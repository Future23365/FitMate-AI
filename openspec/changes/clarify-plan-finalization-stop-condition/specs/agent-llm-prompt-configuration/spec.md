## ADDED Requirements

### Requirement: 默认 prompt 必须表达 plan 生成的动作查询停止条件
系统 SHALL 在默认 Agent LLM prompt 中表达：当当前可见动作候选事实已经足以组成 `plan` 时，模型不得因为缺少 `prescription` 或 `schedule` 继续同类动作查询。Prompt MUST 表达 `prescription` 和 `schedule` 不是动作库查询结果；模型应基于本轮用户目标、训练频率、单次时长、候选动作事实和保守训练编排构造这些结构字段，并通过结构化收口 tool 与服务端 validator 校验。

#### Scenario: 候选动作足够时停止同类查询
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达 `searchExerciseResources` 或等价动作查询结果只提供动作候选事实
- **AND** system message MUST 表达已有候选动作足以组成 `plan` 时，应停止同类动作查询
- **AND** system message MUST 表达缺少 `prescription` 或 `schedule` 不等价于缺少动作候选事实
- **AND** system message MUST NOT 要求模型为了补 `prescription` 或 `schedule` 重复查询动作库

#### Scenario: plan 结构字段由模型构造并交给 validator
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达 `prescription` 可由模型基于本轮用户目标、单次时长、候选动作事实和保守训练编排生成
- **AND** system message MUST 表达 `schedule` 可由模型基于训练频率、周期安排、训练日 / 休息日或保守默认生成
- **AND** system message MUST 表达这些字段必须通过结构化收口 tool 和服务端 validator 校验

#### Scenario: 不新增固定业务流程
- **WHEN** 实现本 prompt change
- **THEN** `/api/chat`、LangChain runtime、tool handler、validator 和 response adapter MUST NOT 新增基于用户原文短语、关键词、正则、同义词表或业务 `toolName` 的语义分支
- **AND** system message MUST NOT 包含原始失败用户短句或等价固定短语作为触发规则
- **AND** system message MUST NOT 根据具体 tool result 字段组合替模型决定继续查询、结构化收口、普通回答或澄清
