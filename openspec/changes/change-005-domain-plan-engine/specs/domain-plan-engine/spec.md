## ADDED Requirements

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
系统 SHALL 在长期计划返回给用户或进入保存流程前执行服务端校验。

#### Scenario: 生成 schedule preview
- **WHEN** DomainPlanEngine 输出 schedule preview
- **THEN** Validator MUST 校验训练日数量、连续负荷、动作 section、候选来源、时长和风险边界
- **AND** 校验失败时系统 MUST 返回修复结果或继续对话引导
- **AND** 系统 MUST NOT 保存未通过校验的计划

#### Scenario: 引用 artifact 不可用
- **WHEN** PlanStrategy 引用的 sourceArtifactId 不存在、不可访问或 payload 无法校验
- **THEN** 系统 MUST 返回可恢复的继续对话引导
- **AND** 系统 MUST NOT 从 conversationSummary 重建完整训练计划
