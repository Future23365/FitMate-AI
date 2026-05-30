## ADDED Requirements

### Requirement: 用户可见回复必须来自结构化编排结果
系统 SHALL 使用 Response Writer 将 Orchestrator final state 转换为用户可见回复、确认问题、失败引导或变更摘要。

#### Scenario: Patch 成功
- **WHEN** PatchEngine 成功创建 artifact revision 或写入 future schedule
- **THEN** Response Writer MUST 基于结构化 diff 生成变更摘要
- **AND** 回复 MUST 说明修改目标、保留内容和下一步可执行动作
- **AND** Response Writer MUST NOT 从自然语言 summary 重建训练 payload

### Requirement: 确认问题必须展示真实影响范围
系统 SHALL 根据 Policy 和 ConfirmationGate 的结构化结果生成确认问题。

#### Scenario: 需要确认批量 future schedule 修改
- **WHEN** ConfirmationGate 返回 requiresConfirmation
- **THEN** Response Writer MUST 展示目标范围、影响数量、关键 diff 和确认选项
- **AND** 用户确认前回复 MUST NOT 暗示修改已经完成

### Requirement: 失败引导必须匹配失败类型
系统 SHALL 为 ambiguous、not_found、candidate_insufficient、policy_blocked、validation_failed 和 repair_failed 生成不同的用户引导。

#### Scenario: 候选不足
- **WHEN** Exercise Retrieval Service 或 Repair Orchestrator 返回候选不足
- **THEN** Response Writer MUST 说明候选不足原因
- **AND** 回复 MUST 提供可确认的放宽选项或继续说明入口

### Requirement: 健康边界文案不得提供医疗诊断
系统 SHALL 对健康/不适相关回复保持训练建议边界，不生成诊断或治疗承诺。

#### Scenario: 用户表达疼痛或高风险症状
- **WHEN** HealthRiskClassifier 返回 pain_or_injury 或 high_risk_symptom
- **THEN** Response Writer MUST 使用保守训练建议或停止生成训练计划
- **AND** 回复 MUST 建议寻求专业人士帮助
- **AND** 回复 MUST NOT 提供医疗诊断、病因判断或治疗方案
