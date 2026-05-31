## ADDED Requirements

### Requirement: 长期计划推送必须服从 resolved intent
系统 SHALL 使用 `/api/chat` 的最终 resolved intent 驱动长期计划推送，避免计划生成层重新决策用户关键意图。

#### Scenario: resolved intent 要求生成长期计划
- **WHEN** resolved intent 的 `action.kind` 为 `workout_plan`
- **AND** `action.shouldTrigger` 为 `true`
- **THEN** 长期计划生成请求 MUST 使用 resolved intent 中的 `workoutIntent`
- **AND** 长期计划生成请求 MUST 接收关键字段来源和引用解析结果
- **AND** 系统 MUST NOT 从用户回复正文重新提取 plan trigger
- **AND** 系统 MUST NOT 在计划生成接口中重新判断本轮是否应该生成 plan

#### Scenario: resolved intent 要求澄清
- **WHEN** resolved intent 的 `responseMode` 为 `ask_clarification`
- **OR** `action.shouldTrigger` 为 `false`
- **THEN** 系统 MUST NOT 调用长期计划生成流程
- **AND** 前端 MUST NOT 展示长期计划生成中的加载状态

### Requirement: 长期计划推送不得用默认周期覆盖 resolved intent 约束
系统 SHALL 保证长期计划草稿的周期、日历范围和周频率符合 resolved intent 中的关键字段及其来源。

#### Scenario: resolved intent 包含明确日历范围
- **WHEN** resolved intent 的 `workoutIntent.calendarHorizonDays` 存在
- **AND** 该字段来源为 `current_user_message`、`history`、`artifact` 或 `llm_inferred`
- **THEN** 生成的长期计划草稿 MUST 使用相同的 `calendarHorizonDays`
- **AND** `cycleLengthDays` MUST 与该日历范围一致或按该范围可解释地展开
- **AND** 系统 MUST NOT 返回使用默认 21 天覆盖该范围的计划草稿

#### Scenario: resolved intent 只有默认周期
- **WHEN** resolved intent 的计划周期或日历范围来源为 `default`
- **THEN** 系统 MAY 使用默认周期生成计划
- **AND** 用户回复或可见建议 MUST 说明本次使用的是默认周期假设
- **AND** 系统 MUST 提供可继续调整周期的用户可见回复选项

#### Scenario: 默认值来源缺失或不可追踪
- **WHEN** 计划生成需要使用默认周期、默认周频率或默认单次时长
- **THEN** resolved intent 或 PlanStrategy MUST 标记对应字段来源为 `default`
- **AND** 系统 MUST NOT 将默认值伪装成用户已经明确表达的约束

#### Scenario: 计划草稿与 resolved intent 不一致
- **WHEN** 计划草稿的 `cycleLengthDays`、`calendarHorizonDays`、`weeklyFrequency` 或 `trainingDayCount` 与 resolved intent 约束冲突
- **THEN** 系统 MUST 拒绝将该草稿作为成功计划返回
- **AND** 系统 MUST 进入自动修复或可继续对话的恢复流程

### Requirement: 生成后建议不得默认改变用户明确需求
系统 SHALL 在完成用户明确可执行需求后，以用户可选择的方式提供更稳妥训练调整建议。

#### Scenario: 用户明确请求可执行长期计划
- **WHEN** 用户明确请求长期、多天或周期性训练安排
- **AND** resolved intent 具备生成条件
- **THEN** 系统 MUST 优先生成符合用户请求的计划
- **AND** 系统 MAY 在回复中提供调整建议或建议按钮
- **AND** 系统 MUST NOT 在没有硬阻断的情况下私自把用户请求改成另一种计划目标

#### Scenario: 存在硬阻断条件
- **WHEN** 用户请求涉及医疗诊断、治疗建议、不可执行引用对象或缺少必要训练条件
- **THEN** 系统 MUST 阻断生成或进入澄清
- **AND** 系统 MUST 用用户可理解的方式说明需要补充或无法执行的原因
