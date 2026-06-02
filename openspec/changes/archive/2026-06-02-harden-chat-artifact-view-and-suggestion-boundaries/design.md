## Context

当前 `/api/chat` 生产链路已经是 Tool-first `AgentOrchestrator`。真实 trace 暴露的问题集中在 Agent 终止合同和用户可见投影层，而不是数据库工具本身：

- 短回复或模糊回复被带入执行型失败出口，用户看到“这次执行没有完成”。
- 模型建议里出现“验证后保存”“保存另一套训练”一类当前产品未开放的按钮。
- 用户请求查看刚才生成的 routine 时，Agent 可以用文字复述 recent artifact，但聊天流没有把 routine payload 重新投影成卡片。
- 服务端 recent artifact 索引出现 4 条 active routine，而前端只有 2 个气泡卡片，说明 Agent 写入和聊天自动保存之间缺少稳定 message 绑定与去重。
- `buildFitnessConversationContext()` 中宽泛的 raw text `goal` 提取会把操作性请求写进 `knownFacts.goal`，让后续 Agent 输入带上错误事实。

必须保持既有 AI 语义边界：服务端不得用关键词、正则、短句模板、同义词表或评分规则判断用户自然语言意图，也不得把模型输出的高层语义改写成另一类语义。服务端只校验结构化工具合同、资源引用、权限、payload、Policy、Validator、产品能力和前端投影边界。

## Goals / Non-Goals

**Goals:**

- 让模型通过 prompt / structured output 明确区分普通回答、澄清、artifact 查看、训练生成、训练修改和写入请求。
- 支持 `answered + getArtifactPayload` 的 read-only artifact 查看结果重新推送 routine / plan 卡片。
- 让用户可见建议通过结构化产品能力校验，而不是靠按钮文案或用户消息关键词过滤。
- 由服务端 runtime 注入当前 `responseMessageId`，确保 artifact 写入与当前 assistant message 稳定绑定。
- 统一 Agent 写入与聊天自动保存的 artifact 去重，避免同一气泡、同一 payload、同 kind 多条 active artifact。
- 移除或降级 raw text 宽泛 goal 提取，避免服务端把操作性消息持久化为训练目标事实。
- 补充可复现单测和黑盒 flow，覆盖本次 trace 暴露的用户路径。

**Non-Goals:**

- 不开放“保存训练到训练库”的新产品功能。
- 不新增服务端自然语言意图判断，不实现 `if 用户说好的/没有` 一类短语分流。
- 不让服务端基于用户原文决定调用哪个训练工具。
- 不修改 Prisma Schema，不新增数据库表。
- 不放宽 artifact payload schema、userId/sessionId 隔离、Validator 或 Policy。
- 不恢复旧 intent-first、旧 reference resolver first 或旧 assistant_action 执行路径。

## Decisions

### 1. 语义修复放在 LLM 合同，不放在服务端短语规则

实现应调整 Agent prompt modules 和结构化输出说明，让模型在没有明确执行目标时优先返回 `answered`、`needs_clarification`、`blocked` 或可诊断失败，而不是进入 routine generation / save chain。服务端只校验模型是否调用了合法工具、工具输入是否满足当前 run 已登记资源，以及最终结果是否能被投影。

替代方案是服务端识别 `好的`、`没有`、`哈哈` 等短语后直接 no-op。该方案被拒绝，因为它会重新引入服务端语义判断，并且无法覆盖上下文相关含义：同一句“好的”可能是确认继续、接受澄清、普通礼貌回复或结束对话。

### 2. Artifact 查看是 read-only card projection，不是重新生成或保存

当用户请求“查看刚才生成的训练”或等价 artifact 查看时，模型应通过 `listRecentArtifacts` / `resolveArtifactReference` / `getArtifactPayload` 读取结构化事实。如果最终结果是 `answered`，且 `usedToolResultIds` 唯一引用了成功的 routine / plan payload 读取结果，`buildAgentArtifactStreamEvents()` 可以从该 tool result 投影 `artifact_validated` 和 `artifact` 事件。

该路径不调用 `generateRoutineDraft`、`validateRoutineDraft`、`evaluatePolicy` 或 `saveConversationArtifactRevision`。它只展示已经存在且当前用户可访问的 artifact payload。

替代方案是让模型继续用自然语言复述训练内容。该方案不能恢复用户可见卡片，也会让后续前端历史保存和 recent artifact 事实继续不一致。

### 3. 建议按钮按结构化产品能力校验

`assistantSuggestions` 应继续由模型或对应 LLM 阶段生成，但需要增加或派生结构化目标操作信息，例如 `targetOperation = "view_artifact" | "adjust_artifact" | "generate_from_recommendation" | "answer_followup" | "unsupported_write"`。Response Writer 只展示当前产品已开放、点击后能作为用户消息安全进入下一轮的建议。

服务端不得通过匹配 label/message 中的“保存”“验证”等中文词来过滤建议。若模型没有提供可校验的目标操作，服务端只能保留纯回答/澄清/查看/调整这类已知安全来源的建议，或丢弃无法证明安全的写入建议，并在 trace 中记录结构化过滤原因。

替代方案是直接按文案黑名单过滤保存按钮。该方案会变成服务端文本语义判断，也容易误删合法描述。

