## MODIFIED Requirements

### Requirement: 服务端训练草稿硬校验只覆盖确定性事实

服务端 SHALL 只将可确定验证的结构、事实、权限和用户明确约束作为训练草稿 hard fail 条件；动作阶段归属、动作顺序、动态热身/拉伸用途、训练日重复度、连续负荷、训练量高低、休息长短和训练安排合理性 SHALL 由 LLM 基于候选动作说明和用户上下文决定。历史和 artifact 字段只有在可追溯为用户明确确认的约束时，才 SHALL 作为 hard fail 依据。

#### Scenario: 契约事实失败时阻止草稿

- **WHEN** AI 生成的训练草稿包含不存在的 `exerciseId`、候选集合外动作、候选集合为空、Schema 无法解析、payload 内部计数字段与实际结构不一致、权限越界或用户本轮明确约束被违反
- **THEN** 服务端 MUST 判定草稿校验失败
- **AND** 系统 MUST NOT 展示或保存该草稿

#### Scenario: 训练合理性不阻止草稿

- **WHEN** AI 生成的训练草稿通过 Schema、动作来源、候选集合、权限和用户明确约束校验
- **AND** 草稿存在训练日重复、连续训练日动作重叠、单日训练量偏高、新手训练量偏高、组间休息偏短或 section 语义分歧
- **THEN** 服务端 MUST NOT 因这些合理性判断判定草稿失败
- **AND** 系统 MAY 在 validation warnings 或 AI Trace 中记录这些诊断信息
- **AND** 系统 MUST 允许该草稿进入展示或保存流程

#### Scenario: 用户明确重复训练同一套动作

- **WHEN** 用户明确要求连续多天或多个训练日重复当前 routine
- **AND** ReferenceResolver 已解析到可访问的 routine artifact
- **AND** DomainPlanEngine 基于该 artifact 展开重复训练计划
- **THEN** 服务端 MUST 接受重复训练日作为合法用户意图
- **AND** 服务端 MUST NOT 返回 `day_similarity_high` 或 `consecutive_load_high` 作为 hard fail
- **AND** 系统 MAY 记录连续训练或重复训练 warning

#### Scenario: 推断时长或默认频率不作为 hard fail 依据

- **WHEN** 训练草稿实际估算时长、声明时长或训练日数量与 `sessionMinutes`、`weeklyFrequency` 不一致
- **AND** 对应字段来源是 `default` 或 `llm_inferred`
- **THEN** 服务端 MUST NOT 将该不一致作为 hard fail
- **AND** 系统 MAY 记录目标时长或频率不一致 warning

#### Scenario: 用户明确时长和频率约束仍可阻止草稿

- **WHEN** 用户当前消息、历史已确认约束或用户确认 artifact 明确要求本次训练时长、训练周期或每周频率
- **AND** AI 生成草稿明显违反该明确约束
- **THEN** 服务端 MAY 将该违反判定为契约失败
- **AND** 系统 MUST 在 trace 中记录被违反的字段和字段来源

#### Scenario: 用户明确避免动作或禁忌仍可阻止草稿

- **WHEN** 用户当前消息、历史已确认约束或用户确认 artifact 明确要求避免某个动作、避免某类动作或遵守具体训练禁忌
- **AND** AI 生成草稿明显违反该明确约束
- **THEN** 服务端 MAY 将该违反判定为契约失败
- **AND** 系统 MUST 在 trace 中记录被违反的约束、字段来源和命中的动作

#### Scenario: 未主动提出的伤病限制不作为 hard fail 依据

- **WHEN** 用户没有主动提出伤病、疼痛或具体训练禁忌
- **AND** 历史上下文或 artifact 中也不存在用户确认过的相关限制
- **AND** AI 生成草稿通过结构、动作来源、权限、候选集合和用户明确约束校验
- **THEN** 服务端 MUST NOT 基于推断性伤病风险或默认健康风险判断阻止草稿展示
- **AND** 系统 MAY 在 trace 中保留诊断信息

#### Scenario: 非确定性 section 语义分歧不阻止草稿

- **WHEN** AI 生成的训练草稿使用真实存在且来自候选集合的动作
- **AND** 该动作不违反用户明确器械、权限或动作来源约束
- **AND** 服务端本地元数据推导出的 section 与 AI 输出 section 不一致
- **THEN** 服务端 MUST NOT 仅因该 section 语义分歧判定草稿失败
- **AND** 系统 MAY 在 AI Trace 中记录诊断 warning

#### Scenario: 动态关节活动可作为热身

- **WHEN** AI 将 `Knee_Circles`、`Wrist_Circles` 或等价动态关节活动动作放入 routine 的 `warmup` section
- **AND** 这些动作存在于动作库并属于本轮候选集合
- **THEN** 服务端 MUST 接受该 section 编排
- **AND** 系统 MUST NOT 返回 `section_exercise_mismatch` 作为 hard fail
