## MODIFIED Requirements

### Requirement: 聊天主链路必须产出唯一 resolved intent

系统 SHALL 将旧 resolved intent 降级为兼容和诊断输出。生产 `/api/chat` 主执行合同 SHALL 是 `AgentExecutionResult`，而不是旧 `type + action.kind + responseMode` 决策树。

#### Scenario: 用户请求可执行训练结果
- **WHEN** 用户提出动作推荐、单次 routine、长期 plan 或已有 artifact 调整请求
- **THEN** 系统 MUST 进入 Tool-first AgentOrchestrator
- **AND** Agent MUST 通过工具读取事实、查询候选、生成 draft 或 patch、校验并返回 `AgentExecutionResult`
- **AND** 后续回复生成和卡片生成 MUST 使用 `AgentExecutionResult`
- **AND** 旧 resolved intent MAY 作为兼容事件从 Agent 结果派生，但 MUST NOT 独立触发卡片

#### Scenario: 系统存在旧版 intent 字段
- **WHEN** 系统仍需要兼容旧的 `type`、`workoutIntent`、`canTriggerAction`、`suggestedReplies` 或 resolved intent 字段
- **THEN** 这些字段 MUST 从 Agent 工具执行结果派生
- **AND** 系统 MUST NOT 让旧字段成为另一个可独立触发卡片的事实来源

## ADDED Requirements

### Requirement: 服务端不得在 Agent 前执行高层语义纠偏

系统 SHALL 禁止 `/api/chat` 在 Agent tool loop 前使用服务端关键词、正则、短句模板或历史摘要推断改写用户高层语义。

#### Scenario: 用户发送短指令
- **WHEN** 用户发送“换一个”“不用哑铃”“简单点”“改成在家练”或等价短指令
- **THEN** 服务端 MUST 将原始用户消息、真实 recent messages 和 recent artifact 摘要交给 Agent
- **AND** LLM MUST 通过工具读取事实并决定含义
- **AND** 服务端 MUST NOT 在 Agent 前把该消息改写成 `exercise_replacement`、`routine`、`workout_patch` 或其他高层 action

#### Scenario: LLM 工具计划和服务端旧规则冲突
- **WHEN** Agent 的工具计划与旧 intent normalize 或关键词 gate 结果不一致
- **THEN** 系统 MUST 以 Agent tool result 和服务端硬校验为准
- **AND** 旧规则 MUST NOT 覆盖 Agent 决策
