## ADDED Requirements

### Requirement: Production observation 投影必须瘦身为结构化事实摘要
系统 SHALL 将 production tool 的模型可见 observation 投影为结构化事实摘要。Observation MUST 保留当前 run 决策必需的事实等级、可消费性、缺口字段、诊断 code、有限事实列表和 grounding 摘要；MUST NOT 复制长篇全局禁止项、完整 workflow、固定下一步 tool flow 或答案模板。

#### Scenario: observation 暴露事实等级和消费边界
- **WHEN** tool result 被投影为 Planner 可见 observation
- **THEN** observation MUST 表达该结果的事实等级或等价字段，例如 `diagnostic`、`resolved`、`section_scoped_exercise_facts`、`consumable` 或 `terminal`
- **AND** observation MUST 表达该结果是否可支撑成功 `final_answer` 或 `visibleOutputs`
- **AND** failed、diagnostic 或 `fulfillment.satisfied = false` 结果 MUST 明确只能用于恢复、澄清、失败解释或下一轮 repair

#### Scenario: searchExerciseResources observation 保留训练结构所需事实
- **WHEN** `searchExerciseResources` 或等价动作事实查询 tool 返回成功结果
- **THEN** model observation MUST 保留 `groups.<section>.exercises[]` 的有限动作事实
- **AND** model observation MUST 保留 `availableSections`、`sectionSummary`、`missingSectionsForRoutineOrPlan` 和 `supportsOutputKinds`
- **AND** model observation MUST 保留 `querySpecificity` 或等价字段表达查询是否过宽
- **AND** model observation MUST NOT 用长篇自然语言重复 output contract、global grounding policy 或固定调用顺序

#### Scenario: inspectVisibleTrainingProposals observation 保留索引和导入边界
- **WHEN** `inspectVisibleTrainingProposals` 返回 `list_recent` 结果
- **THEN** model observation MUST 表达 `facts[]` 是轻量索引
- **AND** model observation MUST 表达 `facts[].factRef` / `facts[].messageId` 只可用于本轮 `read_recent.ref.value`
- **AND** model observation MUST 表达该索引不能直接支撑成功训练结构
- **AND** model observation MUST NOT 包含答案模板或固定后续 tool flow

#### Scenario: observations 不包含固定用户短语触发
- **WHEN** production observations 暴露给 Planner
- **THEN** observations MUST NOT 包含固定用户短语作为 tool 调用条件
- **AND** observations MUST NOT 表达成“用户说 X 时必须调用 tool Y”
- **AND** observations MUST NOT 根据具体业务 `toolName` 要求 runtime 改写下一步 action

### Requirement: observation 的下一步提示必须是可选恢复出口
系统 MAY 在 observation 中提供 `nextActionHints` 或等价结构化恢复出口。该字段 MUST 只表达动作类别，例如继续合法 `tool_call`、`ask_user`、不带 `visibleOutputs` 的 `final_answer` 或失败收口；MUST NOT 强制具体 `toolName`、固定 input 或用户可见回答模板。

#### Scenario: nextActionHints 不规定具体 tool flow
- **WHEN** observation 暴露 `nextActionHints`
- **THEN** `nextActionHints` MUST 使用受控枚举或短字符串表达可选恢复出口
- **AND** `nextActionHints` MUST NOT 包含具体用户短语
- **AND** `nextActionHints` MUST NOT 要求固定调用 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 或其他具体 tool
- **AND** Planner MUST 仍基于当前用户目标、tools、toolResults、resources 和 outputContracts 自主选择合法 action
