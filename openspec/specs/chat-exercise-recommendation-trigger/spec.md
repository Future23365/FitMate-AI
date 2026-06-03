# chat-exercise-recommendation-trigger Specification

## Purpose
TBD - created by archiving change allow-goal-only-exercise-recommendation. Update Purpose after archive.
## Requirements
### Requirement: 动作推荐必须由 Agent 执行结果触发
系统 SHALL 让动作推荐卡片由 Agent 工具调用和 `AgentExecutionResult` 触发，而不是由旧内部推荐事件、resolved intent 或 `workoutIntent` 触发。成功动作推荐 MUST 产生前端可消费的 `exercise_recommendation` artifact 事件，除非 Agent 返回澄清、blocked 或 failed。

#### Scenario: 用户请求动作推荐
- **WHEN** Agent 判断本轮应返回动作推荐
- **THEN** Agent MUST 调用动作检索工具获得 candidateSetId 或等价候选集合
- **AND** `AgentExecutionResult` MUST 表达推荐结果或阻断原因
- **AND** 系统 MUST NOT 使用旧 `exercise_recommendation` intent 字段独立触发推荐卡片

#### Scenario: 候选不足
- **WHEN** 动作检索工具返回候选不足或无法满足约束
- **THEN** Agent MUST 返回澄清、blocked、failed 或可恢复建议
- **AND** 系统 MUST NOT 通过旧推荐事件展示未通过候选边界的卡片

#### Scenario: 候选检索成功后展示推荐卡片
- **WHEN** Agent 使用 `searchExercises` 或等价工具成功获得用于推荐的候选集合
- **AND** 最终 `AgentExecutionResult` 引用了该工具结果
- **THEN** 服务端 MUST 基于该工具结果生成或投影 `exercise_recommendation` artifact payload
- **AND** `/api/chat` MUST 发送 `artifact_validated` 和 `artifact` 或等价结构化流事件
- **AND** 前端 MUST 能在当前 assistant bubble 中展示推荐卡片
- **AND** 服务端 MUST NOT 仅以纯文本 `answered` 回复吞掉可展示候选集合

#### Scenario: 模型遗漏终止原因但推荐结果合法
- **WHEN** 模型返回 `final_result`，且 `result.status="answered"`、`usedToolResultIds` 引用本轮成功的 recommendation `searchExercises` 工具结果
- **AND** `result` 本身满足 `AgentExecutionResult` 合同，但顶层 `reason` 缺失
- **THEN** Agent runtime MUST 使用诊断用默认 `reason` 完成解析
- **AND** 系统 MUST 继续投影推荐卡片
- **AND** 系统 MUST NOT 改写 `result.status`、`replyContext`、`usedToolResultIds` 或用户语义

### Requirement: Agent 工具名动作必须规范化
系统 SHALL 在不放宽工具输入校验的前提下，将模型输出中 `action` 直接等于已注册工具名的形态规范化为合法 `call_tool` 决策。

#### Scenario: 模型用工具名作为 action
- **WHEN** 模型输出 `{ "action": "askClarification", "input": { ... }, "reason": "..." }`
- **AND** `askClarification` 是当前 Agent registry 中的已注册工具
- **THEN** Agent runtime MUST 将其规范化为 `{ "action": "call_tool", "toolName": "askClarification", "input": { ... }, "reason": "..." }`
- **AND** 规范化后的 input MUST 继续通过该工具原始 Zod schema 校验
- **AND** 系统 MUST NOT 对未注册工具名或缺少 input 的输出执行该规范化

### Requirement: 推荐卡片底部只展示 AI 建议

系统 SHALL 在聊天推荐卡片底部只展示本轮 AI 显式返回的 `assistantSuggestions`，不得展示固定写死的刷新或编排按钮。

#### Scenario: 推荐卡片展示 AI 建议

- **WHEN** 同一条助手消息生成 `exercise_recommendation` 推荐卡片
- **AND** 该消息存在一个或多个 `assistantSuggestions`
- **THEN** 前端 MUST 在推荐卡片底部原操作区展示这些建议
- **AND** 用户点击建议时，前端 MUST 将对应建议的 `message` 作为下一轮用户消息发送

#### Scenario: 推荐卡片没有建议

- **WHEN** 同一条助手消息生成 `exercise_recommendation` 推荐卡片
- **AND** 该消息没有可展示的 `assistantSuggestions`
- **THEN** 推荐卡片底部 MUST NOT 展示“换一批”“编成训练”或等价固定按钮
- **AND** 推荐卡片 MUST 继续展示动作列表、摘要、安全提醒和动作详情入口

#### Scenario: 非推荐消息保留原建议位置

- **WHEN** 助手消息没有生成 `exercise_recommendation` 推荐卡片
- **AND** 该消息存在一个或多个 `assistantSuggestions`
- **THEN** 前端 MUST 继续在消息正文下方展示这些建议

### Requirement: 推荐刷新必须使用 Agent-first 合同
系统 SHALL 将聊天中的动作推荐刷新、换一批和重新生成推荐收敛到 Agent-first 合同。推荐刷新 MUST NOT 调用旧 exercise recommendation AI route，也不得通过服务端自然语言规则重新解释用户本轮意图。

#### Scenario: 用户点击换一批推荐
- **WHEN** 用户在聊天推荐卡片中请求换一批或刷新推荐
- **THEN** 系统 MUST 通过 `/api/chat` 发起可见的 Agent-first 请求，或对已存在 Agent result 执行确定性分页、去重、排除已反馈动作等 result-level 操作
- **AND** 系统 MUST NOT 调用旧 exercise recommendation AI route

#### Scenario: 刷新需要理解用户新约束
- **WHEN** 用户刷新推荐时输入新的自然语言约束
- **THEN** LLM / Agent MUST 负责理解该约束并输出结构化工具调用或澄清
- **AND** 服务端 MUST NOT 通过关键词、正则、同义词表或短句模板替 Agent 改写推荐目标、器械条件、肌群或高层 action

#### Scenario: 推荐候选不足
- **WHEN** Agent-first 推荐刷新无法获得足够候选
- **THEN** 系统 MUST 返回澄清、blocked、failed 或可恢复建议
- **AND** 系统 MUST NOT 回退到旧推荐 route 或旧内部推荐事件展示卡片

### Requirement: 未指定器械的动作推荐必须默认无器械

当用户请求某个训练目标、身体部位或动作类别的纯动作推荐，且没有明确提供可用器械时，系统 SHALL 默认推荐无器械或自重动作。用户明确提供可用器械时，动作推荐 SHALL 使用该器械边界。

#### Scenario: 用户只说明训练部位
- **WHEN** 用户输入“今天我想练胸”或等价纯动作推荐请求
- **AND** Agent 没有读取到当前消息、已确认上下文或用户记忆中的正向可用器械事实
- **THEN** Agent MUST 使用无器械或自重候选生成 `exercise_recommendation`
- **AND** 系统 MUST NOT 因缺少器械条件追问用户

#### Scenario: 用户明确提供可用器械
- **WHEN** 用户输入“我有哑铃，推荐几个练胸动作”或等价请求
- **THEN** Agent MUST 使用哑铃或动作库真实等价器械 facet 检索推荐候选
- **AND** 系统 MUST NOT 用默认无器械覆盖该器械条件

#### Scenario: 用户明确要求不用器械
- **WHEN** 用户输入“推荐几个不用器械的练腿动作”或等价请求
- **THEN** Agent MUST 使用无器械或自重候选生成 `exercise_recommendation`
- **AND** 推荐卡中的动作 MUST 能通过候选 evidence 证明满足无器械边界

