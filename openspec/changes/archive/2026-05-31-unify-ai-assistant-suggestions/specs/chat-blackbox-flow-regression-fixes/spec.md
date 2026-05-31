## ADDED Requirements

### Requirement: AI 建议回复必须有自动化回归覆盖

系统 SHALL 为统一 AI 建议回复增加自动化回归测试，覆盖用户口吻、阶段来源、阻断优先级和动作推荐后的下一步建议。

#### Scenario: 非用户口吻建议不展示

- **WHEN** 任一 LLM 阶段返回“请重新说明你的训练目标、时间和器械条件”或等价 AI 指令式建议
- **THEN** 服务端 MUST 过滤该建议
- **AND** 前端 MUST NOT 展示该建议 chip

#### Scenario: 缺信息建议使用用户口吻

- **WHEN** 用户输入“帮我安排一下”
- **AND** 当前缺少训练目标、时长或器械条件
- **THEN** 系统 MUST 返回用户可直接点击发送的 `assistantSuggestions`
- **AND** 建议消息 MUST 类似“我在家自重练 30 分钟全身”，而不是“你想练多久？”

#### Scenario: 动作推荐成功后提供下一步建议

- **WHEN** 用户输入“我想练胸”
- **AND** 系统成功生成 `exercise_recommendation`
- **THEN** 系统 MUST 可以返回 `kind = "next_action"` 的非阻断建议
- **AND** 建议 MUST 基于刚生成的动作推荐，例如继续生成单次训练、换一批动作或调整动作偏好
- **AND** 建议点击后 MUST 作为下一轮用户消息发送

#### Scenario: 阻断建议优先于下一步建议

- **WHEN** 当前意图需要用户先补充必要信息
- **THEN** 系统 MUST 只展示阻断补齐建议
- **AND** 系统 MUST NOT 同时展示依赖未满足信息的生成训练建议
