## ADDED Requirements

### Requirement: routine / plan section 覆盖失败必须可恢复收口

系统 SHALL 在 `visibleTrainingProposal` 的 `payload.kind = "routine"` 或 `payload.kind = "plan"` 但 `exerciseItems` 未覆盖 `warmup`、`training`、`stretch` 任一必要 section 时，拒绝该 terminal output，并提供足够结构化诊断供 repair 或用户安全失败收口使用。系统 MUST NOT 因正文中出现热身、拉伸或训练建议而绕过结构化 section 校验。

#### Scenario: routine 缺少 warmup 或 stretch

- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`
- **AND** 某个 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** `payload.exerciseItems` 只包含 `training` section，或缺少 `warmup` / `stretch` 中任一 section
- **THEN** terminal output validation MUST 拒绝该 `visibleTrainingProposal`
- **AND** validation failure MUST 包含稳定诊断 code，例如 `section_coverage_missing`
- **AND** validation failure MUST 表达 `payloadKind`、失败 path、当前输出覆盖 section 和缺失 section
- **AND** Response Renderer MUST NOT 输出该 `visible_output`
- **AND** fact bridge MUST NOT 保存该 `visibleTrainingProposal`

#### Scenario: 正文建议不能替代结构化动作事实

- **WHEN** Planner 在 `final_answer.content` 中写出热身、拉伸、动作处方或训练安排
- **AND** 对应 `visibleTrainingProposal.payload.exerciseItems` 缺少可校验的 `warmup` 或 `stretch` 动作项
- **THEN** 系统 MUST 将该输出视为结构化训练方案不完整
- **AND** 系统 MUST NOT 将正文内容解析、补全或保存成结构化动作事实
- **AND** 系统 MUST NOT 根据正文自然语言自动生成缺失的 exerciseId、section、prescription 或 schedule

#### Scenario: repair observation 表达可恢复方向

- **WHEN** `visibleTrainingProposal` 因 section 覆盖不足进入 repair
- **THEN** repair observation MUST 表达当前输出覆盖哪些 section、缺失哪些 section，以及当前 run 可见事实覆盖哪些 section
- **AND** repair observation MUST 表达可恢复方向包括继续获取缺失 section 的可消费动作事实、输出当前事实可支撑结构、向用户澄清或安全失败收口
- **AND** repair observation MUST NOT 包含固定用户短句作为触发条件
- **AND** repair observation MUST NOT 指定必须调用某个具体业务 `toolName` 或固定 tool 调用顺序
