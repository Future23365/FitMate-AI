## ADDED Requirements

### Requirement: 查询边界违反必须进入训练生成恢复流程
系统 SHALL 将训练草稿或 patch 违反 candidate set 查询边界视为确定性契约失败，并进入修复、重查或用户引导流程，而不是作为 warning 放过。

#### Scenario: Routine 违反查询边界
- **WHEN** routine 草稿中的动作存在于数据库并属于某个候选集合
- **AND** 该动作不满足候选集合查询证据中的 hard filters
- **THEN** 系统 MUST 将校验结果标记为失败
- **AND** 失败 MUST 包含可稳定识别的错误码，例如 `candidate_query_boundary_mismatch`
- **AND** 系统 MUST NOT 展示或保存该 routine 草稿

#### Scenario: Plan 违反查询边界
- **WHEN** plan 草稿中的动作存在于数据库并属于某个候选集合
- **AND** 该动作不满足候选集合查询证据中的 hard filters
- **THEN** 系统 MUST 将校验结果标记为失败
- **AND** 系统 MUST NOT 展示或保存该 plan 草稿

#### Scenario: Patch replacement 违反查询边界
- **WHEN** workout patch 的 `replacementExerciseId` 存在于数据库
- **AND** 该动作不满足 replacement 候选集合查询证据中的 hard filters
- **THEN** 系统 MUST 将 patch 校验标记为失败
- **AND** 系统 MUST NOT 保存该 patch revision

#### Scenario: 查询边界失败后的恢复
- **WHEN** 校验失败原因为 candidate set 查询边界违反
- **THEN** 系统 MUST 优先引导 Agent 使用同一业务目标重新调用 `searchExercises`
- **AND** 重新调用必须传入合法结构化 filters
- **AND** 系统 MUST NOT 通过改标题、改 summary 或忽略该 filter 来修复

#### Scenario: 查询边界不可满足
- **WHEN** 重新检索仍无法得到满足 hard filters 的足够候选
- **THEN** 系统 MUST 返回可继续对话的失败或澄清引导
- **AND** 系统 MUST NOT 用放宽后的候选伪装成满足原查询边界
