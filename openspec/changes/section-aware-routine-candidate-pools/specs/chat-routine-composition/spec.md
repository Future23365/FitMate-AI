## ADDED Requirements

### Requirement: Routine 生成不得因模型漏写热身拉伸覆盖而阻断

聊天 routine 生成 SHALL 将完整 routine 的三段式结构作为服务端候选合同归一化。只要用户请求的是完整单次 routine，系统 MUST 默认要求并尝试满足 `warmup`、`training`、`stretch` 覆盖，不得因为模型只在 `sectionCoverage` 中写入 `training` 而阻断生成或追问用户。

#### Scenario: 模型只声明 training 覆盖
- **WHEN** Agent 调用 `searchExercises(candidateUse = "routine")`
- **AND** `resultRequirements.sectionCoverage` 只包含 `training`
- **THEN** 服务端 MUST 将 routine 候选要求归一化为包含 `warmup`、`training`、`stretch`
- **AND** 系统 MUST 尝试用无器械或自重且适合 section 的动作补足 `warmup` 和 `stretch`
- **AND** 系统 MUST NOT 仅因模型漏写 `warmup` 或 `stretch` 覆盖而返回 `needs_clarification`

#### Scenario: 无器械高强度胸背腿 routine
- **WHEN** 用户请求“每周 3 练，每次 50 分钟，没有器械，高强度，重点练胸背腿”或等价 routine
- **THEN** 系统 MUST 为 `training` 查找符合目标的无器械主训练候选
- **AND** 系统 MUST 为 `warmup` 查找无器械且适合热身的动作
- **AND** 系统 MUST 为 `stretch` 查找无器械且适合拉伸的动作
- **AND** 系统 MUST NOT 要求用户再次确认热身或拉伸是否允许无器械

### Requirement: Routine draft 必须按 section pool evidence 分段

聊天 routine draft 生成 SHALL 使用 `candidateSetEvidence.sectionPools` 作为分段事实源。`generateRoutineDraft` MUST 优先按 section pool evidence 生成 `warmup`、`training`、`stretch`，不得只按动作通用元数据或模型传入顺序重新猜测 section。

#### Scenario: sectionPools 提供热身和拉伸候选
- **WHEN** `searchExercises(candidateUse = "routine")` 返回 `candidateSetEvidence.sectionPools`
- **AND** `sectionPools.warmup` 和 `sectionPools.stretch` 各包含至少一个数据库动作
- **THEN** `generateRoutineDraft` MUST 使用这些动作生成对应 section
- **AND** 系统 MUST NOT 返回 `candidate_set_missing_warmup` 或 `candidate_set_missing_stretch`

#### Scenario: sectionPools 与通用动作元数据不完全一致
- **WHEN** 某个动作在本轮 `sectionPools.warmup` 中出现
- **AND** 该动作通用元数据也允许或偏向 `stretch`
- **THEN** routine draft MUST 将该动作作为本轮 `warmup` 候选使用
- **AND** 后续 validation MUST 能基于本轮 candidate evidence 验证该动作来自可用候选边界

### Requirement: Routine 候选阻断必须表达真实 section 缺口

当 routine 候选确实无法满足三段式结构时，系统 SHALL 返回面向用户和开发者都可理解的 section 级诊断。系统 MUST 区分“主训练候选不足”和“热身 / 拉伸候选不足”，不得把默认无器械热身拉伸补齐误表述为需要用户放宽器械条件。

#### Scenario: 主训练满足但热身缺失
- **WHEN** `training` 候选池满足 routine 主训练要求
- **AND** `warmup` 候选池无法找到无器械或指定器械候选
- **THEN** 工具 diagnostics MUST 标记缺失的是 `warmup`
- **AND** 用户可见回复 MUST 说明缺少热身候选
- **AND** 回复 MUST NOT 表述为需要放宽主训练器械条件

#### Scenario: 明确全程同器械导致热身拉伸不足
- **WHEN** 用户明确要求热身、主训练和拉伸全部使用同一器械
- **AND** 动作库无法满足对应 `warmup` 或 `stretch` 候选池
- **THEN** 系统 MAY 返回 `needs_clarification`、`blocked` 或 `failed`
- **AND** 回复 MUST 说明缺失的是全程同器械的热身或拉伸候选
- **AND** 系统 MUST NOT 静默改用默认无器械候选
