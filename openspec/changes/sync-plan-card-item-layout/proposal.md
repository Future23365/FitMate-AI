## Why

长期计划卡片和单次动作编排卡片都在聊天流中展示动作条目，但当前长期计划的条目布局、间距、标签和备注位置与编排卡片不一致。用户理解上计划只是比编排多了训练天数，因此动作条目本身应保持同一套视觉和信息结构。

## What Changes

- 将长期计划草稿卡片中每天的动作条目布局同步为单次动作编排卡片的条目布局。
- 长期计划保留训练日切换、当天焦点、预估用时、安全建议和排班设置等“多天计划”能力。
- 动作条目内部统一使用图片、动作名、器械与主要肌群、备注、组数和目标次数/时长的展示结构。
- 继续复用现有 `ExerciseDetailIconButton` 和 `ExercisePreviewSheet`，不新增详情入口交互。
- 不改变 AI 输出结构、API 契约、数据库模型、训练保存逻辑或计划生成规则。

## Capabilities

### New Capabilities

- `chat-plan-card-item-layout`: 约束聊天长期计划卡片中的动作条目必须复用单次动作编排卡片的信息结构和视觉布局，只保留计划层的多天容器差异。

### Modified Capabilities

无。

## Impact

- 影响前端组件：
  - `features/workouts/components/workout-plan-draft-card.tsx`
  - `features/workouts/components/workout-routine-draft-card.tsx`
- 可能提取共享的动作条目展示组件或局部渲染函数，用于消除计划卡片和编排卡片的重复布局。
- 不影响 `features/chat/components/chat-page.tsx` 的卡片分发逻辑。
- 不影响 API、AI 编排、Zod 校验、Prisma Schema 或持久化结构。
