## ADDED Requirements

### Requirement: Routine 生成必须由 Agent draft 工具触发
系统 SHALL 让聊天 routine 生成从 Agent routine draft / validation / policy / persistence 工具链触发，而不是从旧聊天意图、内部动作事件或 `workoutIntent` 触发。

#### Scenario: 用户请求单次训练
- **WHEN** Agent 判断用户请求应生成单次 routine
- **THEN** Agent MUST 通过 routine draft 工具、候选集合、Validator 和 Policy 形成可展示结果
- **AND** `AgentExecutionResult` MUST 引用对应 tool result、validationId、policyDecisionId 或 revisionId
- **AND** 系统 MUST NOT 通过旧 `workout_routine` intent 字段独立触发 routine 卡片

#### Scenario: 明确时长
- **WHEN** 用户给出明确训练时长
- **THEN** Agent routine 输入 MUST 保留该时长和字段来源
- **AND** routine 校验 MUST 验证草稿接近目标可执行时长
- **AND** 系统 MUST NOT 从旧 `workoutIntent.sessionMinutes` 读取该字段作为生产事实源

## REMOVED Requirements

### Requirement: 明确时长的本次训练请求必须触发 routine

**Reason**: 触发条件不再由旧聊天意图解析直接决定。

**Migration**: Agent 基于用户消息、上下文和工具结果决定 routine、动作推荐、普通回答或澄清。

### Requirement: 聊天意图解析不得返回互相冲突的动作类型

**Reason**: 聊天意图解析不再是生产动作类型来源。

**Migration**: Agent final result schema、tool dependency graph 和 Response Writer 投影必须保持一致。

### Requirement: 经验未明确时 routine 必须默认推送简单编排

**Reason**: 该要求绑定旧 intent 缺省经验。

**Migration**: Agent routine tool input 和领域服务默认策略表达保守经验，并由 validation / trace 记录来源。
