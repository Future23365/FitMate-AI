## Context

当前聊天链路是 `/api/chat` 先解析结构化意图，再通过 `assistant_action` 触发前端静默调用 `/api/ai/workout-plan` 生成草稿。routine 场景目前复用 `WorkoutPlanDraft`，通过 `days.length === 1` 区分“本次动作编排”，最终再用 `convertWorkoutPlanDraftToWorkoutRoutine()` 转成 `WorkoutRoutine`。

这个复用结构已经与最新执行模型不一致：

- `WorkoutPlanDraft.days[].items[]` 没有 `section` 字段，转换时把所有动作写成 `section: "training"`。
- `WorkoutPlanDraft` 没有 routine 级 `trainingLoopRounds` 和 `trainingLoopRestSeconds`，转换时固定为 1 轮。
- 卡片 UI 以“训练日 + 动作列表”为主，无法清晰表达热身、主训练循环、拉伸三段式编排。
- 持久化模型已经支持 `WorkoutRoutineItem.section`、`trainingLoopRounds` 和 `trainingLoopRestSeconds`，但 AI 推送链路没有把这些字段作为事实数据贯穿。

本次重构无需兼容历史聊天草稿数据，因此可以直接替换 routine 推送数据结构，而不是继续让 routine 伪装成单日 plan。

## Goals / Non-Goals

**Goals:**

- 为聊天推送的单次训练编排建立 routine 专用结构，包含热身、训练、拉伸三个部分。
- 让 AI 输出、服务端 Zod 校验、动作库 id 校验、前端卡片展示、保存到 `WorkoutRoutine` 使用同一套 routine 数据结构。
- 让主训练循环次数和循环间休息成为 routine 草稿的一等字段，并影响预估时长、卡片展示和保存结果。
- 优化聊天推送卡片，使用户能直接检查每个阶段、动作参数、循环轮数和休息配置。
- 删除 routine 场景对 `WorkoutPlanDraft.days[0]` 的语义依赖，不为历史聊天草稿增加兼容层。

**Non-Goals:**

- 不重构 `/training` 执行状态机；它继续消费 `WorkoutRoutine` / `WorkoutSchedule` 和 `buildWorkoutTimeline()`。
- 不引入新的数据库表；现有 `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule` 足够表达本次需求。
- 不兼容旧聊天历史里的 routine 草稿展示或保存。
- 不改变长期 `workout_plan` 的多日计划语义，除非为了共享类型命名和服务边界做必要整理。

## Decisions

### 1. routine 使用专用 `WorkoutRoutineDraft`，不再复用单日 `WorkoutPlanDraft`

新增共享 Schema，例如：

- `workoutRoutineDraftSchema`
- `workoutRoutineDraftSectionSchema`
- `workoutRoutineDraftItemSchema`

建议结构：

```ts
type WorkoutRoutineDraft = {
  kind: "routine";
  title: string;
  goal: string;
  summary?: string;
  estimatedSessionMinutes: number;
  trainingLoopRounds: number;
  trainingLoopRestSeconds: number;
  sections: Array<{
    section: "warmup" | "training" | "stretch";
    title: string;
    items: WorkoutRoutineDraftItem[];
  }>;
  safetyNotes: string[];
};
```

取舍：继续扩展 `WorkoutPlanDraft` 的改动量更小，但会把“多日计划”和“单次可执行编排”混在同一个模型里，导致字段含义越来越依赖 `days.length`。专用结构更适合当前阶段的长期维护，也和 `WorkoutRoutine` 持久化模型一致。

### 2. `/api/ai/workout-plan` 内部分流 plan 与 routine，必要时再拆服务文件

保留外部入口可以减少前端请求层 churn，但服务端内部必须按 `intent.intentType` 分流：

- `intentType === "plan"`：继续生成和校验 `WorkoutPlanDraft`。
- `intentType === "routine"`：生成和校验 `WorkoutRoutineDraft`。

返回体应使用 discriminated union，例如：

```ts
type AiWorkoutDraftSuccess =
  | { ok: true; kind: "plan"; intent: WorkoutPlanIntent; draft: WorkoutPlanDraft; ... }
  | { ok: true; kind: "routine"; intent: WorkoutPlanIntent; draft: WorkoutRoutineDraft; ... };
```

取舍：拆成 `/api/ai/workout-routine` 更纯粹，但会同时改聊天 controller、client、trace 和错误处理。当前可以先保持入口不变、内部类型分流；如果实现中发现 plan/routine 服务过重，再把服务函数拆成 `ai-workout-routine-service.ts`，但不需要新增公开 API 兼容层。

### 3. AI 提示词要求三段式输出，并把循环配置写入 Schema

`workoutPlanDraftGeneration` 的 routine 分支需要明确：

