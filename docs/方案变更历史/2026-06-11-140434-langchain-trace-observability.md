# 2026-06-11 14:04:34 CST LangChain Trace 日志页观测补齐

## 当前问题

生产 `/api/chat` 已迁移到 LangChain Agent Runtime 后，日志页仍主要依赖旧 Agent loop 时代的 `model_request`、`model_response`、`tool_call` step。新 runtime 只写入一个 `LangChain Agent Runtime 摘要`，导致日志页无法稳定展示 token usage、每层 Loop、每轮 provider `tool_calls` 与 tool wrapper 执行的关联。异常路径例如 recursion / budget exhausted 还可能丢失 `traceSummary`，让导出的 `langChainRuntimeSummaries` 和 `langChainToolExecutions` 为空。

## 调整思路

不恢复旧 `AgentAction`、`PlannerPort` 或旧 loop 诊断字段，而是按 LangChain 框架的运行方式补观测层：在 LangChain middleware 里记录每次真实 model call，再由 `/api/chat` trace 写入层投影为日志页已有的模型请求、模型响应和工具执行 step。

## 关键改动

- LangChain runtime 增加 model call trace recorder，记录 `modelCallIndex`、`runtimeStep`、请求摘要、响应摘要、provider `tool_calls`、token usage 和失败信息。
- tool wrapper execution 通过 provider tool call id 回连到对应 model call，并保留执行顺序、失败 code、模型可见摘要和用户投影摘要。
- `/api/chat` trace 写入层为每次 model call 生成 `model_request` / `model_response` step，为每次 wrapper execution 生成 `tool_call` step；summary step 继续保留，但不再承担 loop 推断。
- 日志页读取 `modelCallIndex`，按 LangChain `runtimeStep` 聚合 Loop，导出 payload 保留 `modelCalls`、token usage、provider tool calls 和 tool executions。

## 验证方式

- 增加 LangChain runtime 单元测试，覆盖 provider token usage、provider tool call 链接、tool budget failure 和 provider failure trace summary。
- 增加 trace viewer 回归测试，覆盖两轮 LangChain model call 的 Loop、token usage、provider tool calls、tool wrapper execution 和导出 payload。
- 使用 OpenSpec strict validation、相关测试和 TypeScript 检查验证合同与类型边界。
