## ADDED Requirements

### Requirement: searchExerciseResources observation 只能表达动作事实和覆盖事实
`searchExerciseResources` SHALL remain a read-only structured exercise fact query tool. Its model observation MUST expose deterministic query facts, exercise facts and section coverage only. It MUST NOT infer whether the user asked for `exercise_selection`、`routine` 或 `plan`, and MUST NOT tell Planner which `visibleTrainingProposal.payload.kind` can or should be emitted.

#### Scenario: Observation 不暴露输出 kind 判断
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST include query facts such as `suitabilities`、`totalMatches`、`returnedCount`、`truncated` and `appliedFilters`
- **AND** model observation MUST include section facts such as `sectionSummary`、`availableSections` and missing section facts
- **AND** model observation MUST include limited `groups.<section>.exercises[]` facts including `exerciseId` and `allowedSections`
- **AND** model observation MUST NOT include `supportsOutputKinds`
- **AND** model observation MUST NOT include `routinePlanCompositionBoundary.supportsOutputKinds`
- **AND** model observation MUST NOT include any equivalent field that lists `exercise_selection`、`routine` or `plan` as supported output kinds

#### Scenario: Observation 不判断可否成功交付 visibleOutputs
- **WHEN** `searchExerciseResources` returns a constrained successful query result
- **THEN** model observation MAY state that the tool query succeeded and which facts were returned
- **AND** model observation MUST NOT include `supportsSuccessfulVisibleOutputs`
- **AND** model observation MUST NOT include `finalAnswerSupport`
- **AND** model observation MUST NOT state that the result can or cannot satisfy the user's final training request
- **AND** final `visibleTrainingProposal` validity MUST be determined by Planner output, output contract and terminal validator

#### Scenario: Observation 不提供下一步 action 建议
- **WHEN** `searchExerciseResources` model observation is built
- **THEN** observation MUST NOT include `nextActionHints`
- **AND** observation MUST NOT instruct Planner to output `final_answer_with_visible_outputs`
- **AND** observation MUST NOT instruct Planner to continue tool calling or ask the user
- **AND** service code MUST NOT choose action, toolName or `payload.kind` based on the user's original natural language

#### Scenario: 结构缺口仍作为事实暴露
- **WHEN** `searchExerciseResources` result lacks one or more queried or needed sections
- **THEN** model observation MAY expose deterministic missing section facts
- **AND** model observation MAY expose `diagnostics[]` for empty groups or invalid anchors
- **AND** model observation MUST NOT convert missing section facts into forbidden output kinds, supported output kinds or fixed recovery flow
