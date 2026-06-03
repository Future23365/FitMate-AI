## ADDED Requirements

### Requirement: 模型可见 tool 合同必须区分 input 字段和 output-only 字段
系统 SHALL 确保 production tool manifest、schema summary、examples 和 Planner observation 明确区分可传入 input 字段与 output-only 摘要字段，避免模型把服务端输出统计、截断状态或内部上限误当成下一轮 tool input。

#### Scenario: output-only 字段不得出现在 input schema 或 examples
- **WHEN** 系统构造 production tool manifest
- **THEN** manifest 的 `inputJsonSchema` MUST 只包含该 tool 真实允许的 input 字段
- **AND** manifest examples MUST NOT 把 output-only 字段放进 input 示例
- **AND** manifest / schema summary MUST NOT 暗示 output-only 字段可以由 Planner 传入

#### Scenario: observation 不暴露可复制的内部上限字段
- **WHEN** tool result 被投影成 Planner 可见 observation
- **THEN** observation MUST 使用安全投影或默认摘要
- **AND** 服务端内部上限、分页控制或 output-only 统计字段 MUST 被移除，或被明确标注为 output summary
- **AND** observation MUST NOT 包含可被模型直接复制成下一轮 input 的分页控制片段

#### Scenario: 搜索动作资源工具不得开放分页控制 input
- **WHEN** `searchExerciseResources` 或等价只读动作资源查询 tool 暴露给 production Planner
- **THEN** 其模型可见 input 合同 MUST NOT 包含 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize`
- **AND** Action Validator MUST 继续拒绝这些未知或不允许字段
- **AND** 服务端内部固定返回上限 MUST 只作为执行和输出摘要边界，不得变成 LLM 可控查询能力

#### Scenario: 成功 tool result 的 final grounding 说明清晰
- **WHEN** tool result 满足 `ok = true` 且 `fulfillment.satisfied = true`
- **THEN** 模型可见合同 MUST 说明该结果可以通过 `final_answer.usedToolResultIds` 支撑成功回答
- **AND** failed、diagnostic 或 `satisfied=false` 的结果 MUST 继续只能用于解释、澄清、阻断说明或 repair
