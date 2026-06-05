## Why

Agent Loop 重构前，首页聊天请求已经使用 `deepseek-v4-flash` 并把前端 `thinkingEnabled` 映射到 DeepSeek `thinking` 参数；重构到 `DeepSeekModelAdapter` 后，该能力只剩前端按钮和 metadata，真实模型请求没有继续携带 `thinking`，默认模型也回退为 `deepseek-chat`。

本 change 用于恢复这条已存在但在重构中遗漏的模型请求合同：生产 Agent 默认使用 `deepseek-v4-flash`，前端思考模式开关必须真正控制 DeepSeek Thinking Mode，默认推理强度为 `high`。

## What Changes

- 将生产 `DeepSeekModelAdapter` 的默认模型恢复为 `deepseek-v4-flash`，仍允许 `DEEPSEEK_MODEL` 作为部署环境变量覆盖。
- 将 `/api/chat` 请求中的 `thinkingEnabled` 从 `AgentRunInput.metadata` 传递到 DeepSeek 请求体，映射为 `thinking.type = "enabled" | "disabled"`。
- 新增集中配置项管理 Thinking Mode 默认 `reasoning_effort = "high"`，避免把供应商请求参数散落在 adapter 局部常量中。
- 扩展 DeepSeek 响应类型和 trace 诊断，记录 `reasoning_content` 的受控摘要、长度或可追溯引用，但本 change 不把原始 `reasoning_content` 展示给前端用户。
- 保留后续展示 reasoning 的能力边界：服务端可以保存或投影受控 reasoning 诊断，但当前用户可见 NDJSON 合同不新增 reasoning 展示事件。
- 不接入 DeepSeek 原生 `tools/tool_calls`，不改变内部 `AgentAction`、`ToolRegistry`、runtime validator、Response Renderer 或训练业务 tool 能力。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-runtime-configuration`: 增加 DeepSeek 默认模型、Thinking Mode 和 `reasoning_effort` 的集中配置要求。
- `agent-llm-prompt-configuration`: 明确 `DeepSeekModelAdapter` 请求体必须消费 `thinkingEnabled` 并继续保持 Agent prompt / model input 与供应商协议的边界。
- `ai-run-trace`: 模型请求与响应 trace 必须记录 thinking 配置和 `reasoning_content` 诊断摘要。
- `ai-trace-debugger`: `/dev/ai-traces` 必须能查看 thinking 配置和 reasoning 诊断摘要，但不把原始 reasoning 当作用户可见回复。
- `chat-blackbox-llm-flow-tests`: 基础黑盒请求继续携带 `thinkingEnabled`，并增加对生产请求路径真正使用该字段的验证要求。

## Impact

- 影响 `DeepSeekModelAdapter` 的请求体构造、响应解析和模型 trace envelope。
- 影响生产聊天从 `PreparedChatRequest` / `AgentRunInput` 到 adapter 的配置传递方式。
- 影响 `lib/server/config/` 下 Agent LLM 请求默认值配置。
- 影响相关 adapter、trace、黑盒请求合同和配置测试。
- 不改变 `/api/chat` 前端请求 schema，不改变用户可见 NDJSON 响应协议，不展示原始 `reasoning_content`。
