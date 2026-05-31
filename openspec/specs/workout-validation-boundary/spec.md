# workout-validation-boundary Specification

## Purpose
TBD - created by archiving change limit-workout-validation-to-deterministic-facts. Update Purpose after archive.
## Requirements
### Requirement: 服务端训练草稿硬校验只覆盖确定性事实

服务端 SHALL 只将可确定验证的事实、安全和结构边界作为训练草稿 hard fail 条件；动作阶段归属、动作顺序和动态热身/拉伸用途等训练语义 SHALL 由 LLM 基于候选动作说明和用户上下文决定。

#### Scenario: 确定性事实失败时阻止草稿

- **WHEN** AI 生成的训练草稿包含不存在的 `exerciseId`、候选集合外动作、缺失必要 section、Schema 无法解析、绕过用户器械/伤病限制、权限越界或明显离谱的时长训练量
- **THEN** 服务端 MUST 判定草稿校验失败
- **AND** 系统 MUST NOT 展示或保存该草稿

#### Scenario: 非确定性 section 语义分歧不阻止草稿

- **WHEN** AI 生成的训练草稿使用真实存在且来自候选集合的动作
- **AND** 该动作不违反用户器械、伤病、权限或训练量限制
- **AND** 服务端本地元数据推导出的 section 与 AI 输出 section 不一致
- **THEN** 服务端 MUST NOT 仅因该 section 语义分歧判定草稿失败
- **AND** 系统 MAY 在 AI Trace 中记录诊断 warning

#### Scenario: 动态关节活动可作为热身

- **WHEN** AI 将 `Knee_Circles`、`Wrist_Circles` 或等价动态关节活动动作放入 routine 的 `warmup` section
- **AND** 这些动作存在于动作库并属于本轮候选集合
- **THEN** 服务端 MUST 接受该 section 编排
- **AND** 系统 MUST NOT 返回 `section_exercise_mismatch` 作为 hard fail

### Requirement: Section 元数据只能作为提示和诊断信号

服务端 SHALL 允许 `allowedSections` 或等价动作元数据用于候选排序、候选分池、提示词约束和 trace 诊断，但 SHALL NOT 将该元数据作为覆盖 LLM 训练语义判断的唯一硬失败依据。

#### Scenario: 候选分池不限制最终语义选择

- **WHEN** 服务端为 LLM 生成 warmup、training、stretch 候选分池
- **THEN** 分池结果 MAY 影响候选优先级和提示词说明
- **AND** 服务端 MUST 保留总候选集合中的合法动作可被 LLM 用于最终草稿

#### Scenario: 语义 warning 可观测

- **WHEN** AI 输出的 section 与服务端元数据偏好不一致
- **THEN** 系统 MAY 记录包含 `exerciseId`、AI section、元数据 section 和原因的 trace warning
- **AND** 该 warning MUST NOT 单独导致聊天卡片生成失败

