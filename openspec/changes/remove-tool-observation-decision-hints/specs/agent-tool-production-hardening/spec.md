## MODIFIED Requirements

### Requirement: Production observation 投影必须瘦身为结构化事实摘要
系统 SHALL 将 production tool 的模型可见 observation 投影为结构化事实摘要。Observation MUST 保留当前 run 决策必需的事实等级、引用边界、缺口字段、诊断 code、有限事实列表和 grounding 摘要；MUST NOT 复制长篇全局禁止项、完整 workflow、固定下一步 tool flow、答案模板、业务目标满足度判断或输出 kind 可行性判断。

#### Scenario: observation 暴露事实等级和消费边界
- **WHEN** tool result 被投影为 Planner 可见 observation
- **THEN** observation MUST 表达该结果的事实等级或等价字段，例如 `diagnostic`、`resolved`、`section_scoped_exercise_facts`、`consumable` 或 `terminal`
- **AND** observation MAY 表达 tool 自身能力是否执行完成，例如查询成功、读取成功、引用不存在或输入无效
- **AND** observation MUST NOT 表达该结果是否满足用户最终目标
- **AND** observation MUST NOT 表达该结果是否支撑成功 `visibleOutputs`
- **AND** failed、diagnostic 或 `fulfillment.satisfied = false` 结果 MUST 明确只能作为事实状态或失败诊断暴露，不得伪装成已成功生成结构化业务输出

#### Scenario: searchExerciseResources observation 保留训练结构所需事实
- **WHEN** `searchExerciseResources` 或等价动作事实查询 tool 返回成功结果
- **THEN** model observation MUST 保留 `groups.<section>.exercises[]` 的有限动作事实
- **AND** model observation MUST 保留 `availableSections`、`sectionSummary` 和确定性缺口字段
- **AND** model observation MUST 保留 `querySpecificity` 或等价字段表达查询是否过宽
- **AND** model observation MUST NOT 包含 `supportsOutputKinds`
- **AND** model observation MUST NOT 包含 `supportsSuccessfulVisibleOutputs`
- **AND** model observation MUST NOT 用长篇自然语言重复 output contract、global grounding policy 或固定调用顺序

#### Scenario: inspectVisibleTrainingProposals observation 保留索引和导入边界
- **WHEN** `inspectVisibleTrainingProposals` 返回 `list_recent` 结果
- **THEN** model observation MUST 表达 `facts[]` 是轻量索引
- **AND** model observation MUST 表达 `facts[].factRef` / `facts[].messageId` 只可用于本轮 `read_recent.ref.value`
- **AND** model observation MUST 表达该索引不是完整训练方案 payload
- **AND** model observation MUST NOT 包含答案模板、固定后续 tool flow、`supportsOutputKinds` 或 `nextActionHints`

#### Scenario: observations 不包含固定用户短语触发
- **WHEN** production observations 暴露给 Planner
- **THEN** observations MUST NOT 包含固定用户短语作为 tool 调用条件
- **AND** observations MUST NOT 表达成“用户说 X 时必须调用 tool Y”
- **AND** observations MUST NOT 根据具体业务 `toolName` 要求 runtime 改写下一步 action

## REMOVED Requirements

### Requirement: observation 的下一步提示必须是可选恢复出口
**Reason**: 正常成功 tool observation 中的 `nextActionHints` 仍会把工具事实投影变成下一步编排提示，影响 Planner 自主判断 action 和业务输出 shape。

**Migration**: 删除正常 production model observation 中的 `nextActionHints` 或等价字段，包括业务 tool observation 和 ok tool result index observation。需要修复非法 action 时，使用 validator repair feedback 或 `repairContext` 提供字段级错误、previous result fact 和恢复边界；正常 tool result 只提供事实、缺口、引用和诊断。

## ADDED Requirements

### Requirement: 正常 tool observation 不得包含下一步编排提示
系统 SHALL 禁止正常 tool result 的 model observation 提供下一步 action 建议。Planner MUST 基于用户目标、messages、metadata、tools、toolResults、resources、observations 和 outputContracts 自主选择合法 action。

#### Scenario: observation 不输出 nextActionHints
- **WHEN** production tool result 被投影给 Planner
- **THEN** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 包含 `final_answer_with_visible_outputs`
- **AND** observation MUST NOT 包含 `final_answer_without_visible_outputs`
- **AND** observation MUST NOT 包含 `continue_tool_call`
- **AND** observation MUST NOT 包含 `ask_user` 作为下一步建议
- **AND** observation MUST NOT 要求固定调用 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 或其他具体 tool

#### Scenario: repair feedback 可以表达字段级恢复
- **WHEN** Planner 输出非法 action 并进入 repair 语境
- **THEN** repair feedback MAY 表达字段路径、错误 code、expected、actual、allowedValues、requiredFields 和可恢复边界
- **AND** repair feedback MUST NOT 让服务端根据用户自然语言改写 action
- **AND** repair feedback MUST NOT 包含 `nextActionHints`
- **AND** repair feedback MUST NOT 包含 `final_answer_with_visible_outputs`、`final_answer_without_visible_outputs`、`final_answer_with_current_tool_result`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举
- **AND** repair feedback MUST NOT 作为正常成功 tool observation 注入
