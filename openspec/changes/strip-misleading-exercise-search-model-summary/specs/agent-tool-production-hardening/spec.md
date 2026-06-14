## ADDED Requirements

### Requirement: Planner-visible tool result contract gate 必须阻断动作查询误导字段

系统 SHALL 为 production tool contract tests 或 model-visible contract gate 增加递归检查，确保 `searchExerciseResources` 的 Planner-visible summary 不包含误导模型继续查询的执行统计、预算回显、过滤执行诊断或 section coverage 字段。该 gate MUST 只作用于 Planner-visible summary，不得要求删除 trace summary、user projection 或内部 handler output 中的调试统计。

#### Scenario: 递归扫描模型可见 summary
- **WHEN** 测试构造 `searchExerciseResources` 的成功 Planner-visible summary
- **THEN** contract gate MUST 递归扫描顶层对象、`query`、`diagnostics[]`、`candidateGroups[]`、嵌套对象和字符串化 JSON
- **AND** gate MUST 断言不存在 `totalMatches`、`returnedCount`、`truncated`、`excludedCount`、`candidateCountPerSection`、`sort`、`maxReturned`、`limit`、`take`、`offset`、`page`、`pageSize` 或 `cursor`
- **AND** gate MUST 断言不存在 `querySpecificity`、`filterSemantics`、`appliedFilters`、`filterApplicationBoundary`、`filterApplications`、`positiveAnchorBoundary` 或 `refreshExclusionBoundary`
- **AND** gate MUST 断言不存在 `sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation`、`groupSemantics`、`allowedSections`、`zeroMatchMuscles`、`exercise_name_too_broad` 或 `too_broad`

#### Scenario: Trace 和用户投影不被误删
- **WHEN** `searchExerciseResources` 的 trace summary 或 user projection 包含开发调试统计
- **THEN** contract gate MUST NOT 因这些非 Planner 通道包含 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection` 或 `filterApplications` 而失败
- **AND** 测试 MUST 证明 Planner-visible summary 与 trace / user projection 使用不同投影边界

#### Scenario: 不新增服务端语义分流
- **WHEN** contract gate 覆盖本 change 的实现
- **THEN** `/api/chat`、LangChain runtime、tool wrapper、renderer 和 `searchExerciseResources` handler MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或固定 phrasing 改写 provider `tool_calls`
- **AND** Planner MUST remain responsible for choosing tools from model-visible manifest, context, observations and tool results
