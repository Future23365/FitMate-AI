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
