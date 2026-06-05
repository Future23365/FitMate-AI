## MODIFIED Requirements

### Requirement: list_recent observation 必须表达事实边界而非答案模板
`inspectVisibleTrainingProposals(operation = "list_recent")` 的模型可见 observation SHALL 描述当前 actor 和 conversation 中可引用 `visibleTrainingProposal` 事实索引的事实边界。Observation MUST NOT 替模型判断用户意图，也 MUST NOT 规定模型在某个用户短语、空结果或字段组合条件下输出固定答案。

#### Scenario: list_recent 空索引表达可见事实状态
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 返回空 `facts[]`
- **THEN** model projection MUST 表达 `facts[]` 是当前可见、可引用的 `visibleTrainingProposal` 事实索引集合
- **AND** model projection MUST 表达空数组只表示当前可见事实中没有这类引用对象
- **AND** model projection MUST 表达该结果可作为模型推理、解释缺少引用对象或向用户澄清的事实依据
- **AND** model projection MUST 表达该结果不能支撑成功训练方案刷新、替换、调整或新训练方案生成

#### Scenario: observation 不写固定用户短语或答案模板
- **WHEN** production registry 或 runtime 将 `list_recent` observation 暴露给 Planner
- **THEN** 模型可见内容 MUST NOT 包含 `换一批`、`再来一组`、`不要这个` 或等价固定用户短语作为使用条件
- **AND** 模型可见内容 MUST NOT 包含“如果用户这样说就这样回答”的答案模板
- **AND** 模型可见内容 MUST NOT 要求固定 `final_answer`、`ask_user`、`read_recent` 或 `searchExerciseResources` 调用顺序

#### Scenario: observation 引导模型结合上下文自行决定下一步
- **WHEN** `list_recent` observation 暴露给 Planner
- **THEN** 模型可见内容 MUST 表达该结果只提供事实边界
- **AND** 模型可见内容 MUST 表达若本轮目标依赖该引用对象，模型应结合本轮用户请求、最近对话和其他 observations / tool results 自行决定解释缺少引用对象、追问、请求补充目标或失败收口
- **AND** 模型可见内容 MUST 表达只有用户已经提供足够独立生成所需目标和约束时，才可作为新请求处理，且不得宣称这是对不可见已有对象的刷新、替换或调整
- **AND** 模型可见内容中的描述性自然语言 MUST 使用中文，`operation`、`list_recent`、`read_recent`、`facts`、`visibleTrainingProposal` 等技术标识 MUST 保持英文原样
