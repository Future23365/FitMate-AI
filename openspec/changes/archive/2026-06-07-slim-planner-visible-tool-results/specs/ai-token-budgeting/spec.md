## ADDED Requirements

### Requirement: Agent Planner 可见 tool result 必须使用专用瘦身投影

系统 SHALL 在构造 Agent Planner 模型输入时，将当前 run 已登记的 tool result 转换为 Planner 专用低风险瘦身投影。该投影 MUST 原样保留模型理解、grounding、resource 消费和失败恢复所需的事实字段，并且 MUST NOT 把用户展示投影、占位 handler output 或运行时执行元数据发送给模型。

#### Scenario: 成功 tool result 进入下一轮 Planner 输入
- **WHEN** Agent runtime 已执行成功 tool result
- **AND** runtime 准备下一轮 Planner 输入
- **THEN** Planner 可见 tool result MUST 包含 `toolName`、`toolResultId`、`ok`、`fulfillment` 和 `projection.model`
- **AND** Planner 可见 tool result MUST 原样保留 `fulfillment.producedResources`、`fulfillment.consumedResources` 和 `fulfillment.unmetRequirements`
- **AND** Planner 可见 tool result MUST NOT 包含 `projection.user`
- **AND** Planner 可见 tool result MUST NOT 包含 `output: "[redacted]"` 或完整 handler output
- **AND** Planner 可见 tool result MUST NOT 包含 `toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt` 或 `completedAt`
- **AND** 本优化 MUST NOT 删除或压缩 `projection.model` 内的查询条件摘要、`appliedFilters`、`filterApplications`、`groups`、`allowedSections` 或其他业务事实字段

#### Scenario: 完整 tool result 仍保留在服务端内部结果中
- **WHEN** Agent runtime 使用瘦身投影调用 Planner
- **THEN** runtime 内部保存的完整 `ToolResult` MUST 继续保留 `projection.user`、执行元数据和 trace / replay 所需字段
- **AND** Response Renderer、trace 导出和 replay 摘要 MUST NOT 因 Planner 输入瘦身而丢失既有用户展示字段
- **AND** 服务端 validator MUST 继续基于当前 run 的真实 tool result、resource 和 visible output 校验终态输出

#### Scenario: 失败 tool result 进入下一轮 Planner 输入
- **WHEN** Agent runtime 已记录失败 tool result
- **AND** runtime 准备下一轮 Planner 输入
- **THEN** Planner 可见失败结果 MUST 原样保留 `toolName`、`toolResultId`、`ok = false`、`error` 和 `fulfillment`
- **AND** Planner 可见失败结果 MUST NOT 包含 `toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt` 或 `completedAt`
- **AND** 本投影 MUST NOT 压缩失败恢复 details、repair facts 或 fulfillment 信息
- **AND** 本投影 MUST NOT 改写失败语义、不得把 failed 或 diagnostic 结果提升为可支撑成功结构化输出的事实

#### Scenario: Tool manifest 和输出合同保持不变
- **WHEN** 系统实施 Planner 可见 tool result 瘦身
- **THEN** `ToolRegistry` 暴露的 tool manifest MUST 保持现有 `inputJsonSchema`、`outputJsonSchema`、`whenToUse`、`whenNotToUse` 和 examples 合同
- **AND** `visibleTrainingProposal` 或其他 `outputContracts` MUST NOT 因本优化被压缩、删除或改写
- **AND** repair feedback、`terminal_reference_invalid` 处理和 Action Validator 语义 MUST NOT 因本优化改变

#### Scenario: Tool calling 能力不因结果瘦身退化
- **WHEN** Planner 准备基于当前 run 继续判断是否调用 tool
- **THEN** Planner 可见 `tools[]` MUST 继续包含当前 registry 允许的 tool manifest
- **AND** tool manifest 中的 `name`、`description`、`inputJsonSchema`、`whenToUse`、`whenNotToUse`、examples 和 policy hint MUST 不因本优化变化
- **AND** 已执行 tool 的事实含义 MUST 通过 `toolResults[].projection.model` 暴露给 Planner
- **AND** 系统 MUST NOT 依赖 `projection.user`、执行时间戳、hash、执行 id 或占位 output 来让模型理解 tool result
- **AND** 本优化 MUST NOT 改变模型理解 tool result 所需的业务事实来源

#### Scenario: Planner 输入 token 归因可验证
- **WHEN** 系统记录或导出 Planner 模型请求 trace
- **THEN** trace SHOULD 能区分或推导 `toolResults` 瘦身前后字符量
- **AND** 验证 SHOULD 至少确认 Planner 可见 tool result 不再包含 `projection.user`
- **AND** 验证 SHOULD 至少确认 Planner 可见 tool result 不再包含 `startedAt`、`completedAt`、`normalizedInputHash`、`idempotencyKey`、`toolCallId`、`toolVersion` 和 `output: "[redacted]"`
- **AND** 验证 SHOULD 至少确认 `projection.model`、`fulfillment`、resource 引用和失败恢复信息仍保持可见
- **AND** 如果无法直接记录精确 token 差异，验证 MAY 使用稳定序列化字符数作为近似口径，并在测试或收尾说明中标注该口径
