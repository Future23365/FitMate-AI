## 1. OpenSpec 与边界确认

- [x] 1.1 运行 `openspec validate rebalance-langchain-tool-call-budget --strict`，确认 proposal / design / specs / tasks 合法。
- [x] 1.2 复核本 change 只触碰 LangChain runtime / config / prompt 预算说明 / 测试 / 文档记录，不修改 `/api/chat` 主链路、业务 tool handler、provider payload 合同或 response adapter 主流程。

## 2. Runtime 配置同步

- [x] 2.1 在 `agentRuntimeConfig.langChain.runBudget` 中将整轮业务 tool 总预算调为 20，并新增单个业务 tool 单轮调用上限配置，补中文意图注释和 TypeScript 类型。
- [x] 2.2 在 LangChain runtime 中为每个业务 tool 自动接入 `toolCallLimitMiddleware`，使用集中配置的 per-tool run limit，并排除 `reportAgentActivity`。
- [x] 2.3 保留项目自定义总业务 tool 安全熔断，确保超过 20 次业务 tool call 时仍阻止 handler 并归一为预算失败。
- [x] 2.4 同步调整 `maxModelCalls` 和 `recursionLimit` 推导，使 20 次业务 tool、activity report 和最终结构化回答的合法路径不会提前耗尽模型调用预算。

## 3. 模型可见预算说明

- [x] 3.1 对照 `docs/llm-prompt-guidance.md`，更新默认 system prompt 的运行预算说明，区分整轮业务 tool 总预算、单个业务 tool 单轮调用上限和 `reportAgentActivity` 独立上限。
- [x] 3.2 补充或更新 prompt / runtime 测试，确保模型可见说明包含 per-tool 上限，不包含用户 phrasing、关键词路由或固定业务 tool 流程。

## 4. 回归测试与文档

- [x] 4.1 更新 `tests/langchain-agent-runtime/config.test.ts`，覆盖 `maxToolCalls = 20`、per-tool run limit、模型调用预算和 `recursionLimit` 关系。
- [x] 4.2 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖单个业务 tool 第 3 次调用被 LangChain per-tool limit 阻止且 handler 只执行 2 次。
- [x] 4.3 更新 runtime 总预算测试，覆盖跨多个业务 tool 超过 20 次仍触发项目总预算熔断。
- [x] 4.4 在 `docs/方案变更历史/` 生成本次预算调整说明，并在 `docs/项目演变历程.md` 追加简要记录，时间使用上海时间精确到秒。
- [x] 4.5 使用 `rg` 检查旧 `maxToolCalls = 5` 或旧共享 5 次预算语义没有残留在生产代码和测试中；OpenSpec / docs 中仅作为问题背景出现。

## 5. 验证与收尾

- [x] 5.1 运行 `openspec validate rebalance-langchain-tool-call-budget --strict`。
- [x] 5.2 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-runtime/config.test.ts`。
- [x] 5.3 运行 `npm run typecheck`。
- [x] 5.4 检查 `git diff --name-status`，确认没有无关删除、重命名或用户已有改动被混入。
- [x] 5.5 完成本 change 的任务勾选，并准备中文提交信息。

## 6. 真实重复调用修复

- [x] 6.1 基于 2026-06-11 19:05 trace 复核 per-tool 上限实际语义，区分 provider tool_call 尝试次数和 wrapper handler 执行次数。
- [x] 6.2 在 LangChain runtime 中新增请求前业务 tool 可用性过滤，确保已达到 `maxToolCallsPerTool` 的业务 tool 不再暴露给后续 provider model request。
- [x] 6.3 保留 LangChain `toolCallLimitMiddleware` 作为同一 provider response 内多个同名 tool_calls 的 handler 执行兜底。
- [x] 6.4 补充连续多轮重复调用同一业务 tool 的 runtime 回归测试，断言 provider tool_call 尝试次数不会继续增长到总预算上限。
- [x] 6.5 重新运行 OpenSpec、runtime / config 测试、typecheck、lint 和最终 diff 检查。
