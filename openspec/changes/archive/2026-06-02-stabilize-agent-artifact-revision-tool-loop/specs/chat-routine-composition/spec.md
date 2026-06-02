## ADDED Requirements

### Requirement: Artifact-bound routine 生成必须支持旧推荐 revision
系统 SHALL 在基于已有 `exercise_recommendation` artifact 的动作生成 routine 时，接受当前用户可访问的旧 recommendation revision id，并恢复到 active payload 后校验 required 动作来源。

#### Scenario: 推荐 artifact 旧 revision 生成 routine
- **WHEN** 用户要求将 recent artifact summary 中的动作做成一套 routine
- **AND** Agent 调用 `generateRoutineDraft` 时传入 `sourceArtifactId` 和 `requiredExerciseIds`
- **AND** `sourceArtifactId` 已经是 superseded artifact 但可恢复到同 lineage active recommendation artifact
- **THEN** 服务端 MUST 使用 active recommendation payload 校验 `requiredExerciseIds`
- **AND** 所有 required 动作都属于 active recommendation payload 时 MUST 继续生成 routine 草稿
- **AND** 系统 MUST NOT 因 requested artifact status 为 superseded 而退回自由文本回答

#### Scenario: required 动作不属于 active 推荐 payload
- **WHEN** `generateRoutineDraft` 恢复到 active recommendation payload
- **AND** 输入的 `requiredExerciseIds` 中存在不属于该 payload 的动作 id
- **THEN** 服务端 MUST 返回结构化 `invalid_dependency` 或等价失败
- **AND** 系统 MUST NOT 用裸搜候选替代用户指定 artifact 动作集合
