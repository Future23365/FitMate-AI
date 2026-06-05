## Why

当前 `/api/chat` 在服务端 hydration 已保存会话时，会把数据库历史消息和本次请求的 `latestUserMessage` 合并。真实 trace 显示，当用户在上一轮 assistant 已回答后再次发送相同文本（例如连续两轮都说“不要”）时，现有去重只按“最后一个 user 消息内容是否相同”判断，导致新一轮用户消息没有追加到 `rawMessages`。随后 Agent run 仍把旧的 user 消息当作 `latestUserMessage`，模型看到的会话最后一条反而是上一轮 assistant 回复，形成重复围绕旧输入生成的错误。

同一 trace 还显示 `run.metadata.recentVisibleTrainingProposals` 暴露了上一套 `visibleTrainingProposal` 的完整 `exerciseItems`。这与当前 prompt 和 `inspectVisibleTrainingProposals` manifest 中“metadata 只提供索引，完整事实必须通过 `read_recent` 导入”的模型可见合同不一致。模型可以不调用 `inspectVisibleTrainingProposals(read_recent)` 或 `searchExerciseResources`，直接复用 metadata 中完整动作列表，导致“重新安排”仍输出同一套方案。

## What Changes

- 收窄服务端消息合并去重：只有保存会话最后一条消息本身就是同内容 `user` 时，才认为本次 `latestUserMessage` 已经存在；如果保存会话最后一条是 `assistant`，即使最近一条 user 内容相同，也必须追加新的用户消息。
- 将 `recentVisibleTrainingProposals` 的生产模型可见投影收窄为引用索引摘要，只保留 `factRef`、`messageId`、`kind`、`status`、`schemaVersion`、`createdAt`、`proposalKind`、`visibleOutputSchemaVersion`、`factSchemaVersion`、`sectionSummary` 和 `reusableTrainingExerciseCount`。
- 保持完整训练事实读取能力在 `inspectVisibleTrainingProposals(operation = "read_recent")`，成功后才导入当前 run 的 `visible_training_proposal_fact` consumable resource。
- 不新增服务端自然语言关键词判断，不把“不要”“换一批”等短句写成服务端路由条件。
- 不修改 `AgentAction`、`PlannerPort`、`runAgentRuntime`、`ToolRegistry` 注册、`Response Renderer` 或 `/api/chat` route。

## Capabilities

### Modified Capabilities

- `agent-text-chat-flow`: 修正服务端会话 hydration 和最新用户消息合并边界，确保相同文本的新一轮用户输入不会被误吞。
- `visible-proposal-reference-tool`: 收窄当前 run metadata 中的最近可见训练方案摘要，使 metadata 只承担引用索引职责，完整事实继续由 `inspectVisibleTrainingProposals(read_recent)` 导入。

## Impact

- 服务端聊天请求归一化：`lib/server/chat/chat-service.ts`
- 可见训练方案事实投影：`lib/server/visible-training-proposals/visible-training-proposal-fact-store.ts`
- 生产聊天 metadata 注入：`lib/server/chat/agent-text-chat-service.ts`
- 测试：`tests/chat-service.test.ts`、`tests/visible-training-proposal-fact-store.test.ts`、按需更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`
- 文档：方案变更历史和项目演变记录
