## ADDED Requirements

### Requirement: Planner tool result 瘦身必须删除重复查询诱导诊断

系统 SHALL 在构造 Planner 模型输入时删除 `searchExerciseResources` 中不支撑候选选择的执行诊断和重复查询诱导字段。瘦身目标是减少低价值 token 和避免模型追逐计数、截断、过滤执行细节或候选预算回显；该优化 MUST NOT 删除候选动作事实、当前查询语义过滤值或服务端最终校验所需的内部数据。

#### Scenario: 成功动作查询结果进入 Planner 输入
- **WHEN** Agent runtime 将成功的 `searchExerciseResources` result 转换为下一轮 Planner 输入
- **THEN** Planner-visible tool result MUST 保留 `projection.model` 中的候选动作事实
- **AND** Planner-visible tool result MUST NOT 包含 `projection.user`
- **AND** Planner-visible tool result MUST NOT 包含完整 handler output
- **AND** Planner-visible tool result MUST NOT 包含 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection`、`filterApplications`、`querySpecificity`、`filterSemantics`、`positiveAnchorBoundary` 或 `refreshExclusionBoundary`
- **AND** runtime 内部保存的完整 `ToolResult` MUST 继续保留 trace、user projection 和 validator 所需事实

#### Scenario: token 预算验证覆盖字段回流
- **WHEN** 测试或 trace audit 验证 Planner-visible tool result 瘦身
- **THEN** 验证 MUST 至少确认 `searchExerciseResources` 的 Planner-visible result 不含 `projection.user`、完整 handler output 和本 change 禁止的重复查询诱导字段
- **AND** 验证 MUST 至少确认 `candidateGroups[].exercises[]` 中的候选动作事实仍保持可见
- **AND** 如果无法直接记录精确 token 差异，验证 MAY 使用稳定序列化字符数作为近似口径
