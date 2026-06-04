## MODIFIED Requirements

### Requirement: 生产文本聊天必须使用受控业务 ToolRegistry
生产 `/api/chat` 文本聊天 SHALL 使用受控 production `ToolRegistry` 运行 Agent。该 registry 在本阶段只能注册已声明的低风险只读业务 tool，并继续通过 `LlmPlanner -> runAgentRuntime -> Action Validator -> Executor -> Response Renderer` 收口。

#### Scenario: 生产聊天注册动作查询和事实读取 tool
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 为本轮 Agent run 构造 production `ToolRegistry`
- **AND** registry MUST 包含 `searchExerciseResources`
- **AND** registry MAY 包含本 change 声明的动作事实 read/import tool
- **AND** registry MUST NOT 包含 fixture tools、训练生成、保存 artifact、用户记忆、动作详情读取、routine / plan / patch 候选集合或其他未在 OpenSpec 中声明的业务 tool
- **AND** Planner 可见 manifest MUST 来自 `ToolRegistry.serializeForPlanner()` 或等价安全序列化入口

#### Scenario: 生产聊天恢复跨 run 动作事实摘要
- **WHEN** `/api/chat` 构造 AgentRunInput
- **THEN** 系统 MAY 恢复当前用户和当前会话可访问的最近动作事实轻量摘要
- **AND** 该摘要 MUST 只包含可引用 id、消息 id、事实类型、展示动作数量、少量展示动作摘要和结构化过滤摘要
- **AND** 需要完整事实时，Planner MUST 调用已注册 read/import tool
- **AND** `/api/chat` MUST NOT 从自然语言聊天摘要或 assistant 正文反向重建完整动作事实

#### Scenario: 生产聊天不通过关键词选择 tool
- **WHEN** 用户请求查询动作库、刷新上一批推荐、解释训练原则或进行普通文本交流
- **THEN** `/api/chat` MUST NOT 根据用户原文关键词、正则、同义词表或短句模板选择 `searchExerciseResources` 或动作事实 read/import tool
- **AND** 是否调用 tool MUST 由 LLM 基于当前可见 manifest 和轻量事实摘要输出合法 `tool_call` 决定
- **AND** Action Validator MUST 继续拒绝未知 toolName、非法 input 和非法 resource 引用

### Requirement: 文本聊天 trace 不得扩大当前业务能力
系统 SHALL 保持当前文本聊天阶段的受控 `ToolRegistry`、跨 run 事实恢复边界和通用 NDJSON 事件边界。新增 trace 写入 MUST NOT 注册额外业务 tool、恢复旧事件或引入服务端自然语言分流。

#### Scenario: trace 写入记录预算和事实桥摘要
- **WHEN** `/api/chat` 为文本聊天请求创建 trace
- **THEN** trace MUST 记录 production registry 摘要、toolCount、toolNames 或等价 manifestHash 证据
- **AND** trace SHOULD 记录本轮 Agent run 的 `maxToolCalls`、`maxPlannerCalls`、`maxSteps` 和预算事件
- **AND** 如本轮恢复了动作事实摘要，trace MUST 只记录安全摘要和引用 id
- **AND** trace MUST NOT 记录完整历史 payload、跨用户 payload、未展示内部候选或未经脱敏的大 payload
