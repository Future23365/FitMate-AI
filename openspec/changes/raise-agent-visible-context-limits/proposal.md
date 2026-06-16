## Why

当前生产 Agent 已经能通过 `searchExerciseResources` 等工具拿到候选事实，但业务 tool 的 `toModelVisibleSummary()` 序列化成 LangChain `ToolMessage content` 时仍可能因为 `modelVisibleSummaryMaxLength` 过低被包装成 `status: "truncated"`，模型只能看到 preview。现在主要目标是先保证模型准确消费已经返回的 tool result summary，避免候选已经查到却在主 Agent 可见摘要链路丢失；业务候选数量、trace/user projection、聊天历史窗口和调用次数不在本 change 范围内。

## What Changes

- 调大 `toolWrapper.modelVisibleSummaryMaxLength`，避免正常业务 tool result summary 被包装成 `status: "truncated"` preview。
- 将 `ToolMessage content` 这条模型可见摘要链路中的 JSON 数组项数和对象字段数裁剪纳入集中配置，避免 `toLangChainJsonValue()` 的固定 20/30 结构上限先于长度预算丢失候选事实。
- 不调大模型输出 token、provider timeout、整轮 timeout、模型调用次数、整轮 tool 调用次数、单 tool 重复调用次数、业务 tool 候选数量、业务 hard cap、trace / NDJSON 投影、userProjection、terminal failure finalizer 或聊天 raw message 上限。
- 不新增业务 tool，不改变 `/api/chat` 主链路，不新增服务端自然语言分流，不改变结构化训练输出校验合同。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-runtime-configuration`: 只调整 tool wrapper 中主 Agent 模型可见 tool result summary 的长度预算和结构预算；调用次数、业务数量、timeout、trace/user projection 保持原值。
- `ai-model-payload-budget`: 调整模型可见 `ToolMessage content` 预算策略，在准确度优先阶段保留更完整的受控 tool result summary，同时仍保持确定性上限。

## Impact

- 影响 `lib/server/config/agent-runtime-config.ts` 中的 `toolWrapper.modelVisibleSummaryMaxLength` 和模型可见 JSON 结构预算。
- 影响 `lib/server/langchain-agent/utils.ts`、tool wrapper、runtime synthetic feedback 和业务 tool `toModelVisibleSummary()` 的 JSON 投影结构裁剪行为。
- 不影响动作资源 repository、visible training proposal fact store、业务 tool 默认候选数量、chat raw message schema、trace/user projection 或 finalizer 预算。
- 需要更新相关 runtime/tool wrapper 配置测试、JSON 投影测试和 OpenSpec 验证测试。
