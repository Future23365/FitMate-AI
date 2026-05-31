## MODIFIED Requirements

### Requirement: 健康字段不得阻断训练生成
系统 SHALL 不再把健康、伤病、疼痛、不适、身体限制、动作风险标签或动作禁忌标签作为动作推荐、单次编排、长期计划或 Patch 替换生成的阻断、排除、拒绝或降级原因。

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

#### Scenario: 用户主动表达身体不适
- **WHEN** 用户消息包含疼痛、伤病、不适、医疗或身体限制相关语义
- **THEN** 系统 MUST NOT 因这些语义排除动作、降低候选数量、拒绝生成训练计划或拒绝 Patch 替换
- **AND** 系统 MUST 按普通训练意图、动作库候选和结构化校验继续生成结果

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

#### Scenario: 用户提及疼痛或伤病
- **WHEN** 用户主动提及疼痛、伤病、不适或医疗相关词
- **THEN** 模型提示 MAY 保持不做医疗诊断或治疗承诺的边界
- **AND** 模型提示 MUST NOT 要求把这些词作为动作选择、训练计划生成或 Patch 替换的决策边界
