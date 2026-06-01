# 聊天推送流程说明

## 1. 文档范围

本文说明当前聊天中的结构化推送流程，主要包括：

- 动作推荐推送
- 单次训练编排推送
- 长期训练计划推送

这里的“推送”不是 Git push，也不是系统通知，而是用户在聊天中表达训练需求后，系统在 assistant 消息气泡内自动生成并展示结构化结果卡片。

## 2. 总体链路

当前推送不是由聊天模型直接生成卡片，而是分成两段：

```txt
用户消息
  ↓
/api/chat 解析意图、筛动作候选、决定是否触发 assistant_action
  ↓
前端收到 assistant_action
  ↓
前端再调用具体生成接口
  ├─ /api/ai/exercise-recommendations
  └─ /api/ai/workout-plan
  ↓
结果挂到当前 assistant 消息气泡里
```

核心设计是：聊天模型只负责自然语言回复；服务端结构化意图和候选动作决定是否真的推送。这样可以避免“自然语言回复承诺会生成，但内部没有触发生成”的不一致。

## 3. 前端发送聊天消息

入口在 `features/chat/hooks/use-chat-controller.ts`。

用户发送消息后，前端会：

1. 创建一条 `user` 消息。
2. 创建一条空的 `assistant` 消息，用于承接流式回复。
3. 构造当前轮 `conversationSummary` 和 `latestUserMessage`。
4. 调用 `requestChatStream` 请求 `/api/chat`。

请求体主要包含：

- `latestUserMessage`
- `conversationSummary`
- `thinkingEnabled`

对应代码入口：

- `features/chat/hooks/use-chat-controller.ts`
- `features/chat/api/chat-client.ts`
- `app/api/chat/route.ts`

当前模型可见上下文主要是 `conversationSummary + 当前最新用户消息`，不是完整历史消息窗口。

## 4. `/api/chat` 服务端职责

`/api/chat` 是推送决策的第一段入口。

它负责：

1. 校验 `DEEPSEEK_API_KEY`。
2. 校验请求体。
3. 构造 AI Trace。
4. 调用 `prepareAiChatRequest` 生成本轮服务端请求上下文。
5. 调用 `createAiChatResponse` 返回 NDJSON 流。

核心文件：

- `app/api/chat/route.ts`
- `lib/server/chat/chat-service.ts`

`createAiChatResponse` 内部流程：

```txt
记录用户输入
  ↓
resolveChatIntent：调用模型解析结构化意图
  ↓
如果需要动作上下文，buildExerciseContext 查询动作库并筛候选
  ↓
resolveAssistantAction 决定是否触发推送事件
  ↓
构造聊天回复 prompt
  ↓
流式返回 assistant_action / suggested_replies / reasoning / content / done
```

## 5. 意图解析

意图解析由 `resolveChatIntent` 完成。

模型需要返回结构化 JSON，核心字段包括：

- `type`
- `needsExerciseContext`
- `workoutIntent`
- `requestedExerciseName`
- `canTriggerAction`
- `missingActionFields`
- `suggestedReplies`

当前支持的顶层 `type` 包括：

- `general_fitness_advice`
- `exercise_recommendation`
- `workout_plan`
- `routine`
- `exercise_replacement`
- `exercise_explanation`
- `non_fitness`

其中，只有以下类型可能触发推送：

- `exercise_recommendation`
- `routine`
- `workout_plan`

如果意图解析失败，服务端会使用 `createFallbackChatIntent` 做兜底，不会直接让本轮聊天失败。
该兜底只产生安全的非执行意图，不会根据用户原文关键词推断 `exercise_recommendation`、`routine` 或 `workout_plan`。

服务端只负责契约校验和确定性执行边界：

1. LLM 负责判断 `type`、`action.kind`、`workoutIntent.intentType` 等高层语义。
2. 服务端可以规范化 `null`、旧字段和建议按钮结构，并校验字段一致性。
3. 服务端不得用关键词、短句模板或历史摘要把 LLM 输出的高层 action 改写成另一种 action。
4. 结构冲突或缺少可执行字段时，进入 repair、澄清或安全拒绝，而不是改写语义。
5. `exercise_replacement`、`workout_patch`、依赖 artifact 的 `exercise_explanation` 按引用型契约校验，不要求具备新生成训练所需的 `workoutIntent`。

## 6. 动作候选上下文

当 `needsExerciseContext = true` 时，服务端会执行 `buildExerciseContext`。

它会：

1. 读取动作库。
2. 根据 `workoutIntent` 调用 `selectExerciseCandidates`。
3. 如果用户点名某个动作，再做名称匹配。
4. 组装给聊天模型可见的 `providedExercises`。
5. 生成候选状态。

