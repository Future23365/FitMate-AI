## MODIFIED Requirements

### Requirement: 长期计划动作必须来自服务端候选集合
系统 SHALL 对长期计划草稿中的所有动作 ID 进行服务端校验，确保 AI 只能使用本次 Agent 工具候选集合中的动作。

#### Scenario: Agent 返回计划草稿
- **WHEN** Agent plan draft 工具或等价 Agent-first 计划生成结果返回长期计划草稿
- **THEN** 系统 MUST 使用 Zod schema 校验草稿结构
- **AND** 系统 MUST 校验所有 `exerciseId` 存在于数据库动作库
- **AND** 系统 MUST 校验所有 `exerciseId` 来自本次 Agent tool result、candidateSetId、`primaryExercises` 或 `supplementaryExercises`
- **AND** 系统 MUST NOT 通过旧 `/api/ai/workout-plan` route 生成聊天计划草稿

#### Scenario: AI 编造动作 ID
- **WHEN** 长期计划草稿包含不存在或不在候选集合中的 `exerciseId`
- **THEN** 系统 MUST 拒绝该草稿作为有效计划
- **AND** 系统 MUST 记录可用于 AI Trace 排查的校验失败信息

## ADDED Requirements

### Requirement: 旧计划草稿接口不得作为聊天入口
系统 SHALL 删除旧 `/api/ai/workout-plan` 聊天计划草稿入口。聊天中的长期计划 MUST 来自 Agent plan draft / validation / policy / persistence 工具链和 `AgentExecutionResult`。

#### Scenario: 聊天请求长期计划
- **WHEN** 用户在聊天中请求长期计划、周期计划或每周安排
- **THEN** 系统 MUST 通过 `/api/chat` Agent-first 主链生成、澄清或阻断
- **AND** 系统 MUST NOT 从前端调用 `/api/ai/workout-plan`

#### Scenario: 旧 plan trigger 出现在 assistant 文本
- **WHEN** assistant 文本中出现 `workout_plan_trigger` 或历史遗留 plan trigger JSON
- **THEN** 前端新流 MUST NOT 解析该文本来触发长期计划卡片
- **AND** 长期计划卡片 MUST 只由 Agent stream/result 合同触发
