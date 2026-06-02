## ADDED Requirements

### Requirement: Routine 搜索必须由服务端内部分段候选池

系统 SHALL 在执行 `searchExercises(candidateUse = "routine")` 时由服务端内部构建 `warmup`、`training`、`stretch` 三类候选池。Agent / LLM MUST NOT 被要求分别为三段发起三次动作搜索调用。

#### Scenario: LLM 一次调用 routine 搜索
- **WHEN** Agent 调用 `searchExercises(candidateUse = "routine")`
- **THEN** 系统 MUST 只要求该调用表达整套 routine 的候选目标
- **AND** 服务端 MUST 内部生成 `warmup`、`training`、`stretch` 候选池
- **AND** 工具结果 MUST 返回同一个可消费 `candidateSetId`

#### Scenario: 主训练 filters 不污染热身和拉伸
- **WHEN** Agent 在 routine 搜索中传入主训练相关 `bodyRegions`、`targetMuscles`、`equipment`、`levels` 或强度边界
- **THEN** 系统 MUST 将这些边界优先用于 `training` 候选池
- **AND** 系统 MUST NOT 默认把主训练 `targetMuscles`、`equipment`、`levels` 或强度边界作为 `warmup` / `stretch` 的 hard filter

### Requirement: Routine 热身和拉伸候选默认无器械且适合对应 section

系统 SHALL 在 routine 搜索中默认用无器械或自重动作满足 `warmup` 和 `stretch` 候选池，并且候选动作必须适合对应 section。除非结构化输入明确要求某个非 training section 使用指定器械，否则普通主训练器械表达不得覆盖该默认边界。

#### Scenario: 未明确指定热身拉伸器械
- **WHEN** routine 搜索需要生成 `warmup` 和 `stretch` 候选
- **AND** 结构化输入没有明确要求 `warmup` 或 `stretch` 使用指定器械
- **THEN** `warmup` 候选池 MUST 优先筛选无器械或自重且适合 `warmup` 的动作
- **AND** `stretch` 候选池 MUST 优先筛选无器械或自重且适合 `stretch` 的动作

#### Scenario: 用户只表达主训练器械
- **WHEN** 用户请求“有哑铃练上肢”或等价 routine
- **AND** Agent 将哑铃表达为主训练可用器械
- **THEN** `training` 候选池 MAY 使用哑铃作为 hard filter 或强偏好
- **AND** `warmup` 和 `stretch` 候选池 MUST 默认继续使用无器械或自重边界

#### Scenario: 用户明确指定热身或拉伸器械
- **WHEN** 结构化输入明确表达 `warmup` 或 `stretch` 必须使用某个器械
- **THEN** 系统 MAY 将该器械作为对应 section 候选池的 hard constraint
- **AND** 如果该 section 无法满足候选覆盖，工具结果 MUST 返回稳定的 section 级诊断
- **AND** 系统 MUST NOT 静默改用无器械动作覆盖用户明确 hard constraint

### Requirement: Routine 候选证据必须记录 sectionPools

`searchExercises(candidateUse = "routine")` 的候选证据 SHALL 记录每个 section pool 的动作来源、应用过滤边界和覆盖证明。后续 routine draft、validation、policy 和保存链路 MUST 使用该 evidence 作为本轮候选事实源。

#### Scenario: routine 搜索成功
- **WHEN** `searchExercises(candidateUse = "routine")` 返回可消费候选集合
- **THEN** `candidateSetEvidence` MUST 包含 `sectionPools.warmup`、`sectionPools.training` 和 `sectionPools.stretch`
- **AND** 每个 pool MUST 记录候选 `exerciseId`
- **AND** evidence MUST 能证明 warmup / stretch 默认无器械边界是否被应用

#### Scenario: generateRoutineDraft 消费候选集合
- **WHEN** Agent 调用 `generateRoutineDraft` 并引用 routine `candidateSetId`
- **THEN** `generateRoutineDraft` MUST 优先使用 `candidateSetEvidence.sectionPools` 分配动作 section
- **AND** 如果同一动作同时具有多个通用 `allowedSections`，系统 MUST 以本轮 `sectionPools` evidence 为准

#### Scenario: 候选池缺失 section
- **WHEN** routine 搜索无法满足某个 section pool 的最低覆盖
- **THEN** 工具 diagnostics MUST 标明缺失的 section
- **AND** recoveryOptions MUST 指向 section-aware routine candidate set 或明确说明缺少哪类候选
- **AND** recoveryOptions MUST NOT 只提示“用同一 hard filters 重新查询”
