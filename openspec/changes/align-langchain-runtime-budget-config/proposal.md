## Why

当前生产 `/api/chat` 使用 LangChain Agent Runtime 后，运行预算配置仍保留了 `maxIterations` 这类旧迭代语义，并用 `maxIterations + 2` 推导 LangChain `recursionLimit`。实际 LangChain agent 底层按 graph step 计数，一组“模型请求 tool_call + tool 执行”会消耗多个 graph step，导致配置允许的 tool 调用次数与真实 `recursionLimit` 不同步。

这会让合法请求在工具调用成功后，还没来得及进入最终结构化回答就被归一为 `budget_exhausted`。本次变更需要把运行预算改成可解释、可测试、与 LangChain 执行语义一致的集中配置合同。

## What Changes

- 将 LangChain runtime 的 graph step 限制改为显式配置或稳定推导，删除不再表达真实执行语义的旧 `maxIterations` 配置。
- 同步 `maxModelCalls`、`maxToolCalls`、activity report 和最终结构化回答之间的预算关系，确保允许的业务 tool 调用不会提前耗尽 `recursionLimit`。
- 保持业务 tool 调用预算、activity report 预算和整体超时仍由集中配置管理，不在 route、tool 或业务模块局部硬编码。
- 补充 runtime 配置与回归测试，覆盖 activity report + 多次业务 tool + final response 的合法路径，以及预算耗尽时仍归一为 `budget_exhausted`。
- 不修改 `/api/chat` 主链路、不新增服务端自然语言分流、不按具体用户 phrasing 或业务 `toolName` 特判。

## Capabilities

### New Capabilities

### Modified Capabilities

- `langchain-agent-runtime`: 运行预算配置必须与 LangChain graph step、模型调用、业务 tool 调用和最终结构化回答语义保持同步。
- `agent-runtime-configuration`: 集中配置只保留真实参与生产 runtime 的预算字段，并用中文注释表达字段之间的约束关系。
- `agent-text-chat-flow`: trace 预算摘要不再暴露旧 `maxIterations` 语义，改为记录 LangChain graph step 限制和真实模型 / tool 调用预算。
- `agent-llm-prompt-configuration`: 默认 system prompt 的运行预算说明必须区分业务 tool 调用和 activity report，避免把 `reportAgentActivity` 与业务 tool 预算混为一谈。
- `agent-tool-production-hardening`: 旧自研 planner / step 固定预算表述必须收敛到当前 LangChain native tool calling 的集中预算合同。

## Impact

- 影响 `lib/server/config/agent-runtime-config.ts` 中 LangChain runtime 预算配置。
- 影响 `lib/server/langchain-agent/runtime.ts` 中传给 LangChain agent 的 `recursionLimit` 计算与预算说明。
- 影响 `tests/langchain-agent-runtime/runtime.test.ts`、`tests/langchain-agent-runtime/config.test.ts` 等 runtime / config 测试。
- 不涉及数据库迁移、API 请求/响应契约变更、前端 UI、业务 tool handler 或 provider payload 合同变更。
