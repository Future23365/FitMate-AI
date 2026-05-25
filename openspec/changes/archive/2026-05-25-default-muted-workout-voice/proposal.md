## Why

训练页首次进入时自动播报容易打断用户当前环境，也可能在未明确授权的情况下播放声音。需要把首次进入改为静音，并通过右上角播报控制旁的轻量提示引导用户主动开启声音。

## What Changes

- 将 `/training` 的语音播报本地默认值改为关闭；已有 `localStorage` 偏好继续优先生效。
- 在右上角语音播报按钮附近首次展示一次带箭头的轻量提示，说明可在此开启声音控制开关，后续进入不再自动弹出。
- 用户点击开关后继续把启用/关闭状态写入 `localStorage`，后续进入训练页沿用用户选择。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `workout-session-voice-broadcast`: 调整首次进入默认静音、用户本地偏好持久化和右上角一次性开启提示的规格。

## Impact

- 影响 `features/workouts/hooks/use-workout-voice-broadcast.ts` 中的语音播报偏好读取默认值。
- 影响 `features/workouts/components/workout-session-page.tsx` 中右上角播报按钮的默认状态和一次性提示 UI。
- 不改变训练 timeline、计时、计次、动作切换、AI 调用或服务端 API。
