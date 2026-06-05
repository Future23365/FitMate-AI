## ADDED Requirements

### Requirement: Agent LLM prompt 必须表达 visibleTrainingProposal 刷新语义
系统 SHALL 在默认 Agent LLM prompt 中表达 `visibleTrainingProposal` 的刷新语义：当用户基于上一套用户可见训练方案要求替换、重新来一套、不满意或同类继续请求时，模型应理解为保留原目标和约束，并优先让新的 `exerciseItems` 与上一套用户已看到动作产生实质差异。该说明 MUST NOT 写成固定自然语言短语到固定 tool、固定 action 或固定 `payload.kind` 的映射。

#### Scenario: Prompt 描述刷新结果要求
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明上一套 `visibleTrainingProposal` 的刷新目标是保留原训练目标、器械、难度、时长、section 和计划约束
- **AND** system message MUST 说明刷新时应优先替换上一套用户已看到的 `exerciseItems`
- **AND** system message MUST 说明不得只按原始需求和同一排序重新生成导致重复方案
- **AND** system message MUST 使用中文描述业务含义，`visibleTrainingProposal`、`exerciseItems`、`routine`、`plan`、`payload.kind` 等技术标识保持英文原样

#### Scenario: Prompt 不固定 tool 调用
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 表达成用户说出某个固定短语时必须调用 `inspectVisibleTrainingProposals`
- **AND** system message MUST NOT 表达成用户说出某个固定短语时必须调用 `searchExerciseResources`
- **AND** system message MUST NOT 要求固定 tool 调用次数或固定 tool 调用顺序
- **AND** system message MUST NOT 要求服务端根据用户原文选择 tool 或改写 action

#### Scenario: Prompt 描述候选不足和保留例外
- **WHEN** system message 描述训练方案刷新
- **THEN** system message MUST 说明如果用户明确要求保留某些动作，模型可以保留这些动作
- **AND** system message MUST 说明如果在当前约束下候选不足，模型应说明原因、询问是否放宽条件或只输出可支撑的结构
- **AND** system message MUST 说明模型不能在未说明原因的情况下把重复旧动作称为已经完成刷新

### Requirement: Agent LLM prompt 必须区分刷新动作与调整处方
系统 SHALL 在模型可见合同中区分替换训练方案动作和调整既有训练方案处方。用户要求“换一批”“重新来一套”等表达可能意味着替换动作；用户要求调整组数、时长、顺序、休息或难度时，模型应优先保留动作并调整对应结构字段，除非用户同时表达替换动作。

#### Scenario: Prompt 描述处方调整不默认换动作
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达仅调整处方、顺序、时长、休息或难度的请求不应默认替换全部动作
- **AND** system message MUST 表达模型应根据用户目标和上下文自主判断是调整字段、读取事实、查询替代动作、澄清还是失败收口
- **AND** system message MUST NOT 使用关键词表替代模型判断
