## Why

当前生产 Agent 已经能通过 `searchExerciseResources` 等工具拿到候选事实，但模型可见摘要、结构投影、候选数量和失败收口输入仍存在较低的裁剪边界。现在主要目标是先保证模型准确消费事实，避免候选已经查到却因预算或硬裁剪丢失，再在后续独立优化 token 成本。

## What Changes

- 调大 LangChain Agent 主链、tool wrapper、terminal failure finalizer、trace / NDJSON 投影和业务 tool 候选读取预算。
- 将 `toLangChainJsonValue()` 中数组项数和对象字段数的硬编码裁剪纳入集中配置，并在模型可见摘要、userProjection、traceSummary、finalizer 输入和 visible output 投影中统一使用。
- 同步调大 `searchExerciseResources` 的候选数量配置和 repository hard cap，避免只改配置但底层仍被旧 hard cap 截断。
- 同步调大 `inspectVisibleTrainingProposals` 的最近事实读取配置和 fact store hard cap，避免历史可见训练事实过早丢失。
- 不新增业务 tool，不改变 `/api/chat` 主链路，不新增服务端自然语言分流，不改变结构化训练输出校验合同。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-runtime-configuration`: 调整 Agent runtime、tool wrapper、finalizer 和业务 tool 可见事实预算，要求集中配置和 hard cap 同步。
- `ai-model-payload-budget`: 调整模型可见 payload 预算策略，在准确度优先阶段保留更完整的受控事实，同时仍保持确定性上限。

## Impact

- 影响 `lib/server/config/agent-runtime-config.ts` 中的运行预算、投影预算和 tool 候选数量配置。
- 影响 `lib/server/langchain-agent/utils.ts` 及其调用方的 JSON 投影结构裁剪行为。
- 影响动作资源 repository 和 visible training proposal fact store 的 hard cap。
- 需要更新相关 runtime、tool、response adapter 和 OpenSpec 验证测试。
