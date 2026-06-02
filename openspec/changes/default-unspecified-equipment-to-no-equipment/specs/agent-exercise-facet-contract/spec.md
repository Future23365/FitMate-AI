## ADDED Requirements

### Requirement: 执行型动作检索未指定器械时必须默认无器械

Agent 通过 `searchExercises` 构建可执行候选集合时，系统 SHALL 在没有正向可用器械或居家条件的结构化事实时默认使用无器械 / 自重边界。该默认只适用于 Agent 执行型候选用途，不得改变动作库页面、composer 或普通动作查询的默认行为。

#### Scenario: 推荐候选缺少器械条件
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse = "recommendation"`
- **AND** 输入、ContextPackage 和已确认用户记忆中都没有正向可用器械或居家条件
- **THEN** 系统 MUST 将候选集合限定为无器械或自重可用动作
- **AND** `candidateSetEvidence` 或等价诊断 MUST 能证明已执行该无器械边界

#### Scenario: Routine 候选缺少器械条件
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse = "routine"`
- **AND** 输入、ContextPackage 和已确认用户记忆中都没有正向可用器械或居家条件
- **THEN** 系统 MUST 默认使用无器械或自重候选边界
- **AND** 后续 `generateRoutineDraft` MUST 只能消费满足该边界的候选集合或服务端受控补充候选

#### Scenario: 用户明确提供可用器械
- **WHEN** Agent 输入或已确认上下文包含正向可用器械，例如 `filters.equipment.in`、`equipmentRequired`、`equipment` 或等价结构化事实
- **THEN** 系统 MUST 使用该器械边界构建候选集合
- **AND** 系统 MUST NOT 再叠加默认无器械边界覆盖用户明确可用器械

#### Scenario: 只有排除类器械条件
- **WHEN** Agent 输入只包含 `filters.equipment.notIn`、`equipmentAvoided` 或等价排除条件
- **AND** 没有正向可用器械或居家条件
- **THEN** 系统 MUST 保留排除条件并叠加默认无器械边界
- **AND** 系统 MUST NOT 将排除类条件解释成某个可用器械

#### Scenario: 服务端不得读取自然语言原文决定默认
- **WHEN** 服务端判断是否需要默认无器械
- **THEN** 判断 MUST 只基于 Agent 结构化输入、ContextPackage 中已确认事实、用户记忆或 candidate evidence
- **AND** 判断 MUST NOT 基于 latest user message、conversationSummary、关键词、正则、同义词表或短句模板重新解释用户语义
