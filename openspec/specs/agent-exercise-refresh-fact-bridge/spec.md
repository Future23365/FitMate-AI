# agent-exercise-refresh-fact-bridge Specification

## Purpose
TBD - created by archiving change support-agent-exercise-refresh-fact-bridge. Update Purpose after archive.
## Requirements
### Requirement: 系统必须持久化用户可见动作事实
系统 SHALL 在生产聊天中保存用户实际看到的结构化动作查询 / 推荐事实，用于后续“再推荐一批”“换一批”“不要重复刚才动作”等跨 run 刷新请求。持久化事实 MUST 以服务端确定性投影为来源，不得从自然语言回复正文反向重建。

#### Scenario: 保存用户可见动作事实
- **WHEN** `searchExerciseResources` 或等价动作推荐查询结果被成功投影给用户
- **THEN** 系统 MUST 保存一条用户可见动作事实
- **AND** 事实 MUST 绑定 `userId`、`conversationId`、`messageId` 或等价响应消息 id、fact kind、status、schemaVersion 和 createdAt
- **AND** 事实 MUST 保存本次结构化查询摘要和 `displayedExerciseIds`
- **AND** `displayedExerciseIds` MUST 只包含已经进入用户可见投影的动作 id

#### Scenario: 不排除用户未看到的候选
- **WHEN** tool handler 返回了比用户投影更多的内部候选、诊断候选或未展示动作
- **THEN** 这些未展示动作 MUST NOT 进入默认刷新排除集合
- **AND** 系统 MAY 为诊断保存 `returnedExerciseIds` 或等价内部摘要
- **AND** `returnedExerciseIds` MUST NOT 被 read/import tool 默认暴露为用户已看到动作

#### Scenario: 保存事实不改变用户响应
- **WHEN** 用户可见响应已经由 runtime 和 Response Renderer 生成
- **THEN** 持久化动作事实失败 MUST 被记录为结构化诊断
- **AND** 系统 MUST NOT 因事实保存失败改写本轮模型 action、重新调用 tool 或伪造用户可见结果

### Requirement: `/api/chat` 必须恢复轻量动作事实摘要
生产 `/api/chat` SHALL 在构造 AgentRunInput 前恢复当前用户和会话可访问的最近动作事实轻量摘要，使 Planner 能知道存在可读取的上一轮动作事实，但不能直接获得完整历史 payload。

#### Scenario: 恢复最近动作事实索引
- **WHEN** 已认证用户在同一会话中继续发送消息
- **THEN** `/api/chat` MAY 读取该用户可访问的最近动作事实摘要、引用 id、消息 id、展示动作数量、少量动作名 / id 和原始过滤摘要
- **AND** 这些摘要 MAY 进入 AgentRunInput metadata、context package 或等价模型可见上下文
- **AND** 摘要 MUST NOT 包含完整 handler output、未展示内部候选、跨用户 payload 或未脱敏诊断数据

#### Scenario: 上下文恢复不做语义分流
- **WHEN** 用户说“再推荐一批”“换一批”或其他自然语言请求
- **THEN** `/api/chat` MUST NOT 根据用户原文关键词选择 read/import tool 或 `searchExerciseResources`
- **AND** 是否读取上一轮事实、是否排除已展示动作和是否再次查询动作库 MUST 由 Planner 基于可见 manifest 和事实摘要输出合法 AgentAction 决定
- **AND** 服务端 MUST NOT 从 assistant 文本正文反推上一轮动作列表

### Requirement: read/import tool 必须把历史动作事实重新引入当前 run
系统 SHALL 提供受控 read/import 能力读取上一轮用户可见动作事实。该能力 MUST 校验 actor、会话范围、事实状态、schemaVersion 和引用唯一性，并把读取结果作为当前 run 的安全 tool result 或 consumable resource 登记。

