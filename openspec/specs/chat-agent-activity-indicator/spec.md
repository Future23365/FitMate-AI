# chat-agent-activity-indicator Specification

## Purpose
TBD - created by archiving change add-agent-activity-indicator. Update Purpose after archive.
## Requirements
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

### Requirement: Chat page displays the current Agent activity in the active answer box

聊天页 SHALL 在当前聊天请求处理中，将 Agent 进度状态展示在正在生成的 AI 回答框顶部，并使用旧活动条的紧凑视觉样式作为基线。活动条只表达当前请求正在推进，不得使用 `/dev/ai-traces` 的 loop 卡片、模块卡片或调试详情样式。

#### Scenario: 请求处理中展示状态条
- **WHEN** 用户发送消息后请求仍在处理中
- **THEN** 聊天页 MUST 在当前 AI 回答框顶部展示 Agent 活动状态条
- **AND** 原有回答框加载态 MUST 继续在状态条下方展示“正在思考”
- **AND** 输入框上方 MUST NOT 单独展示 Agent 活动状态条
- **AND** 状态条 MUST 不遮挡消息列表、输入框、发送按钮、建议按钮或已有训练卡片操作

#### Scenario: 状态条使用旧紧凑样式
- **WHEN** Agent 活动状态条可见
- **THEN** 状态条 MUST 使用旧活动条的紧凑行内视觉基线
- **AND** 状态条 MUST 保留 `agent-activity-indicator` 类名或等价稳定测试 hook
- **AND** 状态条 MUST 使用 Material Symbols / `SymbolIcon` 图标和中文短文案
- **AND** 状态条 MUST 使用接近 `flex items-center gap-xs px-xs py-[2px] font-label-sm text-label-sm font-bold` 的紧凑布局
- **AND** 状态条 MUST 默认使用主色弱强调，例如 `text-primary/80`，失败态 MAY 使用 `text-error`
- **AND** 状态条 MUST NOT 渲染为卡片、边框面板、trace accordion、badge 列表、JSON 预览或调试模块

#### Scenario: 状态条展示中文短文案
- **WHEN** 前端收到已知 Agent 进度 stage
- **THEN** 状态条 MUST 展示对应中文短文案
- **AND** 文案 MUST 是面向用户的大致含义，例如“正在整理上下文...”“正在规划下一步...”“正在查询动作库...”“正在读取已有训练内容...”“正在校验训练内容...”“正在整理回复...”
- **AND** 文案 MUST NOT 展示英文内部字段名、toolName、trace step name、runtime event type 或调试 payload

#### Scenario: 未知活动状态使用兜底文案
- **WHEN** 前端收到未知 Agent 进度 stage 或服务端未发送活动事件但请求仍在处理中
- **THEN** 状态条 MUST 展示兜底中文文案
- **AND** 兜底文案 MUST 不暗示具体工具已经执行
- **AND** 兜底文案 MUST NOT 包含未知 stage 原文

#### Scenario: 状态条提供编排感视觉反馈
- **WHEN** Agent 活动状态条可见
- **THEN** 状态条 MUST 使用脉冲、动态图标或等价轻量动效表现请求正在推进
- **AND** 动效 MUST 保持克制并支持 `prefers-reduced-motion`
- **AND** 状态条 MUST 使用 `aria-live="polite"` 或等价方式对辅助技术暴露状态变化

### Requirement: Agent activity lifecycle is ephemeral

系统 SHALL 将 Agent 进度状态作为当前请求的临时 UI 状态处理，不得把它保存为聊天内容、模型上下文或训练事实。

#### Scenario: 请求完成后清理状态
- **WHEN** stream 收到 `done`、请求失败、请求超时、请求被取消或会话切换
- **THEN** 前端 MUST 清空当前 Agent 进度状态
- **AND** 聊天页 MUST 不再展示状态条
- **AND** 最小展示时间、动画或阶段仲裁规则 MUST NOT 延迟这些清理动作

#### Scenario: 首个回复内容到达后的状态处理
- **WHEN** stream 开始发送用户可见 `content`
- **THEN** 前端 MAY 将活动状态更新为“正在整理回复...”或保持当前阶段直到 `done`
- **AND** 前端 MUST NOT 因收到首段 `content` 而丢失最终清理逻辑
- **AND** 前端 MUST NOT 将 `content` 文本解析成新的业务阶段

#### Scenario: 活动状态不进入聊天历史
- **WHEN** 前端保存或恢复聊天会话
- **THEN** Agent 进度状态 MUST NOT 写入 `ChatMessage`、聊天历史、conversation summary、conversation context、visible output、artifact payload 或本地历史兼容字段
- **AND** 恢复历史会话时 MUST NOT 重放旧活动状态

### Requirement: Agent activity must be verifiable without real browser automation

