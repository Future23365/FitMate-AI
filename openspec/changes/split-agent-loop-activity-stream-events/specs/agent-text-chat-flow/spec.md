## ADDED Requirements

### Requirement: 文本聊天 stream 必须拆分 Agent Loop 和 Activity 事件

生产 `/api/chat` 文本聊天 NDJSON stream SHALL 使用独立事件表达后端 Agent Loop 轮次和当前活动阶段。Loop 事件 MUST 只表示当前请求内真实 Agent Loop 轮次；Activity 事件 MUST 只表示当前可展示活动阶段，两者不得互相推断或绑定为同一个状态字段。

#### Scenario: 进入后端 Agent Loop 时发送轮次事件
- **WHEN** 当前 `agent-core` runtime 进入一次新的 Agent Loop
- **THEN** stream MUST 发送 `agent_loop` 或等价白名单事件
- **AND** 事件 payload MUST 包含当前请求内从 1 开始的正整数 `loopTurn`
- **AND** 同一请求内只有进入新的后端 Agent Loop 才能递增 `loopTurn`
- **AND** 事件 payload MUST NOT 包含 stage、toolName、tool input、tool output、resource id、prompt、raw model output、token usage 或 trace 详情

#### Scenario: 同一 Loop 内 Activity 更新不改变轮次
- **WHEN** 当前 Agent Loop 内发生 planner、tool execution、validation、resource handling、finalizing 或等价运行阶段变化
- **THEN** stream MAY 发送 `agent_progress` 或等价 Activity 事件
- **AND** Activity 事件 MUST 表达 stage/status/messageKey/sequence 或等价 UI 安全字段
- **AND** Activity 事件 MUST NOT 让前端将 `loopTurn` 递增
- **AND** Activity 事件 MUST NOT 要求每个 stage 都绑定一个 Loop 轮次字段

#### Scenario: 不同 Loop 可以重复相同 Activity 阶段
- **WHEN** 后端连续两个 Agent Loop 都执行同类 tool 或同类运行阶段
- **THEN** stream MUST 能表达新的 `agent_loop` 轮次
- **AND** stream MAY 在新轮次内再次发送相同 stage 的 Activity 事件
- **AND** 系统 MUST NOT 因 stage 文案重复而抑制真实 Loop 轮次变化

#### Scenario: 进入 Loop 前只发送准备阶段
- **WHEN** `/api/chat` 已完成请求校验、上下文准备或 `AgentRunInput` 构造，但尚未进入后端 Agent Loop
- **THEN** stream MAY 发送 Activity 事件表达准备阶段
- **AND** stream MUST NOT 发送虚假的 `agent_loop` 轮次
- **AND** 前端 MUST 能在没有 Loop 轮次时展示安全活动文案

#### Scenario: Loop 与 Activity 事件均来自服务端确定性生命周期
- **WHEN** production chat service 输出 `agent_loop` 或 Activity 事件
- **THEN** 事件 MUST 来自当前请求生命周期、runtime 观察点、已发生的 `AgentTraceEvent`、tool 安全 UI metadata 或等价服务端确定性事实
- **AND** 事件 MUST NOT 由 LLM 直接生成
- **AND** 事件 MUST NOT 基于用户原文、关键词、正则、同义词表、固定短句模板或具体业务 `toolName` 特判生成
- **AND** 事件生成失败 MUST 被视为非致命 UI 诊断，不得改变 Planner、Executor、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer 结果
