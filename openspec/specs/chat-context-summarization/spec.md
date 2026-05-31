# chat-context-summarization Specification

## Purpose
TBD - created by archiving change summarize-ai-chat-context. Update Purpose after archive.
## Requirements
### Requirement: 聊天模型输入使用自然语言上下文总结
系统 SHALL 将聊天相关 LLM 调用的历史上下文表达为自然语言 `conversationSummary`，并且 SHALL 只把当前最新用户消息作为本轮 user message 传给模型。

#### Scenario: 用户发送新消息
- **WHEN** 用户在已有会话中发送一条新消息
- **THEN** `/api/chat` MUST 使用已有 `conversationSummary` 和该条最新用户消息构造本轮 LLM 输入
- **AND** 本轮 LLM 输入 MUST NOT 包含完整历史对话
- **AND** 本轮 LLM 输入 MUST NOT 包含由多条历史消息组成的 selected message window

#### Scenario: 没有历史总结的新会话
- **WHEN** 用户在新会话中发送第一条消息
- **THEN** 系统 MUST 使用空的或明确表示暂无历史的 `conversationSummary`
- **AND** 系统 MUST 将当前最新用户消息作为唯一 user message 传给聊天 LLM

#### Scenario: 旧会话缺少新 summary 字段
- **WHEN** 系统恢复旧聊天历史且历史元数据中没有 `conversationSummary`
- **THEN** 系统 MUST 从已有历史消息或旧 `conversationContext.summary` 初始化自然语言 summary
- **AND** 初始化后的模型输入 MUST NOT 继续暴露旧的结构化 `knownFacts` 或 `currentIntent` 字段给 LLM

### Requirement: 上下文总结更新由服务端负责
系统 SHALL 在服务端维护和更新聊天上下文总结，前端不得成为总结策略的事实来源。

#### Scenario: 助手回复完成
- **WHEN** `/api/chat` 完成本轮助手回复
- **THEN** 服务端 MUST 使用旧 summary、本轮用户消息、助手回复和服务端内部动作摘要生成新的 `conversationSummary`
- **AND** 系统 MUST 将新的 `conversationSummary` 保存到会话或消息 metadata 中，供下一轮请求使用

#### Scenario: Summary 更新失败
- **WHEN** LLM summary 更新失败、超时或不可用
- **THEN** 系统 MUST 使用确定性兜底方式生成受长度限制的 summary
- **AND** 聊天回复 MUST NOT 因 summary 更新失败而丢失本轮用户可见回复
- **AND** AI Trace MUST 记录 summary 更新失败原因

#### Scenario: Summary 内容边界
- **WHEN** 系统生成或更新 `conversationSummary`
- **THEN** summary MUST 优先保留用户训练目标、经验、器械或场地、单次时长、频率、伤痛限制、偏好、避免项、最近意图和未完成问题
- **AND** summary MUST NOT 把服务端默认值描述成用户明确提供的信息

### Requirement: 结构化上下文仅作为服务端内部校验输入
系统 SHALL 将结构化意图、候选动作、动作校验和草稿校验保留在服务端内部，不得把这些结构化上下文字段作为模型可见历史上下文协议。

#### Scenario: 聊天意图解析
- **WHEN** 系统解析聊天意图
- **THEN** 模型请求 MUST 使用 `conversationSummary` 和当前最新用户消息
- **AND** 模型请求 MUST NOT 包含模型可见的 `fitnessConversationContext.knownFacts`
- **AND** 模型请求 MUST NOT 包含模型可见的 `fitnessConversationContext.currentIntent`

#### Scenario: 下游动作推荐或训练草稿生成
- **WHEN** 服务端触发动作推荐、单次编排或长期计划生成
- **THEN** 下游 LLM 调用 MUST 使用 `conversationSummary` 和当前最新用户消息补充语言上下文
- **AND** 下游服务 MUST 继续使用服务端校验后的 `workoutIntent` 和动作候选列表约束模型输出
- **AND** 下游服务 MUST NOT 通过历史消息窗口还原上下文

