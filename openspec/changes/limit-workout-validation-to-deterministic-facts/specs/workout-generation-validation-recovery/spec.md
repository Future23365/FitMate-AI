## MODIFIED Requirements

### Requirement: 训练草稿校验失败必须进入恢复流程

当 AI 生成的训练草稿没有通过服务端确定性校验时，系统 SHALL 根据校验问题类型进入自动修复或用户引导流程，而不是直接把所有校验失败作为终止型错误。非确定性的动作 section 语义分歧 SHALL 不作为校验失败进入恢复流程。

#### Scenario: 可恢复校验失败

- **WHEN** 训练草稿校验结果包含 `session_too_long`、`day_estimate_mismatch`、`too_many_daily_sets`、`beginner_volume_high`、`rest_too_short` 或 `weekly_frequency_mismatch`
- **THEN** 系统 MUST 将该失败标记为可恢复
- **AND** 系统 MUST 尝试自动修复一次或返回可继续对话的引导
- **AND** 系统 MUST NOT 展示未通过校验的训练草稿卡片

#### Scenario: 硬边界校验失败

- **WHEN** 训练草稿校验结果包含动作 ID 不存在、动作不在候选集合、候选集合为空、缺少必要结构或 Schema 解析失败
- **THEN** 系统 MUST 继续阻止该草稿展示或保存
- **AND** 系统 MAY 尝试一次结构修复
- **AND** 修复后仍失败时系统 MUST 返回明确的失败提示

#### Scenario: Section 语义分歧不进入失败恢复

- **WHEN** 训练草稿中的动作真实存在且属于本轮候选集合
- **AND** 草稿通过 Schema、必要结构、权限、用户限制、时长和训练量校验
- **AND** 服务端本地 section 元数据与 AI 输出 section 不一致
- **THEN** 系统 MUST NOT 将该分歧标记为 `plan_validation_failed`
- **AND** 系统 MUST NOT 展示要求用户补充目标、器械或时长的失败恢复提示
