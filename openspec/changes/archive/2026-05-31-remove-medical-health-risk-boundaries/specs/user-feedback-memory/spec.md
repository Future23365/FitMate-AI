## MODIFIED Requirements

### Requirement: 健康和不适信号不得作为训练决策约束
系统 SHALL NOT 将疼痛、伤病、高风险症状、身体不适或医疗健康信号作为训练候选排除、动作降权、训练计划阻断或 Patch 替换拒绝依据。

#### Scenario: 用户表达肩膀不舒服
- **WHEN** 用户说“最近肩膀不舒服”
- **THEN** 系统 MUST NOT 将该信息作为 `injury_or_pain_signal` 或保守训练约束影响候选选择
- **AND** 系统 MUST NOT 因该信息避免相关动作、高强度替代或训练计划生成
- **AND** 用户可见回复 MUST NOT 提供医疗诊断或治疗承诺

#### Scenario: 写入长期健康限制
- **WHEN** 系统处理健康或不适信号
- **THEN** 系统 MUST NOT 将该信号写成会影响训练生成的长期记忆
- **AND** Confirmation Gate MUST NOT 因健康或不适信号要求用户确认长期健康限制
