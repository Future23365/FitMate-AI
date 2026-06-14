## ADDED Requirements

### Requirement: `searchExerciseResources` Planner 可见结果不得暴露内部 diagnostics
系统 SHALL 将 `searchExerciseResources` 的 Planner-visible observation 限定为可消费动作候选事实和必要查询口径。内部 `diagnostics`、命中数量、截断状态、过滤应用细节和名称歧义诊断 MUST NOT 进入 `modelVisibleSummary`，但 MAY 继续保留在 `userProjection`、`traceSummary`、trace log 和测试断言中。

#### Scenario: 成功候选只向 Planner 暴露候选事实
- **WHEN** `searchExerciseResources` 成功返回一个或多个 `candidateGroups[].exercises[]`
- **THEN** Planner-visible observation MUST 包含 `candidateGroups[]`
- **AND** Planner-visible observation MUST 包含每个候选动作的受控 `exerciseId` 和有限动作摘要
- **AND** Planner-visible observation MUST NOT 包含 `diagnostics`
- **AND** Planner-visible observation MUST NOT 包含 `diagnostics[].code`、`diagnostics[].message`、`exercise_name_ambiguous`、`exercise_name_too_broad` 或“唯一候选锚点”等名称匹配诊断文案
- **AND** Planner-visible observation MUST NOT 包含 `totalMatches`、`returnedCount`、`truncated`、`maxReturned`、`excludedCount`、`appliedFilters`、`filterApplications`、`filterSemantics`、`zeroMatchMuscles` 或 `candidateCountPerSection`

#### Scenario: 内部 diagnostics 仍可用于审计
- **WHEN** `searchExerciseResources` 执行结果包含 `diagnostics`
- **THEN** `userProjection` MAY 保留 `diagnostics` 供前端或开发态复盘使用
- **AND** `traceSummary` MAY 保留脱敏后的 `diagnostics`、`totalMatches`、`returnedCount` 和过滤诊断供 trace 调试使用
- **AND** 这些字段 MUST NOT 回灌为下一轮 Planner-visible observation

#### Scenario: 空候选不回灌原始 diagnostics
- **WHEN** `searchExerciseResources` 成功执行但当前查询口径下没有可用候选
- **THEN** Planner-visible observation MUST 仍将该结果表达为成功的当前查询事实
- **AND** Planner-visible observation MUST NOT 暴露原始 `diagnostics`
- **AND** 系统 MUST NOT 将空候选、候选不足或名称歧义诊断表达为必须继续查询、必须扩大候选数量或必须调用某个下一步 tool

### Requirement: `searchExerciseResources` 模型可见说明必须区分候选事实和内部诊断
系统 SHALL 在 `searchExerciseResources` 的 tool description 和相关模型可见说明中表达：Planner-visible 结果以 `candidateGroups[]` 作为动作候选事实；内部 `diagnostics` 只用于 trace / userProjection / debug，不是成功候选事实，也不是下一步 tool 调用指令。

#### Scenario: Tool description 不承诺向 Planner 暴露 diagnostics
- **WHEN** production registry 序列化 `searchExerciseResources` tool description
- **THEN** description MUST 表达该 tool 返回按查询口径分组的 `candidateGroups[]`
- **AND** description MUST 表达内部 `diagnostics` 不作为 Planner 成功候选事实
- **AND** description MUST NOT 表达 Planner 可以依赖 `diagnostics`、命中数量、截断状态或名称歧义诊断来决定是否继续查询

### Requirement: 模型可见合同门禁必须阻止 search diagnostics 泄漏
系统 SHALL 在 model-visible contract gate 中递归检查 `searchExerciseResources` 的 Planner-visible summary，禁止内部诊断字段和诊断文案通过对象、数组或字符串化 JSON 泄漏。

#### Scenario: Contract gate 拒绝 diagnostics key
- **WHEN** `searchExerciseResources` 的 Planner-visible summary 包含 `diagnostics`
- **THEN** model-visible contract gate MUST 返回失败 finding
- **AND** finding MUST 指出 `diagnostics` 所在路径

#### Scenario: Contract gate 拒绝嵌套 diagnostics 字符串
- **WHEN** `searchExerciseResources` 的 Planner-visible summary 在嵌套字符串化 JSON 中包含 `diagnostics`、`exercise_name_ambiguous` 或 `exercise_name_too_broad`
- **THEN** model-visible contract gate MUST 返回失败 finding
- **AND** gate MUST NOT 只检查顶层对象字段
