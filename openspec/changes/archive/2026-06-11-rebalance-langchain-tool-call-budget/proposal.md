## Why

当前生产 LangChain Agent Runtime 使用 `maxToolCalls = 5` 作为所有业务 tool 共用的总预算。这个设计能防止无限 tool loop，但会让第一个 tool 独占整轮预算，导致后续 tool 没有一次合法的修正或重试空间。

本次变更需要把“整轮业务 tool 安全上限”和“单个业务 tool 单轮调用上限”拆开：总预算调大到 20，同时用 LangChain 原生 `toolCallLimitMiddleware` 为每个业务 tool 提供独立 `runLimit = 2`。

## What Changes

- 将集中配置中的业务 tool 总预算调整为 20，作为整轮安全熔断上限。
- 新增单个业务 tool 的单轮调用预算配置，默认每个业务 tool `runLimit = 2`，表达“首次调用 + 最多一次模型修正调用”。
- 在 LangChain runtime 中按 production tool catalog 自动生成 per-tool `toolCallLimitMiddleware`，避免手写具体业务 toolName 分支。
- 保留 `reportAgentActivity` 独立 activity 预算，不把它纳入业务 tool per-tool 限制。
- 同步更新模型可见运行预算说明、runtime / config 测试和 OpenSpec 合同。
- 不新增业务 tool、不修改 `/api/chat` 主链路、不改变 tool handler、provider payload、数据库结构或用户可见 API 契约。

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-runtime-configuration`: 集中配置必须区分整轮业务 tool 总预算和单个业务 tool 单轮调用预算，并声明总预算默认值为 20、单 tool 默认 run limit 为 2。
- `langchain-agent-runtime`: Runtime 必须使用 LangChain per-tool call limit middleware 约束单个业务 tool 的单轮调用次数，同时保留总业务 tool 安全熔断。
- `agent-llm-prompt-configuration`: 模型可见运行预算说明必须同时表达整轮业务 tool 总预算和单个业务 tool 单轮调用上限。
- `agent-tool-production-hardening`: 旧固定 `maxToolCalls = 10` 的要求需要更新为当前 LangChain runtime 的总预算 20 + 单 tool run limit 2 的预算合同。

## Impact

- 影响 `lib/server/config/agent-runtime-config.ts` 的 LangChain runtime 预算配置、类型和中文注释。
- 影响 `lib/server/langchain-agent/runtime.ts` 的 `createAgent` middleware 组合和业务 tool 预算执行。
- 影响 `lib/server/langchain-agent/prompt.ts` 的运行预算说明。
- 影响 `tests/langchain-agent-runtime/runtime.test.ts`、`tests/langchain-agent-runtime/config.test.ts` 等 runtime / config 测试。
- 需要新增 docs 变更记录，说明预算从共享 5 次调整为总预算 20 + per-tool 2 次的原因和边界。