候选状态包括：

- `enough`
- `limited_but_usable`
- `insufficient`

如果候选状态是 `insufficient`，服务端不会触发结构化推送。

## 7. 推送触发规则

推送由 `resolveAssistantAction` 决定，输出三种内部动作：

- `exercise_recommendation`
- `workout_routine`
- `workout_plan`

核心判断由 `canTriggerAssistantAction` 完成。

当前规则：

- 没有动作上下文时不推送。
- 动作候选状态为 `insufficient` 时不推送。
- 如果模型返回 `canTriggerAction = true`，服务端允许触发，但仍要求候选可用。
- 动作推荐只要求训练目标或点名动作明确。
- 单次编排和长期计划需要核心字段满足。
- 缺少健康、伤病、疼痛、身体限制等字段不再默认阻断。
- 缺少经验字段时，当前会按 `beginner` / 简单训练策略默认处理，不再仅因为经验未明确而阻断推送。

`routine` 会被转成：

```txt
assistant_action.action = workout_routine
intent.intentType = routine
weeklyFrequency = 1
```

`workout_plan` 会被转成：

```txt
assistant_action.action = workout_plan
intent.intentType = plan
```

聊天模型本身不负责真正创建卡片；真正触发计划或推荐由服务端结构化意图转成内部事件。

## 8. `/api/chat` 流式事件协议

`/api/chat` 返回 NDJSON 流。每一行是一个 JSON 事件。

当前重要事件包括：

- `assistant_action`：服务端确认本轮需要触发哪类推送。
- `suggested_replies`：信息不足时给用户的一键补充回复。
- `reasoning`：推理加载态。
- `content`：用户可见自然语言回复。
- `done`：本轮完成，包含 `traceId` 和更新后的 `conversationSummary`。
- `error`：流式读取或模型请求失败。

类型定义在 `features/chat/types.ts`：

```ts
type ChatStreamEvent = {
  type:
    | "reasoning"
    | "content"
    | "done"
    | "error"
    | "assistant_action"
    | "suggested_replies"
    | "suggested_questions";
  delta?: string;
  action?: "exercise_recommendation" | "workout_routine" | "workout_plan";
  intent?: unknown;
  suggestedReplies?: string[];
  traceId?: string;
  conversationSummary?: string;
};
```

服务端会在聊天正文前先发送 `assistant_action`，这样前端能在聊天结束后使用确定性的服务端决策触发后续生成。

## 9. 前端接收事件后的分发

前端读取 `/api/chat` 流时，会按事件类型处理：

- `content`：逐段追加到当前 assistant 消息。
- `reasoning`：设置消息加载态。
- `suggested_replies`：写入当前 assistant 消息的一键回复。
- `assistant_action`：暂存本轮结构化动作。
- `done`：保存 `traceId`，并更新 `conversationSummary`。
- `error`：展示错误文案。

聊天流结束后，前端再根据本轮 action 决定是否调用具体生成接口：

```txt
assistant_action = workout_plan 或 workout_routine
  ↓
generateWorkoutPlanForBubble
  ↓
/api/ai/workout-plan

assistant_action = exercise_recommendation
  ↓
generateExerciseRecommendationsForBubble
  ↓
/api/ai/exercise-recommendations
```

代码里仍保留了正文 JSON trigger 解析作为旧兼容兜底，但当前主路径应以 `assistant_action` 为准。

## 10. 动作推荐推送流程

动作推荐推送走 `/api/ai/exercise-recommendations`。

完整流程：

```txt
assistant_action = exercise_recommendation
  ↓
POST /api/ai/exercise-recommendations
  ↓
服务端校验请求体和 API Key
  ↓
读取动作库
  ↓
selectExerciseCandidates 重新筛候选
  ↓
排除 excludeExerciseIds
  ↓
调用动作推荐模型
  ↓
模型只允许从 candidateExercises 中选择 exerciseId
  ↓
Zod 校验模型输出
  ↓
过滤不存在、不在候选集合、已排除的 exerciseId
  ↓
组装 ExerciseRecommendationCard
  ↓
前端写入 bubbleExerciseRecommendations[messageId]
```

核心文件：

- `app/api/ai/exercise-recommendations/route.ts`
- `lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts`

“换一批”或“不喜欢这些动作”时，前端会带上已出现或已 dislike 的动作 ID：

```txt
excludeExerciseIds = 当前卡片动作 + 用户不喜欢的动作
```

如果排除后没有候选，但原始条件下还有候选，服务端会回填部分高匹配动作，并追加安全说明：

```txt
当前条件下可替换动作不足，已回填部分高匹配动作。
```

## 11. 单次编排和长期计划推送流程

单次编排和长期计划共用 `/api/ai/workout-plan`。

