## Why

最新 AI trace 显示，意图解析已经返回 `canTriggerAction = false`、`missingActionFields` 和 `suggestedReplies`，但服务端仍因为 `exercise_recommendation` 的目标字段非空触发了动作推荐事件，导致“需要追问”和“已经推送动作”同时出现。

这会让用户看到的行为与意图判断不一致，也会把 Schema 默认值误当成可执行条件继续生成结果。

## What Changes

- 收紧 `exercise_recommendation` 的服务端触发边界：当意图解析存在阻塞缺失项时，不再仅凭目标字段兜底触发内部动作事件。
- 保留纯动作推荐的低门槛：目标或部位明确、且缺失项只是不应阻塞推荐的字段时，仍允许推荐动作。
- 确保 `suggestedReplies` 与内部动作状态一致：未触发动作时展示建议回复，已触发动作时隐藏建议回复。
- 补充单测覆盖“建议追问阻塞动作推荐”和“目标明确仍可推荐动作”两个边界。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `chat-exercise-recommendation-trigger`: 调整动作推荐触发规则，要求服务端尊重仍然阻塞的缺失字段。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的内部动作触发判断。
- 影响 `lib/server/ai/prompt-config.ts` 中动作推荐意图提示与服务端边界的一致性。
- 影响 `tests/chat-service.test.ts` 中动作推荐触发边界测试。
- 不改变 API 契约、数据库结构或前端组件结构。
