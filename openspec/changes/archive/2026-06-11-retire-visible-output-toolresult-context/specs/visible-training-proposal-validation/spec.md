## MODIFIED Requirements

### Requirement: 当前 run 动作来源缺失不得阻断数据库合法训练卡片
系统 SHALL 将 `visibleTrainingProposal` 动作项的当前 run 来源匹配结果作为 provenance diagnostic，而不是新生成训练卡片的 hard fail。只要 `exerciseId` 通过数据库存在性、发布态、可访问性和 section 边界校验，系统 MUST NOT 因该动作未出现在受控 current-run provenance resource 中而拒绝该 `visibleTrainingProposal`。系统 MUST NOT 通过旧 Agent-era `toolResults.fulfillment.satisfied`、任意 tool projection、具体业务 `toolName` 或 tool output shape 判定动作来源是否满足。

#### Scenario: 数据库合法但未出现在当前 run 动作来源
- **WHEN** Planner 返回结构化训练输出，其中包含 `outputType = "visibleTrainingProposal"`
- **AND** payload 中某个 `exerciseItems[*].exerciseId` 存在于数据库、发布态可用且当前用户可访问
- **AND** 该动作项的 `section` 存在于数据库 `allowedSections`
- **AND** 该 `exerciseId + section` 未出现在 current-run provenance resource 中
- **THEN** terminal output validation MUST NOT 因 `current_run_source_missing` 拒绝该 `visibleTrainingProposal`
- **AND** 系统 MAY 在 validation metadata、trace 或等价诊断中记录缺少当前 run 来源
- **AND** 该诊断 MUST NOT 阻止 Response Renderer 输出已通过数据库事实校验的训练卡片

#### Scenario: 当前 run 来源只来自受控 resource inventory
- **WHEN** terminal output validator 需要计算 `current_run_source_missing` 诊断
- **THEN** validator MUST 只从受控 `resourceStore.inventory()` 中读取可消费 `visible_training_proposal_fact` 或等价受控 provenance resource
- **AND** validator MUST NOT 从 `context.toolResults`、`projection.model.groups`、`fulfillment.satisfied` 或任意具体业务 tool output shape 中收集动作来源
- **AND** validator MUST NOT 根据具体业务 `toolName` 判断某个动作是否可作为最终训练方案来源

#### Scenario: 受控可消费训练事实可消除来源诊断
- **WHEN** current-run `resourceStore.inventory()` 中存在 `role = "consumable"` 且 `resourceType = "visible_training_proposal_fact"` 的资源
- **AND** 该资源摘要包含与 payload 相同的 `exerciseId + section`
- **AND** payload 通过数据库动作事实、发布态和 section 边界校验
- **THEN** validator MUST 接受该 `visibleTrainingProposal`
- **AND** validation metadata SHOULD NOT 记录这些动作项的 `current_run_source_missing` 诊断

## ADDED Requirements

### Requirement: visible output validator context 不得保留旧 tool result 满足度视图
系统 SHALL 将 `VisibleOutputValidationContext` 限定为结构化输出 validator 真实需要的服务端事实上下文。该 context MUST NOT 暴露旧 Agent-era tool result 满足度字段，也 MUST NOT 要求 terminal output validator 消费 `toolResults.fulfillment.satisfied`。

#### Scenario: validator context 类型不包含旧 tool result 入口
- **WHEN** 开发者使用 `VisibleOutputValidationContext`
- **THEN** 类型 MUST NOT 包含 `toolResults`
- **AND** 类型 MUST NOT 导出 `VisibleOutputValidationToolResult`
- **AND** 结构化输出 validator MUST NOT 依赖 `fulfillment.satisfied` 判断 payload 是否可渲染、可保存或可诊断

#### Scenario: 历史 trace 展示不构成 validator 合同
- **WHEN** dev trace viewer 或历史文档为了兼容旧数据读取 `satisfied` 字段
- **THEN** 该读取 MUST NOT 被视为 production terminal output validator 的输入合同
- **AND** 该读取 MUST NOT 要求 `VisibleOutputValidationContext` 重新暴露旧 tool result 满足度视图
