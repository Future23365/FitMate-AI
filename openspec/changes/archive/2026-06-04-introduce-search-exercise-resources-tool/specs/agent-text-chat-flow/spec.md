## ADDED Requirements

### Requirement: 生产文本聊天必须使用受控业务 ToolRegistry
生产 `/api/chat` 文本聊天 SHALL 使用受控 production `ToolRegistry` 运行 Agent。该 registry 在本阶段只能注册 `searchExerciseResources` 这一个真实业务 tool，并继续通过 `LlmPlanner -> runAgentRuntime -> Action Validator -> Executor -> Response Renderer` 收口。

#### Scenario: 生产聊天注册动作查询 tool
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 为本轮 Agent run 构造 production `ToolRegistry`
- **AND** registry MUST 包含 `searchExerciseResources`
- **AND** registry MUST NOT 包含 fixture tools、训练生成、保存 artifact、用户记忆、动作详情读取、routine / plan / patch 候选集合或其他未在本 change 中声明的业务 tool
- **AND** Planner 可见 manifest MUST 来自 `ToolRegistry.serializeForPlanner()` 或等价安全序列化入口

#### Scenario: 生产聊天不通过关键词选择 tool
- **WHEN** 用户请求查询动作库、解释训练原则或进行普通文本交流
- **THEN** `/api/chat` MUST NOT 根据用户原文关键词、正则、同义词表或短句模板选择 `searchExerciseResources`
- **AND** 是否调用 tool MUST 由 LLM 基于当前可见 manifest 输出合法 `tool_call` 决定
- **AND** Action Validator MUST 继续拒绝未知 toolName 和非法 input

## MODIFIED Requirements

### Requirement: 文本聊天 trace 不得扩大当前业务能力
系统 SHALL 保持当前文本聊天阶段的受控 `ToolRegistry` 和通用 NDJSON 事件边界。新增 trace 写入 MUST NOT 注册额外业务 tool、恢复旧事件或引入服务端自然语言分流。

#### Scenario: trace 写入只记录受控 registry
- **WHEN** `/api/chat` 为文本聊天请求创建 trace
- **THEN** Planner 可见 tool manifest MUST 只包含 production registry 当前允许的 tool
- **AND** 在本阶段该 manifest MUST 只包含 `searchExerciseResources`
- **AND** 系统 MUST NOT 因 trace 写入注册 fixture tool、训练生成、artifact 保存、用户记忆或任何未声明真实业务 tool
- **AND** trace MUST 记录 registry 摘要、toolCount、toolNames 或等价 manifestHash 证据

#### Scenario: trace 写入不恢复旧兼容事件
- **WHEN** `/api/chat` 返回文本聊天 NDJSON
- **THEN** 响应 MUST NOT 输出旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result` 或旧 card trigger 事件
- **AND** trace MUST NOT 把这些旧事件描述成参与了当前生产执行

#### Scenario: trace 写入失败不影响用户响应
- **WHEN** trace 创建、step 写入、更新或 finish 发生非业务异常
- **THEN** 用户可见 NDJSON 响应 MUST 继续按 runtime 结果返回
- **AND** trace 写入异常 MUST 被记录为非致命开发诊断

## REMOVED Requirements

### Requirement: 文本聊天阶段必须使用空 ToolRegistry
**Reason**: 本 change 将 `searchExerciseResources` 作为第一个真实低风险只读业务 tool 接入 production Agent，继续要求空 `ToolRegistry` 会和新的业务 tool 接入目标冲突。

**Migration**: 使用新增的“生产文本聊天必须使用受控业务 ToolRegistry”要求替代。生产 registry 在本阶段只允许注册 `searchExerciseResources`，并通过 architecture / registry tests 保留无 fixture tool、无训练生成、无保存能力、无服务端关键词分流的边界。
