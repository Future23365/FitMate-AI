## MODIFIED Requirements

### Requirement: 文本聊天 trace 不得扩大当前业务能力
系统 SHALL 保持当前文本聊天阶段的受控 LangChain tool catalog、跨 run 事实恢复边界和通用 NDJSON 事件边界。新增 trace 写入 MUST NOT 注册额外业务 tool、恢复旧事件或引入服务端自然语言分流。独立 activity tool 废弃后，trace MUST 将活动摘要记录为 runtime / UI metadata，而不是旧 activity report 预算或业务事实。

#### Scenario: trace 写入记录预算和 runtime activity metadata
- **WHEN** `/api/chat` 为文本聊天请求创建 trace
- **THEN** trace MUST 记录 production LangChain tool catalog 摘要、toolCount、toolNames 或等价 catalogHash 证据
- **AND** trace SHOULD 记录本轮 Agent run 的 `maxModelCalls`、`maxToolCalls`、`maxToolCallsPerTool`、`graphRecursionLimit` 或等价 LangChain `recursionLimit`、整体 timeout 和预算事件
- **AND** trace MAY 在独立 runtime / UI metadata 区域记录已投影、被丢弃或 fallback 的 `runtimeMetadata.activitySummary` 摘要和稳定 reason
- **AND** trace MUST NOT 将 `maxActivityReports` 记录为当前生产 activity 摘要预算
- **AND** trace MUST NOT 继续把旧 `maxIterations` 当作当前 LangChain runtime 的预算语义
- **AND** 如本轮恢复了动作事实摘要，trace MUST 只记录安全摘要和引用 id
- **AND** trace MUST NOT 记录完整历史 payload、跨用户 payload、未展示内部候选或未经脱敏的大 payload

### Requirement: 文本聊天 stream 必须支持用户安全 Agent 进度事件
生产 `/api/chat` 文本聊天 NDJSON stream SHALL 支持用户安全的 Agent 进度事件，例如 `agent_progress`。该事件只服务当前请求的聊天 UI 活动条，MUST NOT 替代 `content`、`visible_output`、`tool_result`、`confirmation_request`、`assistant_suggestions`、`error` 或 `done` 等最终用户事件。事件的 `stage`、`status`、`sequence` 和生命周期 MUST 来自服务端当前请求生命周期；可选 `activitySummary` MAY 来自已校验的 `runtimeMetadata.activitySummary` 或服务端安全 fallback。

#### Scenario: 进度事件来自当前 LangChain 生命周期
- **WHEN** production chat service 输出 Agent 进度事件
- **THEN** 事件生命周期、`stage`、`status` 和 `sequence` MUST 来自当前请求生命周期、runtime 观察点、已发生的 LangChain trace summary、tool 安全 UI definition 字段、稳定业务事实合同或等价服务端确定性事实
- **AND** 可选 `activitySummary` MAY 来自通用 wrapper 已校验的 `runtimeMetadata.activitySummary`
- **AND** LLM MUST NOT 直接生成 NDJSON event、`stage`、`status` 或 `sequence`
- **AND** 事件 MUST NOT 基于用户原文、关键词、正则、同义词表或固定短句模板生成
- **AND** 事件 MUST NOT 影响 provider tool_calls、tool wrapper execution、visible output validator、terminal failure finalizer 或 response adapter 结果

#### Scenario: production adapter 不维护具体 toolName 活动映射
- **WHEN** production chat service 将 `tool_execution` runtime event 或 wrapper activity event 投影为 Agent 进度事件
- **THEN** service MUST 优先读取 tool definition 的安全 UI 字段，例如 `uiActivityStage`、`runtimeActivity.defaultSummary` 或等价 metadata
- **AND** service MAY 使用稳定 resource contract 做 fallback
- **AND** service MUST NOT 维护 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 或其他具体业务 `toolName` 的活动阶段映射表
- **AND** 缺少安全 tool metadata 和 resource fallback 时 MUST 使用通用安全阶段，例如 `analyzing_request`

### Requirement: 文本聊天 stream 必须拆分 LangChain 运行轮次和 Activity 事件
生产 `/api/chat` 文本聊天 NDJSON stream SHALL 使用独立事件表达后端 LangChain model/tool 运行轮次和当前活动阶段。轮次事件 MUST 只表示当前请求内真实 LangChain model/tool cycle；Activity 事件 MUST 只表示当前可展示活动阶段或已校验活动摘要，两者不得互相推断或绑定为同一个状态字段。

#### Scenario: 进入后端 LangChain model/tool cycle 时发送轮次事件
- **WHEN** 当前 LangChain runtime 进入一次新的 model/tool cycle
- **THEN** stream MUST 发送 `agent_loop` 或等价白名单事件
- **AND** 事件 payload MUST 包含当前请求内从 1 开始的正整数 `loopTurn`
- **AND** 同一请求内只有进入新的后端 LangChain model/tool cycle 才能递增 `loopTurn`
- **AND** 事件 payload MUST NOT 包含 stage、toolName、tool input、tool output、resource id、prompt、raw model output、token usage 或 trace 详情

