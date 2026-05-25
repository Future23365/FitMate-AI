## Why

训练执行页已有语音开关和基础自检，但自检直接占据主页面控制区，无法集中配置 voice、语速、音量等语音体验，也没有把浏览器能力检测过程以可视化步骤呈现。需要将语音相关能力收拢到一个设置弹窗中，减少训练中页面噪音，并让用户能明确看到当前浏览器是否支持所需 API。

## What Changes

- 在 `/training` 顶部语音开关左侧新增语音设置按钮，点击后打开设置弹窗。
- 设置弹窗允许用户选择浏览器提供的 voice，并调整语音播报相关本地配置。
- 设置弹窗提供“全流程自检”，以步骤列表可视化展示 Web Speech、voice 加载、语音播放事件、Web Audio 节奏音等检测结果。
- 设置弹窗展示本功能使用到的浏览器 API 以及可运行的浏览器版本范围。
- 删除原训练页右侧控制区内的旧自检入口和旧自检结果面板。

## Capabilities

### New Capabilities
- `workout-voice-settings-diagnostics`: 训练执行页语音设置弹窗、自检流程可视化和浏览器 API 兼容说明。

### Modified Capabilities
- `workout-session-voice-broadcast`: 语音播报控制入口从单一开关扩展为开关加设置弹窗，并移除主页面内嵌自检。

## Impact

- 影响 `features/workouts/components/workout-session-page.tsx` 的顶部控制区、右侧训练控制区和语音设置 UI。
- 影响 `features/workouts/voice/workout-voice-self-check.ts` 的自检结果模型与执行步骤。
- 可能影响 `features/workouts/hooks/use-workout-voice-broadcast.ts` 和 `features/workouts/voice/workout-voice-session.ts`，用于传入用户选择的 voice 或本地播报配置。
- 不新增服务端 API，不调用 AI，不持久化到数据库；所有配置保持浏览器本地状态。
