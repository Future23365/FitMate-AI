## ADDED Requirements

### Requirement: Agent Planner 可见 tool result 必须使用专用瘦身投影

系统 SHALL 在构造 Agent Planner 模型输入时，将当前 run 已登记的 tool result 转换为 Planner 专用瘦身投影。该投影 MUST 只包含模型下一步决策、grounding 和安全恢复所需的字段，并且 MUST NOT 把用户展示投影、完整 handler output 或运行时执行元数据发送给模型。

#### Scenario: 成功 tool result 进入下一轮 Planner 输入
- **WHEN** Agent runtime 已执行成功 tool result
- **AND** runtime 准备下一轮 Planner 输入
- **THEN** Planner 可见 tool result MUST 包含 `toolName`、`toolResultId`、`ok`、`fulfillment` 和 `projection.model`
- **AND** Planner 可见 tool result MUST 保留 terminal grounding 需要的当前 run tool result 引用和必要 resource 引用
- **AND** Planner 可见 tool result MUST NOT 包含 `projection.user`
- **AND** Planner 可见 tool result MUST NOT 包含完整 `input`
- **AND** Planner 可见 tool result MUST NOT 包含 `output: "[redacted]"` 或完整 handler output
- **AND** Planner 可见 tool result MUST NOT 包含 `toolCallId`、`toolVersion`、`normalizedInputHash`、`startedAt` 或 `completedAt`

#### Scenario: 完整 tool result 仍保留在服务端内部结果中
- **WHEN** Agent runtime 使用瘦身投影调用 Planner
- **THEN** runtime 内部保存的完整 `ToolResult` MUST 继续保留 `projection.user`、执行元数据和 trace / replay 所需字段
- **AND** Response Renderer、trace 导出和 replay 摘要 MUST NOT 因 Planner 输入瘦身而丢失既有用户展示字段
- **AND** 服务端 validator MUST 继续基于当前 run 的真实 tool result、resource 和 visible output 校验终态输出

#### Scenario: 失败 tool result 进入下一轮 Planner 输入
- **WHEN** Agent runtime 已记录失败 tool result
- **AND** runtime 准备下一轮 Planner 输入
- **THEN** Planner 可见失败结果 MUST 包含 `toolName`、`toolResultId`、`ok = false`、结构化错误码、可恢复性摘要和必要 fulfillment 信息
- **AND** Planner 可见失败结果 MUST NOT 包含完整 handler output、完整 input、用户展示投影或执行时间戳
- **AND** 本投影 MUST NOT 改写失败语义、不得把 failed 或 diagnostic 结果提升为可支撑成功结构化输出的事实

#### Scenario: Tool manifest 和输出合同保持不变
- **WHEN** 系统实施 Planner 可见 tool result 瘦身
- **THEN** `ToolRegistry` 暴露的 tool manifest MUST 保持现有 `inputJsonSchema`、`outputJsonSchema`、`whenToUse`、`whenNotToUse` 和 examples 合同
- **AND** `visibleTrainingProposal` 或其他 `outputContracts` MUST NOT 因本优化被压缩、删除或改写
- **AND** repair feedback、`terminal_reference_invalid` 处理和 Action Validator 语义 MUST NOT 因本优化改变
