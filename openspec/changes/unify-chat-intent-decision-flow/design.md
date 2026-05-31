## Context

当前聊天主链路把“理解用户、触发卡片、生成用户回复、生成 plan/routine artifact”拆在多个阶段中，但这些阶段没有共享一个最终执行契约。`/api/chat` 的意图解析会产出 `type`、`workoutIntent` 和 `canTriggerAction`，回复生成模型又会基于上下文自然组织回答，前端再根据 `assistant_action` 或旧 trigger 逻辑调用专用卡片接口，计划接口还会对缺失字段补默认值。

这个结构会放大 LLM 漏字段或回复策略漂移：模型可能在自然语言里理解用户需求，但结构化意图漏掉关键字段；回复可能在追问，内部动作却已经触发；计划生成层可能用默认值生成一个看似成功但违背用户明确约束的卡片。

本次调整不把服务端改成自然语言理解器。自然语言理解仍由 LLM 承担；服务端只负责把 LLM 的结果收敛成唯一 resolved intent，并校验结构化结果、流程动作和生成 artifact 是否一致。

## Goals / Non-Goals

**Goals:**

- 让 `/api/chat` 每轮只产生一个唯一 `ResolvedChatIntent`，作为回复、卡片生成、trace 和持久化的共同事实来源。
- 让生成型请求进入服务端主编排闭环，由服务端完成 intent、门控、引用解析、artifact 生成、校验和最终回复生成。
- 让 LLM 决策更准：提示词明确区分用户意图、执行动作、回复模式、澄清回复和生成后调整建议。
- 让服务端在不理解开放自然语言的前提下校验结构冲突，例如追问模式却触发 action、缺失字段却生成卡片、plan/routine 类型不一致、引用对象不可用却执行修改。
- 当 resolved intent 冲突时，允许一次 LLM repair；repair 仍失败时降级为澄清回复且不触发卡片。
- 让卡片生成只使用 resolved intent，不再由前端或专用接口重新决策关键意图。
- 让用户明确可执行需求优先完成；更稳妥训练建议只作为 `adjustmentReplies` 或等价用户可见建议，不作为隐藏阻断。

**Non-Goals:**

- 不引入新的数据库表或持久化模型。
- 不让服务端用大量中文规则覆盖所有自然语言表达。
- 不把回复全文和完整训练卡片强行放进同一个 LLM JSON 输出。
- 不把所有实现塞进 `/api/chat` route 文件；route 仍应是薄入口，核心编排放在服务端 service/orchestrator 中。
- 不重写动作库筛选、ReferenceResolver 或训练计划 Validator 的全部实现。
- 不改变医疗、安全硬边界：无法执行的医疗诊断或不安全请求仍应阻断。

## Decisions

### Decision 1: 复用并升级现有聊天 intent，而不是新建并行决策系统

现有 `chatIntent` 已经是 `/api/chat` 的主入口。本次将它升级为 `ResolvedChatIntent` 或等价类型，包含：

- `type`：用户意图类型。
- `action.kind` 与 `action.shouldTrigger`：系统本轮是否触发结构化卡片，以及触发哪类卡片。
- `action.reason` 与 `action.blockingMissingFields`：触发或阻断的服务端可追踪原因，供回复生成、trace 和测试断言使用。
- `responseMode`：`answer_only`、`ask_clarification`、`generate_directly` 或 `generate_with_suggestions`。
- `workoutIntent`：训练目标、时长、周期、周频率、器械、偏好、避免项和限制。
- `missingActionFields`：只有无法生成时才表达缺失字段。
- `clarificationReplies`：补充缺失信息用，只在 `ask_clarification` 出现。
- `adjustmentReplies`：生成后可选调整建议，不阻断当前需求。
- `fieldSources`：关键字段来源，例如 `current_user_message`、`history`、`artifact`、`llm_inferred` 或 `default`。
- `referenceRequirement` 与 `referenceResolution`：表达本轮是否依赖历史 artifact，以及引用是否已经被服务端解析为可执行对象。

`ResolvedChatIntent` 需要放在共享类型或共享 schema 中，供服务端解析、流事件、前端 hook 和专用生成接口复用。前端流事件不应继续只传 `intent: unknown`；它应携带最终 resolved action、可校验的 workout intent、字段来源和引用解析结果。旧的 `type`、`workoutIntent`、`canTriggerAction` 和 `suggestedReplies` 只能由 resolved intent 派生，用于兼容旧调用点。

这样避免再引入一个与 intent 并行的 `ChatDecision` 概念，同时把“用户表达什么”和“系统执行什么”放在同一个执行契约里。

