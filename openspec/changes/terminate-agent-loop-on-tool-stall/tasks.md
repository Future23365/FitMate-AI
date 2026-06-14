## 1. 合同与门禁

- [x] 1.1 完成 Agent 修复方案抽象层级门禁审查，确认方案不包含用户短句、关键词、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 1.2 运行 `openspec validate terminate-agent-loop-on-tool-stall --strict`，确认 proposal / design / spec / tasks 合同有效。
- [x] 1.3 对照 `docs/llm-prompt-guidance.md` 检查连续超限失败反馈分层，确认失败反馈只表达停止条件和失败收口，不提示模型继续自由调用其他业务工具。

## 2. Runtime 实现

- [x] 2.1 在 `lib/server/langchain-agent/runtime.ts` 中将 `tool_consecutive_call_limit_exceeded` 或等价连续业务 tool 超限 execution 标记为 terminal failure。
- [x] 2.2 确保连续超限时不执行业务 handler，并保留模型可见失败摘要 / execution record / trace summary 供 trace 复盘和 terminal failure finalizer 输入使用。
- [x] 2.3 确保连续超限后主 Agent run 不再继续进入下一轮自由 provider model call，也不允许通过其他业务 tool 打断后恢复原 tool 调用。
- [x] 2.4 如新增或调整失败码，同步更新 `lib/server/langchain-agent/types.ts`、runtime error normalization、terminal failure finalizer 分类和 response projection 所需类型。

## 3. 回归测试

- [x] 3.1 为 LangChain runtime 增加通用 fixture business tool 测试：同一业务 tool 连续第 3 次调用时返回 terminal failure，handler 只执行允许次数，后续模型不再调用其他业务 tool。
- [x] 3.2 增加等价变体测试：连续超限后即使模型原本会尝试第二个业务 tool，runtime 也必须终止主 Agent loop。
- [x] 3.3 增加或更新测试，确认 duplicate input 仍不重复执行 handler，但不会作为绕过连续超限后继续自由 tool loop 的路径。
- [x] 3.4 测试不得依赖 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或用户原话作为生产规则；这些只能作为 trace 背景或回归样例说明。

## 4. 验证

- [x] 4.1 运行 `openspec validate terminate-agent-loop-on-tool-stall --strict`。
- [x] 4.2 运行最窄 runtime 测试，例如 `npm test -- tests/langchain-agent-runtime/runtime.test.ts`。
- [x] 4.3 修改 TypeScript / AI orchestration 后运行 `npm run typecheck`。
- [x] 4.4 执行最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` 语义分支，且没有无关删除或格式化。
