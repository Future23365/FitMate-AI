## Context

当前 `/api/chat` 的生产文本聊天链路为：

`PreparedChatRequest -> AgentRunInput -> 空 ToolRegistry -> LlmPlanner + DeepSeekModelAdapter -> runAgentRuntime -> 默认 Response Renderer -> NDJSON`

其中 `AgentRunInput` 构造和空 registry 表达当前业务能力边界，`LlmPlanner` 只负责调用模型 adapter 并产出 `AgentAction` candidate。真正发给 DeepSeek 的 system prompt 目前写在 `DeepSeekModelAdapter.createRequestBody()` 内部，与 endpoint、model、temperature、max_tokens、response_format 和 fetch 调用混在一起。

这个结构短期能跑通，但不利于后续维护：prompt 合同变化会直接触碰供应商 adapter；文档中旧 `lib/server/ai/prompt-config.ts` 引用已经滞后；如果后续在同一位置加入业务 tool 说明，也会破坏“新增业务能力只通过 tool bundle + registry 接入”的架构边界。

## Goals / Non-Goals

**Goals:**

- 把 Agent LLM 默认 system prompt 抽成独立配置模块，配置内容可被代码、测试和文档共同引用。
- 让 `DeepSeekModelAdapter` 从配置读取 prompt，而不是在请求构造中硬编码 prompt 文案。
- 为 prompt 配置增加稳定 `promptVersion` 或等价标识，便于 trace、测试和后续变更审阅。
- 支持通过构造参数或 planner factory 注入 prompt 配置，保证单元测试和后续供应商 adapter 可复用。
- 保持 prompt 配置只描述 AgentAction 决策合同、输出格式、安全边界和模型可见运行上下文，不塞入具体业务 tool 规则。
- 更新滞后文档，清楚说明旧 `lib/server/ai/prompt-config.ts` 不再是当前生产 prompt 入口。

**Non-Goals:**

- 不接入 `searchExercises`、动作详情查询、训练生成、计划生成、保存 revision、用户记忆或数据库业务 tool。
- 不新增任何 `agent-tools/<domain>` 业务 tool，不注册 fixture tool 或真实业务 tool。
- 不修改 `PlannerPort`、`agent-core` runtime loop、Action Validator、Executor、Policy Guard、ResourceStore 或默认 Response Renderer 主流程。
- 不改变 `/api/chat` 外部请求 schema、前端 UI、NDJSON 事件合同或用户可见业务能力。
- 不引入服务端关键词、正则、短句模板或规则评分来判断用户语义。
- 不恢复旧 `lib/server/agent-orchestrator/**`、旧 prompt module、旧 `AgentExecutionResult` 或旧兼容事件。

## Decisions

### 1. 新建 Agent LLM prompt 配置模块

新增 `lib/server/agent-planners/prompts/` 或等价目录，用于保存 Agent planner 模型可见 prompt 配置。建议核心导出包括：

- `agentLlmPromptConfig`：默认配置对象。
- `AgentLlmPromptConfig`：配置类型。
- `buildAgentActionSystemPrompt()` 或等价函数：生成 system prompt 字符串。
- `promptVersion`：稳定版本号，例如 `agent-action-v1`。

配置模块只负责模型决策 prompt，不负责业务 tool 注册、HTTP 请求、DeepSeek 认证、fetch、runtime 执行或用户事件投影。

取舍：把 prompt 放进 `.env` 可以更“动态”，但缺少类型、测试和 code review；把 prompt 放进 adapter 又继续混杂供应商协议。独立 TypeScript 配置模块更适合当前项目的强类型和可测试边界。

### 2. Adapter 消费配置，不拥有业务 prompt

`DeepSeekModelAdapter` 构造参数增加可选 `promptConfig` 或等价字段。没有显式传入时使用默认 `agentLlmPromptConfig`。`createRequestBody()` 只负责把配置转成供应商请求体，不再内联 prompt 文案。

配置仍然由 `agent-planners` 层消费，`agent-core` 不导入 prompt 配置，也不感知 DeepSeek、OpenAI 或任何供应商协议。

