## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见 summary 必须只暴露候选事实和中性诊断

系统 SHALL 将 `searchExerciseResources` 的 Planner-visible summary 限定为当前查询口径、有限动作候选事实和中性诊断。Planner-visible summary MUST NOT 暴露精确命中数、返回数量、截断状态、候选预算回显、排序、过滤执行细节、section coverage、placement eligibility、边界说明或任何会暗示必须继续查询的字段。内部 handler output、trace summary 和 user projection MAY 保留这些调试统计。

#### Scenario: 成功候选结果不暴露继续查询诱导字段
- **WHEN** `searchExerciseResources` 成功返回动作候选
- **AND** 内部结果、trace summary 或 user projection 包含 `totalMatches`、`returnedCount`、`truncated`、`excludedCount`、`candidateCountPerSection`、`sort`、`appliedFilters`、`filterApplications` 或等价执行诊断
- **THEN** Planner-visible summary MUST 包含 `status`、`factLevel`、必要的查询语义过滤值和 `candidateGroups[]`
- **AND** Planner-visible summary MUST 包含 `candidateGroups[].suitability`
- **AND** Planner-visible summary MUST 包含 `candidateGroups[].exercises[]` 中的有限动作事实，例如 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh`、`secondaryMusclesZh` 和 `imageUrl`
- **AND** Planner-visible summary MUST NOT 包含 `totalMatches`、`returnedCount`、`truncated`、`excludedCount`、`candidateCountPerSection`、`sort`、`maxReturned`、`limit`、`take`、`offset`、`page`、`pageSize` 或 `cursor`
- **AND** Planner-visible summary MUST NOT 包含 `querySpecificity`、`filterSemantics`、`appliedFilters`、`filterApplicationBoundary`、`filterApplications`、`positiveAnchorBoundary` 或 `refreshExclusionBoundary`
- **AND** Planner-visible summary MUST NOT 包含 `sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、`allowedSections` 或等价 placement 字段
- **AND** Planner-visible summary MUST NOT 包含 `candidateGroups[].totalMatches`、`candidateGroups[].returnedCount`、`candidateGroups[].truncated` 或 `candidateGroups[].zeroMatchMuscles`

#### Scenario: 空候选或冲突诊断不暴露精确计数
- **WHEN** `searchExerciseResources` 的合法查询没有返回可用候选、点名动作无法纳入或输入约束冲突
- **THEN** Planner-visible summary MAY 包含中性 `diagnostics[]`
- **AND** `diagnostics[]` MUST 只表达当前查询无法提供候选、需要澄清、需要放宽条件或存在确定性冲突
- **AND** `diagnostics[]` MUST NOT 包含 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection` 或等价精确统计
- **AND** `diagnostics[]` MUST NOT 包含 `exercise_name_too_broad`、`too_broad` 或其他会表达“继续扩大查询即可解决”的 code
- **AND** `diagnostics[]` MUST NOT 包含 `sufficient`、`insufficient`、`ready`、`canProceed`、`canDeliverPlan`、`goalSatisfied`、`businessGoalSatisfied`、`complete` 或等价 sufficiency / readiness / completion 字段或文案
- **AND** 内部 trace MAY 继续保留原始失败 code 和统计，用于开发排障

#### Scenario: 模型可见 summary 不提供固定下一步建议
- **WHEN** `searchExerciseResources` 的 Planner-visible summary 进入下一轮模型输入
- **THEN** summary MUST NOT 表达“必须继续调用 `searchExerciseResources`”、“必须扩大 `candidateCountPerSection`”、“必须补查某个 section”或等价固定 workflow
- **AND** summary MUST NOT 表达“候选已经足够”、“候选还不够”、“已经 ready”、“可以生成训练方案”或等价业务目标满足度判断
- **AND** summary MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板替 Planner 选择下一步 tool
- **AND** summary MUST NOT 将查询结果表达成已完成的 `visibleTrainingProposal`、routine、plan、prescription、schedule 或保存结果

#### Scenario: 调试统计保留在非 Planner 通道
- **WHEN** Response Renderer、trace exporter 或开发调试面板消费 `searchExerciseResources` 结果
- **THEN** 系统 MAY 保留 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection`、`filterApplications`、`diagnostics[].totalMatches` 和等价统计
- **AND** 这些字段 MUST NOT 被回灌到 Planner-visible summary
- **AND** 服务端 validator MUST 继续基于真实 tool result、数据库事实和结构化输出合同校验最终结果

### Requirement: `searchExerciseResources` 模型可见说明必须区分候选数量 input 与执行统计 output

系统 SHALL 在 `searchExerciseResources` 的 manifest、schema description、examples 和 Planner-visible summary 中区分 `candidateCountPerSection` 作为受控 input 的含义与执行后的统计 output。Planner 可以传入 `candidateCountPerSection` 控制候选上限，但成功 result 的 Planner-visible summary MUST NOT 回显该字段或用 `returnedCount` / `truncated` 暗示继续扩大查询。

#### Scenario: 输入 schema 仍允许受控候选数量
- **WHEN** production registry 序列化 `searchExerciseResources` input schema
- **THEN** schema MAY 包含 `candidateCountPerSection`
- **AND** `candidateCountPerSection` MUST 被描述为每个请求 section 的受控候选数量上限
- **AND** `candidateCountPerSection` MUST NOT 被描述为分页、offset、cursor、全库读取能力或最终展示数量承诺

#### Scenario: 成功结果不回显候选预算
- **WHEN** `searchExerciseResources` 使用 `candidateCountPerSection` 执行成功
- **THEN** Planner-visible summary MUST NOT 回显 `candidateCountPerSection`
- **AND** Planner-visible summary MUST NOT 使用 `returnedCount`、`truncated`、`totalMatches` 或等价字段提示模型继续扩大候选数量
- **AND** trace summary MAY 记录实际使用的 `candidateCountPerSection`、命中数量和截断状态
