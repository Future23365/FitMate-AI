## ADDED Requirements

### Requirement: searchExerciseResources observation 必须表达查询事实和终态输出分离
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 表达：该 tool 只查询发布态动作事实，并按 `groups.<section>` 提供 section-scoped 候选；它不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存结果或用户记忆。

#### Scenario: 查询结果不等于最终训练结构
- **WHEN** `searchExerciseResources` 返回成功 observation
- **THEN** observation MUST 表达 `groups.<section>.exercises[]` 只是当前查询实际返回的动作事实来源
- **AND** observation MUST 表达最终训练输出必须由合法 `final_answer.visibleOutputs[]` 或 grounded terminal action 承载
- **AND** observation MUST NOT 暗示该 tool 已经生成最终 `visibleTrainingProposal`

#### Scenario: 仍缺事实时不能承诺异步继续
- **WHEN** 模型基于 `searchExerciseResources` observation 判断最终结构仍缺 section、动作、处方或 schedule
- **THEN** 模型可见说明 MUST 表达 Planner 应继续合法 `tool_call`、使用 `ask_user` 澄清或明确失败收口
- **AND** 模型可见说明 MUST 表达不得用成功 `final_answer.content` 承诺本轮之后还会自动继续查询或生成

#### Scenario: 成功普通事实回答应引用 satisfied tool result
- **WHEN** Planner 使用 `searchExerciseResources` 的结果回答普通动作事实问题
- **THEN** 模型可见说明 MUST 表达可通过 `final_answer.usedToolResultIds` 引用 `fulfillment.satisfied = true` 的 tool result
- **AND** failed、invalid-input 或 `satisfied=false` 的结果 MUST NOT 支撑成功 `final_answer`

#### Scenario: 不新增服务端动作语义判断
- **WHEN** 实现本 change
- **THEN** `searchExerciseResources` handler MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或具体 phrasing 增删筛选条件
- **AND** `/api/chat` MUST NOT 根据本 tool 的存在新增服务端语义分流
