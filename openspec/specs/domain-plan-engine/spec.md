# domain-plan-engine Specification

## Purpose
TBD - created by archiving change change-005-domain-plan-engine. Update Purpose after archive.
## Requirements
### Requirement: 长期计划必须由 PlanStrategy 驱动
系统 SHALL 使用结构化 `PlanStrategy` 表达长期计划策略，并由服务端计划引擎展开长期计划。

#### Scenario: 用户请求基于当前 routine 重复训练
- **WHEN** 用户说“三周都练这个”
- **AND** ReferenceResolver 已解析到当前 routine artifact
- **THEN** 系统 MUST 生成引用该 artifact 的 `PlanStrategy`
- **AND** strategy MUST 表达 horizonDays、weeklyFrequency、sessionMinutes、progressionPolicy 和 intensityBias
- **AND** `/api/ai/workout-plan` MUST 通过受控 artifact payload 读取完整 routine
- **AND** 系统 MUST NOT 让 LLM 直接自由生成完整长期日历

#### Scenario: PlanStrategy 缺少核心字段
- **WHEN** PlanStrategy 缺少周期、周频率、单次时长或策略类型
- **THEN** 系统 MUST 使用用户画像默认值或继续追问
- **AND** 系统 MUST NOT 展示不可校验的长期计划草稿

### Requirement: DomainPlanEngine 必须展开训练日和休息日
系统 SHALL 根据 PlanStrategy、用户约束和引用 artifact 展开训练日、休息日和 schedule preview。

#### Scenario: 按周频率生成训练日
- **WHEN** PlanStrategy 指定 `weeklyFrequency = 3` 且 `horizonDays = 21`
- **THEN** DomainPlanEngine MUST 在 21 天内安排与每周 3 练匹配的训练日
- **AND** 非训练日 MUST 标记为休息或恢复
- **AND** 输出 MUST 包含 `schedulePreview`，表达每一天的训练或恢复安排
- **AND** 计划结果 MUST 包含可解释的训练日分布摘要

#### Scenario: 用户要求一周四练但别太累
- **WHEN** 用户要求将计划调整为一周四练并要求强度保守
- **THEN** PlanStrategy MUST 使用保守或正常的 intensityBias
- **AND** DomainPlanEngine MUST 重算训练日与恢复间隔
- **AND** 系统 SHOULD 降低单日容量或避免连续高负荷同肌群安排

### Requirement: 递进策略必须保守且可校验
系统 SHALL 仅在 Validator 可接受的范围内应用训练递进。

#### Scenario: 重复同一 routine 并小幅递进
- **WHEN** PlanStrategy 使用 `repeat_same_routine_with_progression`
- **THEN** DomainPlanEngine MAY 在后续周期小幅增加次数、组数或动作难度
- **AND** 递进 MUST 受用户水平、动作难度、风险和目标时长限制
- **AND** 无法安全递进时系统 MUST 保持原动作结构并说明原因

### Requirement: 长期计划保存前必须经过 Validator

系统 SHALL 在长期计划返回给用户或进入保存流程前执行服务端契约校验。Validator SHALL 校验训练日数量、动作来源、结构、字段来源、引用 artifact、权限和用户明确约束；连续负荷、训练日重复、section 语义、训练量高低和恢复安排合理性 SHALL 作为 warning 或 LLM 语义判断，不得单独阻止计划展示。历史和 artifact 字段只有在可追溯为用户明确确认的约束时，才 SHALL 作为 hard fail 依据。

#### Scenario: 生成 schedule preview

- **WHEN** DomainPlanEngine 输出 schedule preview
- **THEN** Validator MUST 校验训练日数量是否满足用户明确周期和频率约束
- **AND** Validator MUST 校验动作来自本轮候选集合或受控 artifact payload
- **AND** Validator MUST 校验 payload 结构和引用来源与 PlanStrategy 一致
- **AND** Validator MUST NOT 仅因连续负荷、训练日重复、动作 section 或训练量合理性 warning 阻止计划展示

#### Scenario: 用户明确要求重复当前 routine

- **WHEN** 用户要求连续多天或多个训练日重复当前 routine
- **AND** PlanStrategy 使用 `repeat_previous_routine`、`repeat_same_routine_with_progression` 或等价重复策略
- **THEN** Validator MUST 接受重复训练日作为符合用户意图的计划结构
- **AND** Validator MUST NOT 返回 `day_similarity_high` 或 `consecutive_load_high` 作为 hard fail
- **AND** 系统 MAY 在 validation warnings 或 trace 中记录连续训练 warning

#### Scenario: 引用 artifact 不可用

- **WHEN** PlanStrategy 引用的 sourceArtifactId 不存在、不可访问或 payload 无法校验
- **THEN** 系统 MUST 返回可恢复的继续对话引导
- **AND** 系统 MUST NOT 从 conversationSummary 重建完整训练计划

#### Scenario: 字段来源控制频率和时长契约

- **WHEN** DomainPlanEngine 输出的训练日数量或单次时长与 PlanStrategy 不一致
- **AND** 对应 PlanStrategy 字段来源是 `current_user_message`，或可追溯为用户明确确认约束的 `history` / `artifact`
- **THEN** Validator MAY 将该不一致判定为契约失败
- **AND** 系统 MUST 进入修复或恢复流程

#### Scenario: 默认字段不阻止计划展示