系统 SHALL 为 Agent 进度状态提供自动化验证，优先通过类型、hook、组件、service stream fixture 和 architecture boundary 测试覆盖核心行为。

#### Scenario: 测试覆盖 stream 事件解析
- **WHEN** 测试构造包含 `agent_progress` 的聊天 stream fixture
- **THEN** 前端解析逻辑 MUST 更新当前 Agent 进度状态
- **AND** 测试 MUST 覆盖未知 stage 兜底和内部字段不渲染
- **AND** 测试 MUST 覆盖非法 progress payload 不会污染消息内容

#### Scenario: 测试覆盖生命周期清理
- **WHEN** 测试模拟 `done`、`error`、abort、timeout 或会话切换
- **THEN** 当前 Agent 进度状态 MUST 被清空
- **AND** 活动状态 MUST 不写入聊天历史持久化 payload

#### Scenario: 测试覆盖服务端事件边界
- **WHEN** 测试验证 `/api/chat` 当前 Agent stream 事件构造
- **THEN** 事件序列 MUST 包含至少一个首个 `content` 之前的 Agent 进度状态
- **AND** 活动事件 MUST 不包含 prompt、raw model output、tool payload、resource id、token usage 或 trace 详情
- **AND** 测试 MUST 证明旧 `agent_activity`、旧 `assistant_action`、旧 `agent_execution_result` 和旧 `intent_resolved` 未被恢复

### Requirement: 聊天活动条必须独立消费 Agent Loop 和 Activity 事件

聊天页 SHALL 将 Agent Loop 轮次和当前活动文案建模为两个独立的临时 UI 状态。`#N` MUST 只来自后端 stream 的 Loop 事件；右侧中文文案 MUST 只来自 Activity stage 映射或安全兜底文案。

#### Scenario: 收到 Loop 事件只更新轮次前缀
- **WHEN** 前端聊天客户端收到合法 `agent_loop` 事件
- **THEN** 当前活动条状态 MUST 更新为该事件的 `loopTurn`
- **AND** 活动条在存在活动文案时 MUST 展示 `#N` 前缀
- **AND** 该更新 MUST NOT 修改当前 Activity stage、中文文案、图标或失败状态
- **AND** 非正整数、非有限数字或过期的 `loopTurn` MUST NOT 覆盖当前轮次

#### Scenario: 收到 Activity 事件只更新中文文案
- **WHEN** 前端聊天客户端收到合法 `agent_progress` 或等价 Activity 事件
- **THEN** 当前活动条状态 MUST 更新对应 Activity stage
- **AND** 活动条右侧 MUST 展示该 stage 映射出的中文短文案
- **AND** 该更新 MUST NOT 递增、重置或推断 `loopTurn`
- **AND** 未知 stage MUST 使用安全兜底中文文案，不得直接渲染原始 stage 字段

#### Scenario: 同一 Loop 内多次 Activity 更新保持同一前缀
- **WHEN** 前端先收到 `agent_loop` 的 `loopTurn=1`
- **AND** 随后收到多个 Activity 事件，例如 `analyzing_request`、`querying_exercises`、`validating_result`
- **THEN** 活动条 MUST 可以更新右侧中文文案
- **AND** 活动条 MUST 保持 `#1` 前缀不变
- **AND** 前端 MUST NOT 按 Activity 事件数量显示 `#2`、`#3` 或更高轮次

#### Scenario: 新 Loop 内重复相同 Activity 文案仍更新前缀
- **WHEN** 前端已经展示 `#1 正在查询动作库...`
- **AND** stream 随后发送合法 `agent_loop` 事件，`loopTurn=2`
- **AND** 新轮次内 Activity stage 仍为 `querying_exercises`
- **THEN** 活动条 MUST 展示 `#2 正在查询动作库...`
- **AND** 前端 MUST NOT 因中文文案重复而忽略新的 Loop 轮次

#### Scenario: 未进入 Loop 前不显示虚假前缀
- **WHEN** 当前请求只有准备阶段 Activity 事件，尚未收到合法 Loop 事件
- **THEN** 活动条 MAY 展示准备阶段中文文案
- **AND** 活动条 MUST NOT 显示 `#0`、`#1` 或基于本地计数生成的前缀

#### Scenario: 请求结束时同时清理两类临时状态
- **WHEN** stream 收到 `done`、`error`，请求 abort、timeout、会话切换或新建会话
- **THEN** 前端 MUST 清空当前 `loopTurn` 和 Activity stage
- **AND** 两类状态 MUST NOT 写入 `ChatMessage`、聊天历史、conversation summary、visible output、artifact payload 或模型上下文

### Requirement: Agent Loop 前缀必须保持简约用户可见样式

聊天页活动条 SHALL 以简约行内样式展示 Agent Loop 前缀。该前缀 MUST 只使用 `#N` 形式表达轮次，不得展示“Agent Loop”、runtime step、planner call、tool call 或其他技术诊断文本。

