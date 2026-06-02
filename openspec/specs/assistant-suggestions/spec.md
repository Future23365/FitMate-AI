# assistant-suggestions Specification

## Purpose
TBD - created by archiving change unify-ai-assistant-suggestions. Update Purpose after archive.
## Requirements
### Requirement: AI 建议必须统一为 assistantSuggestions

系统 SHALL 使用统一的 `assistantSuggestions` 表达用户可见建议，覆盖缺信息补充、下一步操作、调整、重试和确认场景。前端 SHALL 优先消费统一建议事件，而不是分别理解多套旧建议字段。

#### Scenario: 服务端输出统一建议事件

- **WHEN** 本轮聊天产生一个或多个用户可见建议
- **THEN** 服务端 MUST 输出 `assistant_suggestions` 或等价统一流事件
- **AND** 每条建议 MUST 包含 `label`、`message`、`kind`、`blocking` 和 `source`
- **AND** 前端 MUST 能通过该统一事件渲染建议 chips

#### Scenario: 旧建议字段兼容归一

- **WHEN** 上游阶段仍返回 `suggestedReplies`、`clarificationReplies`、`adjustmentReplies` 或 artifact 失败建议
- **THEN** 服务端 MUST 将这些旧字段归一化为 `assistantSuggestions`
- **AND** 服务端 MUST 对旧字段执行与新结构相同的口吻、数量、去重和事实校验

#### Scenario: Agent 终止结果输出建议

- **WHEN** Tool-first Agent 本轮返回 `needs_clarification`、`blocked` 或成功推荐后的下一步建议
- **THEN** 服务端 MUST 将 `AgentExecutionResult` 或 Response Writer 投影中的建议输出为 `assistant_suggestions` 流事件
- **AND** 前端 MUST 在当前 assistant bubble 下展示建议 chips
- **AND** 系统 MUST NOT 依赖旧 resolved intent、旧 `assistant_action` 或旧 `suggestedReplies` 事件才能展示建议

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

### Requirement: Blocking 建议优先于非阻断建议

系统 SHALL 使用 `blocking` 表达建议是否必须先处理。阻断建议存在时，服务端 SHALL 避免同时展示会误导用户继续生成或执行的非阻断下一步建议。

#### Scenario: 缺信息时只展示补齐建议

- **WHEN** 当前意图缺少必须字段并产生 `blocking = true` 的 clarification 建议
- **THEN** 服务端 MUST 优先返回这些阻断建议
- **AND** 服务端 MUST NOT 同时返回“生成训练”“开始训练”等非阻断 next action

#### Scenario: 推荐成功后展示下一步建议

- **WHEN** 当前动作推荐已经成功生成
- **AND** 没有阻断确认或缺信息问题
- **THEN** 服务端 MUST 可以返回 `blocking = false` 的 next action 建议

