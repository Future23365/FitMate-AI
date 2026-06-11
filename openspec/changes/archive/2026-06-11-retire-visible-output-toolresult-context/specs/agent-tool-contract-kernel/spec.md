## MODIFIED Requirements

### Requirement: 结构化训练输出必须由业务 tool 校验
系统 SHALL 通过 `submitVisibleTrainingProposal` 或等价业务 tool 提交训练方案结构。该 tool MUST 负责 visible output envelope、payload schema、数据库动作事实、section 边界、renderer 投影和 accepted/rejected 摘要，不得保存计划或解析自然语言。该 tool 的 validator context MUST NOT 重新接入旧 Agent-era `toolResults.fulfillment.satisfied` 视图，也 MUST NOT 通过旧 tool result projection 推断动作来源。

#### Scenario: accepted 结构生成用户投影
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "accepted"`
- **THEN** user projection MUST 包含 `validatedVisibleOutputs` 或等价字段
- **AND** response adapter MUST 只渲染已通过服务端校验的可见训练输出
- **AND** model-visible summary MAY 告诉模型最终回答可以引用这张已验证训练卡片

#### Scenario: rejected 结构不渲染
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "rejected"`
- **THEN** user projection MUST NOT 输出 `validatedVisibleOutputs`
- **AND** model-visible summary MUST 要求模型修正结构、重新调用工具或说明无法生成
- **AND** response adapter MUST NOT 把 rejected payload 渲染或持久化为事实

#### Scenario: finalization validator context 不接入旧 tool result 满足度
- **WHEN** `submitVisibleTrainingProposal` 调用 terminal output validator
- **THEN** validator context MUST NOT 包含旧 `toolResults` 数组
- **AND** validator context MUST NOT 包含 `fulfillment.satisfied`
- **AND** accepted / rejected 判断 MUST 基于 payload schema、数据库动作事实、section 边界、renderer 投影和受控 resource inventory
- **AND** accepted / rejected 判断 MUST NOT 依赖任意旧 Agent tool result projection、具体业务 `toolName` 或用户自然语言 phrasing
