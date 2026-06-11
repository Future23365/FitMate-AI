# assistant-suggestions Specification

## Purpose
TBD - created by archiving change unify-ai-assistant-suggestions. Update Purpose after archive.
## Requirements
### Requirement: 建议内容由对应阶段的 LLM 产出

系统 SHALL 让最了解当前上下文的 LLM 阶段产出建议候选；服务端 SHALL 负责统一结构和边界校验，不得把通用训练建议长期硬编码在服务端。

#### Scenario: 意图解析产出缺信息建议

- **WHEN** 用户请求不足以触发动作推荐、routine 或 plan
- **THEN** 意图解析 LLM MUST 产出可点击补充信息建议
- **AND** 服务端 MUST 将这些建议标记为 `kind = "clarification"` 和 `blocking = true`

#### Scenario: 动作推荐成功后产出下一步建议

- **WHEN** 动作推荐 LLM 成功生成 `exercise_recommendation`
- **THEN** 动作推荐阶段 MUST 能产出基于该推荐结果的下一步建议
- **AND** 建议 MAY 包括基于这些动作生成训练、换一批更简单动作或调整偏好
- **AND** 服务端 MUST 将这些建议标记为 `kind = "next_action"` 和 `blocking = false`

#### Scenario: 推荐卡片不注入默认建议

- **WHEN** Agent 已生成动作推荐卡片
- **AND** Agent 回复上下文没有显式提供 `assistantSuggestions`
- **THEN** Response Writer MUST NOT 自动注入“换一批”“生成训练”或等价固定建议
- **AND** 前端 MUST NOT 展示来自 Response Writer 默认兜底的推荐卡片按钮

#### Scenario: 训练生成失败后产出恢复建议

- **WHEN** routine 或 plan 生成失败并返回可恢复上下文
- **THEN** 训练生成或修复阶段 MUST 能产出恢复建议
- **AND** 服务端 MUST 将这些建议标记为 `kind = "retry"` 或 `kind = "adjustment"`

#### Scenario: 不默认新增建议模型调用

- **WHEN** 本轮已有意图解析、动作推荐、routine/plan 生成或修复 LLM 调用
- **THEN** 系统 MUST 优先复用这些阶段产出的建议候选
- **AND** 系统 MUST NOT 默认为了建议回复额外发起一次独立 LLM 调用

### Requirement: 建议 message 必须是用户口吻

每条 AI 建议的 `message` SHALL 是用户点击后可以直接发送的完整用户表达，不得是助手对用户的追问、命令、说明或系统口吻文本。

#### Scenario: AI 指令式建议被过滤

- **WHEN** LLM 产出类似“请重新说明你的训练目标、时间和器械条件”的建议
- **THEN** 服务端 MUST 判定该建议不符合用户口吻
- **AND** 服务端 MUST NOT 将该建议展示给用户
- **AND** AI Trace MUST 记录该建议被过滤的原因

#### Scenario: 用户口吻建议被保留

- **WHEN** LLM 产出类似“我在家自重练 30 分钟全身”或“按这些动作生成 30 分钟训练”的建议
- **THEN** 服务端 MUST 保留该建议
- **AND** 点击该建议后前端 MUST 发送建议的 `message` 作为下一轮用户消息

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

### Requirement: 建议提问必须统一为 suggestedQuestions
系统 SHALL 使用 `suggestedQuestions` 表达聊天主链用户可见建议提问。每条建议提问 SHALL 是用户点击后可以直接发送的完整用户消息；前端 SHALL 展示同一段文本作为按钮文案。LangChain 文本聊天成功终态产生建议提问时，建议 MUST 由结构化 `suggestedQuestions` 字段承载，不得只写入用户可见正文。

#### Scenario: 服务端输出建议提问
- **WHEN** 本轮聊天产生一个或多个用户可见建议提问
- **THEN** 服务端 MUST 输出 `suggestedQuestions`
- **AND** 每条建议提问 MUST 是非空字符串
- **AND** 建议提问数量 MUST 不超过 3 条
- **AND** 前端 MUST 能用该字段渲染建议按钮

#### Scenario: LangChain 成功回复投影建议提问
- **WHEN** LangChain runtime 成功结果包含 `suggestedQuestions`
- **THEN** production response adapter MUST 输出 `suggested_questions` NDJSON 事件
- **AND** 该事件 MUST 使用 runtime 已校验的 `suggestedQuestions`
- **AND** 响应摘要 MUST 记录正确的 `suggestedQuestionCount`
- **AND** 服务端 MUST NOT 从 `content` 正文、用户原文、关键词、正则、同义词表或短句模板中提取建议提问

#### Scenario: 建议提问点击后发送原文本
- **WHEN** 用户点击一条建议提问按钮
- **THEN** 前端 MUST 将该条 `suggestedQuestions` 文本作为下一轮用户消息发送
- **AND** 前端 MUST NOT 使用另一个 hidden message、label、targetOperation 或内部 action 替代该文本

#### Scenario: 旧建议字段不归一到 suggestedQuestions
- **WHEN** 历史消息、旧 stream 或旧服务端结果仍包含 `assistantSuggestions`、`suggestedReplies`、`suggestions` 或旧 `assistant_suggestions`
- **THEN** 系统 MUST NOT 将这些旧字段归一化为 `suggestedQuestions`
- **AND** 新生产写入路径 MUST 只使用 `suggestedQuestions`
- **AND** 新测试 MUST 覆盖旧字段不进入聊天主链建议提问投影

### Requirement: 建议提问不得成为服务端语义分流入口
系统 SHALL 将 `suggestedQuestions` 视为下一轮普通用户消息候选。服务端 MUST NOT 根据建议提问文本提前选择业务 tool、改写 action、执行保存或推断训练结构。

#### Scenario: 服务端不读取按钮文案执行操作
- **WHEN** 用户点击建议提问后发送下一轮消息
- **THEN** 该消息 MUST 进入普通聊天请求链路
- **AND** LLM MUST 基于本轮可见上下文重新判断语义
- **AND** 服务端 MUST NOT 因消息来自建议按钮而绕过 AgentAction、tool schema、ResourceStore、Policy Guard 或 validator

#### Scenario: 建议提问不承诺未执行结果
- **WHEN** 模型输出 `suggestedQuestions`
- **THEN** 每条建议提问 MUST NOT 声称某个 tool 已执行、某个训练已保存、某个 artifact 已验证或某个医疗结论已成立
- **AND** 如果建议涉及当前未开放能力，模型 MUST 改为建议用户补充信息、询问普通训练问题或继续当前可执行范围

