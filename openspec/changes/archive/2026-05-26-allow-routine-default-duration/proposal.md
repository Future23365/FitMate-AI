## Why

当用户已经给出明确动作列表并要求“编成一套训练”时，当前意图解析仍可能因为没有明确训练时长而只追问补充信息，导致不会生成训练编排列表。这个场景已经具备足够的训练内容边界，应允许系统先用默认估算时长生成，并在可见回复中提示用户后续可以补充时长调整。

## What Changes

- 调整聊天意图解析规则：用户提供明确动作列表并要求生成单次训练编排时，允许使用默认或估算的 `sessionMinutes` 并触发 `workout_routine`。
- 调整聊天可见回复规则：当系统使用默认估算时长时，应自然告知用户未提供具体训练时长，并说明可以继续补充时长调整。
- 在 `README.md` 的 TODO 中记录后续用户画像能力：基于用户画像推测默认训练时长。

## Capabilities

### New Capabilities

- `chat-routine-default-duration`: 聊天单次训练编排在明确动作列表场景下允许默认估算训练时长，并通过可见回复提示用户可调整。

### Modified Capabilities

- 无。

## Impact

- 影响 `lib/server/ai/prompt-config.ts` 中聊天意图解析与聊天回复提示词。
- 影响 `README.md` 中 AI 能力 TODO。
- 不改变 API 契约、数据库结构、前端流事件结构或训练计划生成接口。
