## Why

当前 Agent loop 会因为模型在 `tool_call` 顶层多输出不参与执行的字段而直接进入 `invalid_action` repair，导致本可执行的工具调用被中断。LLM 本身容易输出额外字段，服务端应区分“执行关键字段错误”和“可安全丢弃的无关顶层字段”，避免把可恢复的格式噪声升级成 loop 失败。

## What Changes

- 在 `AgentAction` 解析/校验边界增加通用 normalization：按 `type` 保留该 action 允许的顶层字段，丢弃不参与当前 action 执行语义的未知顶层字段。
- `tool_call` 仍必须严格校验 `type`、`toolName` 和 `input`；`input` 必须继续匹配目标 tool schema，非法 toolName、缺失必填字段、类型错误和枚举错误仍然失败。
- 被丢弃的字段不得进入 tool input、不得传给前端、不得参与最终回答或 grounding，只能作为 trace / diagnostic 记录。
- 这类可安全丢弃的顶层字段不应消耗 repair budget；repair 继续用于缺失关键字段、非法 discriminator、非法 tool input、terminal output 失败、resource / policy / grounding 失败等真正不可执行错误。
- 不新增服务端自然语言关键词分流，不新增具体业务 `toolName` 特判，不把本次 warmup/stretch trace 写成生产规则。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-tool-contract-kernel`: 调整 `AgentAction` 执行前校验合同，新增按 action type normalization 和可丢弃未知顶层字段的边界。
- `agent-contract-repair-loop`: 调整 repair 触发边界，明确可安全丢弃的未知顶层字段不进入 repair，不消耗 repair budget；不可安全处理的结构错误仍进入 repair。
- `ai-run-trace`: 增加 action normalization 诊断记录要求，保证被丢弃字段可复盘且不会泄漏敏感 payload。

## Impact

- 影响模块：`lib/server/agent-core/action-validator.ts` 或等价 AgentAction schema/validator、runtime validation trace 事件、repair feedback 入口、相关 tests。
- 不影响模块：业务 tool handler、`searchExerciseResources` 查询语义、`ToolRegistry` 注册、`Policy Guard`、`ResourceStore`、`Response Renderer` 主路径、`/api/chat` 业务路由。
- 验证重点：Agent core contract tests、repair loop tests、trace diagnostics tests、生产聊天中包含额外 `tool_call.content` 的回归用例，以及 `npm run typecheck`。
