## 1. 展示仲裁逻辑

- [x] 1.1 在 `features/chat/lib/agent-activity.ts` 中新增用户可见 activity 展示仲裁函数，支持动态 tool 序列、低权重 `analyzing_request` 和未知 stage 兜底。
- [x] 1.2 将 `analyzing_request` 展示文案调整为“正在规划下一步...”，避免表达成固定回退或服务端卡顿。

## 2. 前端接入

- [x] 2.1 在 `useChatController` 中接入展示仲裁函数，确保 `agent_activity` 和首段 `content` 到达时使用同一套展示更新规则。
- [x] 2.2 调整 `AgentActivityIndicator` 为纯展示组件，让最小展示策略集中在 reducer / hook，同时保持 `done`、`error`、abort 和会话切换立即清理。

## 3. 验证

- [x] 3.1 补充 `tests/chat-agent-activity.test.ts`，覆盖动态 tool 序列、重复 `analyzing_request`、未知 stage、`writing_reply` 和清理边界。
- [x] 3.2 运行 `openspec validate stabilize-agent-activity-display --strict`、相关测试和 `npm run typecheck`，记录验证结果。