完整流程：

```txt
assistant_action = workout_routine 或 workout_plan
  ↓
POST /api/ai/workout-plan
  ↓
服务端校验请求体
  ↓
创建或延续 AI Trace
  ↓
如果前端传了 intent，直接使用该 intent
  ↓
否则由模型重新抽取训练计划 intent
  ↓
读取动作库
  ↓
selectExerciseCandidates 筛候选
  ↓
候选不足则返回失败
  ↓
调用训练计划生成模型
  ↓
根据 intent.intentType 解析为 routine 或 plan
  ↓
Zod 结构校验
  ↓
服务端业务校验
  ↓
返回 kind = routine 或 plan
  ↓
前端写入 bubbleRoutines 或 bubblePlans
```

核心文件：

- `app/api/ai/workout-plan/route.ts`
- `lib/server/workout-plans/ai-workout-plan-service.ts`
- `lib/server/workout-plans/workout-plan-validation-service.ts`

### 11.1 `routine`

`routine` 表示单次训练编排。

常见触发语义：

- 今天练什么
- 这次练 30 分钟
- 在家练背
- 把这批动作编成一套训练
- 安排一个训练流程

生成结果会写入：

```txt
bubbleRoutines[messageId]
```

### 11.2 `plan`

`plan` 表示长期训练计划。

常见触发语义：

- 制定一周计划
- 做一个长期增肌计划
- 安排 6 天训练计划
- 每周练 3 次
- 未来一个月怎么练

生成结果会写入：

```txt
bubblePlans[messageId]
```

长期计划要求包含周期结构、训练日、休息日和三段式动作安排。非休息训练日需要包含：

- `warmup`
- `training`
- `stretch`

休息日只表达恢复说明，不创建训练动作 routine。

## 12. 计划校验规则

训练计划或单次编排生成后，服务端会做两类校验。

第一类是结构校验：

- `workoutRoutineDraftSchema`
- `workoutPlanDraftSchema`

第二类是业务校验：

- 所有 `exerciseId` 必须存在于动作库。
- 所有 `exerciseId` 必须来自本次候选集合。
- 长期计划的 `cycleLengthDays` 必须和 `days.length` 一致。
- `trainingDayCount` 必须等于非休息训练日数量。
- `restDayCount` 必须等于休息日数量。
- 单次时长不能明显超过用户要求。
- 新手训练量过高会产生 warning。
- 训练日动作组合高度重复会报错。
- 缺少必要 section 会报错。
- 动作 section 与本地 `allowedSections` 元数据不一致只记录 warning，不作为 hard fail；例如动态关节活动可由 AI 编排到 `warmup`。

校验失败时，接口返回失败，不会把无效草稿推送给用户。排查时要区分两类结果：`errors` 是确定性 hard fail，会阻止卡片展示；`warnings` 是诊断或可调优信号，不会单独阻止草稿展示。

## 13. 聊天历史保存

推送结果不是单独保存成新的聊天消息，而是挂在对应 assistant message 的结构化记录里。

当前数据结构：

```ts
type ChatConversation = {
  messages: ChatMessage[];
  plans?: Record<string, WorkoutPlanDraft>;
  routines?: Record<string, WorkoutRoutineDraft>;
  exerciseRecommendations?: Record<string, ExerciseRecommendationCard>;
  conversationSummary?: Pick<ConversationSummaryContext, "summary">;
};
```

其中 key 都是 `messageId`：

- `plans[messageId]`
- `routines[messageId]`
- `exerciseRecommendations[messageId]`

前端会自动保存：

- 聊天消息
- 计划草稿卡片
- 单次编排卡片
- 动作推荐卡片
- `conversationSummary`
- 旧兼容 `conversationContext`

## 14. AI Trace 排查入口

排查推送问题时，优先看 AI Trace。

正常一轮 `/api/chat` 应该能看到：

```txt
用户输入
意图判断请求参数
第一次大模型回复：意图判断大模型回复
意图判断结构化结果
引用解析结果
searchArtifacts 受控工具调用（仅语义检索时）
getArtifactPayload 受控工具调用（仅 Patch 或 payload 读取时）
WorkoutPatch 提出 / WorkoutPatch 应用结果（仅局部修改时）
动作库获取与候选筛选
服务端内部动作事件
生成用户回复大模型调用参数
生成用户回复大模型回答
聊天上下文总结更新请求
聊天上下文总结更新结果
聊天回复写入完成 或 确定性回复写入完成
```

Trace 顶层会保留 `runId`、`userId`、`sessionId`、`messageId`、`model`、`promptVersion`、`toolVersions`、本轮输入摘要和 `finalDecision`。其中 recent artifact 只记录摘要，不记录完整 payload；API key、Authorization、token、cookie 等敏感字段会被脱敏，超长字段会被截断。

