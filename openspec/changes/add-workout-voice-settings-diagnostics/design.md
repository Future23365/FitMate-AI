## Context

`/training` 当前通过顶部音量按钮控制语音播报，`useWorkoutVoiceBroadcast()` 内部创建 `WorkoutVoiceSession`，语音参数来自共享的 `workoutVoiceBroadcastConfig`。旧自检入口位于右侧“训练控制”面板，结果以 `events` 字符串展示，不能配置 voice，也不能清楚说明 Web Speech API 和 Web Audio API 的检测步骤。

## Goals / Non-Goals

**Goals:**
- 将语音设置、自检和浏览器 API 兼容说明集中到顶部设置弹窗，减少训练主界面的常驻信息。
- 允许用户选择浏览器当前可用 voice，并调整语速、音量、音调和节奏音量等本地配置。
- 让训练播报和自检共享同一份本地配置，避免设置页和实际播报行为不一致。
- 以结构化步骤显示全流程自检结果，覆盖 API 支持、voice 加载、语音播放事件和 Web Audio 节奏音。

**Non-Goals:**
- 不新增服务端 API、数据库字段或用户账号级配置同步。
- 不引入语音识别、麦克风权限、AI 音频生成或服务端音频持久化。
- 不改变训练计时、自动推进、动作编排和计划加载逻辑。

## Decisions

1. 语音配置保存在 `localStorage`，运行时合并到 `workoutVoiceBroadcastConfig`。
   - 原因：这些设置只影响当前浏览器的播报体验，不属于训练计划或用户业务数据。
   - 取舍：跨设备不同步，但避免引入数据库迁移和权限隔离复杂度。

2. 在 `WorkoutVoiceBroadcastConfig.speech` 中增加可选 `voiceURI`，并让 `WorkoutVoiceSession` 支持运行时更新配置。
   - 原因：voice 选择需要影响真实训练播报，不应只影响自检。
   - 取舍：配置变化只影响后续语音任务；正在播放的语音不强制重启，避免打断训练。

3. 自检结果使用 `steps` 结构表达检测过程，保留底层 `events` 便于开发日志排障。
   - 原因：UI 需要可视化每个检测步骤，事件字符串不适合稳定展示。
   - 取舍：自检模块承担更多状态整理职责，但页面组件更简单，也便于后续测试。

4. 设置弹窗使用本项目现有 Tailwind 和 `SymbolIcon` 直接实现，不新增 UI 依赖。
   - 原因：项目当前没有 `components/ui` 的 Dialog/Select 组件，新增依赖会扩大范围。
   - 取舍：需要手写焦点和关闭交互的基础处理，但本次弹窗范围可控。

## Risks / Trade-offs

- [Risk] 不同浏览器和系统暴露的 voice 列表可能为空或延迟加载 → 自检和弹窗都监听 `voiceschanged` 并提供默认 voice 回退。
- [Risk] 浏览器自动播放策略可能阻止语音或 Web Audio → 自检必须由用户点击触发，并把 blocked/error 状态展示为可理解的失败步骤。
- [Risk] 用户选择的 voice 后续不存在 → 配置保留，但运行时回退到中文 voice 或默认 voice，并在设置 UI 中显示当前未匹配。
- [Risk] 浏览器兼容版本信息会变化 → 页面展示为基于当前 MDN / Can I Use 的参考范围，并继续以运行时能力检测为最终判断。
