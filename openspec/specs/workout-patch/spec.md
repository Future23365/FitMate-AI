# workout-patch Specification

## Purpose
TBD - created by archiving change change-003-workout-patch. Update Purpose after archive.
## Requirements
### Requirement: Patch 必须明确定位目标和修改范围
系统 SHALL 使用结构化 Patch 表达训练内容局部修改的目标、范围、操作和原因。

#### Scenario: 替换当前卡片中的单个动作
- **WHEN** 用户要求“把这个计划里的俯卧撑换一个”
- **AND** ReferenceResolver 已解析到目标 artifact
- **THEN** 系统 MUST 生成包含 `replace_exercise` operation 的 Patch
- **AND** operation target MUST 包含 artifactId、section、exerciseId 和必要的 occurrenceIndex
- **AND** Patch scope MUST 默认为 `artifact_only`

#### Scenario: 同一动作出现多次
- **WHEN** 目标 artifact 中同一 `exerciseId` 出现多次
- **AND** 用户没有说明要修改哪一次或全部
- **THEN** 系统 MUST 返回歧义结果或澄清问题
- **AND** 系统 MUST NOT 默认替换所有出现位置

### Requirement: Patch 必须保留未点名内容
系统 SHALL 在应用 Patch 时保留未被用户点名的动作、训练日、顺序和执行参数。

#### Scenario: 替换单个动作
- **WHEN** PatchEngine 应用单个 `replace_exercise` operation
- **THEN** 系统 MUST 只替换 target 指向的动作
- **AND** 未被 target 命中的动作 MUST 保持不变
- **AND** 未被用户要求修改的 section、训练日、循环配置和休息配置 MUST 保持不变

#### Scenario: Patch 输出 diff
- **WHEN** PatchEngine 成功应用 Patch
- **THEN** 结果 MUST 包含可追踪 diff
- **AND** diff MUST 标明被修改的动作、替代动作和保留字段
- **AND** diff MUST NOT 把未改变内容描述为已修改

### Requirement: Patch 应用后必须创建安全 revision
系统 SHALL 将聊天草稿类修改保存为新的 artifact revision，不覆盖用户已经看到的旧 artifact。

#### Scenario: 修改未保存聊天草稿
- **WHEN** 用户修改 `scope = "artifact_only"` 的 artifact
- **THEN** 系统 MUST 创建新的 artifact version
- **AND** 新 artifact MUST 记录来源 artifact
- **AND** 原 artifact MUST 标记为 `superseded`
- **AND** 原 artifact payload MUST 保持可读取

#### Scenario: 修改已保存 routine 或未来 schedule
- **WHEN** Patch scope 指向 saved routine 或 future schedule
- **THEN** 系统 MUST 返回 blocked
- **AND** 系统 MUST 说明该覆盖需要后续 confirmation change
- **AND** 系统 MUST NOT 批量写入 routine 或 schedule

#### Scenario: 修改已完成训练历史
- **WHEN** Patch 目标包含已完成 schedule 或已完成训练记录
- **THEN** 系统 MUST 默认拒绝修改已完成历史
- **AND** Patch 结果 MUST 说明被拒绝的原因

### Requirement: PatchValidator 必须校验替代动作和训练边界
系统 SHALL 在保存或返回 Patch 结果前校验替代动作、执行参数和训练边界。

#### Scenario: 替代动作来自候选集合
- **WHEN** Patch operation 包含 `replacementExerciseId`
- **THEN** replacementExerciseId MUST 来自服务端动作候选集合
- **AND** replacementExerciseId MUST 引用数据库中存在的 `Exercise`
- **AND** 系统 MUST 拒绝模型编造或候选外动作

#### Scenario: 替代动作不满足约束
- **WHEN** 替代动作不满足原 section、器械、难度、风险或用户限制
- **THEN** PatchValidator MUST 拒绝该 Patch
- **AND** 系统 MUST 返回可理解的失败原因或重新选择候选

#### Scenario: Patch 后训练时长失控
- **WHEN** Patch 后 routine 或 plan 的预估时长明显偏离用户目标
- **THEN** PatchValidator MUST 返回校验失败或修复建议
- **AND** 系统 MUST NOT 展示可保存的错误草稿