#### Scenario: 同一 Loop 内 Activity 更新不改变轮次
- **WHEN** 当前 LangChain model/tool cycle 内发生 model call、tool execution、validation、fact handling、finalizing 或等价运行阶段变化
- **THEN** stream MAY 发送 `agent_progress` 或等价 Activity 事件
- **AND** Activity 事件 MUST 表达 stage/status/messageKey/sequence、已校验 `activitySummary` 或等价 UI 安全字段
- **AND** Activity 事件 MUST NOT 让前端将 `loopTurn` 递增
- **AND** Activity 事件 MUST NOT 要求每个 stage 或 activity summary 都绑定一个 Loop 轮次字段

#### Scenario: 不同 Loop 可以重复相同 Activity 阶段
- **WHEN** 后端连续两个 LangChain model/tool cycle 都执行同类 tool 或同类运行阶段
- **THEN** stream MUST 能表达新的 `agent_loop` 轮次
- **AND** stream MAY 在新轮次内再次发送相同 stage 或相同 `activitySummary` 的 Activity 事件
- **AND** 系统 MUST NOT 因 stage 或摘要文案重复而抑制真实 Loop 轮次变化

#### Scenario: 进入 Loop 前只发送准备阶段
- **WHEN** `/api/chat` 已完成请求校验、上下文准备或 LangChain agent messages 构造，但尚未进入后端 LangChain model/tool cycle
- **THEN** stream MAY 发送 Activity 事件表达准备阶段
- **AND** stream MUST NOT 发送虚假的 `agent_loop` 轮次
- **AND** 前端 MUST 能在没有 Loop 轮次时展示安全活动文案

#### Scenario: Loop 与 Activity 事件不互相派生
- **WHEN** production chat service 输出 `agent_loop` 或 Activity 事件
- **THEN** `agent_loop.loopTurn` MUST 只来自真实 LangChain model/tool cycle
- **AND** Activity 事件的 `stage`、`status` 和 `sequence` MUST 来自当前请求生命周期、runtime 观察点、tool 安全 UI metadata 或等价服务端确定性事实
- **AND** 可选 `activitySummary` MAY 来自已校验的 `runtimeMetadata.activitySummary`
- **AND** 事件生成 MUST NOT 基于用户原文、关键词、正则、同义词表、固定短句模板或具体业务 `toolName` 特判
- **AND** 事件生成失败 MUST 被视为非致命 UI 诊断，不得改变 model call、tool execution、validator、terminal failure finalizer 或 response adapter 结果

### Requirement: 文本聊天 stream 必须投影已校验活动摘要
生产 `/api/chat` 文本聊天 stream MAY 支持在 `agent_progress` 事件中携带可选 `activitySummary` 字段。当前 LangChain 主链中该字段 MUST 只来自通用 wrapper 已校验的 `runtimeMetadata.activitySummary`、tool wrapper 静态默认摘要或服务端安全 fallback。LLM MUST NOT 直接生成 NDJSON event，也不得恢复旧 `AgentAction.activitySummary` 或独立 `reportAgentActivity` stream 合同。

#### Scenario: runtime metadata 摘要通过服务端投影进入 stream
- **WHEN** 通用 wrapper 从业务 tool arguments 中提取 `runtimeMetadata.activitySummary`
- **AND** 该摘要已通过服务端安全边界检查
- **AND** 服务端判定该摘要适合用户展示
- **THEN** `/api/chat` MAY 输出一个 `agent_progress` 事件携带该 `activitySummary`
- **AND** 事件 MUST 继续包含合法 `stage`、`status` 和 `sequence`
- **AND** 事件 SHOULD 保留 `messageKey` 或等价 fallback 信息

#### Scenario: agent_loop 仍只表达轮次
- **WHEN** runtime 进入一次新的 LangChain model/tool cycle
- **THEN** `/api/chat` MUST 继续输出合法 `agent_loop` 事件表达 `loopTurn`
- **AND** 系统 MUST NOT 要求 `agent_loop` 包含模型尚未生成的 `activitySummary`
- **AND** 同一 loop 中后续安全摘要 MAY 通过 `agent_progress` 更新活动条文案

#### Scenario: 非安全摘要降级为固定 stage
- **WHEN** `runtimeMetadata.activitySummary` 缺失、为空、过长、类型不合法或包含内部实现细节
- **THEN** `/api/chat` MUST NOT 将该摘要原样写入 NDJSON stream
- **AND** stream MUST 继续使用现有 `AgentProgressStage` / `messageKey` fallback
- **AND** 非安全摘要 MUST NOT 造成主 Agent run 失败，除非它来自必须拒绝的结构化输出字段

#### Scenario: activitySummary 不进入最终响应事实
- **WHEN** `/api/chat` 将 runtime 结果投影为 `content`、`visible_output`、`suggested_questions`、`tool_result`、`confirmation_request`、`error` 或 `done`
- **THEN** `activitySummary` MUST NOT 被写入这些终态事件的业务 payload
- **AND** `activitySummary` MUST NOT 进入 replay summary、conversation summary、visible output、artifact payload 或跨 run 事实恢复
