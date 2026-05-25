## Why

训练执行页语音播报当前由多个 React effect 直接触发 `startSpeech()`，而 `startSpeech()` 每次都会取消当前 speech job。实际运行中，开启语音后的动作介绍会被计次、倒计时或步骤切换播报抢占，导致用户只能听到零散数字或计时 beep，看起来像“没有声音”。

这个问题不是单个浏览器兼容问题，也不适合继续用局部条件判断修补。语音播报需要被重构成一个明确的会话调度模型，并把播报文案、间隔、等待时长等规则收口到开发者可调整的配置文件，避免后续每次调节播报规则都改业务代码。

## What Changes

- 重构 `/training` 语音播报实现，将动作介绍、步骤切换、准备倒计时、计次播报和计时 beep 纳入统一语音会话调度器。
- 用队列、优先级、去重和取消策略替代“每次新播报都取消当前播报”的抢占式实现。
- 明确高优先级播报和低优先级播报的关系：动作准备提示不能被计次或倒计时抢断，步骤切换可以取消旧步骤播报，关闭/暂停/离开页面必须清空所有任务。
- 新增开发者配置文件，用于配置播报文案模板、语音速率、音量、准备倒计时间隔、计次播报间隔、beep 间隔、speech fallback 超时和无声降级等待时长。
- 将语音文案生成从 hook 中迁出为基于配置和 timeline 数据的纯函数，保留服务端无关、无 AI、无麦克风、无音频持久化的边界。
- 补充单元测试和运行时验证，覆盖开启语音后动作介绍不被计次抢断、准备倒计时按顺序播报、beep 与 speech 独立、刷新后需要激活、配置项生效等关键路径。

## Capabilities

### New Capabilities
- `workout-voice-rule-configuration`: 定义训练语音播报配置文件的结构、可配置项、默认值、校验规则和开发者调整边界。

### Modified Capabilities
- `workout-session-voice-broadcast`: 修改训练语音播报调度、队列、优先级、取消、准备倒计时、计次播报和 Web Audio beep 的要求。

## Impact

- 影响 `features/workouts/hooks/use-workout-voice-broadcast.ts`，需要重构为更清晰的语音会话调度器或改为调用独立控制器。
- 影响 `features/workouts/components/workout-session-page.tsx` 中训练状态与语音完成事件的接入方式。
- 影响 `lib/shared/workouts/voice-cues.ts`，需要改为读取或应用语音规则配置生成播报文本。
- 新增语音播报配置模块，例如 `features/workouts/config/workout-voice-broadcast-config.ts` 或 `lib/shared/workouts/voice-broadcast-config.ts`。
- 影响测试文件，需新增或扩展语音调度器、语音配置、训练页语音接入相关测试。
- 不改变训练计划生成、动作选择、数据库结构、API 契约、AI 编排或服务端音频能力。
