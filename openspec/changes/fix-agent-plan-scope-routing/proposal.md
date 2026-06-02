## Why

当前 Tool-first Agent 在处理“我想减脂，每周 4 练，每次 45 分钟，目前没有器械”这类请求时，会因为“每次 45 分钟”命中 routine 强提示而走 `searchExercises(candidateUse="routine") -> generateRoutineDraft`，最终保存为 `kind = "routine"` 的单次编排。用户明确表达了每周训练安排，这应当生成长期 `plan`，不能用单日 routine 伪装为多天计划。

本 change 先修复 plan / routine scope 路由合同，不处理无器械候选集合边界；器械候选 proof 收紧应放入独立 change。

## What Changes

- 强化 Agent prompt 与 tool capability 合同：用户明确请求一周、多周、周期、长期计划、每周训练安排或 `weeklyFrequency > 1` 时，Agent 必须优先进入 `plan` 工具链。
- 收紧 `generateRoutineDraft` 合同：routine 工具不得消费模型明确输出的长期计划频率作为成功单次编排；遇到 `intentType="routine"` 且结构化意图显示长期计划 scope 时，应返回可恢复反馈，引导模型改走 `generatePlanDraft`。
- 保持服务端语义边界：服务端不读取用户原文做关键词纠偏，只校验模型结构化工具输入与工具合同是否自洽。
- 补充回归测试和黑盒验证步骤，覆盖“每周 4 练，每次 45 分钟”应生成 `workout_plan`，以及“今天/这次/单次 45 分钟”仍应生成 `workout_routine`。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `plan-push-composition`: 明确 Tool-first Agent 下，每周、多天、周期性训练请求必须走 plan draft / validation / policy / persistence 工具链。
- `chat-routine-composition`: 明确 routine draft 工具不得成功消费长期计划 scope，必须将此类合同冲突转为可恢复反馈。
- `tool-first-agent-orchestrator`: 明确 Agent repair loop 必须能把 routine / plan scope 合同冲突反馈给模型，并要求模型改用正确工具链。

## Impact

- 影响模块：
  - `lib/server/ai/prompt-config.ts`
  - `lib/server/agent-orchestrator/readonly-tools.ts`
  - `lib/server/agent-orchestrator/workout-tools.ts`
  - `lib/server/agent-orchestrator/runtime.ts`
  - `tests/agent-orchestrator.test.ts`
  - `tests/workout-plan-validation.test.ts`
  - `manual-tests/llm/*` 或相关黑盒 flow fixture / assertion
- 不涉及数据库迁移、Prisma schema、前端 UI 或动作候选无器械 proof。
- 不改变 `searchExercises` 的无器械 facet 语义；该问题后续单独处理。
