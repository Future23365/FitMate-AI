## ADDED Requirements

### Requirement: searchExercises 必须保留部分满足候选诊断
当 `searchExercises` 用于 routine、plan 或 patch 的执行型候选集合，并且结构化过滤已经返回候选但 `resultRequirements` 未完全满足时，系统 SHALL 返回可诊断的 partial candidate set，而不是只返回不可解释的工具失败或丢弃候选证据。

#### Scenario: 候选非空但缺少 section 覆盖
- **WHEN** Agent 调用 `searchExercises(candidateUse = "routine")`
- **AND** hard filters 返回一个或多个候选动作
- **AND** `resultRequirements.sectionCoverage` 未满足
- **THEN** 工具结果 MUST 包含 candidate set 诊断、实际候选摘要和 `unmetResultRequirements`
- **AND** 工具结果 MUST 标记该 candidate set 为 partial 或 unsatisfied
- **AND** 工具结果 MUST NOT 被登记为可消费成功 candidate set

#### Scenario: Partial candidate 用于澄清
- **WHEN** `searchExercises` 返回 partial candidate set
- **THEN** Agent MAY 基于该诊断调用 `askClarification`
- **AND** 用户可见澄清 MUST 能说明哪些 section 或结果要求未满足
- **AND** 系统 MUST NOT 因澄清引用 partial candidate tool result 返回 `model_output_invalid`

#### Scenario: Partial candidate 被用于生成
- **WHEN** Agent 调用 `generateRoutineDraft`、`generatePlanDraft` 或 `proposeWorkoutPatch`
- **AND** 输入引用的 `candidateSetId` 来自 partial candidate set
- **THEN** 工具 MUST 返回结构化依赖失败
- **AND** 系统 MUST NOT 生成或保存训练 artifact

### Requirement: Routine 动作搜索必须支持 section-aware 器械边界
系统 SHALL 区分用户对主训练可用器械的表达和对所有 routine section 的硬性器械要求。除非用户明确要求所有环节使用同一器械，否则 `training` section MAY 使用用户器械作为 hard filter，`warmup` 和 `stretch` MAY 使用无器械或受控补充候选满足三段式结构。

#### Scenario: 用户说有哑铃
- **WHEN** 用户请求“上肢 30 分钟，有哑铃”或等价 routine
- **THEN** Agent MUST 将哑铃优先作为主训练候选约束
- **AND** 系统 MUST NOT 默认要求 warmup 和 stretch 候选也必须使用哑铃
- **AND** 系统 MUST 能通过无器械或受控补充候选补足 warmup / stretch

#### Scenario: 用户明确要求全程哑铃
- **WHEN** 用户明确要求热身、主训练和拉伸都必须使用哑铃
- **THEN** Agent MAY 将哑铃作为所有 section 的 hard constraint
- **AND** 如果动作库无法满足该约束，系统 MUST 返回 `needs_clarification` 或 `blocked`
- **AND** 系统 MUST NOT 静默放宽用户明确的全程器械要求

#### Scenario: 补充候选纳入证据
- **WHEN** 系统为 warmup 或 stretch 使用受控补充候选
- **THEN** 补充动作 MUST 来自数据库
- **AND** 补充动作 MUST 被纳入本轮 candidate evidence
- **AND** 后续 validation MUST 能证明 routine 中每个动作都属于原始候选或受控补充候选

### Requirement: searchExercises 诊断必须给出可恢复路径
当执行型候选集合未满足 `resultRequirements` 时，工具 SHALL 给出稳定、结构化、模型可读的恢复路径，供 Agent 选择 retry、澄清、blocked 或 failed。

#### Scenario: sectionCoverage 未满足
- **WHEN** `resultRequirements.sectionCoverage` 存在未满足项
- **THEN** diagnostics MUST 包含每个缺失 section 的 required / actual 数量
- **AND** diagnostics MUST 包含候选非空时可保留的候选摘要
- **AND** diagnostics MUST 标明该结果是否允许澄清或重查

#### Scenario: 结果要求完全无法满足
- **WHEN** hard filters 返回空候选或动作库无法满足用户明确 hard constraint
- **THEN** 工具 MUST 返回结构化失败
- **AND** diagnostics MUST 区分 `insufficient_candidates`、`invalid_parameter`、`result_requirement_unmet` 或等价稳定错误码
- **AND** Agent MUST 基于该结构化诊断选择 retry、澄清、blocked 或 failed