### Requirement: AI Trace 展示 summary 上下文边界
系统 SHALL 在 AI Trace 中展示上下文总结的输入、输出和模型请求边界，使开发者能确认没有完整历史对话泄漏到 LLM。

#### Scenario: 查看聊天 trace
- **WHEN** 开发者查看一次 `/api/chat` 的 AI Trace
- **THEN** Trace MUST 展示本轮 `latestUserMessage`
- **AND** Trace MUST 展示用于模型调用的 `conversationSummary`
- **AND** Trace MUST 展示 summary 更新步骤及其结果或失败原因
- **AND** Trace MUST 能看出聊天模型请求没有包含多条历史 user/assistant 消息

#### Scenario: 查看下游生成 trace
- **WHEN** 开发者查看动作推荐或训练计划生成的 AI Trace
- **THEN** Trace MUST 展示传入的 `conversationSummary`
- **AND** Trace MUST 展示服务端结构化 `workoutIntent` 和候选动作校验结果
- **AND** Trace MUST NOT 把旧的历史消息窗口作为模型输入来源记录为成功路径

### Requirement: 短指令必须沿用最近训练事实

系统 SHALL 在不暴露完整历史消息给 LLM 的前提下，让依赖上下文的短指令沿用最近已校验训练事实，并使用当前最新消息覆盖对应字段。

#### Scenario: 修改最近 routine 时长

- **WHEN** `conversationSummary` 或服务端内部上下文表明最近生成了居家背部 30 分钟 `routine`
- **AND** 用户输入“改成45分钟”
- **THEN** 系统 MUST 沿用最近的训练目标和场地条件
- **AND** 系统 MUST 将本次 `sessionMinutes` 更新为 45
- **AND** 系统 MUST 触发 `workout_routine`

#### Scenario: 动作推荐升级为 routine

- **WHEN** `conversationSummary` 或服务端内部上下文表明最近生成了胸部动作推荐
- **AND** 用户输入“把它变成20分钟训练”
- **THEN** 系统 MUST 将“它”解析为最近动作推荐的训练目标
- **AND** 系统 MUST 触发 `workout_routine`

#### Scenario: 当前消息覆盖历史器械条件

- **WHEN** 历史上下文记录用户有哑铃
- **AND** 用户输入“但今天不用器械”
- **THEN** 系统 MUST 使用当前消息覆盖历史器械条件
- **AND** 本轮训练意图 MUST 表达自重或无器械条件

### Requirement: Summary 必须参与预算化上下文选择
系统 SHALL 将 `conversationSummary` 作为历史上下文的唯一模型可见来源，并且 MUST 由 token budget 决策层决定本轮是否需要读取、更新或仅复用 summary。

#### Scenario: 构造聊天模型输入
- **WHEN** 系统为聊天相关 LLM 调用构造模型输入
- **THEN** 模型可见历史上下文 MUST 来自 `conversationSummary`
- **AND** 模型请求 MUST 只包含当前最新用户消息作为本轮 user message
- **AND** 模型请求 MUST NOT 为降低实现复杂度重新传入完整历史消息窗口

#### Scenario: 复用已有 summary
- **WHEN** 本轮预算决策判断用户消息不会改变长期上下文事实
- **THEN** 系统 MUST 复用已有 `conversationSummary`
- **AND** 系统 MUST NOT 发起仅用于重写同等内容 summary 的 LLM 调用
- **AND** Trace MUST 记录 summary 更新被跳过的原因

#### Scenario: 更新 summary
- **WHEN** 本轮用户消息、助手回复或服务端动作摘要产生新的长期上下文事实
- **THEN** 系统 MUST 更新 `conversationSummary`
- **AND** 更新输入 MUST 只包含旧 summary、本轮最新用户消息、助手回复摘要和服务端动作摘要
- **AND** 更新输入 MUST NOT 包含完整历史消息窗口

