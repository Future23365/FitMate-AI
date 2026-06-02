## 1. 回归测试基线

- [ ] 1.1 补充 `tests/agent-orchestrator.test.ts`：模型将短回复或模糊回复结构化为 `answered` / `needs_clarification` 时，runtime 不得额外调用训练生成、验证、Policy 或保存工具。
- [ ] 1.2 补充 `tests/chat-service.test.ts`：`answered + getArtifactPayload(routine)` 必须输出 `artifact_validated` 和 `artifact` 流事件，并绑定当前 assistant message。
- [ ] 1.3 补充 `tests/chat-service.test.ts`：只有 recent artifact summary、回复正文或 summary 时，不得投影 routine / plan 卡片。
- [ ] 1.4 补充 `tests/chat-assistant-suggestions.test.ts`：结构化目标操作为未开放保存能力的建议不得输出为用户可见 chip。
- [ ] 1.5 补充 `tests/chat-assistant-suggestions.test.ts`：建议过滤不得依赖 label/message 文案关键词，必须按结构化操作或来源能力判断。
- [ ] 1.6 补充 `tests/chat-context.test.ts`：操作性请求、查看请求、短确认或短否定不得被 raw text 提取成 `knownFacts.goal`。
- [ ] 1.7 补充 artifact service / chat history 相关测试：同一 `userId + sessionId + messageId + kind + stable payload` 不得产生重复 active artifact。

## 2. Agent 合同与 prompt 边界

- [ ] 2.1 调整 Agent prompt module，明确普通回答、澄清、artifact 查看、训练生成、训练修改和写入请求的结构化终止条件。
- [ ] 2.2 在 prompt 中明确 artifact 查看是只读工具链，不能要求 `draftId`、`validationId`、`policyDecisionId` 或 `revisionId`。
- [ ] 2.3 强化 prompt 约束：当前产品未开放保存训练功能时，模型不得生成保存、验证后保存或保存另一套训练的用户可见建议。
- [ ] 2.4 确认 runtime 不新增服务端关键词、正则、短句模板或同义词表来判断用户自然语言语义。

## 3. 结构化建议边界

- [ ] 3.1 扩展或派生 `assistantSuggestions` 的结构化目标操作信息，使服务端能判断建议对应的产品能力。
- [ ] 3.2 在 Response Writer 或统一建议归一化入口实现产品能力 gate，过滤当前未开放的写操作建议。
- [ ] 3.3 为被过滤建议写入 trace 摘要，记录结构化过滤原因、来源阶段和目标操作。
- [ ] 3.4 保持旧 `suggestedReplies` 兼容，但无法证明安全的写入建议不得继续展示。

## 4. Artifact 查看卡片投影

- [ ] 4.1 扩展 `buildAgentArtifactStreamEvents()`，支持从本轮成功 `getArtifactPayload` routine / plan tool result 投影 read-only card event。
- [ ] 4.2 确保该投影只消费完整 payload，不从回复正文、summary、title 或 recent artifact summary 重建卡片。
- [ ] 4.3 更新前端流消费或历史保存逻辑，确保查看类 artifact event 能写入当前 assistant bubble 的 `bubbleRoutines` / `bubblePlans`。
- [ ] 4.4 在 trace / done metadata 中标记 artifact event 来源是 `read_only_artifact_payload`，区别于 generated / patched 写入结果。

## 5. Message 绑定与 artifact 去重

- [ ] 5.1 扩展 `AgentToolExecutionContext`，加入当前 `/api/chat` 的 `responseMessageId`。
- [ ] 5.2 修改 Agent runtime，在调用工具时注入服务端 `responseMessageId`。
- [ ] 5.3 修改 `saveConversationArtifactRevision`，保存 artifact 时使用 context message id，模型输入中的 `responseMessageId` 只允许作为兼容诊断材料。
- [ ] 5.4 修改 `createOrUpdateConversationArtifact()` 或调用层，按同一 `messageId + kind + stable payload` 复用 active artifact 或刷新 index。
- [ ] 5.5 修改 recent artifact summary 查询或 index 状态维护，避免同一气泡、同一 payload、同 kind 重复 active 记录进入 Agent 上下文。

## 6. 上下文事实摘要收紧

- [ ] 6.1 移除或降级 raw user message 的宽泛 `goal` 关键词提取，训练目标优先来自结构化 intent、artifact、tool result 或用户记忆。
- [ ] 6.2 保留明确时长、器械、周频等低歧义事实提取，但不得由这些事实推断生成、查看、保存、确认或取消语义。
- [ ] 6.3 更新 hydration / token budget / trace 输出，区分摘要事实来源和模型结构化决策。

## 7. 黑盒与验证

- [ ] 7.1 增加或更新手动 LLM 黑盒 flow，覆盖“好的”“没有”“查看刚才生成的训练”“点击模型建议后训练数量一致”等路径。
- [ ] 7.2 运行相关测试子集，至少覆盖 `tests/agent-orchestrator.test.ts`、`tests/chat-service.test.ts`、`tests/chat-context.test.ts`、`tests/chat-assistant-suggestions.test.ts`。
- [ ] 7.3 运行 `npm test` 或说明无法完整运行的原因。
- [ ] 7.4 运行 `npm run typecheck`。
- [ ] 7.5 运行 `openspec validate harden-chat-artifact-view-and-suggestion-boundaries --strict`。
- [ ] 7.6 若实现属于核心链路修复，更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录上海时间到秒。
