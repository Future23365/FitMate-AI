## ADDED Requirements

### Requirement: 动作替换必须保留引用型 resolved action

系统 SHALL 在 `exercise_replacement` 场景中保留引用型 resolved action，并在触发 Patch 前完成当前用户可访问 artifact 的引用解析。

#### Scenario: 模型输出缺失 replacement action

- **WHEN** 意图解析结果的 `type` 为 `exercise_replacement`
- **AND** 模型输出缺失 `action.kind` 或返回 `action.kind = "none"`
- **THEN** 服务端 MUST 将 resolved intent 恢复为 `action.kind = "exercise_replacement"`
- **AND** resolved intent MUST 声明 `referenceRequirement.required = true`
- **AND** 服务端 MUST NOT 因该结构缺口直接降级为 `answer_only`

#### Scenario: 替换动作依赖历史 artifact

- **WHEN** resolved intent 的 `action.kind` 为 `exercise_replacement`
- **THEN** `/api/chat` MUST 在执行替换前调用 ReferenceResolver 或等价引用解析流程
- **AND** 引用解析成功前 MUST NOT 调用 WorkoutPatchEngine
- **AND** 引用解析失败或歧义时 MUST 返回用户可恢复的澄清或选择建议

### Requirement: 候选选择必须通过 pending replacement selection 推进

系统 SHALL 在用户尚未指定替代动作时保存短期 pending replacement selection，并在下一轮基于该结构化状态消费用户选择。

#### Scenario: 已定位被替换动作但缺少替代动作

- **WHEN** 用户请求替换已有 artifact 中的动作
- **AND** ReferenceResolver 已解析到目标 artifact
- **AND** 服务端已定位 source exercise
- **AND** 用户没有指定 replacement exercise
- **THEN** 服务端 MUST 生成 pending replacement selection
- **AND** pending selection MUST 记录 artifactId、artifactKind、sourceExerciseId、候选 replacement exerciseIds 和创建时间
- **AND** 本轮 MUST 返回候选建议而不是执行 Patch

#### Scenario: 用户选择 pending 候选

- **WHEN** 当前会话存在未过期 pending replacement selection
- **AND** 用户点击候选建议或手动输入能唯一命中候选集合的动作名称
- **THEN** 服务端 MUST 基于 pending selection 补齐 source exercise 和 replacement exercise
- **AND** 服务端 MUST 继续执行 `replace_exercise` Patch
- **AND** 服务端 MUST NOT 基于候选集合外的自然语言猜测替代动作

#### Scenario: pending 候选选择歧义

- **WHEN** 当前用户消息无法唯一命中 pending selection 中的候选动作
- **THEN** 服务端 MUST 返回候选选择建议或澄清回复
- **AND** 服务端 MUST NOT 执行 Patch

### Requirement: 用户回复必须反映动作替换执行状态

系统 SHALL 让动作替换场景的用户可见回复与 resolved intent、ReferenceResolver、Patch 和 artifact 结果保持一致。

#### Scenario: 替换未触发

- **WHEN** resolved intent 未触发 action
- **OR** artifactResult 为 `not_requested`
- **THEN** 用户回复 MUST NOT 承诺训练内容已经或稍后会被更新
- **AND** 用户回复 MUST 明确表达当前需要用户选择、补充或重新说明的信息

#### Scenario: 替换 Patch 成功

- **WHEN** WorkoutPatchEngine 成功应用 `replace_exercise`
- **THEN** 用户回复 MUST 描述已完成的替换
- **AND** 聊天流 MUST 返回修订后的 artifact 或等价 Patch 结果事件
- **AND** 用户回复 MUST NOT 再要求用户重复选择同一个替代动作

#### Scenario: 替换 Patch 失败

- **WHEN** WorkoutPatchEngine 拒绝或无法应用 `replace_exercise`
- **THEN** 用户回复 MUST 基于失败原因给出可恢复引导
- **AND** 系统 MUST NOT 展示未通过校验的修订 artifact
