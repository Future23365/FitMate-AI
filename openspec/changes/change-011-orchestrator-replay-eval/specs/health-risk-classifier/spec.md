## ADDED Requirements

### Requirement: 健康风险分类只处理用户主动表达的风险信号
系统 SHALL 在用户主动表达疼痛、不适、伤病或高风险症状时执行 HealthRiskClassifier。

#### Scenario: 用户只提出普通训练目标
- **WHEN** 用户说“我想练腿”或“给我一套胸肩训练”
- **THEN** 系统 MUST NOT 因缺少健康信息而阻断推荐或计划生成
- **AND** 系统 MUST NOT 默认追问健康、伤病或疼痛信息

#### Scenario: 用户表达肩膀不舒服
- **WHEN** 用户说“最近肩膀不舒服”
- **THEN** HealthRiskClassifier MUST 输出风险等级和训练约束摘要
- **AND** 候选检索、Patch、PlanEngine 和 Response Writer MUST 使用该约束

### Requirement: 高风险信号必须阻断高强度训练生成
系统 SHALL 对用户主动表达的高风险症状使用保守边界，避免生成可能加重风险的训练内容。

#### Scenario: 用户表达高风险症状
- **WHEN** 用户消息被分类为 `high_risk_symptom`
- **THEN** 系统 MUST 不生成训练计划或高强度替代动作
- **AND** 用户可见回复 MUST 建议尽快寻求专业帮助
- **AND** 回复 MUST NOT 提供医疗诊断或治疗承诺

### Requirement: 健康风险结果必须与用户记忆和确认门联动
系统 SHALL 将健康/不适信号作为训练约束使用，并在写入长期记忆前经过确认边界。

#### Scenario: 写入长期健康限制
- **WHEN** 系统准备把疼痛、伤病或高风险信号写入长期记忆
- **THEN** 该写入 MUST 标记为需要确认或 pending 状态
- **AND** 确认前该记忆 MUST NOT 作为已生效的长期排除规则

### Requirement: 健康风险分类必须可评测
系统 SHALL 在 Eval Suite 中覆盖普通训练目标、轻微不适、疼痛伤病和高风险症状。

#### Scenario: 运行健康边界 Eval
- **WHEN** Eval Suite 运行健康风险用例
- **THEN** 系统 MUST 断言普通目标不被阻断
- **AND** 系统 MUST 断言高风险症状不会生成训练计划
