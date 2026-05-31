## Context

当前聊天主链路把“理解用户、触发卡片、生成用户回复、生成 plan/routine artifact”拆在多个阶段中，但这些阶段没有共享一个最终执行契约。`/api/chat` 的意图解析会产出 `type`、`workoutIntent` 和 `canTriggerAction`，回复生成模型又会基于上下文自然组织回答，前端再根据 `assistant_action` 或旧 trigger 逻辑调用专用卡片接口，计划接口还会对缺失字段补默认值。

这个结构会放大 LLM 漏字段或回复策略漂移：模型可能在自然语言里理解用户需求，但结构化意图漏掉关键字段；回复可能在追问，内部动作却已经触发；计划生成层可能用默认值生成一个看似成功但违背用户明确约束的卡片。

本次调整不把服务端改成自然语言理解器。自然语言理解仍由 LLM 承担；服务端只负责把 LLM 的结果收敛成唯一 resolved intent，并校验结构化结果、流程动作和生成 artifact 是否一致。

## Goals / Non-Goals

**Goals:**

- 让 `/api/chat` 每轮只产生一个唯一 `ResolvedChatIntent`，作为回复、卡片生成、trace 和持久化的共同事实来源。
- 让 LLM 决策更准：提示词明确区分用户意图、执行动作、回复模式、澄清回复和生成后调整建议。
- 让服务端在不理解开放自然语言的前提下校验结构冲突，例如追问模式却触发 action、缺失字段却生成卡片、plan/routine 类型不一致、引用对象不可用却执行修改。
- 当 resolved intent 冲突时，允许一次 LLM repair；repair 仍失败时降级为澄清回复且不触发卡片。
- 让卡片生成只使用 resolved intent，不再从自然语言回复或专用接口中重新决策关键意图。
- 让用户明确可执行需求优先完成；更稳妥训练建议只作为 `adjustmentReplies` 或等价用户可见建议，不作为隐藏阻断。

**Non-Goals:**

- 不引入新的数据库表或持久化模型。
- 不让服务端用大量中文规则覆盖所有自然语言表达。
- 不把回复全文和完整训练卡片强行放进同一个 LLM JSON 输出。
- 不重写动作库筛选、ReferenceResolver 或训练计划 Validator 的全部实现。
- 不改变医疗、安全硬边界：无法执行的医疗诊断或不安全请求仍应阻断。

## Decisions

### Decision 1: 复用并升级现有聊天 intent，而不是新建并行决策系统

现有 `chatIntent` 已经是 `/api/chat` 的主入口。本次将它升级为 `ResolvedChatIntent` 或等价类型，包含：

- `type`：用户意图类型。
- `action.kind` 与 `action.shouldTrigger`：系统本轮是否触发结构化卡片，以及触发哪类卡片。
- `responseMode`：`answer_only`、`ask_clarification`、`generate_directly` 或 `generate_with_suggestions`。
- `workoutIntent`：训练目标、时长、周期、周频率、器械、偏好、避免项和限制。
- `missingActionFields`：只有无法生成时才表达缺失字段。
- `clarificationReplies`：补充缺失信息用，只在 `ask_clarification` 出现。
- `adjustmentReplies`：生成后可选调整建议，不阻断当前需求。
- `fieldSources`：关键字段来源，例如 `current_user_message`、`history`、`artifact`、`llm_inferred` 或 `default`。

这样避免再引入一个与 intent 并行的 `ChatDecision` 概念，同时把“用户表达什么”和“系统执行什么”放在同一个执行契约里。

### Decision 2: LLM 负责理解和初始决策，服务端只校验结构一致性

提示词需要要求 LLM 一次性输出完整 resolved intent，并明确以下关系：

- `responseMode = ask_clarification` 时 `action.shouldTrigger` 必须为 `false`。
- `action.shouldTrigger = true` 时 `missingActionFields` 和 `clarificationReplies` 必须为空。
- 用户明确可执行需求时先生成结果，训练建议放入 `adjustmentReplies`。
- 周期天数、周训练频率、单次时长和引用对象必须进入结构化字段，不能只写进自然语言回复。

