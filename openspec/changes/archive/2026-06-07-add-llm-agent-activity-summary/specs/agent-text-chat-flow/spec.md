## ADDED Requirements

### Requirement: 文本聊天 stream 必须投影已校验活动摘要
生产 `/api/chat` 文本聊天 stream SHALL 支持在 `agent_progress` 事件中携带可选 `activitySummary` 字段。该字段 MUST 只来自当前 run 已校验 `AgentAction.activitySummary` 的安全投影，LLM MUST NOT 直接生成 NDJSON event。

#### Scenario: action 摘要通过服务端投影进入 stream
- **WHEN** Planner 返回包含 `activitySummary` 的 action
- **AND** 该 action 已通过 `AgentAction` schema 校验
- **AND** 服务端判定该摘要适合用户展示
- **THEN** `/api/chat` MAY 输出一个 `agent_progress` 事件携带该 `activitySummary`
- **AND** 事件 MUST 继续包含合法 `stage`、`status` 和 `sequence`
- **AND** 事件 SHOULD 保留 `messageKey` 或等价 fallback 信息

#### Scenario: agent_loop 仍先表达轮次
- **WHEN** runtime 进入一次新的 Agent loop
- **THEN** `/api/chat` MUST 继续先输出合法 `agent_loop` 事件表达 `loopTurn`
- **AND** 系统 MUST NOT 要求 `agent_loop` 包含模型尚未生成的 `activitySummary`
- **AND** 同一 loop 中后续安全摘要 MAY 通过 `agent_progress` 更新活动条文案

#### Scenario: 非安全摘要降级为固定 stage
- **WHEN** action 中的 `activitySummary` 缺失、为空、过长、类型不合法或包含内部实现细节
- **THEN** `/api/chat` MUST NOT 将该摘要原样写入 NDJSON stream
- **AND** stream MUST 继续使用现有 `AgentProgressStage` / `messageKey` fallback
- **AND** 非安全摘要 MUST NOT 造成主 Agent run 失败，除非 action 本身违反 `AgentAction` schema 的硬结构要求

#### Scenario: activitySummary 不进入最终响应事实
- **WHEN** `/api/chat` 将 runtime 结果投影为 `content`、`visible_output`、`suggested_questions`、`tool_result`、`confirmation_request`、`error` 或 `done`
- **THEN** `activitySummary` MUST NOT 被写入这些终态事件的业务 payload
- **AND** `activitySummary` MUST NOT 进入 replay summary、conversation summary、visible output、artifact payload 或跨 run 事实恢复

### Requirement: 文本聊天 trace 必须安全记录活动摘要边界
生产 `/api/chat` trace SHALL 能诊断模型是否提供活动摘要以及服务端是否投影该摘要，但 trace MUST NOT 因该诊断扩大泄漏面或改变用户可见响应。

#### Scenario: trace 记录已采用摘要
- **WHEN** 服务端从合法 action 投影 `activitySummary`
- **THEN** trace MAY 在 `planner_action`、runtime event summary 或 NDJSON 响应摘要中记录已采用的安全摘要
- **AND** trace MUST 记录该摘要来自 `AgentAction.activitySummary` 的服务端投影，而不是 LLM 直接生成的 stream event
- **AND** trace 写入失败 MUST NOT 改变 NDJSON 响应

#### Scenario: trace 不记录被拒绝原文
- **WHEN** `activitySummary` 因安全校验未被投影
- **THEN** trace MAY 记录稳定拒绝原因或计数
- **AND** trace MUST NOT 保存未脱敏的长摘要、内部 raw model response、provider 原文或不安全内部字段
