## Why

当前 LangChain Agent prompt 只说明“只能使用当前 LangChain tool catalog 暴露的工具”，但没有明确“本次 provider request 实际暴露的 `tools` schema 才是唯一可调用集合”。当 runtime 因连续调用上限从后续请求中移除某个业务 tool 后，模型仍可能受历史 `tool_calls` 影响继续生成已经不在当前 request tools 中的 `toolName`。

这会让主 Agent run 进入已可由 runtime 拦截的失败路径，而不是优先基于已进入模型上下文的成功 tool result、当前剩余工具或澄清/失败收口继续。

## What Changes

- 在默认 LangChain Agent system prompt 中补充通用 provider tool calling 边界：模型每次只能调用当前 provider request 实际暴露的 `tools` schema。
- 明确历史消息、历史 `tool_calls` 或历史 tool result 中出现过的 `toolName` 不等于当前仍可调用。
- 保留 runtime 现有执行前拒绝作为硬边界；本 change 不列出不可用工具清单，不向主模型暴露不可用原因，也不写具体业务 `toolName` 分支。
- 补充 prompt 回归测试，确保该通用规则存在，并且不引入 case-specific 用户短语或 `toolName = ...` 规则。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 LangChain Agent prompt 必须表达当前 provider request tools 才是唯一可调用工具目录，历史中出现过但当前未暴露的 toolName 不可调用。

## Impact

- 影响 `lib/server/langchain-agent/prompt.ts` 的默认 system prompt 文案。
- 影响 `tests/langchain-agent-runtime/runtime.test.ts` 中 prompt 合同断言。
- 不修改 production tool catalog、LangChain runtime 主循环、provider payload 构造、tool wrapper handler、response adapter 或 `/api/chat` route。
