## ADDED Requirements

### Requirement: 默认 prompt 必须表达新训练输出的信息充分性门槛
系统 SHALL 在默认 Agent LLM prompt 中表达：当模型准备新输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal` 时，必须先确认当前对话、当前 run 已导入事实或当前 run 的 tool results 已提供足够可解释的训练目标和关键约束。信息不足时，模型 MUST 使用 `ask_user`，或输出不含 `visibleOutputs` 的 `final_answer` 说明可选方向和可恢复下一步。

#### Scenario: Prompt 表达 exercise_selection 的最低信息门槛
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `payload.kind = "exercise_selection"` 至少需要当前可见上下文中存在训练目标、身体部位、动作类别、器械限制、场地限制、目标标签、点名动作或其他可解释筛选条件之一
- **AND** system message MUST 说明缺少这些条件时不得输出随机动作卡片
- **AND** system message MUST 使用中文描述业务含义
- **AND** `payload.kind`、`exercise_selection`、`visibleOutputs`、`ask_user` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 表达 routine 的最低信息门槛
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `payload.kind = "routine"` 需要当前可见上下文中存在单次训练目标或部位、单次时长、可用器械或场地等关键约束
- **AND** system message MUST 说明目标、时长、器械或场地不足以解释方案时，应先澄清或给出可选方向，不得推送默认 routine 卡片

#### Scenario: Prompt 表达 plan 的最低信息门槛
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `payload.kind = "plan"` 需要当前可见上下文中存在长期目标、训练频率或周期、单次时长、可用器械或场地等关键约束
- **AND** system message MUST 说明频率、时长、目标或器械/场地不足时，应先澄清或给出可选方向，不得推送空泛 plan 卡片

#### Scenario: Prompt 不引入 phrasing 特判
- **WHEN** 默认 prompt 表达信息充分性门槛
- **THEN** system message MUST NOT 使用固定用户短句作为触发条件
- **AND** system message MUST NOT 要求固定 `toolName`、固定 tool 调用次数、固定调用顺序或服务端语义分流
- **AND** system message MUST NOT 承诺服务端会自动补齐训练目标、时长、频率、器械或场地
