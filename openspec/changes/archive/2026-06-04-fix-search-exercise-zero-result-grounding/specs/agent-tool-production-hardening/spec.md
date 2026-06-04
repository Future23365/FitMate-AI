## ADDED Requirements

### Requirement: 事实查询 tool 可以将 0 条结果声明为满足的成功结果
系统 SHALL 允许只读事实查询 tool 在查询执行成功且返回 0 条业务记录时声明 `fulfillment.satisfied = true`，前提是该结果表达的是已完成事实查询，而不是候选消费、写入或生成任务完成。

#### Scenario: 0 条事实查询可以支撑 final_answer
- **WHEN** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 引用当前 run 中 `ok = true` 且 `fulfillment.satisfied = true` 的事实查询 tool result
- **AND** 该 tool result 的业务摘要包含 `totalMatches = 0`
- **THEN** Action Validator MUST 按通用 grounding 规则允许该引用
- **AND** Runtime MUST NOT 因业务记录数量为 0 而将该 terminal action 改写成 `terminal_reference_invalid`

#### Scenario: 通用 unsatisfied grounding 规则保持不变
- **WHEN** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 引用 failed、diagnostic 或 `fulfillment.satisfied = false` 的 tool result
- **THEN** Action Validator MUST 继续将该 terminal action 判定为 `terminal_reference_invalid`
- **AND** 本规则 MUST NOT 为单个业务 tool 增加 Action Validator 特判

### Requirement: 候选消费不足不能伪装成事实查询成功
系统 SHALL 保持事实查询成功与下游候选消费满足之间的边界。只读查询 tool 的 `satisfied = true` 只表示查询事实已完成，不表示训练生成、推荐候选或保存操作已满足。

#### Scenario: 空查询结果不自动生成 consumable candidate resource
- **WHEN** `searchExerciseResources` 或等价只读查询 tool 返回 `totalMatches = 0`
- **THEN** Runtime MUST NOT 自动登记 `candidate_set`、routine、plan、patch、artifact revision 或等价可消费生成资源
- **AND** 下游生成或保存 tool MUST 继续依赖自己的输入 schema、resource contract 和领域校验

#### Scenario: 不在 core 内写业务 toolName 分支
- **WHEN** Runtime、Action Validator、Executor、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer 处理 0 条事实查询 result
- **THEN** 这些 core 模块 MUST NOT 新增基于 `searchExerciseResources` 或其他具体业务 `toolName` 的特判
- **AND** 0 条事实查询的语义 MUST 由该 tool 的 output、fulfillment 和模型可见说明表达
