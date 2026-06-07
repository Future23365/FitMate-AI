## MODIFIED Requirements

### Requirement: visibleTrainingProposal 校验失败必须提供结构化资源覆盖诊断
当 `visibleTrainingProposal` 终态输出因动作 section 不合法或缺少 `routine` / `plan` 必要主训练事实而失败时，系统 SHALL 提供可进入 repair observation 的结构化诊断。诊断 MUST 表达确定性失败事实、当前资源覆盖和缺失边界；诊断 MUST NOT 替 Planner 指定固定 tool、固定 action、固定回复或固定调用顺序。缺少 `warmup` 或 `stretch` 不再构成 terminal output hard validation failure，但系统仍 SHALL 保留当前输出的 section 覆盖摘要供 trace、metadata 或后续诊断使用。

#### Scenario: section_not_allowed 反馈允许 section
- **WHEN** `visibleTrainingProposal.exerciseItems[*].section` 不存在于该动作数据库 `allowedSections`
- **THEN** validation failure MUST 包含稳定 code `section_not_allowed`
- **AND** validation failure MUST 包含失败字段路径、`exerciseId`、模型输出的 `section` 和数据库允许的 `allowedSections`
- **AND** repair observation MUST 表达该动作不能放入模型输出的 section
- **AND** 系统 MUST NOT 渲染或保存该 `visibleTrainingProposal`

#### Scenario: routine 或 plan 缺少 training 时反馈缺口
- **WHEN** Planner 输出 `payload.kind = "routine"` 或 `payload.kind = "plan"`
- **AND** `exerciseItems` 未覆盖 `training` section
- **THEN** validation failure 或 repair observation MUST 表达缺失 `training`
- **AND** repair observation MUST 表达当前输出覆盖哪些 section
- **AND** repair observation MUST 表达当前可见事实覆盖哪些 section

#### Scenario: routine 或 plan 仅缺少 support section 时不 hard fail
- **WHEN** Planner 输出 `payload.kind = "routine"` 或 `payload.kind = "plan"`
- **AND** `exerciseItems` 覆盖 `training` section
- **AND** `exerciseItems` 缺少 `warmup`、`stretch` 或两者
- **AND** payload schema、`prescription`、`schedule`、数据库动作事实和 `allowedSections` 均合法
- **THEN** terminal output validator MUST NOT 因缺少 `warmup` 或 `stretch` 拒绝该 `visibleTrainingProposal`
- **AND** 系统 MUST NOT 自动生成、选择或补入缺失的 support section 动作

#### Scenario: Repair feedback 不替模型选择下一步
- **WHEN** 系统生成 terminal output validation repair feedback
- **THEN** feedback MUST NOT 包含固定用户短语作为触发条件
- **AND** feedback MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定 tool 流程
- **AND** feedback MUST NOT 根据具体 `toolName` 和字段组合改写 Planner 的语义目标

### Requirement: routine / plan section 覆盖失败必须可恢复收口

系统 SHALL 在 `visibleTrainingProposal` 的 `payload.kind = "routine"` 或 `payload.kind = "plan"` 但 `exerciseItems` 未覆盖 `training` section 时，拒绝该 terminal output，并提供足够结构化诊断供 repair 或用户安全失败收口使用。系统 MUST NOT 因正文中出现训练建议而绕过结构化 `training` section 校验。缺少 `warmup` 或 `stretch` 时，系统 MUST NOT 从正文解析、补全或保存缺失动作事实，也 MUST NOT 因该缺失直接拒绝已经合法的训练方案。

#### Scenario: routine 缺少 training

- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`
- **AND** 某个 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** `payload.exerciseItems` 不包含 `training` section
- **THEN** terminal output validation MUST 拒绝该 `visibleTrainingProposal`
- **AND** validation failure MUST 包含稳定诊断 code，例如 `section_coverage_missing`
- **AND** validation failure MUST 表达 `payloadKind`、失败 path、当前输出覆盖 section 和缺失 `training`
- **AND** Response Renderer MUST NOT 输出该 `visible_output`
- **AND** fact bridge MUST NOT 保存该 `visibleTrainingProposal`

#### Scenario: 正文建议不能替代结构化 training 动作事实

- **WHEN** Planner 在 `final_answer.content` 中写出主训练动作、处方或训练安排
- **AND** 对应 `visibleTrainingProposal.payload.exerciseItems` 缺少可校验的 `training` 动作项
- **THEN** 系统 MUST 将该输出视为结构化训练方案缺少必要主训练事实
- **AND** 系统 MUST NOT 将正文内容解析、补全或保存成结构化动作事实
- **AND** 系统 MUST NOT 根据正文自然语言自动生成缺失的 `exerciseId`、`section`、`prescription` 或 `schedule`

#### Scenario: 缺少 warmup 或 stretch 不触发 validation failure

- **WHEN** Planner 返回 `payload.kind = "routine"` 或 `"plan"`
- **AND** `payload.exerciseItems` 包含合法 `training` 动作项和必要 `prescription`
- **AND** `payload.exerciseItems` 缺少 `warmup` 或 `stretch`
- **THEN** 业务 terminal output validator MUST 继续校验数据库动作事实、`allowedSections`、`prescription` 和 `schedule`
- **AND** 若这些确定性校验通过，系统 MUST 允许该 `visibleTrainingProposal` 渲染和保存
- **AND** 系统 MUST NOT 因 support section 缺失进入 terminal failure finalizer
