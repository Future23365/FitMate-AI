## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须区分候选事实与训练交付判据

`searchExerciseResources` 模型可见说明 SHALL 表达该 tool 只返回动作候选事实和查询口径边界，不生成、保存或判定最终训练方案。说明 MUST 帮助模型理解候选池可以被选择、跳过或用于后续结构化输出；辅助阶段局部窄查询缺口不得被解释为整体 `routine` 或 `plan` 不可交付。该说明 MUST NOT 新增业务目标满足度字段、固定下一步指令或结构化训练交付 workflow。

#### Scenario: 候选池可被选择子集消费

- **WHEN** `searchExerciseResources` 返回 `candidateGroups[].exercises`
- **THEN** 模型可见说明 MUST 表达这些动作是候选池，不是最终推荐清单
- **AND** 模型可见说明 MUST 表达最终 `visibleTrainingProposal` 可以从候选池选择子集
- **AND** 模型可见说明 MUST 表达未选择候选不需要通过再次查询移除

#### Scenario: 内部缺口诊断不进入 Planner-visible 交付指令

- **WHEN** `searchExerciseResources` 的 trace 或用户投影包含内部缺口诊断
- **THEN** Planner-visible summary MUST NOT 暴露该内部诊断字段
- **AND** 模型可见说明 MUST 表达辅助阶段局部窄查询缺口不等于整体 `routine` 或 `plan` 不可交付
- **AND** 模型可见说明 MUST NOT 把内部缺口诊断包装成必须继续调用动作查询 tool 的指令

#### Scenario: 辅助阶段不要求逐肌群 primary 命中

- **WHEN** 模型使用 `warmup` 或 `stretch` 候选辅助训练编排
- **THEN** `searchExerciseResources` 模型可见说明 MUST 表达 warmup / stretch 辅助阶段候选用于支撑辅助阶段选择
- **AND** 模型可见说明 MUST 表达除非用户明确要求特定覆盖，否则辅助阶段不要求每个目标肌群都有 primary 候选
- **AND** 模型可见说明 MUST NOT 表达 `warmup` 或 `stretch` 候选缺少某肌群 primary 命中时必须继续查询

#### Scenario: coverage 不指挥下一步

- **WHEN** `searchExerciseResources` 返回 `coverage`
- **THEN** 模型可见说明 MUST 表达 `coverage` 只说明本次查询中哪些 `suitabilities` 有候选
- **AND** 模型可见说明 MUST 表达 `coverage` 不是用户目标满足度、训练方案生成结果或下一步 tool 调用指令
- **AND** 模型可见投影 MUST NOT 新增 `supportsOutputKinds`、`visibleDeliveryBoundary`、`fulfillment` 或等价业务目标满足度字段
