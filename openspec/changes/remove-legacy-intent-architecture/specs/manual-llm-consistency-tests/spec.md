## ADDED Requirements

### Requirement: 黑盒测试不得依赖旧 intent 事件
系统 SHALL 让手动 LLM 黑盒 runner 和报告以用户可见闭环、`AgentExecutionResult`、Agent tool dependency graph、artifact / patch / suggestion 事件和 done metadata 作为验收事实源。

#### Scenario: 旧事件缺失
- **WHEN** `/api/chat` 响应不包含 `assistant_action`、`intent_resolved`、旧 resolved intent、`workoutIntent` 或 trigger JSON
- **THEN** 黑盒 runner MUST NOT 因这些旧字段缺失而判失败
- **AND** runner MUST 从 `AgentExecutionResult` 和可见事件推导卡片类型、澄清、失败或阻断状态

#### Scenario: 旧事件仍被输出
- **WHEN** 测试环境中仍出现 `assistant_action`、`intent_resolved` 或旧 trigger JSON
- **THEN** 报告 MUST 标记为 legacy field leakage
- **AND** 除历史兼容测试外，新黑盒用例 MUST 将其视为架构清理失败

#### Scenario: 执行证据缺失
- **WHEN** 用户可见回复声称已经生成、修改或保存训练内容
- **THEN** 黑盒 runner MUST 校验存在对应 `AgentExecutionResult`、tool result、validation / policy / revision 或 artifact / patch 事件
- **AND** 仅有自然语言承诺 MUST 判定为失败

#### Scenario: Agent-native fallback 可见
- **WHEN** 真实多轮流程中出现工具失败、候选不足、引用不可解析、validation 失败或 policy blocked
- **THEN** 黑盒 runner MUST 从 `AgentExecutionResult.status`、blocking reason、tool evidence metadata 和用户可见回复判断该轮结果
- **AND** runner MUST NOT 因缺少旧 intent fallback、`assistant_action` 或旧 trigger JSON 而把 recovery 判为失败

#### Scenario: 核心流程验收矩阵
- **WHEN** 基础或详细黑盒套件覆盖 routine、长期计划、动作推荐、局部 Patch、序号动作讲解和短指令调整
- **THEN** 每类流程 MUST 校验用户可见结果与 `AgentExecutionResult`、tool dependency graph、artifact / patch / suggestion 事件或 done metadata 一致
- **AND** 每类流程 MUST 校验 legacy path absence

## MODIFIED Requirements

### Requirement: 黑盒报告必须记录确定性引用讲解诊断

系统 SHALL 让手动 LLM 黑盒 runner 记录 Agent 引用讲解路径的工具读取状态，避免用户可见回复正确但报告缺少执行证据。

#### Scenario: 序号动作讲解 resolved 状态可见

- **WHEN** 用户在同一会话中基于最近训练卡片输入“第一个动作怎么做”
- **AND** Agent 通过工具读取 recent artifact 和动作库生成讲解
- **THEN** 黑盒 runner MUST 记录 artifact tool result、artifactId、artifactKind、payload 读取状态和目标 exerciseId
- **AND** 报告 MUST 记录这些证据来自 Agent tool results
- **AND** 该轮 MUST NOT 依赖 `assistant_action` 或旧 resolved intent 判断引用解析是否成功

#### Scenario: 确定性引用失败仍然失败

- **WHEN** 用户请求序号动作讲解
- **AND** Agent 无法读取当前用户可访问的 artifact payload 或无法定位具体 `exerciseId`
- **THEN** 黑盒 runner MUST 将该轮记录为语义断言失败或需要澄清
- **AND** 报告 MUST 记录失败原因
- **AND** 系统 MUST NOT 把无训练卡片当作该轮通过的充分条件

### Requirement: 详细 LLM 黑盒测试必须贴近真实首页请求链路

系统 SHALL 让完整/详细 LLM 黑盒测试尽量按真实首页聊天路径执行多轮流程，避免测试 runner 获得真实页面没有的上下文能力。

#### Scenario: 详细套件通过 API 形态执行聊天轮次

- **WHEN** 开发者执行完整/详细 LLM 黑盒测试
- **THEN** 系统 MUST 使用与首页聊天一致的请求字段执行每轮聊天
- **AND** 每轮 MUST 使用 `conversationId`、`responseMessageId`、`latestUserMessage` 和 `thinkingEnabled` 构造请求
- **AND** `conversationSummary` MAY 随历史兼容请求传入，但 MUST NOT 作为测试通过所需的执行事实源
- **AND** 每轮 MUST 通过测试专用 current user 触发与首页一致的鉴权边界
- **AND** 测试 MUST NOT 依赖手工注入完整历史 `conversationContext` 来通过真实页面无法通过的用例

#### Scenario: 同一流程内保存并延续会话状态

- **WHEN** 完整/详细 LLM 黑盒流程完成任一非失败轮次
- **THEN** 系统 MUST 通过会话保存边界保存该轮产生的用户消息、assistant 回复、后台 conversation summary、Agent metadata 和可见训练卡片
- **AND** 后续轮次 MUST 基于保存后的同一 `conversationId` 继续执行
- **AND** 不同流程用例之间 MUST 使用互相隔离的新会话

#### Scenario: 环境 preflight 不满足时明确跳过或失败

- **WHEN** 完整/详细 LLM 黑盒测试启动
- **THEN** 系统 MUST 检查真实模型 key、测试用户、数据库连接、必要 migration、`ConversationArtifact` / `ArtifactIndex` 表和基础 seed 数据是否满足详细套件运行条件
- **AND** 缺少真实模型 key 时 MUST 生成真实模型跳过摘要
