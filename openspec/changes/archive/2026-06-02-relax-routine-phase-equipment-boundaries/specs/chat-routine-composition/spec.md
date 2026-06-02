## ADDED Requirements

### Requirement: Routine draft 必须使用受控补充 section evidence

聊天 routine 生成 SHALL 将 `searchExercises` 返回的 `controlledSupplementalCandidates.section` 视为本轮候选集合的结构化分段证据。`generateRoutineDraft` 构造三段式 routine 时，MUST 优先使用该 evidence 放置受控补充动作，而不得仅用动作通用元数据重新分段导致必要 section 缺失。

#### Scenario: 受控补充动作被用于 warmup
- **WHEN** `searchExercises(candidateUse = "routine")` 返回 `candidateSetEvidence.controlledSupplementalCandidates`，其中某个数据库动作的 `section = "warmup"`
- **AND** Agent 调用 `generateRoutineDraft` 并引用同一 `candidateSetId`
- **THEN** routine draft MUST 将该动作作为 `warmup` 候选使用
- **AND** 系统 MUST NOT 因该动作通用元数据同时偏向 `stretch` 而返回 `candidate_set_missing_warmup`

#### Scenario: 受控补充动作被用于 stretch
- **WHEN** `searchExercises(candidateUse = "routine")` 返回 `candidateSetEvidence.controlledSupplementalCandidates`，其中某个数据库动作的 `section = "stretch"`
- **AND** Agent 调用 `generateRoutineDraft` 并引用同一 `candidateSetId`
- **THEN** routine draft MUST 将该动作作为 `stretch` 候选使用
- **AND** 后续 `validateRoutineDraft` MUST 能通过 `candidateSetEvidence` 证明该动作属于本轮受控补充边界

### Requirement: Routine 热身和拉伸默认不继承主训练器械要求

当用户只表达可用器械或主训练器械偏好时，聊天 routine 生成 SHALL 默认把该器械用于 `training` 主训练候选边界。`warmup` 和 `stretch` SHALL 默认允许无器械或自重受控补充动作，系统不得要求用户再次确认热身和拉伸是否也使用主训练器械。

#### Scenario: 用户有哑铃但未要求全程哑铃
- **WHEN** 用户请求“上肢 30 分钟，有哑铃，帮我安排一套”或等价 routine
- **THEN** 系统 MUST 优先为 `training` 选择哑铃候选动作
- **AND** 系统 MUST 默认允许 `warmup` 和 `stretch` 使用无器械或自重动作
- **AND** 系统 MUST NOT 仅因为动作库缺少哑铃热身或哑铃拉伸动作而再次询问用户是否接受无器械热身/拉伸

#### Scenario: 用户明确指定热身和拉伸无器械
- **WHEN** 用户已回答“热身用无器械，拉伸用无器械，训练阶段全部用哑铃动作”或等价表达
- **THEN** Agent MUST 继续生成 routine draft、validation、policy 或 artifact 保存链路
- **AND** 系统 MUST NOT 继续发起同类澄清
- **AND** 系统 MUST NOT 因 `candidate_set_missing_warmup` 或等价 section coverage 错误终止为通用失败

#### Scenario: 用户明确要求全程同器械
- **WHEN** 用户明确要求热身、主训练和拉伸全部使用同一器械
- **THEN** 系统 MAY 将该器械作为所有 section 的 hard constraint
- **AND** 若动作库无法满足该边界，系统 MUST 返回 `needs_clarification`、`blocked` 或 `failed`
- **AND** 系统 MUST NOT 静默放宽用户明确的全程器械要求
