## ADDED Requirements

### Requirement: 替换候选选择必须生成 replace_exercise Patch

系统 SHALL 将用户对替换候选的选择转化为结构化 `replace_exercise` Patch，并通过现有 Patch 校验和 artifact revision 链路执行。

#### Scenario: 用户选择替代动作

- **WHEN** 服务端从 pending replacement selection 或完整替换表达中确定 sourceExerciseId 和 replacementExerciseId
- **AND** ReferenceResolver 已解析到当前用户可访问的目标 artifact
- **THEN** WorkoutPatchEngine MUST 生成 `replace_exercise` operation
- **AND** operation target MUST 指向目标 artifact 中的 source exercise
- **AND** operation MUST 使用已校验的 replacementExerciseId

#### Scenario: 替代动作来自候选集合

- **WHEN** Patch operation 包含 replacementExerciseId
- **THEN** replacementExerciseId MUST 来自本轮或 pending replacement selection 的服务端候选集合
- **AND** replacementExerciseId MUST 引用数据库中存在的 Exercise
- **AND** 系统 MUST 拒绝候选集合外或模型编造的 replacementExerciseId

#### Scenario: 应用 Patch 前重新校验 artifact

- **WHEN** 服务端准备应用 pending replacement selection
- **THEN** 系统 MUST 重新读取并校验目标 artifact payload
- **AND** 目标 artifact MUST 仍属于当前 userId 和 sessionId 可访问范围
- **AND** payload MUST 仍包含 pending selection 指向的 sourceExerciseId

#### Scenario: Patch 成功创建修订 artifact

- **WHEN** `replace_exercise` Patch 应用成功
- **THEN** 系统 MUST 创建新的 artifact revision 或返回等价修订结果
- **AND** 原 artifact MUST 保持可读取
- **AND** Patch diff MUST 标明被替换动作、替代动作和保留内容