服务端门控只检查这些结构化字段是否自洽，不尝试判断所有自然语言含义。这样既保留 LLM 的理解能力，也避免一次 LLM 漏字段直接落到业务执行。

### Decision 3: 冲突时 repair 一次，失败后降级澄清

`ResolvedIntentGate` 在发现冲突时生成结构化 violation 列表，例如：

- `ask_clarification` 与 `action.shouldTrigger = true` 冲突。
- `missingActionFields` 非空但仍触发 action。
- `type = workout_plan` 但 `workoutIntent.intentType = routine`。
- action 依赖 artifact，但引用解析为 `not_found` 或 `ambiguous`。
- 关键字段来源为 `default`，但响应没有让用户知道默认假设。

系统将 violations、原始用户消息、conversationSummary、referenceResolution 和原始 intent 发送给 repair prompt，要求只修 resolved intent。repair 后仍不通过时，服务端统一降级为 `ask_clarification`，不触发任何卡片生成。

### Decision 4: 卡片生成只服从 resolved intent

前端和专用生成接口不再从用户回复正文或自然语言上下文重新推断触发动作。`/api/ai/workout-plan` 等接口收到的意图必须来自 resolved intent，并且关键字段不能在下游被静默改写。

这不是把所有生成放到一个 LLM call。完整训练卡片仍可以由专用生成器生成，因为它需要候选动作、artifact payload、Validator 和 repair；但生成器的输入契约必须来自同一个 resolved intent。

### Decision 5: 用户回复在 artifact 结果之后生成或修正

回复不能提前承诺一个尚未通过校验的卡片。生成型请求应按顺序执行：

1. 生成 resolved intent。
2. 通过一致性门控。
3. 生成并校验 artifact。
4. 根据 resolved intent 与 artifact 成功或失败结果生成用户回复。

如果 artifact 失败，回复应解释恢复路径或给出可继续对话选项；如果 `responseMode = ask_clarification`，则不调用 artifact generator。

### Decision 6: 关键默认值必须可见且受控

默认值仍可用于低风险字段或明确的兜底体验，但不能静默覆盖用户约束。对于计划周期、周频率、日历范围、引用对象这类会改变结果形态的字段，系统必须记录来源。若字段来源为 `default`，回复或调整建议必须让用户知道默认假设；若用户表达了明确约束，则生成结果必须与该约束一致。

## Risks / Trade-offs

- [Risk] 新 resolved intent 契约会影响多个模块，迁移范围比单纯补 prompt 更大。→ Mitigation: 分阶段迁移，先保留旧字段兼容输出，再逐步让前端和生成接口只读新 action/responseMode。
- [Risk] 增加 repair 会提高延迟和 token 成本。→ Mitigation: 仅在门控发现结构冲突时调用 repair，正常路径不增加额外模型调用。
- [Risk] 过度门控会阻断本可生成的请求。→ Mitigation: 门控只检查结构化自洽和硬边界，不用服务端规则判断开放语义；用户明确可执行需求默认生成，建议放入 `adjustmentReplies`。
- [Risk] 回复延后到 artifact 校验后会影响流式体验。→ Mitigation: 先支持生成型请求的非承诺式过渡或短等待状态；最终文本必须以 artifact 结果为准。
- [Risk] 下游接口仍可能保留旧默认值路径。→ Mitigation: 在计划生成和 DomainPlanEngine 增加与 resolved intent 的契约校验，测试覆盖“resolved intent 为 3 天但 draft 为 21 天”等结果冲突。

## Migration Plan

1. 在服务端新增 resolved intent 类型和门控，但保留旧 `type`、`workoutIntent`、`canTriggerAction` 字段映射。
2. 更新 prompt，使 LLM 直接输出升级后的 resolved intent；旧字段由解析层兼容填充。
3. 将前端卡片触发改为只使用服务端 action，不再从回复正文提取 trigger。
4. 将 plan/routine/recommendation 生成接口改为接收 resolved intent 派生的请求，不再二次决策关键字段。
5. 调整回复生成，使其基于 resolved intent 和 artifact 结果输出。
6. 增加回归测试和 trace 字段后，再清理旧 trigger 解析路径。
