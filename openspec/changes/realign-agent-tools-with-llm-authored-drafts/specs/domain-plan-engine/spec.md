## ADDED Requirements

### Requirement: DomainPlanEngine 不得生成训练语义草稿

`DomainPlanEngine` SHALL 只执行确定性计划辅助能力，例如 schedule preview、calendar 展开和一致性校验。生产 Agent 生成链路 MUST NOT 使用 `DomainPlanEngine` 根据 source artifact、候选动作或策略自动生成完整 `WorkoutPlanDraft`。

#### Scenario: 生成长期计划
- **WHEN** Agent 需要生成长期 plan
- **THEN** LLM MUST 输出完整 structured plan draft
- **AND** `DomainPlanEngine` MUST NOT 根据 source routine 自动生成训练日语义
- **AND** `DomainPlanEngine` MUST NOT 根据候选动作自动决定计划内容

#### Scenario: 计划一致性校验
- **WHEN** 系统需要检查 LLM-authored plan 与 strategy 是否一致
- **THEN** `DomainPlanEngine` MAY 执行确定性一致性校验
- **AND** 校验失败 MUST 返回 errors 或 recovery
- **AND** `DomainPlanEngine` MUST NOT 自动改写 plan draft 以通过校验

### Requirement: DomainPlanEngine 不得解释用户自然语言

`DomainPlanEngine` SHALL NOT 读取 `latestUserMessage` 或其他自然语言文本推断周期、周频率、强度、策略、约束或递进语义。这些字段 MUST 来自 LLM structured output 或已确认的确定性事实。

#### Scenario: 策略字段缺失
- **WHEN** LLM-authored plan 或 strategy 缺少必要字段
- **THEN** 系统 MUST 返回结构化失败、LLM repair 或澄清
- **AND** `DomainPlanEngine` MUST NOT 用正则、关键词或模板从用户原文补齐字段

#### Scenario: 生产链路调用 DomainPlanEngine
- **WHEN** `/api/chat` 生产 Agent 链路调用 `DomainPlanEngine`
- **THEN** 调用输入 MUST NOT 包含 `latestUserMessage`
- **AND** 调用 MUST 只用于确定性 schedule / calendar 计算或一致性校验