### Decision 2: LLM 负责理解和初始决策，服务端只校验结构一致性

提示词需要要求 LLM 一次性输出完整 resolved intent，并明确以下关系：

- `responseMode = ask_clarification` 时 `action.shouldTrigger` 必须为 `false`。
- `action.shouldTrigger = true` 时 `missingActionFields` 和 `clarificationReplies` 必须为空。
- 用户明确可执行需求时先生成结果，训练建议放入 `adjustmentReplies`。
- 周期天数、周训练频率、单次时长和引用对象必须进入结构化字段，不能只写进自然语言回复。

服务端门控只检查这些结构化字段是否自洽，不尝试判断所有自然语言含义。这样既保留 LLM 的理解能力，也避免一次 LLM 漏字段直接落到业务执行。

### Decision 2.1: 明确 action 范围和不可执行引用

`action.kind` 至少覆盖以下用户可观察动作：

- `exercise_recommendation`：生成动作推荐。
- `workout_routine`：生成单次训练编排。
- `workout_plan`：生成长期或多天计划。
- `workout_patch`：修改已有 routine 或 plan artifact。
- `exercise_replacement`：替换已有训练中的动作。
- `exercise_explanation`：讲解已有动作或训练内容。
- `none`：只回答或只追问，不触发结构化生成。

其中 `workout_patch`、`exercise_replacement` 和依赖历史内容的 `exercise_explanation` 必须声明 `referenceRequirement`。如果 ReferenceResolver 返回 `not_found` 或 `ambiguous`，resolved intent 必须进入 `ask_clarification` 或引用选择流程，不能让下游根据自然语言摘要自行猜测 artifact。

### Decision 3: 冲突时 repair 一次，失败后降级澄清

`ResolvedIntentGate` 在发现冲突时生成结构化 violation 列表，例如：

- `ask_clarification` 与 `action.shouldTrigger = true` 冲突。
- `missingActionFields` 非空但仍触发 action。
- `type = workout_plan` 但 `workoutIntent.intentType = routine`。
- action 依赖 artifact，但引用解析为 `not_found` 或 `ambiguous`。
- 关键字段来源为 `default`，但响应没有让用户知道默认假设。

系统将 violations、原始用户消息、conversationSummary、referenceResolution 和原始 intent 发送给 repair prompt，要求只修 resolved intent。repair 后仍不通过时，服务端统一降级为 `ask_clarification`，不触发任何卡片生成。

### Decision 4: 生成型 artifact 进入服务端主编排闭环

以准确性为优先时，生成型 artifact 必须进入服务端聊天主编排闭环。`/api/chat` route 仍保持薄入口，但它背后的 chat orchestrator 需要按同一条链路完成：

1. 解析 `ResolvedChatIntent`。
2. 运行一致性门控和必要的 repair。
3. 运行 ReferenceResolver，得到可执行或不可执行的引用结果。
4. 根据最终 resolved intent 调用对应 artifact generation service。
5. 校验 artifact 是否符合 resolved intent、字段来源、引用对象和领域规则。
6. 根据 artifact 成功、失败或恢复结果生成最终用户回复。
7. 通过同一条响应流返回回复、artifact、建议回复和 trace。

前端不再作为第二个 orchestrator。它可以展示服务端返回的生成中状态、artifact payload、失败恢复和 suggested replies，但不能根据正文、旧 trigger 或本地 action 判断自行调用 artifact 生成接口。

这不是把所有生成放到一个 LLM call。完整训练卡片仍由专用生成器或领域服务生成，因为它需要候选动作、artifact payload、Validator 和 repair；但生成器必须被服务端 orchestrator 调用，输入契约必须来自同一个 resolved intent。

`/api/ai/workout-plan` 等专用接口可以保留为调试、兼容或内部复用入口，但生产聊天主链路不能依赖前端在 `/api/chat` 之后再调用这些接口来补齐训练卡片。若保留公开接口，也必须要求传入 resolved intent 派生请求，并拒绝自行判断“是否应该生成”。

服务端流式事件需要从“前端触发指令”调整为“服务端编排状态和结果”，例如：

- `intent_resolved`：已确定最终 resolved intent。
- `artifact_generating`：服务端正在生成对应 artifact。
- `artifact_validated`：artifact 已通过校验。
- `artifact` 或 `workout_patch`：返回可展示的结构化结果。
- `artifact_failed`：生成失败或恢复失败，携带可继续对话的恢复信息。
- `content`：最终用户回复文本。
- `done`：本轮编排完成。

旧 trigger 清理分三层处理：