### 4. `responseMessageId` 由 runtime context 注入

`saveConversationArtifactRevision` 不应再依赖模型传入 `responseMessageId`。`AgentToolExecutionContext` 应包含当前 `/api/chat` 的 `responseMessageId`，runtime 执行写工具时把它作为服务端事实传入 artifact service。模型可以引用 `draftId`、`validationId`、`policyDecisionId` 等当前 run 资源，但不能决定 artifact 绑定到哪个 assistant message。

兼容期内，工具 input schema 可以继续接受 `responseMessageId` 但忽略模型值或只用于 trace 诊断；最终保存必须使用 context 中的服务端 message id。

替代方案是继续让模型传 `responseMessageId`。该方案已经导致 artifact 与气泡可能脱钩，不适合作为持久化边界。

### 5. Artifact 去重以 message 绑定和 payload 稳定性为准

`createOrUpdateConversationArtifact()` 和聊天历史自动保存应在同一规则下收敛：

- 同一 `userId + sessionId + messageId + kind` 已存在 active artifact 时，相同 payload 不创建新记录，只刷新 index。
- 同一 `messageId + kind` payload 发生变化时，按既有 revision / superseded 规则处理。
- 没有 `messageId` 的旧记录不应阻止当前气泡绑定，但写入成功后应优先把 active artifact 绑定到当前 message，避免下一轮 recent artifacts 同时出现旧未绑定记录和新绑定记录。
- recent artifact list 只返回当前 active 事实；同一 lineage 或同一 message 下的 superseded 记录不得继续作为 active candidate 出现。

替代方案是只在前端隐藏重复卡片。该方案无法解决模型上下文看到 4 条 artifact 的根因。

### 6. 上下文事实摘要只记录可证明的训练事实

`buildFitnessConversationContext()` 不应继续用宽泛 raw text 关键词把用户消息提取为 `knownFacts.goal`。训练目标事实应优先来自结构化 intent、已校验 tool result、artifact index、用户记忆或更窄的已证明上下文，而不是把任意包含“练”的操作请求直接当目标。

这不是服务端判断“保存请求不是训练目标”的语义分流，而是删除过宽的服务端语义提取能力。服务端可以继续提取确定性、低歧义事实，例如明确数值时长和已枚举器械；对于目标、调整方向、查看/保存意图等高层语义，仍由模型结构化输出决定。

替代方案是维护一组操作词排除规则。该方案仍然是服务端自然语言判断，且会持续膨胀。

### 7. Trace 与黑盒报告要能证明边界

新增 trace 字段或摘要时，应能回答：

- 本轮是否调用了训练生成、验证、Policy 或保存工具。
- artifact 卡片事件来自 generated/patched 保存结果，还是 answered 的 read-only payload 查看。
- 哪些建议被过滤，过滤依据是结构化产品能力边界，而不是文案关键词。
- artifact 写入使用的 `responseMessageId` 来源是服务端 context 还是模型 input。
- recent artifact 去重后模型可见 candidate 数量是否与用户端卡片事实一致。

## Risks / Trade-offs

- [Risk] Prompt 收紧后模型仍可能误把短回复理解成执行请求。→ Mitigation: runtime 继续校验工具前置资源；黑盒 flow 覆盖短回复路径；失败时 trace 能标出模型决策和工具链。
- [Risk] 建议增加结构化操作字段会影响旧建议兼容。→ Mitigation: 旧建议先按来源和 kind 做保守兼容；无法证明安全的写入建议丢弃并记录 trace。
- [Risk] answered 结果重投影 artifact card 可能误展示非查看请求。→ Mitigation: 只从成功 `getArtifactPayload` tool result 投影，且必须是当前用户可访问 payload；不从回复正文或 artifact summary 重建 payload。
- [Risk] artifact 去重误合并不同训练。→ Mitigation: 去重只在同 `messageId + kind` 或稳定 payload 相同的边界内执行，不跨用户、不跨 session、不按 title/summary 模糊合并。
- [Risk] 移除宽泛 goal 提取会减少部分上下文便利。→ Mitigation: 训练目标应由 Agent 结构化 intent、artifact、tool result 或用户记忆提供；这比服务端关键词摘要更符合语义边界。

## Migration Plan

1. 补 OpenSpec 验收测试与单元测试用例，先覆盖当前失败路径。
2. 调整 Agent prompt / structured output 说明，强调普通回答、澄清、artifact 查看和写入请求的不同终止条件。
3. 扩展 runtime tool context，注入 `responseMessageId`，并让保存工具使用 context message id。
4. 实现 `answered + getArtifactPayload` 的 routine / plan card stream projection。
5. 实现结构化 suggestion capability gate，并记录过滤 trace。
6. 调整 artifact service / chat history service 的去重和 message 绑定。
7. 收紧 conversation context 的 raw text goal 提取。
8. 运行相关单测、`npm test` 相关子集、`npm run typecheck` 和手动 LLM 黑盒 flow。

## Open Questions

无。保存训练到训练库仍不在本 change 范围内；本 change 只阻止未开放保存能力作为建议暴露，并稳定已有聊天 artifact 的查看与事实源边界。
