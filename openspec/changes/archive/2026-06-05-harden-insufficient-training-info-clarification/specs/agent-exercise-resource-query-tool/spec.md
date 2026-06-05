## ADDED Requirements

### Requirement: searchExerciseResources 必须将无目标 broad query 标记为未满足
`searchExerciseResources` SHALL 对缺少可解释筛选条件的 broad query 返回诊断性未满足结果。若 tool input 除默认 `suitabilities`、`published`、`sort` 外没有任何目标、facet、器械、场地、点名动作或当前 run 可见动作锚点，`fulfillment.satisfied` MUST 为 `false`，该 tool result MUST NOT 支撑成功 `final_answer` 或 `visibleTrainingProposal`。

#### Scenario: 无筛选动作查询不能支撑成功训练输出
- **WHEN** Planner 调用 `searchExerciseResources`，input 只包含默认或等价默认的 `suitabilities`、`published`、`sort`
- **THEN** tool execution MAY 返回只读动作摘要
- **AND** `fulfillment.satisfied` MUST be `false`
- **AND** model observation MUST 说明该结果只可用于澄清、解释查询过宽或下一轮 repair
- **AND** model observation MUST 说明不能用该结果输出成功 `final_answer.visibleOutputs[]`

#### Scenario: 有结构化约束的动作查询仍可满足
- **WHEN** Planner 调用 `searchExerciseResources`，input 包含 `q`、`category`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`requiredExerciseIds` 或 `excludeExerciseIds` 中至少一类可解释约束
- **THEN** tool fulfillment MAY be `satisfied=true` when the query executes within schema and database boundaries
- **AND** returned groups MAY be used as current-run action facts subject to final output validation

#### Scenario: Broad query 合同不读取用户原文
- **WHEN** tool 判断 query 是否过宽
- **THEN** 判断 MUST only use structured tool input fields
- **AND** 判断 MUST NOT inspect user original text, keywords, synonyms, regexes or phrasing templates