取舍：让 `LlmPlanner` 直接拼 prompt 可以避免 adapter 参数变化，但 `LlmPlanner` 是供应商无关的 planner 边界，不应该知道 DeepSeek message 格式。adapter 负责消息协议，prompt 配置负责内容来源，两者分开。

### 3. Prompt 内容只描述通用 AgentAction 合同

默认 prompt 应包含：

- 模型必须只返回一个 JSON object。
- 输出必须匹配 `AgentAction` 合同。
- 允许的 `type` 仅包括 `tool_call`、`final_answer`、`ask_user`。
- 模型不得执行 tool、伪造 confirmation/hash、泄漏 secret 或直接输出 NDJSON event。
- 模型必须基于 user payload 中的 `run`、`tools`、`observations`、`toolResults` 做决策。

默认 prompt 不应包含动作库、训练生成、保存 artifact、用户记忆、推荐卡片、训练规则等业务说明。后续业务能力的模型可见说明必须来自 tool manifest、resource contract、projection 或独立业务 tool change，而不是偷偷加进这个 prompt 配置 change。

取舍：把业务规则写进总 prompt 可能短期提升某个场景表现，但会让所有请求都携带业务规则，也破坏 tool-first 的能力隔离。当前 change 只建立通用 prompt 配置位置。

### 4. 配置可测试，不做运行时管理后台

本 change 的“可配置”指代码级配置可集中声明、类型约束、测试注入、版本记录和文档审阅，不要求做数据库表、管理后台、远程配置服务或热更新。

如果未来需要运营级 prompt 版本管理，应另起 change 讨论权限、审计、发布、回滚、灰度和敏感信息保护。

取舍：直接做管理后台会扩大范围并引入权限与发布流程；当前问题是 prompt 硬编码在 adapter 中，代码级配置已能解决维护边界。

### 5. 文档同步真实入口

实现阶段需要更新当前滞后的 prompt 说明，至少说明：

- 当前生产 `/api/chat` 的 prompt 来源是新的 Agent LLM prompt 配置模块。
- 旧 `lib/server/ai/prompt-config.ts` 不再是当前生产入口。
- 模型可见业务能力来自 `ToolManifest` / `ResourceStore` / `observation` / `toolResults`，不是直接写在全局 prompt 中。
- 配置版本如何在测试或 trace 中被识别。

取舍：只改代码不改文档会让后续继续按旧 prompt registry 排查问题；同步文档能降低误判入口的概率。

## Risks / Trade-offs

- [Risk] “可配置”被误解为可以在 env 中随意覆盖完整 prompt。→ Mitigation：本 change 明确只做代码级配置和测试注入，运行时远程配置另起 change。
- [Risk] 后续为了修业务问题把动作/训练规则塞进通用 prompt。→ Mitigation：spec 和架构扫描明确禁止业务 toolName、业务能力说明和旧 prompt module 混入配置。
- [Risk] prompt 抽离后 adapter 测试只验证字段存在，漏掉实际 message 内容。→ Mitigation：测试必须断言 system message 来自配置，并覆盖自定义 prompt 配置注入。
- [Risk] 文档仍保留旧入口描述。→ Mitigation：tasks 要求同步更新 prompt 说明文档和架构文档。

## Migration Plan

1. 新增 Agent LLM prompt 配置类型、默认配置和 system prompt builder。
2. 调整 `DeepSeekModelAdapter` 构造参数和请求体构造，使 system message 来自配置。
3. 在生产 planner factory 中继续使用默认配置，不改变 `/api/chat` 行为或外部请求合同。
4. 增加 prompt 配置测试、adapter 请求体测试和架构扫描。
5. 更新 prompt 说明文档、Agent Tool 架构文档和项目演变记录。
6. 运行 OpenSpec 校验、相关 `tests/agent-core` / route adapter 测试和 `npm run typecheck`。

## Open Questions

无。本 change 的配置范围限定为代码级 prompt 配置；运行时远程配置、业务 prompt 分层和真实业务 tool 接入都不在本 change 内。
