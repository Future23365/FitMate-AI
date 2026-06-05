## ADDED Requirements

### Requirement: 基础黑盒必须判定信息不足时不可推送随机训练卡片
基础首页聊天黑盒 SHALL 覆盖笼统训练请求、长期计划条件不足、动作推荐目标不清三类流程。若期望是澄清或可选方向，最终用户可见输出中出现不可解释的 `visibleOutputs` 训练卡片 MUST be judged as failed，即使同时出现泛泛 `suggestedQuestions`。

#### Scenario: F03 笼统 routine 请求先澄清
- **WHEN** 基础黑盒执行 F03 第一轮
- **AND** user input is `给我一套训练`
- **THEN** assistant MUST NOT output a `visibleTrainingProposal` card
- **AND** assistant MUST ask for key conditions or provide user-clickable options that directly补齐目标、时长、器械或场地

#### Scenario: F05 非健身后回到训练不应直接生成默认方案
- **WHEN** 基础黑盒执行 F05 第二轮或等价流程
- **AND** user only provides a broad current training target without enough routine constraints
- **THEN** assistant MUST NOT output an unexplained routine or plan card
- **AND** assistant MAY recommend a clarifying next step, ask a question, or provide non-structured text guidance

#### Scenario: F12 目标不清的动作推荐先澄清
- **WHEN** 基础黑盒执行 F12 第一轮
- **AND** user input is `推荐一个动作`
- **THEN** assistant MUST NOT output a random exercise card
- **AND** assistant MUST ask for target body part, goal, equipment, venue, or provide concrete selectable directions

#### Scenario: Judge 不把随机卡片加泛泛建议判为通过
- **WHEN** judge input expectation says not to directly generate random card or training card
- **AND** visible user output includes `visibleOutputs` for `visibleTrainingProposal` or legacy training card kind
- **THEN** judge MUST return `passed=false`
- **AND** judge MUST NOT return `passed_via_suggestion` solely because generic `assistantSuggestions` are present
