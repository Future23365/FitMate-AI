## MODIFIED Requirements

### Requirement: Agent Planner 可见 tool result 必须使用专用瘦身投影

系统 SHALL 在构造 Agent Planner 模型输入时，将当前 run 已登记的 tool result 转换为 Planner 专用低风险瘦身投影。该投影 MUST 原样保留模型理解、grounding、resource 消费和失败恢复所需的事实字段，并且 MUST NOT 把用户展示投影、占位 handler output 或运行时执行元数据发送给模型。瘦身投影保留字段 MUST 遵守每个 tool 当前的 model-visible summary 合同；不得要求保留该 tool 已明确从模型可见 observation 删除的字段。

#### Scenario: 成功 tool result 进入下一轮 Planner 输入
- **WHEN** Agent runtime 已执行成功 tool result
- **AND** runtime 准备下一轮 Planner 输入
- **THEN** Planner 可见 tool result MUST 包含 `toolName`、`toolResultId`、`ok`、`fulfillment` 和 `projection.model`
- **AND** Planner 可见 tool result MUST 原样保留 `fulfillment.producedResources`、`fulfillment.consumedResources` 和 `fulfillment.unmetRequirements`
- **AND** Planner 可见 tool result MUST NOT 包含 `projection.user`
- **AND** Planner 可见 tool result MUST NOT 包含 `output: "[redacted]"` 或完整 handler output
- **AND** Planner 可见 tool result MUST NOT 包含 `toolCallId`、`toolVersion`、`idempotencyKey`、`normalizedInputHash`、`startedAt` 或 `completedAt`
- **AND** 本优化 MUST NOT 删除或压缩当前 tool model-visible summary 合同中仍需要的查询条件摘要、`appliedFilters`、`filterApplications`、`exercises`、diagnostics 或其他业务事实字段
- **AND** 本优化 MUST NOT 因历史通用白名单而重新注入 `searchExerciseResources` 已删除的 `groups`、`allowedSections`、`sectionSummary`、`availableSections`、`missingSections`、`allowedSectionsRelation` 或 `groupSemantics`

#### Scenario: 完整 tool result 仍保留在服务端内部结果中
- **WHEN** Agent runtime 使用瘦身投影调用 Planner
- **THEN** runtime 内部保存的完整 `ToolResult` MUST 继续保留 `projection.user`、执行元数据和 trace / replay 所需字段
- **AND** Response Renderer、trace 导出和 replay 摘要 MUST NOT 因 Planner 输入瘦身而丢失既有用户展示字段
- **AND** 服务端 validator MUST 继续基于当前 run 的真实 tool result、resource 和 visible output 校验终态输出
