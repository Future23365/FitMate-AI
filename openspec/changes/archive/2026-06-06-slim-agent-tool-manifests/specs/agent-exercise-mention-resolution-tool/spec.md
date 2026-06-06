## MODIFIED Requirements

### Requirement: `resolveExerciseResourceMentions` 必须提供安全投影和模型可见说明

系统 SHALL 为 `resolveExerciseResourceMentions` 提供中文模型可见说明、examples、model observation、user projection 和 trace summary，且不得泄漏完整数据库记录或内部 handler output。

#### Scenario: 模型可见说明表达 mention 解析与下游使用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `resolveExerciseResourceMentions` 的 `description`、`whenToUse`、`whenNotToUse` 和 examples MUST 默认使用中文描述
- **AND** 说明 MUST 表达该 tool 只把用户明确点名的单个动作名解析为发布态 Exercise 候选
- **AND** 说明 MUST 表达 `matched.exerciseId` 只能作为 `searchExerciseResources.requiredExerciseIds`
- **AND** 说明 MUST 表达 `ambiguous` 需要模型选择候选、重新查询或 `ask_user`
- **AND** 说明 MUST 表达 `not_found` 不能作为动作事实
- **AND** 说明 MUST 表达本 tool result 不能直接写入 `visibleTrainingProposal.exerciseItems`

#### Scenario: examples 使用完整 tool_call action
- **WHEN** production registry 序列化 `resolveExerciseResourceMentions` manifest
- **THEN** examples MUST 包含完整 `{ type: "tool_call", toolName: "resolveExerciseResourceMentions", input: ... }`
- **AND** examples MUST 展示 `mentions[].text` 只放单个动作名，不放完整用户消息
- **AND** examples MUST NOT 训练模型输出裸 tool input

#### Scenario: manifest 不包含工程实现者提示
- **WHEN** production registry 序列化 `resolveExerciseResourceMentions` manifest
- **THEN** 模型可见说明 SHOULD 使用“mentions 必须由用户明确点名的动作构成；不要从泛泛目标中猜动作名”表达边界
- **AND** 模型可见说明 MUST NOT 把“不要用服务端关键词、正则、同义词表或短句模板从用户原文拆 mention”作为面向 Planner 的主要说明
- **AND** 服务端仍 MUST NOT 新增关键词、正则、同义词表或短句模板拆 mention
