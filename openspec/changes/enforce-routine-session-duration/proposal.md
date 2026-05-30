## Why

当前 routine 生成链路只强力阻止训练实际估算明显超过用户目标时长，但对“用户要 40 分钟、可执行编排只有 25 分钟”的情况只记录 warning，导致 LLM 声明时长和卡片实际估算不一致。这个问题会让用户误以为卡片算错，实际是生成/修复闭环没有把目标时长当作双向约束。

## What Changes

- 将明确单次时长的 routine 请求视为目标可执行时长约束，而不是仅作为 `estimatedSessionMinutes` 声明字段。
- 当服务端估算时长明显低于用户目标时长时，新增可恢复校验问题，并阻止直接展示未补足的 routine 草稿。
- 自动修复 prompt 在时长不足时要求优先增加主训练容量，例如增加主训练循环轮数、组数、合理次数、训练动作或合理休息，而不是只改 `estimatedSessionMinutes`。
- 强化自动修复后的验收：修复草稿仍需重新通过同一套服务端校验，卡片展示的预估时长必须来自确定性估算。
- 补充相关单元测试，覆盖 routine 时长不足、恢复策略和修复 prompt 指令。

## Capabilities

### New Capabilities

### Modified Capabilities
- `workout-generation-validation-recovery`: 训练草稿校验恢复逻辑需要把目标时长明显不足纳入可恢复失败，并生成补足训练量的修复/引导策略。
- `chat-routine-composition`: 聊天 routine 生成需要保证明确时长请求的可执行估算接近用户目标时长，不能只信任 LLM 声明字段。

## Impact

- 影响服务端训练计划校验与恢复逻辑：`lib/server/workout-plans/workout-plan-validation-service.ts`、`lib/server/workout-plans/workout-plan-validation-recovery-service.ts`。
- 影响 AI routine 自动修复提示词：`lib/server/workout-plans/ai-workout-plan-service.ts`，必要时同步 `lib/server/ai/prompt-config.ts`。
- 影响自动化测试：新增或调整 workout plan validation / recovery / AI prompt 相关测试。
- 不改变 API 响应结构，不新增数据库字段，不影响已保存 routine 的持久化结构。
