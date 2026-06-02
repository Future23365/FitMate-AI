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

#### Scenario: 旧 fallback 逻辑存在
- **WHEN** 旧 `createFallbackWorkoutIntent`、pending replacement 字符串匹配、显式引用关键词或其他服务端文本规则仍存在于代码库
- **THEN** 它们 MUST NOT 在 Agent 前改写 `AgentExecutionState`、`WorkoutEditPlan`、tool decision 或 `AgentExecutionResult`
- **AND** 若仍需保留，MUST 迁移为 Agent 可读状态、工具硬边界或仅测试夹具
