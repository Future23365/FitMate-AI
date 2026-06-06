## MODIFIED Requirements

### Requirement: `searchExerciseResources` observation 必须保留动态事实并压缩重复说明
系统 SHALL 在 `searchExerciseResources` 的模型 observation 中继续暴露真实 tool result 才能确定的动态事实。Observation MUST 以结构化字段表达查询事实、动作事实和 section coverage；MUST NOT 复制完整 system prompt、manifest 长段、业务输出 kind 判断、最终目标满足度判断或下一步 action 建议。

#### Scenario: Observation 不暴露输出 kind 判断
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含查询事实，例如 `suitabilities`、`totalMatches`、`returnedCount`、`truncated` 和 `appliedFilters`
- **AND** model observation MUST 包含 section coverage 事实，例如 `sectionSummary`、`availableSections` 和缺失 section 事实
- **AND** model observation MUST 包含有限 `groups.<section>.exercises[]` 动作事实，例如 `exerciseId` 和 `allowedSections`
- **AND** model observation MUST NOT 包含 `supportsOutputKinds`
- **AND** model observation MUST NOT 包含 `routinePlanCompositionBoundary.supportsOutputKinds`
- **AND** model observation MUST NOT 包含任何等价字段列出 `exercise_selection`、`routine` 或 `plan` 这类可输出 kind

#### Scenario: Observation 不判断可否成功交付 visibleOutputs
- **WHEN** `searchExerciseResources` 返回受约束的成功查询结果
- **THEN** model observation MAY 表达 tool 查询成功以及返回了哪些事实
- **AND** model observation MUST NOT 包含 `supportsSuccessfulVisibleOutputs`
- **AND** model observation MUST NOT 包含 `finalAnswerSupport`
- **AND** model observation MUST NOT 表达该结果能否满足用户最终训练请求
- **AND** 最终 `visibleTrainingProposal` 有效性 MUST 由 Planner 输出、output contract 和 terminal validator 决定

#### Scenario: Observation 不提供下一步 action 建议
- **WHEN** `searchExerciseResources` model observation 被构造
- **THEN** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 指示 Planner 输出 `final_answer_with_visible_outputs`
- **AND** observation MUST NOT 指示 Planner 继续 tool calling 或询问用户
- **AND** service code MUST NOT 基于用户原始自然语言选择 action、toolName 或 `payload.kind`

#### Scenario: 结构缺口仍作为事实暴露
- **WHEN** `searchExerciseResources` result lacks one or more queried or needed sections
- **THEN** model observation MAY expose deterministic missing section facts
- **AND** model observation MAY expose `diagnostics[]` for empty groups or invalid anchors
- **AND** model observation MUST NOT convert missing section facts into forbidden output kinds, supported output kinds or fixed recovery flow

#### Scenario: observation 用短边界替代长篇终态重复
- **WHEN** `searchExerciseResources` model observation 暴露事实不足或查询过宽
- **THEN** model observation MAY 表达 `diagnostics[]`、`missingSections`、`querySpecificity` 或等价确定性事实
- **AND** model observation MUST NOT 复制 system prompt 中关于 `AgentAction`、`usedRefs`、resource id 和 final answer 终态的完整长规则
