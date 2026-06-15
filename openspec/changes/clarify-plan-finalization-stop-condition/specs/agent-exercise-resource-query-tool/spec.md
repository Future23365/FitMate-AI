## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须表达非处方边界
系统 SHALL 在 `searchExerciseResources` 的 tool description、schema description、model-visible summary 或等价模型可见说明中表达：该 tool 只返回动作候选事实，不产出 `prescription`、`schedule`、`routine`、`plan` 或训练卡片事实。该说明 MUST NOT 将查询结果包装成固定结构化收口流程，也 MUST NOT 指挥模型按固定顺序继续查询或提交结果。

#### Scenario: description 表达不产出处方或日程
- **WHEN** production registry 序列化 `searchExerciseResources` tool description
- **THEN** 模型可见说明 MUST 表达该 tool 不返回 `prescription`
- **AND** 模型可见说明 MUST 表达该 tool 不返回 `schedule`
- **AND** 模型可见说明 MUST 表达该 tool 不生成 `routine` 或 `plan`
- **AND** 模型可见说明 MUST 表达动作候选可以作为后续结构化输出的动作事实来源

#### Scenario: 缺少 prescription 或 schedule 时不重复查询动作库
- **WHEN** `searchExerciseResources` 已返回满足当前动作目标的候选事实
- **AND** 当前结构化输出缺口是 `prescription` 或 `schedule`
- **THEN** 模型可见说明 MUST 表达重复调用该 tool 不会新增 `prescription` 或 `schedule` 事实
- **AND** 模型可见说明 MUST 允许模型基于已有候选进入结构化收口、澄清或失败收口
- **AND** 模型可见说明 MUST NOT 要求固定调用 `submitVisibleTrainingProposal` 或任何具体下一步 tool

#### Scenario: 不新增服务端语义分流
- **WHEN** 本 change 实现完成
- **THEN** `searchExerciseResources` handler MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板改写查询条件
- **AND** LangChain runtime MUST NOT 根据 `searchExerciseResources` 的具体 toolName 写业务分支
