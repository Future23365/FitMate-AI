## ADDED Requirements

### Requirement: 文本聊天 stream 必须支持用户安全 Agent 进度事件

生产 `/api/chat` 文本聊天 NDJSON stream SHALL 支持用户安全的 Agent 进度事件，例如 `agent_progress`。该事件只服务当前请求的聊天 UI 活动条，MUST NOT 替代 `content`、`visible_output`、`tool_result`、`confirmation_request`、`assistant_suggestions`、`error` 或 `done` 等最终用户事件。

#### Scenario: 进度事件出现在首个 content 之前
- **WHEN** 已认证用户向 `/api/chat` 发送合法请求，并且请求进入当前 `agent-core` 文本聊天主链
- **THEN** stream MUST 在首个用户可见 `content` 事件之前输出至少一个 `agent_progress` 或等价当前主链进度事件
- **AND** 该事件 MUST 表达 `preparing_context`、`analyzing_request` 或等价早期阶段
- **AND** 该事件 MUST NOT 包含旧 `agent_activity` 事件名或旧 `AgentOrchestrator` payload

#### Scenario: 进度事件来自当前 agent-core 生命周期
- **WHEN** production chat service 输出 Agent 进度事件
- **THEN** 事件 MUST 来自当前请求生命周期、runtime 观察点、已发生的 `AgentTraceEvent`、tool 安全 UI metadata 或等价服务端确定性事实
- **AND** 事件 MUST NOT 由 LLM 直接生成
- **AND** 事件 MUST NOT 基于用户原文、关键词、正则、同义词表或固定短句模板生成
- **AND** 事件 MUST NOT 影响 Planner 输出、Action Validator、Executor、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer 结果

#### Scenario: 终态用户事件仍来自 Response Renderer
- **WHEN** runtime 完成并产生 `AgentRunResult`
- **THEN** production chat service MUST 继续使用默认 Response Renderer 或等价安全 renderer 输出最终用户事件
- **AND** `content` MUST 来自已校验 terminal action
- **AND** `visible_output` MUST 来自已校验 visible output renderer
- **AND** `tool_result` MUST 来自 tool result 的安全 user projection
- **AND** `done` MUST 只表达响应结束，不得携带旧兼容 payload

#### Scenario: 不恢复旧兼容事件
- **WHEN** `/api/chat` 返回文本聊天 NDJSON
- **THEN** 响应 MUST NOT 输出旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result`、旧 card trigger 或旧 `agent_activity` 事件
- **AND** 前端 MUST NOT 依赖这些旧事件展示本轮文本回复或活动条

### Requirement: Agent runtime 进度观察必须是非致命只读扩展

系统 SHALL 将 Agent 进度观察作为当前 `agent-core` runtime 的只读扩展处理。任何进度观察、阶段映射或 stream 写入失败都不得改变 runtime 的业务执行结果。

#### Scenario: 观察点失败不影响 runtime
- **WHEN** runtime 在记录 registry snapshot、planner budget、planner action、validation result、policy decision、tool execution、resource registration 或 terminal grounding 等生命周期事件时触发进度观察
- **AND** 观察回调或阶段映射抛出异常
- **THEN** runtime MUST 继续按原始 Agent 合同执行
- **AND** runtime MUST NOT 重试 planner、重试 tool、改写 action、跳过 validator、改变 policy decision 或替换 terminal action
- **AND** 系统 MAY 记录非致命开发诊断

#### Scenario: core 不包含业务阶段分支
- **WHEN** 实现 runtime 进度观察机制
- **THEN** `agent-core` MUST 只暴露通用生命周期事件或通用观察点
- **AND** `agent-core` MUST NOT 包含 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 或其他具体业务 `toolName` 的 UI 阶段分支
- **AND** 业务 tool 如需提供更具体 UI 阶段，MUST 通过 tool 安全 metadata、projection 或 production adapter 的安全映射表达

#### Scenario: stream 写入失败安全收口
- **WHEN** production chat service 在写入 `agent_progress` 时遇到 stream 已关闭、请求 abort 或写入异常
- **THEN** 系统 MUST 按当前请求取消或错误边界安全收口
- **AND** 已完成的 runtime 结果 MUST 不因进度写入失败被改写成业务成功或业务失败
- **AND** 用户可见错误 MUST 继续使用当前安全中文错误边界
