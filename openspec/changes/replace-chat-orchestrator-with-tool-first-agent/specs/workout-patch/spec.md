## ADDED Requirements

### Requirement: WorkoutPatch 必须由 Agent 基于真实 payload 和候选集合提出

系统 SHALL 让 Agent 在读取目标 artifact payload 和动作候选后提出 `WorkoutPatch`。服务端 SHALL 校验并应用 Patch，但不得基于自然语言关键词自行选择 Patch 目标或替代动作。

#### Scenario: Agent 提出 WorkoutEditPlan
- **WHEN** 用户请求调整已有训练内容
- **THEN** Agent MUST 先基于 artifact payload 和用户消息提出 `WorkoutEditPlan`
- **AND** `WorkoutEditPlan` MUST 包含 targetArtifactId、sourceArtifactPayloadId、preserve、changes、scope、strategy、requiredCandidateSetIds 和 confirmationLevel
- **AND** 服务端 MUST 校验 edit plan 引用的 artifact、payload 和候选集合属于当前用户和当前 run

#### Scenario: Agent 提出 Patch
- **WHEN** Agent 判断用户请求是局部训练修改
- **THEN** Agent MUST 先读取目标 artifact payload
- **AND** Agent MUST 基于 payload 中真实存在的 section、exerciseId 或 item 提出 Patch
- **AND** Patch target MUST 指向当前用户可访问 artifact 中的真实对象
- **AND** Patch MUST 引用已校验的 `WorkoutEditPlan`

#### Scenario: Patch 使用候选动作
- **WHEN** Patch 包含 `replacementExerciseId`
- **THEN** replacementExerciseId MUST 来自本轮工具返回的候选集合或 pending candidate set
- **AND** 服务端 MUST 校验该 exerciseId 存在于数据库
- **AND** 服务端 MUST 拒绝模型编造或候选外动作

#### Scenario: 整体条件变化不强行局部 Patch
- **WHEN** 用户请求改变整套训练的器械、场地、目标、整体难度或大幅时长
- **THEN** Agent MAY 选择重新生成而不是局部 Patch
- **AND** 服务端 MUST NOT 因用户文本包含“换一个”就强制进入 `replace_exercise`

#### Scenario: Patch 应用和保存
- **WHEN** Patch 通过校验且需要创建 revision
- **THEN** 写工具 MUST 引用 artifactPayloadId、patchId、validationId、policyDecisionId 和必要的 confirmationId
- **AND** 写工具 MUST 返回 revisionId、diff 和保存状态
- **AND** Response Writer MUST 只基于保存状态描述是否已修改完成
