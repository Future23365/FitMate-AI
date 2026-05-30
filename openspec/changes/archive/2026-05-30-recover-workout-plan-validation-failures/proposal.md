## Why

当前 AI 生成的训练草稿只要没有通过服务端校验，就会以“计划生成失败”终止展示。像 `session_too_long` 这类问题本质上是训练方案需要调整，不应打断用户，而应先自动修复或引导用户继续对话。

## What Changes

- 将训练草稿校验失败分为可恢复和不可恢复两类。
- 对可恢复问题（如时长超出、训练量偏高、声明时长不一致）先把校验结果反馈给 LLM 自动修复一次。
- 自动修复后仍失败时，前端展示对话式引导，而不是终止型错误卡片。
- 保留动作 ID、候选集合、三段式 routine 结构、Schema 等硬边界；这些失败仍走结构修复或失败提示，不直接放行错误草稿。
- 不删除服务端校验，只改变校验失败后的恢复策略和用户体验。

## Capabilities

### New Capabilities
- `workout-generation-validation-recovery`: 定义训练草稿校验失败后的自动修复、可恢复错误返回和聊天引导行为。

### Modified Capabilities
- `chat-routine-composition`: 单次 routine 校验失败时应尝试自动修复或引导用户调整，而不是直接终止。
- `plan-push-composition`: 长期 plan 校验失败时应尝试自动修复或引导用户调整，而不是直接终止。

## Impact

- 影响 `/api/ai/workout-plan` 的失败处理和响应结构。
- 影响 AI 训练草稿生成 prompt，新增基于校验结果的修复请求。
- 影响聊天前端的 silent plan generation 错误处理和引导消息展示。
- 影响 `lib/server/workout-plans/workout-plan-validation-service.ts` 周边调用，不要求删除现有校验规则。
- 需要补充服务端测试和前端/Hook 层失败恢复测试。
