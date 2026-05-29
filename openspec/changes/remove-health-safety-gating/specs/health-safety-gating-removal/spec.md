## ADDED Requirements

### Requirement: 健康字段不得阻断训练生成
系统 SHALL 不再把健康、伤病、疼痛、不适或身体限制相关字段作为动作推荐、单次编排或长期计划生成的触发前置条件。

#### Scenario: 用户基于上一轮训练要求生成一周计划
- **WHEN** 用户在已有训练上下文后发送“我要一周都练这个”
- **THEN** 系统 MUST 使用已有 `conversationSummary` 和当前消息识别长期计划需求
- **AND** 系统 MUST NOT 因缺少 `injuryLimitations`、疼痛状态或健康限制确认而阻断 `assistant_action`
- **AND** 系统 MUST 在候选动作充足时触发长期计划生成

#### Scenario: 模型返回健康相关 missing fields
- **WHEN** 意图模型返回的 `missingActionFields` 只包含健康、伤病、疼痛或身体限制相关字段
- **THEN** 服务端 MUST 忽略这些字段
- **AND** 服务端 MUST NOT 将这些字段展示为需要用户补充的信息
- **AND** 服务端 MUST 按目标、时长、周期、器械或场地等训练信息判断是否可以触发生成

### Requirement: 模型不得主动追问健康限制
系统 SHALL 不在聊天、summary、动作推荐或训练计划生成 prompt 中要求模型主动询问健康、伤病、疼痛、不适、高风险健康词或医疗建议。

#### Scenario: 普通训练请求
- **WHEN** 用户提出动作推荐、单次训练或长期计划请求
- **THEN** 模型提示 MUST NOT 要求追问“是否有膝盖不适”或类似健康问题
- **AND** 模型提示 MUST NOT 要求输出医疗、就医、高风险健康提醒

#### Scenario: 用户未提及健康情况
- **WHEN** 用户没有主动提供健康、伤病、疼痛或身体限制信息
- **THEN** 系统 MUST 默认相关字段为空或未提供
- **AND** 系统 MUST NOT 把默认空值解释为需要补问的缺失信息

### Requirement: 保留非健康结构化边界
系统 SHALL 继续保留动作库候选、exerciseId 校验、Zod Schema 校验和用户数据隔离等非健康结构化边界。

#### Scenario: 下游生成训练结果
- **WHEN** 系统触发动作推荐、单次编排或长期计划生成
- **THEN** 下游模型 MUST 继续只使用服务端候选动作中的 `exerciseId`
- **AND** 服务端 MUST 继续校验模型输出结构和候选动作引用
