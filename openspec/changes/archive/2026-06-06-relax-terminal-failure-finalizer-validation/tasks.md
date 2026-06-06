## 1. OpenSpec 与边界

- [x] 1.1 复核本 change 为 terminal failure finalizer 输出合同调整，不放宽主 Agent 训练方案、resource、policy 或 renderer 校验。
- [x] 1.2 对照 `docs/llm-prompt-guidance.md` 的 Validator 分层，确认本次删除的是失败兜底用户文案语义判定，不是结构 shape 校验。
- [x] 1.3 运行 `openspec validate relax-terminal-failure-finalizer-validation --strict`。

## 2. 实现

- [x] 2.1 在 `lib/server/chat/terminal-failure-finalizer.ts` 中移除 `content` / `suggestedQuestions` 的语义短语判定。
- [x] 2.2 保留 `TerminalFailureFinalizerOutput` 的 strict shape、非空 `content`、长度、`suggestedQuestions` 数量和单条长度校验。
- [x] 2.3 确认 finalizer 成功仍只输出普通 `content` / `suggested_questions` / `done`，不触碰 `visibleOutputs`、tool、resource 或事实持久化边界。

## 3. 测试与验证

- [x] 3.1 更新 `tests/chat-terminal-failure-finalizer.test.ts`，覆盖不含固定失败披露短语但 shape 合法的 finalizer 输出应通过。
- [x] 3.2 更新 `tests/chat-service.test.ts`，覆盖 finalizer 返回普通内容和建议时不再因文案短语未命中而降级为固定 fallback。
- [x] 3.3 运行相关测试：`npm test -- tests/chat-terminal-failure-finalizer.test.ts tests/chat-service.test.ts`。
- [x] 3.4 运行 `npm run typecheck`。
- [x] 3.5 最终检查 diff，确认未混入无关工作区改动、高风险删除或服务端用户语义分流。
