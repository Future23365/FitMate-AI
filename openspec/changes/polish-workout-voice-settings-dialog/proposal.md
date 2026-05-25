## Why

训练语音设置弹窗已经具备 voice 选择、自检和浏览器 API 版本说明，但当前信息层级仍偏基础：中文 voice 不够优先，弹窗打开缺少明确空间层次，自检失败后的恢复建议不够具体，浏览器版本信息也缺少直观识别。需要做一次聚焦的体验打磨，让用户更快选到中文 voice，并更容易理解浏览器能力和故障处理方式。

## What Changes

- voice 下拉列表优先展示 `zh-CN` voice，再展示其他中文 voice，最后展示非中文 voice。
- 打开语音设置弹窗时增加弹窗进入动画，并让主训练页面产生向后缩的视觉效果。
- 自检失败时，如果 Web Speech / Web Audio 运行时 API 本身可用，则提示用户可以尝试重启浏览器后再检测。
- 浏览器 API 版本说明中为 Chrome、Edge、Firefox、Safari、iOS Safari 增加彩色浏览器图标。

## Capabilities

### New Capabilities

### Modified Capabilities
- `workout-voice-settings-diagnostics`: 打磨 voice 排序、弹窗动效、自检失败恢复建议和浏览器 API 版本展示。

## Impact

- 主要影响 `features/workouts/components/workout-session-page.tsx` 的语音设置弹窗 UI、voice 列表排序和兼容信息展示。
- 可能影响 `features/workouts/voice/workout-voice-self-check.ts` 的自检结果文案或失败原因表达。
- 不新增服务端 API、不修改数据库、不改变训练计时、语音开关语义或训练流程。
