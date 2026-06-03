## Why

当前聊天链路在用户没有说明器械时，会把 `equipment` 留空，导致 Agent 动作检索和 routine / plan 生成可以落到任意器械候选；这与新的产品规则不一致：未单独提供可用器械时，应默认按无器械训练处理。

这次 change 需要把“未指定器械默认无器械”落成 Agent 工具、训练生成和长期计划门控的结构化合同，避免只靠 prompt 让模型临时理解。

## What Changes

- 将执行型 `searchExercises` 的默认器械边界改为无器械：当本轮结构化输入和已确认上下文都没有正向可用器械时，候选检索 MUST 自动使用无器械 / 自重边界。
- 更新纯动作推荐规则：用户只说训练目标或部位时，推荐卡默认只展示无器械候选；用户明确提供哑铃、弹力带、健身房器械等可用器械时，才使用该器械条件。
- 更新 routine 生成规则：用户提供目标和时长但未提供器械时，routine 的候选检索、draft intent 和保存结果都默认表达无器械。
- 更新长期 plan 门控：器械不再是必须追问的缺失条件；未提供可用器械时，plan 默认按无器械生成。
- 保留已确认可用器械的优先级：当前消息、同会话确认事实或用户记忆中已有正向可用器械时，不应用无器械默认覆盖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-facet-contract`: 增加执行型动作候选检索的默认无器械合同，并明确只由结构化事实决定是否覆盖默认。
- `chat-exercise-recommendation-trigger`: 增加目标明确但未指定器械时，动作推荐默认使用无器械候选的要求。
- `chat-routine-composition`: 增加单次 routine 未指定器械时默认无器械，并同步 draft intent / artifact 边界的要求。
- `plan-push-composition`: 修改长期计划触发门控，移除“缺少器械或场地必须追问”的旧要求，改为默认无器械。

## Impact

- 影响 `lib/server/ai/prompt-config.ts` 中 Agent tool decision 和 final result 的器械默认规则提示。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts` 中 `searchExercises` 输入归一化和工具说明。
- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 中 `generateRoutineDraft` / `generatePlanDraft` 的 intent 默认值。
- 影响 `lib/server/chat/chat-service.ts` 或相关 ContextPackage / memory 事实归一化处，确保已确认可用器械不会被默认无器械覆盖。
- 影响 `tests/agent-orchestrator.test.ts`、`tests/chat-service.test.ts`、`tests/exercise-service.test.ts` 或黑盒 LLM flow 期望。
- 不修改 Prisma Schema、数据库迁移、动作库原始数据、前端外部 API 请求格式或权限边界。
