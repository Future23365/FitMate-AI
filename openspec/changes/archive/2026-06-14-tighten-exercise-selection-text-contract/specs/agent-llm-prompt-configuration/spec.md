## ADDED Requirements

### Requirement: 动作推荐正文不得主动生成训练处方参数

LangChain Agent system prompt SHALL 在模型可见回答规则中表达：当最终回答只是呈现动作推荐集合，而不是交付一次可执行训练 `routine` 或多天训练 `plan` 时，`fitmate_final_response.content` MUST 只解释推荐理由、目标肌群、适用场景、动作差异、动作注意事项或与用户目标的关系。该正文 MUST NOT 主动生成组数、次数、时长、休息时间、训练频率、日程或等价处方参数。

#### Scenario: 只交付动作推荐集合
- **WHEN** 模型判断用户目标只需要动作推荐集合
- **AND** 最终结构化训练输出为 `payload.kind = "exercise_selection"`
- **THEN** system prompt MUST 表达 `content` 可以解释推荐理由、目标肌群、适用场景、动作差异和动作注意事项
- **AND** system prompt MUST 表达 `content` 不应主动输出组数、次数、时长、休息时间、训练频率或日程
- **AND** system prompt MUST NOT 根据固定用户短句、关键词、正则、同义词表或具体 phrasing 触发该规则

#### Scenario: 用户需要训练编排或计划
- **WHEN** 模型判断用户目标需要一次可执行训练、组数次数、训练频率、休息时间、日程或多天计划
- **THEN** system prompt MAY 表达这类处方型内容应由 `routine` 或 `plan` 的结构化训练输出支撑
- **AND** system prompt MUST NOT 要求服务端根据用户原文替模型选择 `payload.kind`
- **AND** system prompt MUST NOT 在 `/api/chat`、runtime、validator 或 response adapter 中引入自然语言分流
