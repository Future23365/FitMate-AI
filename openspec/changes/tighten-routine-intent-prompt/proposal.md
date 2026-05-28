## Why

当前聊天意图解析可能返回互相矛盾的结构：顶层 `type` 是 `exercise_recommendation`，但 `workoutIntent.intentType` 是 `routine`。当用户已经明确说出训练目标、时长和器械条件时，这会导致系统推送动作推荐卡片，而不是单次训练编排。

本次变更需要让 LLM 的结构化回复只表达一个用户意图，优先通过 prompt 约束消除“动作推荐”和“单次编排”混用的问题。

## What Changes

- 收紧聊天意图解析 prompt：当用户表达本次训练目标并提供训练时长、器械或场地条件时，顶层 `type` 必须为 `routine`。
- 明确 `exercise_recommendation` 只用于用户单纯想看动作清单、动作示例或换一批动作，且没有表达本次训练编排需求的场景。
- 明确顶层 `type` 与 `workoutIntent.intentType` 不能语义冲突。
- 增加针对“练腿，20分钟，没有器械”这类输入的验证覆盖，确保走 `workout_routine` 推送路径。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-routine-composition`: 调整聊天意图解析对单次训练需求的判定要求，避免明确时长的本次训练请求被解析为动作推荐。

## Impact

- 影响 `lib/server/ai/prompt-config.ts` 中 `/api/chat` 意图解析 prompt。
- 影响聊天流中 `assistant_action` 的动作类型选择。
- 需要补充或更新聊天意图解析相关测试。