#### Scenario: 活动条展示简约轮次前缀
- **WHEN** 活动条同时存在合法 `loopTurn` 和 Activity 文案
- **THEN** 活动条 MUST 在中文文案前展示 `#N`
- **AND** `#N` MUST 与中文文案视觉相邻但状态来源独立
- **AND** 活动条 MUST NOT 展示 `Loop 1`、`第一轮`、`Step1`、`S1`、runtime step、planner call 或 tool call 诊断信息

#### Scenario: 前缀不与文案语义绑定
- **WHEN** 第五个 Agent Loop 内 Activity stage 仍是 `querying_exercises`
- **THEN** 活动条 MUST 能展示 `#5 正在查询动作库...`
- **AND** 系统 MUST NOT 把 `querying_exercises` 文案解释为第几轮含义

### Requirement: 聊天活动条必须展示安全活动摘要
聊天页活动条 SHALL 在当前请求处理中优先展示服务端投影的安全 `activitySummary`。当摘要缺失或不安全时，活动条 MUST 继续使用现有 `AgentProgressStage` 固定中文文案或安全兜底文案。`activitySummary` 的当前生产来源 MUST 是 `/api/chat` 已校验 runtime metadata、tool wrapper 静态默认摘要或服务端安全 fallback，不得要求模型通过独立 activity tool 生成。

#### Scenario: 展示 runtime metadata activitySummary
- **WHEN** 前端收到合法 `agent_progress` 事件
- **AND** 事件包含通过前端二次校验的 `activitySummary`
- **THEN** 活动条 MUST 展示该摘要作为右侧中文文案
- **AND** 活动条 MAY 继续使用当前 stage 对应的图标、色调和紧凑布局
- **AND** 活动条 MUST NOT 展示 `toolName`、trace step name、runtime event type、schema 字段或调试 payload
- **AND** 前端 MUST NOT 要求事件 `stage` 固定为 `model_activity`

#### Scenario: 前端不恢复旧 activity 来源
- **WHEN** 聊天活动条消费 `agent_progress.activitySummary`
- **THEN** 前端 MUST NOT 从 `reportAgentActivity`、旧 `AgentAction.activitySummary`、旧 `agent_activity` 事件或 assistant `content` 文本恢复摘要
- **AND** 前端 MUST NOT 根据用户输入、业务 `toolName` 或 stage 原文生成替代摘要
- **AND** 摘要仍 MUST NOT 写入 `ChatMessage`、聊天历史、conversation summary、conversation context、visible output、artifact payload 或本地历史兼容字段

### Requirement: 活动摘要必须保持用户可访问展示
聊天页 SHALL 以现有活动条可访问性和紧凑样式展示 `activitySummary`。新增摘要文案 MUST 不破坏当前回答框布局、loop 前缀或辅助技术状态提示。

#### Scenario: 摘要与 loop 前缀同屏展示
- **WHEN** 活动条同时存在合法 `loopTurn` 和安全 `activitySummary`
- **THEN** 活动条 MUST 展示 `#N` 前缀和摘要文案
- **AND** `#N` MUST 只来自 `agent_loop.loopTurn`
- **AND** 摘要文案 MUST NOT 改写、递增或隐藏合法 loop 前缀

#### Scenario: 摘要使用 polite 状态提示
- **WHEN** 活动条展示 `activitySummary`
- **THEN** 活动条 MUST 继续使用 `aria-live="polite"` 或等价方式暴露状态变化
- **AND** 动效 MUST 继续支持 `prefers-reduced-motion`
- **AND** 文案长度 MUST 受控，避免遮挡消息列表、输入框、发送按钮、建议按钮或训练卡片操作

### Requirement: 聊天活动条必须继续独立显示 Agent Loop 轮次
聊天页 SHALL 保持 `agent_loop` 和模型活动摘要为两个独立状态。`#N` MUST 只来自 `agent_loop.loopTurn`，右侧文案 MUST 来自模型活动摘要或安全 fallback。

#### Scenario: 模型摘要不改变 loop 前缀
- **WHEN** 活动条已经展示合法 `loopTurn`
- **AND** 前端收到包含模型 `activitySummary` 的 `agent_progress`
- **THEN** 活动条 MUST 更新右侧文案
- **AND** 活动条 MUST 保持当前 `#N` 前缀不变
- **AND** 前端 MUST NOT 根据摘要事件数量递增、重置或推断 `loopTurn`

#### Scenario: 新 loop 保留当前摘要文案
- **WHEN** 活动条已经展示模型活动摘要
- **AND** 前端随后收到新的合法 `agent_loop` 事件
- **THEN** 活动条 MUST 更新 `#N` 前缀
- **AND** 活动条 MAY 保留当前摘要直到下一条模型活动摘要或请求结束
- **AND** 摘要文案重复 MUST NOT 阻止合法 loop 前缀更新

