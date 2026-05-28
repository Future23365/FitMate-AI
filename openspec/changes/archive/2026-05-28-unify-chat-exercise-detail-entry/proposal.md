## Why

聊天推送中的单独动作推荐、动作编排和长期计划卡片当前各自实现动作详情入口：有的整卡可点，有的标题旁显示 `info` 图标，有的 hover 后显示“查看教学”。这些差异会让用户在两列动作卡片中误触或找不到统一的详情入口。

需要统一为更节省空间的右上角 hover 详情按钮：默认不占文字空间，hover/focus 时强化显示，只有点击该按钮才打开动作详情抽屉。

## What Changes

- 统一聊天动作卡片的详情入口为右上角 `info` icon button。
- 单独动作推荐、动作编排和长期计划中的动作卡片不再通过整张卡片或整行动作点击打开详情。
- 详情按钮默认以低干扰样式存在，hover/focus 时显示更明确的可点击状态。
- 继续复用现有 `ExercisePreviewSheet` 展示动作详情，不新增详情面板。
- 安全提醒仍保留 warning 语义和 amber 样式，不与动作详情入口混用。

## Capabilities

### New Capabilities
- `chat-exercise-detail-entry`: 约束聊天中动作卡片详情入口的统一位置、触发方式和抽屉复用规则。

### Modified Capabilities

无。

## Impact

- 影响前端组件：
  - `features/exercises/components/exercise-recommendation-card.tsx`
  - `features/workouts/components/workout-routine-draft-card.tsx`
  - `features/workouts/components/workout-plan-draft-card.tsx`
- 可能新增或提取一个小型共享 UI 组件，用于统一右上角动作详情按钮样式。
- 不影响 API、AI 输出结构、数据库模型、训练保存逻辑或动作详情数据来源。
