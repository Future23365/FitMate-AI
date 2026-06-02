## MODIFIED Requirements

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
