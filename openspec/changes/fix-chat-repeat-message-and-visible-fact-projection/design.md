## Context

本问题发生在 `/api/chat` production 文本聊天链路中，但根因不在模型 provider、Agent runtime 或某个特定自然语言短语。服务端请求归一化会优先按 `conversationId` 读取已保存会话，再将本次请求的 `latestUserMessage` 合并进历史消息。当前去重逻辑只看最近一个 user 消息内容，忽略它后面是否已有 assistant 回复，因此把“同内容的新一轮 user 消息”误判成“同一条消息已经存在”。

另一个边界问题是模型可见 metadata 与 tool 合同不一致。`recentVisibleTrainingProposals` 被注入 Agent run metadata，用于让模型知道当前会话是否存在可引用的用户可见训练方案。当前 prompt 和 `inspectVisibleTrainingProposals` manifest 都要求 metadata / `list_recent` 只提供索引，完整训练方案必须通过 `read_recent` 导入当前 run。但实际 summary 包含完整 `exerciseItems`，让模型可以绕过 read/import 直接复用旧方案。

## Goals / Non-Goals

**Goals:**

- 修正 saved conversation hydration 与 `latestUserMessage` 的合并规则。
- 保证用户在上一轮 assistant 已回复后再次发送相同文本时，新 user 消息会进入 `rawMessages` 和模型可见 `run.messages`。
- 保证 `recentVisibleTrainingProposals` metadata 只提供引用索引和计数摘要，不暴露完整动作项、处方、schedule 或展示详情。
- 保持 `inspectVisibleTrainingProposals(read_recent)` 是完整事实导入当前 run 的唯一入口。
- 用自动化测试覆盖原始失败形态和等价变体。

**Non-Goals:**

- 不新增服务端“不要 / 换一批 / 再来一组”等自然语言短语识别。
- 不修改 `AgentAction`、`PlannerPort`、Agent runtime 主循环、Action Validator、ResourceStore、Response Renderer 或 production tool registry。
- 不新增、重命名或扩展业务 tool。
- 不删除 fact store 中持久化的完整 `visibleTrainingProposal` payload；只收窄模型可见 metadata summary。

## Decisions

### 1. 按消息轮次去重，而不是按最近 user 文本去重

`appendLatestUserMessageIfMissing()` 应只在保存会话最后一条消息本身是同内容 `user` 时返回原历史。只看“最近一个 user 文本”会跨过后续 assistant 回复，把已经完成的一轮对话误当成当前请求。新的规则与前端真实交互一致：如果保存历史最后一条是 assistant，本次请求一定代表新的 user turn，即使文本相同也要追加。

备选方案是引入服务端对 `latestUserMessage` 的自然语言语义判断，例如识别“不要”是否表示拒绝上一套方案。该方案违反项目 AI 边界，也不能解决任意相同文本重复 turn。当前选择是消息序列层面的确定性修复。

### 2. recent metadata 使用独立索引投影

新增或调整 projection helper，将 `VisibleTrainingProposalFactSummary` 转换为模型可见的 recent index summary。该投影只保留引用、状态、版本、创建时间、方案类型、section 计数和可复用 training 动作数量。`exerciseItems`、`prescription`、`schedule`、`exerciseDetails`、图片、肌群等完整事实不进入 `run.metadata.recentVisibleTrainingProposals`。

完整事实仍保存在 `ConversationBusinessFact` payload 中，并继续由 `readVisibleTrainingProposalFact()` 在 `read_recent` 时读取、校验、导入 consumable resource。这样 persistence contract 不变，模型可见 context contract 收窄。

### 3. 保持模型自主 tool calling

服务端只修正确定性输入：消息序列和 metadata 投影。是否需要 `list_recent`、`read_recent`、`searchExerciseResources`、澄清或普通回答，仍由模型根据 prompt、manifest 和当前上下文决定。实现不得把用户原始文本映射为固定 tool 调用。

## Affected Modules

- 生产者：`chat-history-service` 读取的 saved conversation、`visible-training-proposal-fact-store` 读取的 business fact。
- 协调者：`prepareChatRequest()` 和 `createAgentTextChatRunInput()`。
- 消费者：`LlmPlanner` 看到的 `AgentRunInput.messages` 与 `run.metadata.recentVisibleTrainingProposals`。
- 持久化：`ConversationBusinessFact` 保存完整事实不变。
- 工具：`inspectVisibleTrainingProposals` 继续负责 list/read，不改 toolName 和执行能力。

## Risks / Trade-offs

- [Risk] 收窄 metadata 后，模型不能直接从 context 复制历史动作生成新方案。→ Mitigation：这是目标边界；模型应先通过 `read_recent` 导入完整事实，或调用 `searchExerciseResources` 查询新动作。
- [Risk] 某些测试依赖 `recentVisibleTrainingProposals.exerciseItems`。→ Mitigation：更新测试断言为索引摘要，并保留 `inspectVisibleTrainingProposals(list_recent/read_recent)` 的完整 tool-level 覆盖。
- [Risk] 只修消息去重仍可能遇到前端重复请求。→ Mitigation：本 change 修复服务端上下文误拼；真正跨请求幂等可后续用 user message id 独立设计，不用文本内容承担长期幂等。

## Validation Plan

- `openspec validate fix-chat-repeat-message-and-visible-fact-projection --strict`
- `npm test -- tests/chat-service.test.ts`
- `npm test -- tests/visible-training-proposal-fact-store.test.ts`
- `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts`
- 如修改 TypeScript / AI 编排共享逻辑，运行 `npm run typecheck`

## Open Questions

无。当前修复只处理确定性的消息合并和模型可见投影，不引入新的用户语义规则。
