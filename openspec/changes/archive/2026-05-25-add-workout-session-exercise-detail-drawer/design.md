## Context

`/training` 当前由 `features/workouts/components/workout-session-page.tsx` 驱动，训练流程推进、计时/计次、准备倒计时和语音播报都受同一个 `isPaused` 状态影响。动作详情抽屉已经通过 `features/exercises/components/exercise-preview-sheet.tsx` 在动作编排、计划草稿和推荐卡片中复用，具备右侧抽屉动画、多图展示和详情信息布局。

## Goals / Non-Goals

**Goals:**

- 在训练执行页当前动作示范模块提供明确的“动作详情”入口。
- 点击入口时立刻复用现有暂停状态暂停当前流程，避免计时、计次或准备倒计时继续推进。
- 复用 `ExercisePreviewSheet` 的抽屉、动画和详情展示，保证和前面动作详情抽屉体验一致。
- 关闭抽屉后保持暂停，由用户主动恢复训练，避免阅读完成后流程突然继续。

**Non-Goals:**

- 不新增训练动作字段，不修改 `buildWorkoutTimeline()`。
- 不改动作库详情抽屉的通用视觉规则。
- 不改变语音播报规则、AI 编排、计划生成或服务端 API。

## Decisions

1. 在 `WorkoutSessionPage` 内维护当前详情抽屉的打开状态，并把 `currentItem` 作为 `ExercisePreviewSheet` 的 `exercise` 输入。
   - 理由：当前动作已经由 timeline 派生，按钮只需要展示“当前动作”的详情；不需要引入跨组件状态或路由参数。
   - 取舍：抽屉打开状态属于训练页局部 UI 状态，关闭后不会恢复训练进度控制权。

2. 点击“动作详情”时直接调用 `setIsPaused(true)`，而不是新增独立的 `pauseReason`。
   - 理由：现有计时、计次、准备倒计时和语音播报已经统一依赖 `isPaused`，复用它可以保证所有流程一致暂停。
   - 取舍：如果用户打开详情前已经暂停，行为保持不变；如果关闭抽屉后需要继续训练，仍由现有“继续”按钮完成。

3. 在左侧动作示范模块内放置按钮，并使用 Material Symbols 图标与现有训练页操作按钮风格保持一致。
   - 理由：入口和动作示范强关联，放在示范模块内比放到底部控制区更符合“查看当前动作”的语义。
   - 取舍：按钮只作为查看入口，不承担恢复或跳步职责。

## Risks / Trade-offs

- [Risk] `ExercisePreviewSheet` 对传入 exercise 结构有字段要求，训练 `WorkoutItem` 与动作库 `Exercise` 类型必须兼容。 → Mitigation：实现时读取类型定义并只传递已存在、被共享抽屉使用的当前动作对象；必要时补齐局部适配但不改数据模型。
- [Risk] 训练完成或切换 plan 时抽屉仍打开会展示过期动作。 → Mitigation：当当前动作变化或训练状态重置时，抽屉仍绑定最新 `currentItem`；如果没有可展示动作则关闭。
- [Risk] 关闭抽屉后用户可能预期自动恢复。 → Mitigation：规格明确关闭后保持暂停，避免用户还未准备好时流程自动推进。
