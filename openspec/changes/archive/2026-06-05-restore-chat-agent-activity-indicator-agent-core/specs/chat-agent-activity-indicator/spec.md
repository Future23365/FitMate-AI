## MODIFIED Requirements

### Requirement: Chat stream exposes user-safe Agent activity

系统 SHALL 在 `/api/chat` 当前 `agent-core` 文本聊天主链处理请求时，通过 NDJSON stream 提供面向聊天页 UI 的 Agent 进度状态，使前端可以展示当前大致编排阶段。该事件 MUST 使用当前主链的新白名单事件合同，例如 `agent_progress`；系统 MUST NOT 恢复旧 `AgentOrchestrator`、旧 `agent_activity` stream 合同或旧训练卡片触发事件。

#### Scenario: 请求开始时提供初始进度状态
- **WHEN** 用户在聊天页发送消息，并且 `/api/chat` 已完成认证、请求校验和 `AgentRunInput` 构造
- **THEN** stream MUST 在首个用户可见 `content` 事件之前提供初始 Agent 进度状态
- **AND** 初始进度状态 MUST 表示正在准备上下文、理解训练需求或等价的早期处理阶段
- **AND** 初始进度状态 MUST 来自当前请求生命周期，不得来自旧聊天历史、旧 stream event 或旧 `AgentOrchestrator` 字段

#### Scenario: Agent 执行动作库相关工作
- **WHEN** 当前 `agent-core` runtime 已通过 `ToolRegistry`、Action Validator、Policy Guard 和 Executor 执行动作库查询、动作事实读取或等价低风险只读 tool
- **THEN** stream MUST 提供可映射为“正在查询动作库...”或“正在读取已有训练内容...”的进度状态
- **AND** 该状态 MUST 只基于已发生的 runtime / tool execution 生命周期或 tool 安全 UI metadata
- **AND** 该状态 MUST NOT 基于用户原文、关键词、正则、同义词表或固定短句推断
- **AND** 进度状态 MUST NOT 包含完整查询参数、候选池、动作 payload、tool result id、resource id、tool input / output 或 trace payload

#### Scenario: Agent 校验和收口训练内容
- **WHEN** 当前 `agent-core` runtime 正在执行 validation、policy、resource registration、terminal grounding、visible output rendering 或等价确定性收口阶段
- **THEN** stream MUST 提供可区分校验、收尾和整理回复的进度状态
- **AND** 进度状态 MUST 只表达大致阶段，不得承诺百分比、剩余时间或最终一定成功
- **AND** 进度状态 MUST NOT 伪装成训练结果已生成、已保存或已查询成功，除非对应 runtime / tool / renderer 阶段已经真实完成

#### Scenario: 活动事件保持用户安全
- **WHEN** stream 发送 Agent 进度状态
- **THEN** 事件 payload MUST 只包含稳定 stage、status、可选 messageKey 和 sequence 等 UI 安全字段
- **AND** 事件 payload MUST NOT 包含 prompt、raw model output、toolName、tool input、tool output、resource id、token usage、权限信息、数据库 payload、开发 trace 详情或服务端内部错误栈
- **AND** 未知 stage MUST 在前端使用安全兜底文案展示，不得把未知 stage 原文直接渲染给用户

#### Scenario: 活动事件不改变 Agent 执行结果
- **WHEN** 当前 `agent-core` runtime 或 production chat adapter 生成 Agent 进度状态
- **THEN** 进度状态 MUST NOT 改写 Planner action、tool input、tool result、resource contract、Policy Guard 决策、terminal action 或 Response Renderer 的最终用户事件
- **AND** 进度状态生成失败 MUST 被视为非致命 UI 诊断，不得触发模型重试、tool 重试或用户可见业务失败

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
