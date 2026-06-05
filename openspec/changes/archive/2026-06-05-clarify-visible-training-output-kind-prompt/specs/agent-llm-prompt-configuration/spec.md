## ADDED Requirements

### Requirement: 默认 prompt 必须提供训练输出类型选择指南
系统 SHALL 在默认 Agent LLM system prompt 中提供 `visibleTrainingProposal.payload.kind` 选择指南，帮助模型按用户目标语义区分 `exercise_selection`、`routine` 和 `plan`。该指南 MUST 使用代表性语义范式说明常见目标，但 MUST NOT 表达为固定关键词触发规则、服务端语义分流或固定 tool 调用顺序。

#### Scenario: Prompt 表达产品训练输出能力地图
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明产品核心训练输出能力包括普通健身解释、动作事实查询与动作选择、一次可执行训练编排、多天或周期训练计划、以及基于当前 run 可见训练方案事实的调整或派生
- **AND** system message MUST 说明模型应先判断用户目标需要哪类训练结果，再基于当前可见 tools、observations 和 toolResults 自主决定 `tool_call`、`final_answer` 或 `ask_user`
- **AND** system message MUST 说明不得根据固定短语、关键词或测试样例机械选择输出结构

#### Scenario: Prompt 区分 exercise_selection、routine 和 plan
- **WHEN** 默认 prompt 描述 `visibleTrainingProposal.payload.kind`
- **THEN** system message MUST 说明 `exercise_selection` 只表示一批可选 `training` 动作事实，适合动作推荐、动作清单、动作库查询、动作替代候选或动作事实说明
- **AND** system message MUST 说明 `routine` 表示一次可执行训练编排，适合一套训练、一次训练、当次训练、某目标或部位的单次训练、某个时长内完成训练、循环训练、居家或无器械单次训练、或希望直接照做一轮训练的目标
- **AND** system message MUST 说明 `plan` 表示多天或周期安排，适合每周频次、周期长度、多天安排、训练日 / 休息日安排、每周几练、连续几周目标或长期训练计划

#### Scenario: Prompt 表达输出类型优先级
- **WHEN** 用户目标同时包含单次训练编排信息和多天、频次或周期信息
- **THEN** system message MUST 指导模型优先考虑 `plan`
- **AND** system message MUST 说明 `plan` 可以复用同一套 `warmup` / `training` / `stretch` 编排，并通过 `schedule.assignments` 表达训练日和休息日
- **AND** 当用户目标只要求一次训练且关键约束足以解释方案时，system message MUST 指导模型优先考虑 `routine`
- **AND** 当用户目标语义只停留在动作候选、动作清单或动作事实层面时，system message MUST 指导模型使用 `exercise_selection` 或普通文本

#### Scenario: Prompt 禁止因事实阶段不足而降级输出类型
- **WHEN** system message 描述 tool result 后的 terminal 决策
- **THEN** system message MUST 说明不要因为当前 run 先拿到的事实只支持 `training`，就把本应是 `routine` 或 `plan` 的目标降级为 `exercise_selection`
- **AND** 如果目标需要 `routine` 或 `plan` 且当前缺少 `warmup` / `stretch` 动作事实，system message MUST 指导模型在可见 tool 可补查时继续返回合法 `tool_call`
- **AND** system message MUST 说明补齐候选后再输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal`
- **AND** system message MUST 说明不得用正文动作列表、`exercise_selection` 或“如果你需要完整计划我可以继续”作为成功终态

#### Scenario: Prompt 说明候选不足的可恢复收口
- **WHEN** 缺失 section 查询返回 0 条、diagnostics 显示无候选、约束冲突、tool 不可用或关键目标约束仍不足
- **THEN** system message MUST 指导模型使用 `ask_user` 或不带 `visibleOutputs` 的 `final_answer` 说明具体缺口和可恢复下一步
- **AND** 可恢复下一步 SHOULD 围绕放宽器械、场地、难度、目标部位、训练形式、时长、频次或继续澄清
- **AND** system message MUST 说明不得让用户自行把未完成的 `training` 动作列表组合成 `routine` 或 `plan`

#### Scenario: Prompt 示例不变成服务端语义分流
- **WHEN** 实现本 change
- **THEN** 默认 prompt MUST NOT 写入 F04、F17、F18 或等价测试编号
- **AND** 默认 prompt MUST 说明代表性表达只是语义范式，不是固定触发词
- **AND** `/api/chat`、Agent runtime、tool handler、validator 和 renderer MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板改写 `action`、`toolName` 或 `payload.kind`
