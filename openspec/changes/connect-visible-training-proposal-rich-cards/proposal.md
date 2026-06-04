## Why

当前 `/api/chat` 已经把动作推荐、训练编排和训练计划统一收敛到 `final_answer.visibleOutputs[]` 的 `visibleTrainingProposal`，但前端仍用轻量 `VisibleTrainingProposalPanel` 展示这份结构化事实，旧的 `ExerciseRecommendationCard`、`WorkoutRoutineDraftCard` 和 `WorkoutPlanDraftCard` 还没有接入新主链。用户需要继续使用旧三张富卡片的动作详情、保存、导入和建议交互，同时不能为了 UI 形态回退或拆分 AI 输出合同。

## What Changes

- 新增前端适配层，将已校验的 `visibleTrainingProposal` 转换为旧三张富卡片的展示数据：
  - `kind = "exercise_selection"` 渲染为 `ExerciseRecommendationCard`
  - `kind = "routine"` 渲染为 `WorkoutRoutineDraftCard`
  - `kind = "plan"` 渲染为 `WorkoutPlanDraftCard`
- 保持 `visibleTrainingProposal` 作为唯一训练事实源；`message.visibleOutputs` 继续保存原始结构化输出，正文 `content` 只作为解释文本。
- 不修改 `AgentAction`、`final_answer.visibleOutputs[]`、`visibleTrainingProposal.payload`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 或跨轮事实桥合同。
- 前端适配只负责展示结构转换、动作详情补齐和旧卡片交互复用；不得把旧 `bubblePlans`、`bubbleRoutines`、`bubbleExerciseRecommendations` 重新作为新消息事实源。
- 旧历史消息中已有的 `bubblePlans`、`bubbleRoutines`、`exerciseRecommendations` 继续兼容展示；新 Agent 消息优先从 `visibleOutputs` 渲染富卡片。
- 计划卡片适配必须遵守当前 `visibleTrainingProposal` 计划合同：同一套 `warmup` / `training` / `stretch` 编排加 `schedule.assignments`，不得要求模型输出每天不同的完整动作编排。

## Capabilities

### New Capabilities
- `chat-visible-training-rich-cards`: 定义聊天气泡如何从 `visibleTrainingProposal` 渲染旧三张训练富卡片，并保持 AI 输出合同、事实桥和旧历史兼容边界稳定。

### Modified Capabilities
- 无。现有 AI 输出、tool、事实桥和训练生成能力不改变需求合同；本 change 只新增前端富卡片消费能力。

## Impact

- 前端聊天页：`features/chat/components/chat-page.tsx`
- 前端聊天事件与历史：`features/chat/types.ts`、`features/chat/hooks/use-chat-controller.ts`、`features/chat/lib/chat-history.ts`
- 新增或调整前端 adapter：`features/chat/lib/*`
- 复用现有卡片组件：`features/exercises/components/exercise-recommendation-card.tsx`、`features/workouts/components/workout-routine-draft-card.tsx`、`features/workouts/components/workout-plan-draft-card.tsx`
- 测试：前端 adapter 单测、聊天事件消费测试、卡片渲染回归测试，以及按需运行 `npm run typecheck`
