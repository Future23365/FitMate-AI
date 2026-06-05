## Context

当前生产文本聊天通过 `PlannerPort` 要求模型输出受控 `AgentAction`。最近日志暴露出一个具体失败：模型语义上选择了正确的 `ask_user` 澄清，但把用户可见文本写入 `content`，而当前 schema 要求 `ask_user.question`，最终触发 `invalid_action_schema` 并耗尽 repair budget。

这个问题不是单个字段记错，而是一类合同设计风险：同一个语义槽在不同 action / operation / tool input 下使用不同字段名。模型在长 prompt、长 manifest 和多轮 repair 中更容易被高频字段吸引，输出“语义正确但字段不合法”的 JSON。当前已知同类点包括：

- 终态用户可见文本：`final_answer.content` / `ask_user.question`。
- 终态 grounding 引用：`usedToolResultIds` / `usedResourceRefs`。
- 可见训练方案读取引用：`read_recent.factRef` / `read_recent.messageId`。
- 动作肌群筛选：`searchExerciseResources.muscle` / `searchExerciseResources.muscles`。

本 change 属于 `core contract 变更`，同时包含业务 tool 字段重命名和模型可见合同同步。实现前必须以 OpenSpec 为边界，不能只做 prompt 补丁。

## Goals / Non-Goals

**Goals:**

- 建立并落地“同一语义槽只用一个字段名”的 Agent 合同命名规则。
- 统一 `final_answer` 和 `ask_user` 的用户可见文本字段为 `content`。
- 统一 terminal grounding 引用字段，降低模型在 tool result 和 resource 引用之间切换字段名的负担。
- 统一 `inspectVisibleTrainingProposals(operation = "read_recent")` 的引用输入槽。
- 统一 `searchExerciseResources` 的肌群筛选槽。
- 同步更新 prompt、manifest、schema description、examples、repair feedback、observations、trace/replay 和测试。
- 删除旧字段的新生产路径，不让旧字段继续作为可用合同出现。

**Non-Goals:**

- 不新增服务端自然语言关键词、正则、同义词表、短句模板或业务语义分流。
- 不把建议提问按钮变成直接执行业务 action 的结构化按钮。
- 不改变 `ToolRegistry`、`Policy Guard`、`Executor` 或 ResourceStore 的核心职责。
- 不改变训练计划业务校验规则、动作数据库事实来源或权限隔离边界。
- 不为旧字段建立长期兼容层；旧字段只允许作为拒绝和 repair 诊断来源。

## Decisions

### 1. 用 `content` 统一终态用户可见文本

选择：`final_answer` 和 `ask_user` 都使用 `content: string` 作为用户可见文本字段。

理由：这两个 action 的差异已经由 `type` 表达。字段名继续区分“回答正文”和“追问正文”会让模型记忆负担变高，且实际 renderer 最终都投影为前端 `content` 事件。

替代方案：

- 保留 `ask_user.question` 并强化 prompt：改动小，但继续保留同义槽分裂，无法解决原则问题。
- 同时接受 `question` 和 `content`：短期通过率高，但会把两个字段都变成事实合同，后续 prompt、trace 和 tests 更难收敛。

### 2. 用 `usedRefs` 统一 terminal grounding 引用

选择：终态 action 使用统一 `usedRefs?: Array<{ type: "tool_result" | "resource"; id: string; resourceType?: string }>` 表达已使用事实来源。`final_answer` 的成功 grounding 可以来自 `usedRefs` 或合法 `visibleOutputs[]`；`ask_user` 可以用 `usedRefs` 引用诊断、失败或澄清依据。

理由：`usedToolResultIds` 和 `usedResourceRefs` 都是“本轮终态引用了哪些已登记事实来源”的语义槽。用两个字段迫使模型根据来源类型切换字段名；统一数组后，差异由每个 ref 的 `type` 表达。

取舍：`resource` 引用仍需要 `resourceType` 或等价字段帮助 ResourceStore 校验具体资源类别；这是资源身份的一部分，不是另一个同义槽。

### 3. 用 `ref` 统一 `read_recent` 引用输入

