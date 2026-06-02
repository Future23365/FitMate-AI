## ADDED Requirements

### Requirement: Chat stream exposes user-safe Agent activity
系统 SHALL 在 `/api/chat` 处理聊天请求时，通过流式响应提供面向聊天页 UI 的 Agent 活动状态，使前端可以展示当前大致编排阶段。

#### Scenario: 请求开始时提供初始活动状态
- **WHEN** 用户在聊天页发送消息并且 `/api/chat` 开始处理请求
- **THEN** stream MUST 在首个用户可见 `content` 事件之前提供初始 Agent 活动状态
- **AND** 初始活动状态 MUST 表示正在准备上下文、理解训练需求或等价的早期处理阶段

#### Scenario: Agent 执行动作库相关工作
- **WHEN** Agent 执行动作库查询、候选动作筛选、训练推荐候选构建或等价动作相关工具
- **THEN** stream MUST 提供可映射为“正在查询动作库...”的活动状态
- **AND** 活动状态 MUST NOT 包含完整查询参数、候选池、动作 payload、tool result id 或 trace payload

#### Scenario: Agent 生成或校验训练内容
- **WHEN** Agent 正在生成动作推荐、单次训练、长期计划、训练修改结果或执行 validator / policy gate
- **THEN** stream MUST 提供可区分生成和校验的活动状态
- **AND** 活动状态 MUST 只表达大致阶段，不得承诺百分比、剩余时间或最终一定成功

#### Scenario: 活动事件保持用户安全
- **WHEN** stream 发送 Agent 活动状态
- **THEN** 事件 payload MUST 只包含稳定枚举、状态、可选文案键和可选顺序号等 UI 安全字段
- **AND** 事件 payload MUST NOT 包含 prompt、raw model output、toolName、tool input、tool output、resource id、token usage、权限信息、数据库 payload 或开发 trace 详情

### Requirement: Chat page displays the current Agent activity in the active answer box
聊天页 SHALL 在当前聊天请求处理中，将 Agent 活动状态展示在正在生成的 AI 回答框顶部，并使用中文短文案说明当前大致阶段。

#### Scenario: 请求处理中展示状态条
- **WHEN** 用户发送消息后请求仍在处理中
- **THEN** 聊天页 MUST 在当前 AI 回答框顶部展示 Agent 活动状态条
- **AND** 原有回答框加载态 MUST 继续在状态条下方展示“正在思考”
- **AND** 输入框上方 MUST NOT 单独展示 Agent 活动状态条
- **AND** 状态条 MUST 不遮挡消息列表、输入框、发送按钮或已有卡片操作

#### Scenario: 状态条展示中文短文案
- **WHEN** 前端收到已知 Agent 活动 stage
- **THEN** 状态条 MUST 展示对应中文短文案
- **AND** 文案 MUST 是面向用户的大致含义，例如“正在理解训练需求...”“正在查询动作库...”“正在生成训练安排...”“正在校验训练内容...”“正在整理回复...”
- **AND** 文案 MUST NOT 展示英文内部字段名、toolName、trace step name 或调试 payload

#### Scenario: 未知活动状态使用兜底文案
- **WHEN** 前端收到未知 Agent 活动 stage 或服务端未发送活动事件但请求仍在处理中
- **THEN** 状态条 MUST 展示兜底中文文案
- **AND** 兜底文案 MUST 不暗示具体工具已经执行

#### Scenario: 状态条提供编排感视觉反馈
- **WHEN** Agent 活动状态条可见
- **THEN** 状态条 MUST 使用动态图标、脉冲、跳动点阵、流动线条或等价轻量动效表现请求正在推进
- **AND** 动效 MUST 保持克制并支持 `prefers-reduced-motion`
- **AND** 状态条 MUST 使用 `aria-live="polite"` 或等价方式对辅助技术暴露状态变化

### Requirement: Agent activity lifecycle is ephemeral
系统 SHALL 将 Agent 活动状态作为当前请求的临时 UI 状态处理，不得把它保存为聊天内容或模型上下文。

#### Scenario: 请求完成后清理状态
- **WHEN** stream 收到 `done`、请求失败、请求超时、请求被取消或会话切换
- **THEN** 前端 MUST 清空当前 Agent 活动状态
- **AND** 聊天页 MUST 不再展示状态条

#### Scenario: 首个回复内容到达后的状态处理
- **WHEN** stream 开始发送用户可见 `content`
- **THEN** 前端 MAY 将活动状态更新为“正在整理回复...”或保持当前阶段直到 `done`
- **AND** 前端 MUST NOT 因收到首段 `content` 而丢失最终清理逻辑

#### Scenario: 活动状态不进入聊天历史
- **WHEN** 前端保存或恢复聊天会话
- **THEN** Agent 活动状态 MUST NOT 写入 `ChatMessage`、聊天历史、conversation summary、conversation context 或 artifact payload
- **AND** 恢复历史会话时 MUST NOT 重放旧活动状态

### Requirement: Agent activity must be verifiable without real browser automation
系统 SHALL 为 Agent 活动状态提供自动化验证，优先通过类型、hook、组件和 stream fixture 测试覆盖核心行为。

#### Scenario: 测试覆盖 stream 事件解析
- **WHEN** 测试构造包含 Agent 活动事件的聊天 stream fixture
- **THEN** 前端解析逻辑 MUST 更新当前 Agent 活动状态
- **AND** 测试 MUST 覆盖未知 stage 兜底和内部字段不渲染

#### Scenario: 测试覆盖生命周期清理
- **WHEN** 测试模拟 `done`、`error`、abort、timeout 或会话切换
- **THEN** 当前 Agent 活动状态 MUST 被清空
- **AND** 活动状态 MUST 不写入聊天历史持久化 payload

#### Scenario: 测试覆盖服务端事件边界
- **WHEN** 测试验证 `/api/chat` Agent stream 事件构造
- **THEN** 事件序列 MUST 包含至少一个首个 `content` 之前的 Agent 活动状态
- **AND** 活动事件 MUST 不包含 prompt、raw model output、tool payload、resource id 或 trace 详情
