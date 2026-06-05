## MODIFIED Requirements

### Requirement: 文本聊天 stream 必须支持用户安全 Agent 进度事件

生产 `/api/chat` 文本聊天 NDJSON stream SHALL 支持用户安全的 Agent 进度事件，例如 `agent_progress`。该事件只服务当前请求的聊天 UI 活动条，MUST NOT 替代 `content`、`visible_output`、`tool_result`、`confirmation_request`、`assistant_suggestions`、`error` 或 `done` 等最终用户事件。

#### Scenario: 进度事件来自当前 agent-core 生命周期
- **WHEN** production chat service 输出 Agent 进度事件
- **THEN** 事件 MUST 来自当前请求生命周期、runtime 观察点、已发生的 `AgentTraceEvent`、tool 安全 UI definition 字段、稳定 resource contract 或等价服务端确定性事实
- **AND** 事件 MUST NOT 由 LLM 直接生成
- **AND** 事件 MUST NOT 基于用户原文、关键词、正则、同义词表或固定短句模板生成
- **AND** 事件 MUST NOT 影响 Planner 输出、Action Validator、Executor、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer 结果

#### Scenario: production adapter 不维护具体 toolName 活动映射
- **WHEN** production chat service 将 `tool_execution` runtime event 投影为 Agent 进度事件
- **THEN** service MUST 优先读取 tool definition 的安全 UI 字段，例如 `uiActivityStage`
- **AND** service MAY 使用稳定 resource contract 做 fallback
- **AND** service MUST NOT 维护 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 或其他具体业务 `toolName` 的活动阶段映射表
- **AND** 缺少 `uiActivityStage` 和 resource fallback 时 MUST 使用通用安全阶段，例如 `analyzing_request`
