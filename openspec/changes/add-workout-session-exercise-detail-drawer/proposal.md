## Why

训练中页面的动作示范区只能在流程内被动展示图片，用户如果想确认当前动作的完整要点、肌群、器械和分步动画，需要离开训练节奏去其他页面查找。这个能力应该直接出现在当前动作旁，并且查看详情时自动暂停，避免训练计时在用户阅读动作细节时继续推进。

## What Changes

- 在 `/training` 左侧动作示范模块新增“动作详情”按钮。
- 点击“动作详情”后自动暂停当前训练流程，包括计时、计次、准备倒计时和语音播报推进。
- 右侧打开现有共享 `ExercisePreviewSheet`，展示当前动作详情，并复用前面动作详情抽屉的动画、图片轮播和信息布局。
- 关闭抽屉后保持暂停状态，由用户明确点击“继续”恢复训练。
- 不改变训练计划生成规则、训练 timeline、动作数据结构、AI 编排或服务端 API 契约。

## Capabilities

### New Capabilities

- `workout-session-exercise-detail-drawer`: 覆盖训练中页面当前动作详情入口、打开时自动暂停、以及复用共享动作详情抽屉的展示行为。

### Modified Capabilities

- None.

## Impact

- 影响 `features/workouts/components/workout-session-page.tsx` 的动作示范区和暂停状态处理。
- 复用 `features/exercises/components/exercise-preview-sheet.tsx`，不新增独立详情抽屉实现。
- 可能需要补充训练执行页相关测试或类型检查，验证自动暂停和抽屉打开状态。
