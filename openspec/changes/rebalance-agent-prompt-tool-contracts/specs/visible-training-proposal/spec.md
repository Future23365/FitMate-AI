## ADDED Requirements

### Requirement: `submitVisibleTrainingProposal` 必须集中表达训练结构化收口边界

`submitVisibleTrainingProposal` 模型可见说明 SHALL 承担 `visibleTrainingProposal` 的结构化收口边界。说明 MUST 表达模型何时可以基于当前可见候选事实提交 `exercise_selection`、`routine` 或 `plan`，而不是让默认 system prompt 或 `searchExerciseResources` description 承载完整训练编排 workflow。

#### Scenario: Finalization tool 表达 routine / plan 收口条件

- **WHEN** production LangChain tool catalog 序列化 `submitVisibleTrainingProposal`
- **THEN** tool description MUST 表达该 tool 用于提交经服务端校验并可用户可见的训练方案结构
- **AND** tool description MUST 表达 `payload.kind = "exercise_selection" | "routine" | "plan"` 的结构能力和主要差异
- **AND** tool description MUST 表达 `routine` / `plan` 需要使用当前可见且可被服务端数据库复核的动作候选
- **AND** tool description MUST 表达当候选事实足以支撑当前 `routine` 或 `plan` 时，应提交结构化方案或自然说明边界，而不是继续扩大动作库 inventory 查询
- **AND** 默认 system prompt MUST NOT 重复承载完整 `visibleTrainingProposal` payload、处方、schedule 或 section 编排细则

#### Scenario: 收口边界不变成固定工具流程

- **WHEN** `submitVisibleTrainingProposal` description 描述动作推荐、一次训练编排或多天计划
- **THEN** 说明 MUST 引导模型基于用户目标、上下文、tool results 和可见候选事实自主选择 `payload.kind`
- **AND** 说明 MUST NOT 写成固定用户短句、固定 tool result 字段组合、固定调用次数或固定 `searchExerciseResources -> submitVisibleTrainingProposal` 流程
- **AND** 服务端 MUST NOT 因该说明新增关键词、正则、同义词表、短句模板或具体 `toolName` 分支

#### Scenario: 已有候选事实可被 finalization tool 消费

- **WHEN** 本轮 `searchExerciseResources` 或可访问历史事实已经提供可被服务端复核的动作候选
- **AND** 用户目标需要结构化训练方案
- **THEN** `submitVisibleTrainingProposal` 模型可见说明 MUST 表达这些候选可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的来源
- **AND** 说明 MUST 表达模型不需要复制完整动作详情、trace id、toolCallId、factRef 或 messageId
- **AND** 说明 MUST 表达未被最终方案选中的候选不需要进入 `visibleTrainingProposal`
