## ADDED Requirements

### Requirement: `searchExerciseResources` 必须表达产品动作资源库边界
系统 SHALL 在 `searchExerciseResources` 的模型可见 description 和 Planner-visible summary 中表达：该 tool 查询的是产品动作库中可用于卡片、图片、动作详情、结构化训练输出和训练执行界面的可渲染动作资源候选。该 tool 的空结果或点名动作未命中 MUST 只表达当前查询口径下产品动作库没有匹配资源，不得表达现实训练动作不存在或模型不能给普通文本建议。

#### Scenario: Tool description 说明资源库角色
- **WHEN** production registry 序列化 `searchExerciseResources` tool description
- **THEN** description MUST 表达 Exercise 动作库是产品可渲染动作资源库
- **AND** description MUST 表达该 tool 不负责检索现实世界全部训练知识
- **AND** description MUST 表达普通文本知识回答不需要产品动作卡片或结构化训练结果时，可以不依赖数据库动作条目

#### Scenario: Planner-visible summary 包含受控 resourceBoundary
- **WHEN** `searchExerciseResources` 成功执行并进入下一轮 Planner 输入
- **THEN** Planner-visible summary MUST 包含 `resourceBoundary`
- **AND** `resourceBoundary` MUST 表达产品动作库的资源角色
- **AND** `resourceBoundary` MUST 表达空候选或点名动作未命中只说明产品库当前没有匹配的可渲染资源
- **AND** `resourceBoundary` MUST 表达需要卡片、图片、`visibleTrainingProposal`、routine、plan 或训练执行项时，具体动作仍必须来自数据库动作事实

#### Scenario: 点名动作未命中只暴露资源缺失事实
- **WHEN** 内部 `diagnostics` 包含 `exercise_name_not_found`
- **THEN** Planner-visible summary MAY 在 `resourceBoundary.missingExerciseNames` 中列出未命中的点名动作名称
- **AND** `resourceBoundary.missingExerciseNames` MUST NOT 包含内部 diagnostic code、命中数量、返回数量、截断状态或过滤执行细节
- **AND** Planner-visible summary MUST NOT 将该名称表达为现实训练动作不存在

#### Scenario: 内部 diagnostics 继续隔离
- **WHEN** `searchExerciseResources` 的 Planner-visible summary 表达产品资源库边界
- **THEN** summary MUST NOT 包含 `diagnostics`
- **AND** summary MUST NOT 包含 `exercise_name_not_found`、`exercise_name_ambiguous`、`exercise_name_filter_mismatch`、`exercise_name_too_broad` 或等价内部 diagnostic code
- **AND** summary MUST NOT 指挥模型必须继续调用 `searchExerciseResources`、必须扩大 `candidateCountPerSection` 或必须调用某个下一步 tool

### Requirement: 模型可见合同门禁必须允许资源库边界并继续阻止诊断泄漏
系统 SHALL 更新 model-visible contract gate，使 `searchExerciseResources` 的 Planner-visible summary 可以包含受控产品资源库边界字段，同时继续递归拒绝内部诊断字段、诊断 code、命中统计、截断状态、分页字段和业务 readiness / workflow 字段。

#### Scenario: Gate 允许受控资源边界字段
- **WHEN** `searchExerciseResources` 的 Planner-visible summary 包含 `resourceBoundary.catalogRole`、`resourceBoundary.emptyResultMeaning`、`resourceBoundary.plainTextKnowledgeBoundary`、`resourceBoundary.structuredOutputBoundary` 和 `resourceBoundary.missingExerciseNames`
- **THEN** model-visible contract gate MUST 接受这些字段
- **AND** gate MUST 继续检查这些字段中的文本是否包含固定 workflow、业务目标满足度或内部诊断泄漏

#### Scenario: Gate 继续拒绝内部诊断泄漏
- **WHEN** `searchExerciseResources` 的 Planner-visible summary 在任意层级或字符串化 JSON 中包含 `diagnostics`、`exercise_name_ambiguous`、`exercise_name_too_broad`、`candidateCountPerSection`、`totalMatches`、`returnedCount` 或 `truncated`
- **THEN** model-visible contract gate MUST 返回失败 finding
- **AND** finding MUST 指出泄漏字段所在路径