- 聊天 hook 不再调用正文 trigger 解析来决定是否生成 recommendation、routine 或 plan。
- 消息展示层可以保留旧 trigger block 的清理能力，但清理结果只影响展示文本，不再产生新 action。
- 上下文摘要和历史消息解析不再把正文中的 trigger JSON 当作最新 intent 事实；如需历史兼容，只能读取已持久化的结构化 message metadata 或 resolved intent 快照。

### Decision 5: 用户回复在 artifact 结果之后生成

回复不能提前承诺一个尚未通过校验的卡片。生成型请求的最终回复必须在 artifact 成功、失败或恢复结果明确之后生成。这样用户看到的自然语言与卡片结果共享同一个 resolved intent 和同一份校验结论。

如果 artifact 失败，回复应解释恢复路径或给出可继续对话选项；如果 `responseMode = ask_clarification`，则不调用 artifact generator。

### Decision 6: 关键默认值必须可见且受控

默认值仍可用于低风险字段或明确的兜底体验，但不能静默覆盖用户约束。对于计划周期、周频率、日历范围、引用对象这类会改变结果形态的字段，系统必须记录来源。若字段来源为 `default`，回复或调整建议必须让用户知道默认假设；若用户表达了明确约束，则生成结果必须与该约束一致。

字段来源按以下规则使用：

- `current_user_message`：当前消息明确给出的字段，优先级最高。
- `history`：conversationSummary 或已持久化结构化上下文中仍然有效的字段。
- `artifact`：ReferenceResolver 解析出的 artifact payload 或 metadata 中的字段。
- `llm_inferred`：LLM 基于当前上下文合理推断的字段，必须可被 trace 追踪。
- `default`：系统默认值，只能用于允许默认的字段，且不能覆盖前三类来源。

允许默认但必须显式标记来源的字段包括 `experience`、低风险 `sessionMinutes` 估算和缺失周期时的计划兜底范围。会改变用户可见结果形态的 `calendarHorizonDays`、`weeklyFrequency`、`sourceArtifactId`、引用对象和明确训练目标不得被默认值静默覆盖。若这些字段只能使用默认值，用户回复或 `adjustmentReplies` 必须说明假设，并提供继续调整路径。

## Risks / Trade-offs

- [Risk] 新 resolved intent 契约和服务端主编排闭环会影响多个模块，迁移范围比单纯补 prompt 更大。→ Mitigation: 分阶段迁移，先让 orchestrator 复用现有生成 service，再逐步移除前端二次触发路径。
- [Risk] 增加 repair 会提高延迟和 token 成本。→ Mitigation: 仅在门控发现结构冲突时调用 repair，正常路径不增加额外模型调用。
- [Risk] 过度门控会阻断本可生成的请求。→ Mitigation: 门控只检查结构化自洽和硬边界，不用服务端规则判断开放语义；用户明确可执行需求默认生成，建议放入 `adjustmentReplies`。
- [Risk] 回复延后到 artifact 校验后会影响流式体验。→ Mitigation: 用服务端流式状态事件展示 `intent_resolved`、`artifact_generating`、`artifact_validated` 等进度；最终文本必须以 artifact 结果为准。
- [Risk] 下游接口仍可能保留旧默认值路径。→ Mitigation: 在计划生成和 DomainPlanEngine 增加与 resolved intent 的契约校验，测试覆盖“resolved intent 为 3 天但 draft 为 21 天”等结果冲突。
- [Risk] `/api/chat` 主链路变重，生成型请求的失败面更集中。→ Mitigation: route 保持薄入口，编排逻辑拆到服务端 service；artifact 生成失败必须转成可恢复回复和 trace，而不是让整轮聊天硬失败。

## Migration Plan

1. 在服务端新增 resolved intent 类型和门控，但保留旧 `type`、`workoutIntent`、`canTriggerAction` 字段映射。
2. 更新 prompt，使 LLM 直接输出升级后的 resolved intent；旧字段由解析层兼容填充。
3. 在服务端 chat orchestrator 中接入现有 recommendation、routine、plan 和 patch 生成 service，使 `/api/chat` 主链路能生成并校验 artifact。
4. 将前端卡片触发改为只消费服务端状态和 artifact 结果，不再从回复正文或 action 本地调用生成接口。
5. 将 plan/routine/recommendation 专用生成接口改为调试、兼容或内部复用入口；生产聊天主链路不再依赖前端调用这些接口。
6. 调整回复生成，使其基于 resolved intent 和 artifact 成功、失败或恢复结果输出。
7. 增加回归测试和 trace 字段后，再清理旧 trigger 解析路径。
