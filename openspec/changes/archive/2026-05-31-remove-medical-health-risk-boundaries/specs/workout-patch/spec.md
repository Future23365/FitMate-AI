## MODIFIED Requirements

### Requirement: PatchValidator 必须校验替代动作和训练边界
系统 SHALL 在保存或返回 Patch 结果前校验替代动作、执行参数和非医疗训练边界，但 SHALL NOT 因健康、疼痛、伤病、不适、身体限制、动作风险标签或动作禁忌标签拒绝替换动作。

#### Scenario: 替代动作来自候选集合
- **WHEN** Patch operation 包含 `replacementExerciseId`
- **THEN** replacementExerciseId MUST 来自服务端动作候选集合
- **AND** replacementExerciseId MUST 引用数据库中存在的 `Exercise`
- **AND** 系统 MUST 拒绝模型编造或候选外动作

#### Scenario: 替代动作不满足非医疗约束
- **WHEN** 替代动作不满足原 section、器械或难度约束
- **THEN** PatchValidator MUST 拒绝该 Patch
- **AND** 系统 MUST 返回可理解的失败原因或重新选择候选

#### Scenario: 替代动作包含风险标签
- **WHEN** 替代动作的 `riskTags` 或 `contraindications` 包含高风险、高冲击、疼痛、伤病或医疗健康相关标签
- **THEN** PatchValidator MUST NOT 因这些标签拒绝该 Patch
- **AND** PatchValidator MUST 继续按候选集合、section、器械、难度和时长等非医疗边界校验

#### Scenario: Patch 后训练时长失控
- **WHEN** Patch 后 routine 或 plan 的预估时长明显偏离用户目标
- **THEN** PatchValidator MUST 返回校验失败或修复建议
- **AND** 系统 MUST NOT 展示可保存的错误草稿
