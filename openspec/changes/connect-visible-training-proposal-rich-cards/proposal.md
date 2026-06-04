## Why

当前 `/api/chat` 已经把动作推荐、训练编排和训练计划统一收敛到 `final_answer.visibleOutputs[]` 的 `visibleTrainingProposal`，但前端仍用轻量 `VisibleTrainingProposalPanel` 展示这份结构化事实，旧的 `ExerciseRecommendationCard`、`WorkoutRoutineDraftCard` 和 `WorkoutPlanDraftCard` 还没有接入新主链。这个轻量面板是此前为了先验证新链路而临时写出的极简展示，不是用户要求的目标样式；目标展示必须回到旧三张富卡片。项目仍处于开发阶段，本 change 采用 no-compatibility 边界：只保留 `visibleOutputs[]` 作为新训练卡片事实源，旧 `bubble*` 历史状态不再兼容展示，必要时直接清理开发环境历史记录，避免前端长期保留两套事实入口。

## What Changes

- 新增前端适配层，将已校验的 `visibleTrainingProposal` 转换为旧三张富卡片的展示数据：
  - `kind = "exercise_selection"` 渲染为 `ExerciseRecommendationCard`
  - `kind = "routine"` 渲染为 `WorkoutRoutineDraftCard`
  - `kind = "plan"` 渲染为 `WorkoutPlanDraftCard`
- 保持 `visibleTrainingProposal` 作为唯一训练事实源；`message.visibleOutputs` 继续保存原始结构化输出，正文 `content` 只作为解释文本。
- 不修改 `AgentAction`、`final_answer.visibleOutputs[]`、`visibleTrainingProposal.payload`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 或跨轮事实桥合同。
- 前端适配只负责展示结构转换、动作详情补齐和旧卡片已有保存 / 导入 / 详情交互复用；不得把旧 `bubblePlans`、`bubbleRoutines`、`bubbleExerciseRecommendations` 重新作为消息事实源。
- 删除旧 `bubblePlans`、`bubbleRoutines`、`bubbleExerciseRecommendations` 的历史兼容渲染、保存和恢复路径；不做旧数据迁移、不做 fallback、不做双写。
- 开发环境如存在旧聊天历史记录，应在实现或验证阶段清理，确保回归只覆盖 `visibleOutputs[] -> visibleTrainingProposal -> 富卡片 adapter` 单一路径。
- 删除或停用 `VisibleTrainingProposalPanel` 面向用户的轻量展示路径；不得保留其标题、分段 mini list、处方 chip、`exercise_selection` / `routine` / `plan` 技术枚举 badge 或任何其他面板信息作为新消息 UI。
- 前端展示样式以旧三张卡片为准，不新增第四种训练卡片样式，不用轻量面板作为 fallback。
- 推荐按钮 / AI 建议回复生成能力先预留，不在本 change 实现；新 `visibleTrainingProposal` 富卡片路径本次不得新增或绑定推荐按钮，也不得恢复固定“换一批”或“编成训练”按钮。
- 计划卡片适配必须遵守当前 `visibleTrainingProposal` 计划合同：同一套 `warmup` / `training` / `stretch` 编排加 `schedule.assignments`，不得要求模型输出每天不同的完整动作编排。

## Capabilities

### New Capabilities
- `chat-visible-training-rich-cards`: 定义聊天气泡如何从 `visibleTrainingProposal` 渲染旧三张训练富卡片，并保持 AI 输出合同、事实桥和 no-compatibility 前端事实源边界稳定。

### Modified Capabilities
- 无。现有 AI 输出、tool、事实桥和训练生成能力不改变需求合同；本 change 只新增前端富卡片消费能力。

## Impact

- 前端聊天页：`features/chat/components/chat-page.tsx`
- 前端聊天事件与历史：`features/chat/types.ts`、`features/chat/hooks/use-chat-controller.ts`、`features/chat/lib/chat-history.ts`
- 新增或调整前端 adapter：`features/chat/lib/*`
- 复用现有卡片组件：`features/exercises/components/exercise-recommendation-card.tsx`、`features/workouts/components/workout-routine-draft-card.tsx`、`features/workouts/components/workout-plan-draft-card.tsx`
- 测试：前端 adapter 单测、聊天事件消费测试、卡片渲染回归测试，以及按需运行 `npm run typecheck`
