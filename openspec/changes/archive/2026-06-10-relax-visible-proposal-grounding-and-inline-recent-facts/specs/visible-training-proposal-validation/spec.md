## ADDED Requirements

### Requirement: 当前 run 动作来源缺失不得阻断数据库合法训练卡片
系统 SHALL 将 `visibleTrainingProposal` 动作项的当前 run 来源匹配结果作为 provenance diagnostic，而不是新生成训练卡片的 hard fail。只要 `exerciseId` 通过数据库存在性、发布态、可访问性和 section 边界校验，系统 MUST NOT 因该动作未出现在当前 run 的 `toolResults.groups.<section>.exercises[]` 或 consumable resource 中而拒绝该 `visibleTrainingProposal`。

#### Scenario: 数据库合法但未出现在当前 run 动作来源
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`，其中包含 `outputType = "visibleTrainingProposal"`
- **AND** payload 中某个 `exerciseItems[*].exerciseId` 存在于数据库、发布态可用且当前用户可访问
- **AND** 该动作项的 `section` 存在于数据库 `allowedSections`
- **AND** 该 `exerciseId + section` 未出现在当前 run 可收集的动作来源中
- **THEN** terminal output validation MUST NOT 因 `current_run_source_missing` 拒绝该 `visibleTrainingProposal`
- **AND** 系统 MAY 在 validation metadata、trace 或等价诊断中记录缺少当前 run 来源
- **AND** 该诊断 MUST NOT 阻止 Response Renderer 输出已通过数据库事实校验的训练卡片

#### Scenario: provenance diagnostic 不替模型选择下一步
- **WHEN** 系统记录当前 run 来源缺失诊断
- **THEN** 诊断内容 MUST 只表达哪些 `exerciseId + section` 未在本轮来源集合中出现
- **AND** 诊断内容 MUST NOT 要求模型固定调用 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他具体业务 `toolName`
- **AND** 诊断内容 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板改写 Planner 的 action

## MODIFIED Requirements

### Requirement: `visibleTrainingProposal` 必须基于数据库动作事实校验
系统 SHALL 在 `visibleTrainingProposal` 渲染、保存或写入聊天历史前，基于 PostgreSQL `Exercise` 事实校验最终 payload 中的每个 `exerciseId`。校验 MUST 不依赖具体业务 `toolName` 返回值作为动作合法性的唯一依据，也 MUST NOT 要求新生成训练卡片的每个动作都已经出现在当前 run 的动作查询结果中。

#### Scenario: 最终方案引用存在且发布态的动作
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`，其中包含 `outputType = "visibleTrainingProposal"`
- **AND** payload 中所有 `exerciseId` 都存在于数据库且 `isPublished = true`
- **THEN** 系统 MUST 允许继续执行 `visibleTrainingProposal` 的业务结构校验
- **AND** 系统 MUST 使用数据库中的 canonical 动作事实作为后续 renderer 和事实桥详情来源

#### Scenario: 数据库合法动作未出现在本轮 tool result
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`，其中包含 `outputType = "visibleTrainingProposal"`
- **AND** payload 中所有 `exerciseId` 都存在于数据库且 `isPublished = true`
- **AND** payload 中所有 `exerciseItems[*].section` 都被对应动作的数据库 `allowedSections` 覆盖
- **AND** 部分动作没有出现在当前 run 的 `toolResults.groups.<section>.exercises[]`
- **THEN** 系统 MUST 继续允许该输出进入 renderer 和事实桥流程
- **AND** 系统 MUST NOT 因缺少当前 run 动作来源而进入 terminal failure finalizer

#### Scenario: 最终方案引用不存在的动作
- **WHEN** `visibleTrainingProposal.exerciseItems[]` 中包含数据库不存在的 `exerciseId`
- **THEN** 系统 MUST 拒绝该 terminal output
- **AND** 拒绝结果 MUST 使用结构化错误表达缺失的 `exerciseId`
- **AND** 系统 MUST NOT 渲染、保存或持久化该 `visibleTrainingProposal`

#### Scenario: 最终方案引用未发布动作
- **WHEN** `visibleTrainingProposal.exerciseItems[]` 中包含 `isPublished != true` 的动作
- **THEN** 系统 MUST 拒绝该 terminal output
- **AND** 拒绝结果 MUST 表达该动作当前不可用于用户可见训练方案
- **AND** 系统 MUST NOT 通过 tool result 或历史事实绕过该发布态校验

### Requirement: 跨轮可见训练事实必须复核当前数据库
系统 SHALL 保留 `visible_training_proposal_fact` 作为跨 run 引用用户已见训练方案的服务端内部事实来源，但历史事实中的动作 MUST 在再次输出为 `visibleTrainingProposal` 前通过当前数据库事实校验。历史事实可以通过 `inspectVisibleTrainingProposals(operation = "list_recent")` 或等价服务端受控读取投影成模型可见业务事实；系统 MUST NOT 继续要求模型额外调用 `read_recent` 才能消费同一历史事实，也 MUST NOT 要求模型输出历史 `factRef`、`messageId`、`resourceId` 或 `toolResultId`。

#### Scenario: 历史方案动作仍可用
- **WHEN** Planner 通过 `inspectVisibleTrainingProposals(operation = "list_recent")` 或等价事实读取恢复历史 `visibleTrainingProposal`
- **AND** 历史方案中的动作当前仍存在、发布态可用且 section 合法
- **THEN** 系统 MAY 允许 Planner 在新的 `visibleTrainingProposal` 中复用这些 `exerciseId`

#### Scenario: 历史方案动作已不可用
- **WHEN** 历史方案中的某个动作已不存在、未发布或 section 不再合法
- **THEN** 系统 MUST 拒绝直接输出该历史方案
- **AND** 系统 MUST 返回可恢复的结构化失败、澄清或失败收口
- **AND** 系统 MUST NOT 因历史事实曾经展示过就绕过当前数据库校验

#### Scenario: 历史方案导入不替代最终输出
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 成功导入历史 `visibleTrainingProposal` 事实
- **THEN** 该事实 MAY 作为当前 run 的复用、派生或调整依据
- **AND** 最终新训练结构仍 MUST 由合法 `final_answer.visibleOutputs[]` 承载
- **AND** 最终新训练结构仍 MUST 通过当前数据库事实和结构校验
