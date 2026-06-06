## ADDED Requirements

### Requirement: Model observation 不得承载业务决策提示
系统 SHALL 将 `toModelObservation`、ok tool result index observation 或等价 model projection 限定为安全事实摘要。正常 model observation MUST NOT 替 Planner 判断用户目标是否满足、最终 `visibleOutputs` 是否应成功交付、应输出哪个业务 `payload.kind`，或下一步应选择哪个 action 类型。

#### Scenario: 成功 tool result 只投影事实
- **WHEN** tool result 被转换成 Planner 可见 observation
- **THEN** observation MAY 包含 tool 执行状态、引用 id、事实等级、有限事实摘要、资源引用、缺口字段和诊断 code
- **AND** observation MUST NOT 包含 `supportsOutputKinds`
- **AND** observation MUST NOT 包含 `supportsSuccessfulVisibleOutputs`
- **AND** observation MUST NOT 包含 `finalAnswerSupport`
- **AND** observation MUST NOT 包含 `nextActionHints`
- **AND** observation MUST NOT 使用等价字段表达“当前结果支持输出哪些业务 kind”或“下一步应该 final answer / 继续 tool / ask user”

#### Scenario: 用户目标满足度只由终态合同决定
- **WHEN** Planner 基于 tool observations 返回 `final_answer`
- **THEN** Action Validator、terminal output validator 和 business validator MUST 基于 schema、事实引用、resource、权限和可渲染性做确定性校验
- **AND** Runtime MUST NOT 基于中间 observation 中的业务满足度字段接受或拒绝成功结构化输出
- **AND** tool observation MUST NOT 通过自定义字段绕回用户目标是否已满足的判断

#### Scenario: 事实缺口以确定性字段表达
- **WHEN** tool result 缺少某些后续业务输出可能需要的事实
- **THEN** observation MAY 表达确定性缺口字段，例如 `missingSections`、`diagnostics[]`、`querySpecificity`、`hasSchedule` 或等价事实
- **AND** observation MUST NOT 把这些缺口派生成可输出 kind 列表、下一步 action 建议或固定 tool flow

#### Scenario: repairContext 只表达字段级修复事实
- **WHEN** Planner 输出非法 action、重复 tool input 或不满足 schema / domain validator 的结果，并进入 `repairContext`
- **THEN** `repairContext` MAY 表达错误 code、字段路径、expected、actual、allowedFields、requiredFields、allowedValues、previous tool result fact 和可恢复边界
- **AND** `repairContext` MUST NOT 包含 `nextActionHints`
- **AND** `repairContext` MUST NOT 包含 `final_answer_with_visible_outputs`、`final_answer_without_visible_outputs`、`final_answer_with_current_tool_result`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举
- **AND** `repairContext` MUST NOT 让服务端根据用户自然语言、具体 phrasing 或具体业务 `toolName` 改写下一轮 action
