## ADDED Requirements

### Requirement: WorkoutPatch 必须由 Agent 基于真实 payload 和候选集合提出

系统 SHALL 让 Agent 在读取目标 artifact payload 和动作候选后提出 `WorkoutPatch`。服务端 SHALL 校验并应用 Patch，但不得基于自然语言关键词自行选择 Patch 目标或替代动作。

#### Scenario: Agent 提出 Patch
- **WHEN** Agent 判断用户请求是局部训练修改
- **THEN** Agent MUST 先读取目标 artifact payload
- **AND** Agent MUST 基于 payload 中真实存在的 section、exerciseId 或 item 提出 Patch
- **AND** Patch target MUST 指向当前用户可访问 artifact 中的真实对象

#### Scenario: Patch 使用候选动作
- **WHEN** Patch 包含 `replacementExerciseId`
- **THEN** replacementExerciseId MUST 来自本轮工具返回的候选集合或 pending candidate set
- **AND** 服务端 MUST 校验该 exerciseId 存在于数据库
- **AND** 服务端 MUST 拒绝模型编造或候选外动作

#### Scenario: 整体条件变化不强行局部 Patch
- **WHEN** 用户请求改变整套训练的器械、场地、目标、整体难度或大幅时长
- **THEN** Agent MAY 选择重新生成而不是局部 Patch
- **AND** 服务端 MUST NOT 因用户文本包含“换一个”就强制进入 `replace_exercise`