- routine 必须只有一个单次编排，不得输出多日计划。
- `sections` 必须包含 `warmup`、`training`、`stretch` 三个 section。
- 热身和拉伸允许动作较少，但每个 section 至少 1 个动作；如果候选不足，服务端应失败并说明候选不足，而不是编造动作。
- `trainingLoopRounds` 必须是合理整数，建议 1-6 轮；服务端可沿用 `clampLoopRounds()` 或更严格的 Zod 范围。
- 主训练循环只重复 `training` section，热身和拉伸不循环。
- 每个 item 必须有 `sets`、`mode`、`target`、`setRestSeconds`、`transitionRestSeconds`。

取舍：让服务端自动按动作名称推断热身/拉伸可以减少模型约束，但用户要求“ai 推送的编排动作应该包含热身、训练、拉伸三个部分”，所以结构必须由 AI 输出并由服务端校验；`inferWorkoutSection()` 只能作为手动编排或旧输入归一化辅助，不作为 AI 草稿的主要来源。

### 4. 保存流程以 `WorkoutRoutineDraft -> WorkoutRoutine` 为唯一转换路径

新增转换函数，例如 `convertWorkoutRoutineDraftToWorkoutRoutine(draft, exercises, options)`，负责：

- 拉平 `sections`，保持 section 顺序为 warmup、training、stretch。
- 用数据库动作详情补齐 `WorkoutItem` 展示和执行字段。
- 保留每个 item 的 `section`、`sets`、`mode`、`target`、`setRestSeconds`、`transitionRestSeconds`。
- 保留 `trainingLoopRounds` 和 `trainingLoopRestSeconds`。
- 对不存在的 `exerciseId` 直接抛错，不生成 fallback 可保存动作。

取舍：前端卡片里直接拼 `WorkoutRoutine` 也能保存，但会把动作详情补齐、字段归一化和安全校验分散到 UI。转换函数作为单一入口更利于测试和复用。

### 5. 卡片拆分 routine 与 plan 展示，避免一个组件承担两套语义

建议保留 `WorkoutPlanDraftCard` 给长期计划，新增 `WorkoutRoutineDraftCard` 给聊天推送单次编排。routine 卡片展示重点：

- 顶部展示标题、目标、预估时长、主训练循环次数。
- 三个阶段按 `workoutSectionConfigs` 顺序展示。
- `training` 阶段标题附近展示“循环 N 轮”和循环间休息。
- 动作行展示图片、动作名、器械/肌群、`sets`、`target`、组间休息、过渡休息和 notes。
- 保存按钮直接写入 `WorkoutRoutine`，成功后进入 `/composer`。

取舍：在旧卡片里加大量分支会更快，但 `WorkoutPlanDraftCard` 已经包含多日 tab、排班、计划导入等长期计划逻辑；routine 专用卡片可以减少条件判断，避免后续 UI 行为互相牵连。

### 6. Trace 与错误处理按真实分支命名

AI Trace 中需要能区分：

- `聊天意图解析`
- `使用客户端传入 routine 意图`
- `动作库获取与 routine 候选筛选`
- `单次训练编排生成请求`
- `单次训练编排草稿校验`
- `训练计划草稿校验`

这样后续排查“为什么没有热身/为什么循环轮数丢了/为什么保存后变 1 轮”时，可以沿结构化链路定位，而不是只看最终卡片。

## Risks / Trade-offs

- [Risk] 候选动作中热身或拉伸不足，模型无法稳定填满三段式结构 → Mitigation：候选筛选为 routine 场景补充 warmup/stretch 相关 supplementary candidates；校验失败时返回明确错误，不允许编造动作。
- [Risk] 前端同时支持 plan 和 routine 两种 draft 返回体会带来类型分支 → Mitigation：使用 `kind` discriminated union，让 controller 和卡片渲染按 `kind` 分流。
- [Risk] AI 可能把热身或拉伸动作放进 training section → Mitigation：服务端校验 section 存在性、动作 id 合法性和参数范围；必要时增加基于动作 category/name 的 warning，但不静默改写 AI 结构。
- [Risk] 不兼容旧聊天草稿会导致旧历史里的卡片不可保存 → Mitigation：本项目未上线，按用户要求不保历史兼容；可让旧消息只保留自然语言正文，不尝试恢复旧草稿。
- [Risk] 长期计划和单次编排共用 API 名称可能继续造成理解成本 → Mitigation：即使保留公开 endpoint，也在服务层、类型和 trace 中使用 `routine` / `plan` 明确命名；后续如继续扩张可再拆公开 endpoint。

## Migration Plan

1. 新增 routine draft Schema、类型、转换函数和服务端校验。
2. 调整 AI prompt 与生成服务，让 `intentType=routine` 输出 `WorkoutRoutineDraft`。
3. 调整 chat client/controller 和消息持久化结构，按 `kind` 保存 bubble draft。
4. 新增 `WorkoutRoutineDraftCard`，并让 routine 保存走 `createWorkoutRoutine()`。
5. 删除旧的 routine-as-single-day-plan 分支和转换依赖。
6. 补齐测试、类型检查和文档，再运行 OpenSpec 校验。

## Open Questions

- 暂无需要用户确认的问题；实现时默认三段式 section 都至少包含 1 个动作，主训练循环次数由 AI 输出并经服务端范围校验。