如果触发了计划或推荐，还会继续看到：

```txt
/api/ai/workout-plan
  训练计划生成请求
  使用客户端传入意图 或 训练计划意图解析结果
  动作库获取与计划候选筛选
  draft_generation 大模型请求
  draft_generation 大模型输出
  单次训练编排草稿校验 或 训练计划草稿校验
  训练计划接口结果

/api/ai/exercise-recommendations
  动作推荐生成请求
  动作推荐候选筛选
  动作推荐大模型请求
  动作推荐模型选择结果
  动作推荐接口结果
```

如果自然语言说会整理，但没有卡片，重点看 `/api/chat` 的“服务端内部动作事件”：

- `assistantAction` 是否为 `null`
- `canTriggerAction` 是否为 `true`
- `missingActionFields` 还有哪些字段
- `candidateStatus` 是否为 `insufficient`

如果 `/api/chat` 已经有 `assistantAction`，但卡片没出来，继续看对应后续接口：

- `/api/ai/workout-plan`
- `/api/ai/exercise-recommendations`

重点看候选是否不足、模型输出是否非法、Zod 校验是否失败、动作 ID 是否不在候选集合。`section_exercise_mismatch` 出现在 `warnings` 或 `sectionSemanticWarnings` 时表示 AI section 与本地元数据分歧，只用于诊断，不等同于 `plan_validation_failed`。

如果问题发生在“这个”“刚才那套”等历史引用或局部修改场景，优先看：

- `reference_resolution`：是否 `resolved`、`ambiguous` 或 `not_found`
- `tool_call`：`searchArtifacts` / `getArtifactPayload` 是否只返回当前用户可访问对象
- `patch_proposal`：Patch scope、operation、目标动作和 `failureReasons`
- `validation`：Patch 或训练草稿是否被结构、候选或边界规则拦截
- `persistence`：artifact revision 是否写入成功

## 15. 常见问题定位

### 15.1 回复承诺生成，但没有卡片

优先检查：

- `/api/chat` 是否真的返回了 `assistant_action`
- `resolveAssistantAction` 是否返回 `null`
- `candidateStatus` 是否为 `insufficient`
- `missingActionFields` 是否仍包含核心字段

当前 prompt 已约束：只有 `serverAssistantAction.triggered = true` 时，聊天模型才可以说会整理结果。

### 15.2 用户只缺少训练经验，却没有推送

当前规则中，经验未明确时应默认按 `beginner` / 简单训练处理，不应单独阻断。

如果仍然阻断，重点检查：

- `missingActionFields` 是否错误保留 `experience`
- `getActionBlockingMissingFields` 是否正确过滤经验字段
- `workoutIntent.experience` 是否被解析为合法值

### 15.3 用户说“无器械”，系统仍追问器械

重点检查意图解析输出：

- `workoutIntent.equipment`
- `workoutIntent.preferences`
- `missingActionFields`

当前 prompt 要求把“在家、自重、徒手、无器械、没有可用设备”等语义归一为可生成的结构化训练条件。

### 15.4 动作推荐换一批后重复

重点检查：

- 前端是否正确收集上一批动作 ID
- `excludeExerciseIds` 是否传到 `/api/ai/exercise-recommendations`
- 服务端筛选后是否因为候选不足触发了回填

### 15.5 训练计划草稿生成失败

重点检查：

- 候选动作是否足够
- 模型输出是否为合法 JSON
- 草稿是否通过 Zod 结构校验
- 草稿中的 `exerciseId` 是否来自数据库和本次候选集合
- 计划周期、训练日数量、休息日数量是否一致

## 16. 关键代码索引

聊天入口：

- `features/chat/hooks/use-chat-controller.ts`
- `features/chat/api/chat-client.ts`
- `app/api/chat/route.ts`
- `lib/server/chat/chat-service.ts`

聊天类型：

- `features/chat/types.ts`

动作推荐：

- `app/api/ai/exercise-recommendations/route.ts`
- `lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts`

计划生成：

- `app/api/ai/workout-plan/route.ts`
- `lib/server/workout-plans/ai-workout-plan-service.ts`
- `lib/server/workout-plans/workout-plan-validation-service.ts`
- `lib/shared/workout-plans/draft-schema.ts`

候选动作：

- `lib/server/workout-plans/exercise-candidate-service.ts`
- `lib/server/exercises/exercise-service.ts`

提示词：

- `lib/server/ai/prompt-config.ts`

聊天历史：

- `features/chat/lib/chat-history.ts`
- `lib/server/chat/chat-history-service.ts`

架构说明：

- `docs/architecture.md`
