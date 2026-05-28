## Why

最新 trace 显示，用户已明确输入“20分钟”，`serverWorkoutIntent.sessionMinutes` 也为 20，但聊天可见回复仍套用了“你还没有告诉我具体训练时长”的默认估算模板。

问题不在意图识别，而在 `chatCompletion` prompt 中默认估算时长提示过于具体，模型容易直接照抄示例句。本次变更将该提示调松，改为根据服务端上下文自然表达。

## What Changes

- 调整聊天可见回复 prompt：有 `serverWorkoutIntent.sessionMinutes` 时按该时长自然描述本次训练。
- 调整默认估算提示：仅在服务端上下文没有明确 `sessionMinutes` 时，用宽泛语言说明先按估算时长整理。
- 移除容易被模型照抄的固定模板句。
- 增加测试覆盖，确保 prompt 不再包含“你还没有告诉我具体训练时长”这类固定句式，并包含按结构化时长表达的要求。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-routine-default-duration`: 调整默认估算时长的可见回复边界和表达方式。

## Impact

- 影响 `lib/server/ai/prompt-config.ts` 中 `/api/chat` 可见回复 prompt。
- 影响 routine 触发后的自然语言过渡回复。
- 需要更新聊天服务 prompt 相关测试。