#### Scenario: 读取可访问动作事实
- **WHEN** Planner 调用 read/import tool 读取某条最近动作事实
- **AND** 当前 actor 有权访问该 `userId` 和 `conversationId` 下的事实
- **AND** 事实 status、kind 和 schemaVersion 可被当前实现支持
- **THEN** tool MUST 返回结构化成功结果
- **AND** 结果 MUST 包含原始结构化查询摘要和 `displayedExerciseIds`
- **AND** Runtime MUST 将该事实登记为当前 run 内可消费资源，或以等价方式使后续 action 只能引用当前 run 内重新引入的事实

#### Scenario: 拒绝不可访问或不唯一引用
- **WHEN** Planner 引用不存在、跨用户、跨会话、已过期、schemaVersion 不兼容或不唯一的动作事实
- **THEN** read/import tool MUST 返回结构化失败或要求澄清
- **AND** Runtime MUST NOT 把该历史事实登记为成功可消费资源
- **AND** 模型 MUST NOT 用失败或 diagnostic 结果支撑成功刷新回答

#### Scenario: 历史 resource id 不可直接消费
- **WHEN** Planner 尝试在当前 run 中直接消费旧 run 的 resource id、历史 toolResultId 或从摘要中猜出的完整 payload
- **THEN** Action Validator 或 read/import 边界 MUST 拒绝该 action
- **AND** 系统 MUST 要求通过当前 run 的 read/import tool 重新引入事实
- **AND** core MUST 保持不知道具体动作事实类型

### Requirement: 刷新动作查询必须只排除用户已展示动作
系统 SHALL 支持基于已恢复动作事实刷新查询。刷新查询 MUST 使用上一轮结构化查询条件作为参考，并通过 `excludeExerciseIds` 排除用户已看到的动作。

#### Scenario: 再推荐一批动作
- **WHEN** Planner 已经通过 read/import tool 恢复上一轮动作事实
- **AND** 用户请求继续推荐同类动作、换一批或不要重复刚才动作
- **THEN** Planner MAY 调用 `searchExerciseResources`
- **AND** 本次查询 SHOULD 复用上一轮可见事实中的结构化过滤条件
- **AND** 本次查询 MUST 将上一轮 `displayedExerciseIds` 作为 `excludeExerciseIds`
- **AND** 本次查询 MUST NOT 排除上一轮未展示给用户的内部候选

#### Scenario: 刷新结果候选不足
- **WHEN** `searchExerciseResources` 在排除已展示动作后返回空结果或候选不足
- **THEN** Planner MUST 使用 `final_answer` 或 `ask_user` 说明当前条件下没有更多未重复动作，或询问是否放宽条件
- **AND** 系统 MUST NOT 为了填满列表而重新返回被排除的已展示动作
- **AND** trace MUST 能展示排除条件、候选不足和最终收口原因

### Requirement: 跨 run 动作事实桥必须具备自动化验证
系统 SHALL 为跨 run 动作事实桥提供自动化测试，覆盖持久化、恢复、read/import、权限隔离、刷新排除和失败收口。

#### Scenario: 验证用户可见事实桥
- **WHEN** 本 change 完成实现
- **THEN** 测试 MUST 覆盖用户可见投影后保存 `displayedExerciseIds`
- **AND** 测试 MUST 覆盖下一轮恢复轻量摘要并通过 read/import tool 读取完整事实
- **AND** 测试 MUST 覆盖同会话刷新时 `searchExerciseResources.excludeExerciseIds` 只使用用户已看到动作
- **AND** 测试 MUST 证明用户未看到的候选不会被默认排除

#### Scenario: 验证隔离和安全边界
- **WHEN** 本 change 完成实现
- **THEN** 测试 MUST 覆盖跨用户、跨会话、缺失事实、过期事实、schemaVersion 不兼容和引用不唯一
- **AND** 测试 MUST 覆盖服务端没有基于用户原文关键词选择 tool
- **AND** 测试 MUST 覆盖旧 run resource id 和历史 toolResultId 不能被当前 run 直接消费

