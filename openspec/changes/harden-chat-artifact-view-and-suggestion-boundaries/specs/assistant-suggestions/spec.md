## ADDED Requirements

### Requirement: 用户可见建议必须通过结构化产品能力边界

系统 SHALL 在输出 `assistantSuggestions` 前校验每条建议对应的结构化目标操作或来源能力。建议按钮 MUST 只展示当前产品已开放、点击后能作为用户消息安全进入下一轮的动作；当前未开放的写入能力 MUST NOT 作为建议按钮暴露给用户。

#### Scenario: 查看或调整建议被保留
- **WHEN** Agent 或 Response Writer 输出的建议具备结构化目标操作，且该操作属于当前已开放的查看、澄清、调整、追问或基于推荐生成训练能力
- **THEN** 服务端 MUST 可以将该建议归一化为 `assistantSuggestions`
- **AND** 前端 MUST 在当前 assistant bubble 下展示对应 chip

#### Scenario: 未开放保存建议被过滤
- **WHEN** Agent 或 Response Writer 输出的建议对应当前产品未开放的 artifact 保存、验证后保存、保存另一套训练或等价写入能力
- **THEN** 服务端 MUST NOT 输出该建议为用户可见 chip
- **AND** 服务端 MUST 在 trace 中记录结构化过滤原因
- **AND** 系统 MUST NOT 因该建议被过滤而调用保存、验证、Policy 或写入工具

#### Scenario: 建议缺少可证明目标操作
- **WHEN** LLM 输出的建议无法通过结构化字段、Agent result status、tool result 来源或既有 suggestion kind 证明其属于已开放能力
- **THEN** 服务端 MUST 保守丢弃该建议或将本轮转为澄清/普通回答
- **AND** 服务端 MUST NOT 通过读取 label 或 message 文案猜测该建议是否安全

### Requirement: 建议过滤不得依赖自然语言文案匹配

系统 SHALL 通过 suggestion 的结构化操作类型、来源阶段、AgentExecutionResult 状态、tool result 证据和产品能力表判断建议是否可展示。服务端 MUST NOT 使用 label/message 中的关键词、正则、同义词表或短语模板过滤或改写建议语义。

#### Scenario: 文案包含保存字样但结构化操作不是写入
- **WHEN** 一条建议的 label 或 message 文案包含可能被误读为写入的自然语言词语
- **AND** 该建议的结构化目标操作被证明为查看、澄清或解释
- **THEN** 服务端 MUST 按结构化目标操作校验该建议
- **AND** 服务端 MUST NOT 仅因文案命中某个词而过滤该建议

#### Scenario: 文案没有保存字样但结构化操作是未开放写入
- **WHEN** 一条建议的 label 或 message 文案没有明显写入关键词
- **AND** 该建议的结构化目标操作是当前未开放的 artifact 写入能力
- **THEN** 服务端 MUST 过滤该建议
- **AND** 服务端 MUST NOT 因文案看起来安全而展示该建议

### Requirement: 阻断建议不得引导用户触发不可执行写链

当本轮 `AgentExecutionResult` 为 `needs_clarification`、`blocked` 或 `failed` 时，系统 SHALL 只展示能解除当前阻断、选择查看目标、补充训练条件或调整请求的建议。阻断建议 MUST NOT 引导用户点击后进入当前无法完成的保存、验证或写入链。

#### Scenario: 保存请求缺少可保存资源
- **WHEN** Agent 因保存请求缺少当前 run 的 draft、validation、policy 或 revision 资源而返回 `needs_clarification` 或 `blocked`
- **THEN** 服务端 MUST 可以展示“查看最近训练”“选择要调整的训练”或“重新生成训练”等已开放建议
- **AND** 服务端 MUST NOT 展示“先验证再保存”或等价当前不可执行保存建议

#### Scenario: 生成或查看路径没有阻断
- **WHEN** 本轮成功生成推荐卡片、routine 卡片、plan 卡片或成功只读查看 artifact
- **THEN** 服务端 MUST 可以展示非阻断下一步建议
- **AND** 这些建议 MUST 通过结构化产品能力校验