选择：`inspectVisibleTrainingProposals(operation = "read_recent")` 使用 `ref: { type: "fact_ref" | "message_id"; value: string }`，不再把 `factRef` 和 `messageId` 暴露为并列顶层输入字段。

理由：两者都表达“读取哪条可见训练方案事实”。顶层并列字段会让模型猜测该填哪个、是否能同时填、缺一个是否可行。统一 `ref` 后，引用方式由 `ref.type` 区分。

替代方案：只保留 `factRef`。这更简单，但会丢掉 `messageId` 作为真实上下文引用的能力；如果实现阶段确认 `messageId` 不再必要，可以在 tasks 中把它降级为删除项。

### 4. 用 `muscles` 统一肌群筛选

选择：`searchExerciseResources` 只保留 `muscles: string[]` 表达一个或多个真实肌群 facet；单肌群也写成一项数组。不再暴露 `muscle` 单值字段。

理由：`muscle` 与 `muscles` 是典型单复数字段分裂。模型只需记住一个字段，服务端仍可通过数组长度执行单值或 OR 查询。

### 5. 旧字段以拒绝和 repair 为主，不做长期兼容

选择：schema 默认拒绝 `ask_user.question`、`usedToolResultIds`、`usedResourceRefs`、`factRef`、`messageId` 顶层 read input 和 `muscle`；repair feedback 明确给出新字段形状。

理由：如果服务端悄悄转换旧字段，模型会继续收到“旧字段也可用”的隐性训练信号。合同收敛需要让模型可见输入、schema、trace 和 tests 都只指向新字段。

实现阶段如必须短期迁移，只能在 design / tasks 明确迁移入口、清理条件、测试覆盖和禁止模型继续输出旧字段的 repair 文案。

### 6. 先做模型可见合同盘点，再改实现

选择：实现前先盘点真实模型输入链路，包括 prompt builder、tool manifest、schema summary、examples、repair feedback、observations、compressed tool results 和 trace/replay fixture。

理由：字段重命名只改 TypeScript schema 不够。只要模型可见说明、旧 example 或 repair 还暴露旧字段，模型仍会继续输出旧字段。

## Risks / Trade-offs

- [Risk] 这是破坏性合同变更，可能影响已有 replay fixture、手动测试或旧 trace 回放。→ Mitigation：tasks 要求旧字段残留扫描、replay/trace 测试更新，并明确不保留旧字段主路径。
- [Risk] 一次性收敛多个字段会扩大改动范围。→ Mitigation：每个字段族必须有独立测试；实现阶段按字段族分批提交，不混入无关重构。
- [Risk] `usedRefs` 可能弱化 tool result 和 resource 的确定性校验边界。→ Mitigation：`type` 判别后仍由 validator 分别校验 tool result 存在性、satisfied 状态、resource role、resourceType 和当前 run 归属。
- [Risk] `read_recent.ref` 增加一层对象后 manifest 更长。→ Mitigation：用极短 schema description 和 example 说明，减少并列字段歧义带来的 repair 成本。
- [Risk] 删除 `muscle` 会影响已有模型习惯。→ Mitigation：prompt、manifest、repair feedback 和 tests 统一指向 `muscles`，并覆盖单肌群数组输入。

## Migration Plan

1. 审计旧字段完整产生和消费链路：schema、handler、projection、renderer、trace/replay、tests、prompt、manifest、examples、repair feedback 和 docs。
2. 先更新核心类型和 validator，确保新字段结构可被确定性校验。
3. 更新 renderer / chat service / trace，让新字段成为唯一用户可见投影来源。
4. 更新业务 tool input schema 和 manifest，使新字段成为模型可见唯一主路径。
5. 更新 repair feedback，对旧字段输出给出字段级修复建议。
6. 更新测试和文档，再执行 `openspec validate <change> --strict`、相关单测、`npm run typecheck` 和必要的 architecture scan。

## Open Questions

- `usedRefs` 是否需要命名为 `groundingRefs` 更清晰？实现前应在 tasks 中结合现有 `usedToolResultIds` 语义确认最终字段名。
- `inspectVisibleTrainingProposals.read_recent` 是否仍需要支持 `messageId` 引用？如果当前事实桥已经能稳定提供 `factRef`，实现阶段可以选择只保留 `fact_ref` 类型并删除 `message_id`。
