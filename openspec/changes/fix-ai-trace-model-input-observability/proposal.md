## Why

当前 `/dev/ai-traces` 保存的 LangChain Agent trace 能复盘 provider `tool_calls`、tool 执行状态、失败码、token usage 和 tool result 的模型可见摘要，但不能证明 system prompt、tool description、schema description 和 finalization tool schema 是否完整进入 provider request。

这会导致排查 Agent 重复 tool call 或无法收口时，把“提示词没有进入模型”“提示词进入模型但模型没有遵守”“trace 导出不完整”混在一起，继续基于不完整日志定位会反复跑偏。

## What Changes

- 补强 LangChain model call trace 的模型可见输入快照，记录 system prompt / system message、messages、当前 provider request 暴露的 tools、tool description、schema description、finalization tool、模型参数和预算摘要。
- 为每次模型请求新增 `modelVisibleInputAudit` 或等价审计对象，记录各模型可见字段的来源、长度、hash / fingerprint、完整性状态和缺失字段。
- 补强 `/dev/ai-traces` 保存全链路 log 的导出合同，保证长文本外置只表示“payload 已包含的长文本被外置”，不能暗示未记录的 prompt/tool schema 已保存。
- 为 message package 增加重复消息风险审计，帮助区分 hydration / input assembly 问题与模型决策问题。
- 保持生产 `/api/chat` 的模型调用行为、tool 选择策略、业务 tool handler 和用户可见 NDJSON 输出不变；本 change 只修改 dev trace 可观测性和导出准确性。
- 不新增服务端自然语言分流、关键词规则、业务 `toolName` 特判或 provider `tool_calls` 改写。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `ai-run-trace`: 模型调用 trace 必须能证明或明确否认完整模型可见输入快照是否存在，并在导出 log 中保留可审计的 system prompt、tool description、schema description、messages、工具可用性和预算边界。

## Impact

- 影响 LangChain Agent runtime 的 trace recorder / request summary 类型，不改变 provider request 内容。
- 影响 chat service 写入 `AiTrace` 的 `model_request` step 结构。
- 影响 `/dev/ai-traces` 保存全链路 log 的 payload / long text reference / detailRef 语义。
- 影响 trace 相关测试，包括 runtime trace、trace export、long text mapping、message package 重复风险和敏感字段脱敏。
