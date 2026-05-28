## Why

聊天页面推送的单次训练编排目前复用长期计划草稿结构，AI 生成结果缺少明确的热身、训练、拉伸阶段边界，也没有把主训练循环次数作为一等字段贯穿到卡片展示和保存流程。现有执行层和持久化层已经支持 `section`、`trainingLoopRounds` 和 `trainingLoopRestSeconds`，现在需要让聊天推送的编排数据与最新执行模型对齐。

本项目还未上线，本次重构无需兼容历史聊天草稿数据，应直接以当前最优结构替换旧的计划草稿复用方式，避免继续在 `WorkoutPlanDraft` 上叠加单次编排语义。

## What Changes

- **BREAKING** 新增聊天推送单次训练编排的结构化草稿模型，不再把 routine 场景伪装成只有 1 个 day 的 `WorkoutPlanDraft`。
- **BREAKING** AI 生成单次编排时必须输出热身、训练、拉伸三个部分；每个动作项必须携带 `section`、`sets`、`mode`、`target`、`setRestSeconds`、`transitionRestSeconds` 等执行参数。
- **BREAKING** AI 单次编排必须输出主训练循环配置，包括 `trainingLoopRounds` 和 `trainingLoopRestSeconds`，并在服务端校验后用于估算时长、卡片展示、保存和训练执行。
- 调整 `/api/ai/workout-plan` 或拆分后的 routine 生成链路，使 routine 输出直接校验为新结构，长期 plan 输出继续保持多日计划语义。
- 优化聊天推送卡片样式：routine 卡片应按热身、训练、拉伸分区展示，并突出主训练循环次数、休息配置、每个动作的组数/次数/秒数。
- 打通聊天推送编排保存全流程：AI 输出经过服务端校验、动作库 id 校验和转换后，直接保存为 `WorkoutRoutine`，并保留分区、循环配置和执行参数。
- 同步调整 AI 提示词、Zod Schema、服务端校验、前端类型、卡片组件、保存入口、相关测试和当前文档。

## Capabilities

### New Capabilities
- `chat-routine-composition`: 聊天页面推送的单次训练编排必须使用热身、训练、拉伸三段式结构，并完整包含主训练循环与动作执行参数。

### Modified Capabilities
- `workout-data-model`: AI 推送的 routine 保存到 `WorkoutRoutine` 时，必须保留三段式 `section`、主训练循环配置和动作执行参数，不得降级成全量 training 动作。

## Impact

- AI 编排与提示词：`lib/server/ai/prompt-config.ts`、`lib/server/chat/chat-service.ts`、`lib/server/workout-plans/ai-workout-plan-service.ts`
- 共享 Schema 和领域模型：`lib/shared/workout-plans/draft-schema.ts`、`lib/shared/workouts/composition.ts`
- 训练草稿校验与转换：`lib/server/workout-plans/workout-plan-validation-service.ts`、`features/workout-plans/lib/workout-routine-conversion.ts`
- 聊天和卡片 UI：`features/chat/hooks/use-chat-controller.ts`、`features/chat/types.ts`、`features/workouts/components/workout-plan-draft-card.tsx`，以及必要时新增 routine 专用卡片组件
- 保存链路：`features/workouts/api/workout-data-client.ts`、`app/api/workout-routines/route.ts`、`lib/server/workouts/workout-persistence-service.ts`
- 测试与文档：相关单元测试、API 测试、`README.md` 或 `docs/database-design.md` 中受影响的当前链路说明
