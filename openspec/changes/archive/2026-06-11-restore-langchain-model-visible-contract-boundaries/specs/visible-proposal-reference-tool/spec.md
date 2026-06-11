## ADDED Requirements

### Requirement: inspectVisibleTrainingProposals 模型可见摘要必须表达事实边界而非答案模板
`inspectVisibleTrainingProposals` 的模型可见 description、schema description、examples 和 summary SHALL 描述当前 actor / conversation 中历史 `visibleTrainingProposal` 事实的事实边界、可访问状态、受控压缩事实和空结果含义。模型可见内容 MUST NOT 替模型判断用户意图，也 MUST NOT 规定模型在某个用户短语、空结果或字段组合条件下输出固定答案、固定 tool flow 或固定结构化输出。

#### Scenario: 空结果表达可见事实状态
- **WHEN** `inspectVisibleTrainingProposals` 返回空 `facts[]`
- **THEN** model-visible summary MUST 表达 `facts[]` 是当前可见的历史 `visibleTrainingProposal` 事实集合
- **AND** summary MUST 表达空数组只表示当前可见事实中没有这类历史训练方案对象
- **AND** summary MUST 表达该结果可作为模型解释缺少引用对象、澄清或按用户提供的新目标继续推理的事实依据
- **AND** summary MUST NOT 表达 `fulfillment.satisfied=false`、业务失败、固定 answer 模板或开始新生成的固定出口

#### Scenario: 成功结果只表达受控历史事实
- **WHEN** `inspectVisibleTrainingProposals` 返回一条或多条历史可见训练事实
- **THEN** model-visible summary MUST 表达受控压缩的 `proposalKind`、section 摘要、动作项摘要、处方 / schedule 摘要和必要 diagnostics
- **AND** summary MUST NOT 暴露模型需要复制的 `factRef`、`messageId`、`resourceId`、`toolResultId` 或 trace id
- **AND** summary MUST NOT 包含 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport`、`nextActionHints` 或等价业务决策字段
- **AND** summary MUST NOT 因存在或缺少 `schedule` 而直接输出“可以 / 不可以生成 plan”这类派生判断

#### Scenario: observation 不写固定用户短语或下一步 action
- **WHEN** production registry 或 runtime 将 `inspectVisibleTrainingProposals` 的模型可见内容暴露给模型
- **THEN** 模型可见内容 MUST NOT 包含固定用户短语作为使用条件
- **AND** 模型可见内容 MUST NOT 包含 `final_answer_with_visible_outputs`、`final_answer_without_visible_outputs`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举
- **AND** 模型可见内容 MUST NOT 要求固定调用 `searchExerciseResources`、`submitVisibleTrainingProposal` 或其他具体 tool
- **AND** 服务端 MUST NOT 根据空 `facts[]`、事实数量、用户原文或字段组合替模型选择最终回答、刷新、替换、重查或新生成策略
