## Why

当前生产 Agent 的模型请求、runtime budget、tool 可见事实数量和 prompt 配置分散在多个模块中，导致排查 `max_tokens`、repair、timeout 或 tool 返回数量时必须翻多处代码。该 change 通过集中 TS config 让这些行为边界可审阅、可测试、可统一调整，同时不把系统行为预算下放到环境变量。

## What Changes

- 新增 `lib/server/config/` 作为服务端 Agent 相关配置集中目录。
- 将现有 Agent LLM prompt 配置迁移到 `lib/server/config/` 下，并保持 `promptVersion`、system prompt 构造和测试注入能力。
- 新增集中 TS config，统一管理 Agent LLM 请求参数、runtime limits、业务 tool 可见事实数量和 trace 文本裁剪参数。
- 每个配置项必须有简短中文注释，说明参数用途、影响范围和调大/调小的主要风险。
- 生产 `/api/chat`、`DeepSeekModelAdapter`、Agent runtime 输入构造、相关 tool 和 trace 摘要常量应改为从集中 config 读取。
- API key、endpoint、model 等部署/密钥类配置继续保留现有环境变量边界；本 change 不要求新增环境变量覆盖 runtime budget。
- 不改变 `/api/chat` 请求/响应 API 契约，不新增业务 tool，不新增服务端自然语言分流。

## Capabilities

### New Capabilities
- `agent-runtime-configuration`: 管理生产 Agent 的 TS 配置集中化、注释、默认值、消费边界和验证要求。

### Modified Capabilities
- `agent-llm-prompt-configuration`: prompt 配置入口迁移到 `lib/server/config/`，并与 Agent runtime config 在同一服务端配置目录中统一管理。

## Impact

- 影响代码区域：
  - `lib/server/config/`
  - `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`
  - `lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts`
  - `lib/server/chat/agent-text-chat-service.ts`
  - `lib/server/agent-core/runtime.ts`
  - `lib/server/agent-tools/**`
  - `lib/server/exercises/**`
  - trace/log 摘要相关 server 模块
- 影响测试：
  - prompt 配置测试
  - model adapter 请求体测试
  - runtime budget 测试
  - tool manifest / tool 行为测试
  - architecture boundary 扫描
- 不影响数据库 schema、前端 UI、用户可见 NDJSON 事件格式或环境变量要求。