- **WHEN** DomainPlanEngine 输出的训练日数量或单次时长与 PlanStrategy 不一致
- **AND** 对应 PlanStrategy 字段来源是 `default` 或 `llm_inferred`
- **THEN** Validator MUST NOT 将该不一致作为 hard fail
- **AND** 系统 MAY 记录 warning 并允许计划展示

### Requirement: DomainPlanEngine 默认值必须受字段来源约束
系统 SHALL 控制 DomainPlanEngine 对周期、频率和时长默认值的使用，避免默认值静默覆盖 resolved intent。

#### Scenario: resolved intent 未提供周期且允许默认
- **WHEN** resolved intent 没有明确计划周期或日历范围
- **AND** 字段来源允许使用默认计划周期
- **THEN** DomainPlanEngine MAY 使用默认 `horizonDays`
- **AND** `PlanStrategy` MUST 标记该周期来源为 `default`
- **AND** 调用方 MUST 在用户回复或可见建议中说明该默认周期假设

#### Scenario: resolved intent 提供明确周期
- **WHEN** resolved intent 或其字段来源表明用户已提供明确计划周期或日历范围
- **THEN** DomainPlanEngine MUST 使用该周期或日历范围
- **AND** DomainPlanEngine MUST NOT 回退到默认 `horizonDays`

#### Scenario: 默认值会改变用户结果
- **WHEN** DomainPlanEngine 需要使用默认周期、频率或时长生成结果
- **AND** 该默认值会改变用户可见的计划长度、训练日数量或训练节奏
- **THEN** 系统 MUST 在回复或可见建议中表达默认假设
- **AND** 系统 MUST 提供用户可继续调整该默认值的路径

### Requirement: DomainPlanEngine 输出必须与 PlanStrategy 一致
系统 SHALL 在返回长期计划草稿前校验 DomainPlanEngine 输出与 `PlanStrategy` 一致。

#### Scenario: 输出周期与 strategy 冲突
- **WHEN** DomainPlanEngine 生成的 draft 包含 `cycleLengthDays` 或 `calendarHorizonDays`
- **AND** 这些字段与 `PlanStrategy.horizonDays` 冲突
- **THEN** 系统 MUST 拒绝该 draft 作为成功计划返回
- **AND** 系统 MUST 进入自动修复或可继续对话恢复流程

#### Scenario: 输出周频率与 strategy 冲突
- **WHEN** DomainPlanEngine 生成的 draft 包含 `weeklyFrequency`
- **AND** 该字段与 `PlanStrategy.weeklyFrequency` 冲突
- **THEN** 系统 MUST 拒绝该 draft 作为成功计划返回
- **AND** 系统 MUST 记录可用于 AI Trace 排查的冲突信息

#### Scenario: 输出引用来源与 strategy 冲突
- **WHEN** `PlanStrategy.sourceArtifactId` 存在
- **AND** DomainPlanEngine 输出的 schedule preview 或 draft 元数据引用了不同 artifact
- **THEN** 系统 MUST 拒绝该 draft 作为成功计划返回
- **AND** 系统 MUST NOT 展示基于错误 artifact 的计划卡片

### Requirement: 长期计划引用必须使用当前 active artifact payload
系统 SHALL 在基于 routine 或 plan 引用展开长期计划前，使用服务端受控工具读取当前 active artifact payload。

#### Scenario: 引用的 sourceArtifactId 已被新 revision 替换
- **WHEN** PlanStrategy 的 `sourceArtifactId` 指向当前用户可访问的旧 revision
- **AND** artifact service 能解析到同一 lineage 的当前 active revision
- **THEN** `/api/ai/workout-plan` MUST 使用当前 active revision 的 payload 调用 DomainPlanEngine
- **AND** 系统 MUST NOT 回退到 LLM 自由生成完整长期日历

#### Scenario: 引用无法解析到可用 payload
- **WHEN** PlanStrategy 的 `sourceArtifactId` 无法读取、不可访问或 payload 校验失败
- **THEN** `/api/ai/workout-plan` MUST 返回可恢复失败
- **AND** 用户可见引导 MUST 要求重新点明训练内容或重新生成
- **AND** 系统 MUST NOT 从 conversationSummary 重建完整训练计划

### Requirement: PlanStrategy 必须从 Agent 结构化输入派生
系统 SHALL 从 Agent 已登记的结构化计划输入、`WorkoutEditPlan`、tool results、candidateSetId、字段来源和用户约束派生 `PlanStrategy`，而不是从旧 resolved intent 派生。

#### Scenario: Agent 请求生成长期计划
- **WHEN** Agent 通过工具请求生成长期计划草稿
- **THEN** `DomainPlanEngine` MUST 接收 Agent 提供的结构化计划输入和字段来源
- **AND** `PlanStrategy` MUST 记录这些字段来源
- **AND** `DomainPlanEngine` MUST NOT 读取旧 `ResolvedChatIntent`、`workoutIntent` 或 `referenceResolution`

#### Scenario: Agent 请求基于历史 artifact 生成计划
- **WHEN** Agent 的计划输入引用历史 routine 或 plan artifact
- **THEN** `DomainPlanEngine` MUST 使用 Agent tool result 中已读取并校验的 active artifact payload
- **AND** `DomainPlanEngine` MUST NOT 从 `conversationSummary` 或旧 referenceResolution 重建完整训练内容

