## MODIFIED Requirements

### Requirement: Chat stream exposes user-safe Agent activity

系统 SHALL 在 `/api/chat` 当前 `agent-core` 文本聊天主链处理请求时，通过 NDJSON stream 提供面向聊天页 UI 的 Agent 进度状态，使前端可以展示当前大致编排阶段。该事件 MUST 使用当前主链的新白名单事件合同，例如 `agent_progress`；系统 MUST NOT 恢复旧 `AgentOrchestrator`、旧 `agent_activity` stream 合同或旧训练卡片触发事件。

#### Scenario: Tool 活动阶段来自安全 definition 字段
- **WHEN** 当前 `agent-core` runtime 已通过 `ToolRegistry`、Action Validator、Policy Guard 和 Executor 执行生产 tool
- **THEN** stream 生成 tool 相关 Agent 进度状态时 MUST 优先读取该 tool 的安全 UI definition 字段，例如 `uiActivityStage`
- **AND** 该字段只能选择稳定 `AgentProgressStage`，不得提供任意用户可见文案
- **AND** 该字段 MUST NOT 进入 Planner 可见 manifest
- **AND** 前端 MUST 继续通过 `agentActivityDisplayByStage` 或等价白名单将 stage 映射为中文短文案
- **AND** 未知 stage MUST 使用安全兜底文案，不得直接渲染内部 stage、toolName、trace step name、runtime event type 或调试 payload

#### Scenario: 新增生产 tool 的活动阶段同步
- **WHEN** 新增或注册一个需要用户可见具体进度的生产 tool
- **THEN** 该 tool MUST 在 tool definition 附近声明对应的安全 activity stage
- **AND** production chat adapter MUST NOT 通过新增具体业务 `toolName -> stage` 表来补同步
- **AND** 如果该 tool 没有用户可理解的具体阶段，系统 MAY 退回通用 `analyzing_request` 或基于稳定 resource contract 的安全 fallback
