## Why

当前 LangChain runtime 将同一模型响应里的多个同名业务 `tool_calls` 按连续执行次数计入 `maxToolCallsPerTool`。这会把一次模型决策中的合法并列查询误判为跨 observation 的无进展 tool loop，导致需要多分面候选事实的请求提前进入 terminal failure。

该问题暴露出连续同 tool 限制的抽象层级过粗：限制本意是阻断模型在看到 tool result 后仍反复请求同一能力，而不是阻断同一 provider 响应中的不同输入 fan-out。

## What Changes

- 将连续同业务 tool 限制从“连续 tool execution 次数”调整为“连续 provider model response 中同一主业务 tool 批次”。
- 同一 `AIMessage.tool_calls` 批次内，同名业务 tool 的不同输入允许并列执行，并继续消耗整轮 `maxToolCalls` 总预算。
- 同一批次内的同名同参重复请求仍由现有 duplicate input 机制处理，不重复执行 handler。
- 跨模型轮次连续请求同一业务 tool 超过 `maxToolCallsPerTool` 时，继续阻止 handler、记录 `tool_consecutive_call_limit_exceeded`，并终止主 Agent loop。
- 同步默认 system prompt 的运行预算说明，明确同一模型响应内的并列 tool calls 不按循环计数，但重复同参输入仍会被去重或拒绝。
- 不新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 分支。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `langchain-agent-runtime`: 调整连续同业务 tool 限制的 runtime 合同，区分同一模型响应的并列 fan-out 与跨模型轮次的无进展 loop。
- `agent-llm-prompt-configuration`: 同步模型可见运行预算说明，使 prompt 表达新的 batch-aware 连续限制。
- `agent-runtime-configuration`: 澄清 `maxToolCallsPerTool` 的配置语义是连续模型决策批次上限，而不是同批并列 tool execution 上限。

## Impact

- 影响 `lib/server/langchain-agent/runtime.ts` 的连续业务 tool 限制、tool 可用性过滤和 trace / failure 记录。
- 影响 `lib/server/langchain-agent/prompt.ts` 的运行预算文案。
- 影响 `tests/langchain-agent-runtime/runtime.test.ts` 中连续 tool 限制、duplicate input、fan-out 和预算边界测试。
- 不修改 `/api/chat` 外部 API、生产 tool catalog、业务 tool schema、数据库结构或前端事件合同。
