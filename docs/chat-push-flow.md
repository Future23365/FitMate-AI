# 聊天推送流程说明

## 1. 文档范围

本文说明当前聊天中的结构化推送流程，主要包括：

- 动作推荐推送
- 单次训练编排推送
- 长期训练计划推送

这里的“推送”不是 Git push，也不是系统通知，而是用户在聊天中表达训练需求后，系统在 assistant 消息气泡内自动生成并展示结构化结果卡片。

## 2. 总体链路

当前推送由 `/api/chat` 内的 Tool-first `AgentOrchestrator` 统一完成，不再由前端在收到旧 `assistant_action` 后二次调用生成接口：

```txt
用户消息
  ↓
/api/chat 构造 ContextPackage
  ↓
Agent tool decision 选择受控工具
  ↓
读取 artifact / 查询动作 / 生成 draft 或 patch / Validator / Policy / 保存 revision
  ↓
产出 AgentExecutionResult
  ↓
Response Writer 投影用户回复和 artifact / patch / suggestion 事件
```

核心设计是：LLM 负责语义编排，但只能通过服务端注册工具执行事实读取和写入；服务端只做 Schema、权限、候选集合、Validator、Policy、Persistence 等硬边界。用户可见回复只描述 `AgentExecutionResult` 中已经发生或被阻断的真实执行结果。

## 3. 前端发送聊天消息

入口在 `features/chat/hooks/use-chat-controller.ts`。

用户发送消息后，前端会：

1. 创建一条 `user` 消息。
2. 创建一条空的 `assistant` 消息，用于承接流式回复。
3. 构造当前轮 `latestUserMessage`，并带上会话 id 与本地已有消息作为保存/兼容输入。
4. 调用 `requestChatStream` 请求 `/api/chat`。

请求体主要包含：

- `latestUserMessage`
- `conversationSummary`
- `thinkingEnabled`

对应代码入口：

- `features/chat/hooks/use-chat-controller.ts`
- `features/chat/api/chat-client.ts`
- `app/api/chat/route.ts`

`conversationSummary` 仍可随请求传入，但只作为后台摘要或历史兼容材料。生产 Agent 模型可见上下文来自服务端构造的 `ContextPackage`，而不是 `conversationSummary + 当前最新用户消息` 的 summary-only 协议。

## 4. `/api/chat` 服务端职责

`/api/chat` 是 Tool-first Agent 主链入口。

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
构造 Agent ContextPackage
  ↓
runAgentOrchestrator 执行 tool decision / tool result / dependency graph
  ↓
工具执行读取 artifact、查询候选、生成 draft/patch、校验、Policy、保存 revision
  ↓
产出 AgentExecutionResult
  ↓
Response Writer 投影 content、assistant_suggestions、artifact / workout_patch、agent_execution_result、done
```

旧 `resolveChatIntent`、`ResolvedChatIntent`、ReferenceResolver-first 主路径、只读-only tool loop 和基于关键词的服务端语义归一化已从生产 `/api/chat` 移除。历史报告或测试夹具可以识别旧字段，但生产 Agent runtime、Response Writer、前端新流解析和领域服务不能导入旧路径。

## 5. Agent 决策协议

生产链路不再先解析旧 `ChatIntent`。Agent tool decision prompt 的输入是 `ContextPackage` 摘要、registry 工具定义、已登记 tool results、dependency graph 和本轮预算。模型输出只能是一个合法工具调用或一个合法 `AgentExecutionResult`。

Agent 可通过工具执行以下受控能力：

- 读取最近 artifact：`listRecentArtifacts`、`searchArtifacts`、`getArtifactPayload`
- 查询动作库：`searchExercises`、`getExerciseById`
- 读取用户记忆：`getUserMemory`
- 提出训练编辑计划：`proposeWorkoutEditPlan`
- 生成 routine / plan 草稿：`generateRoutineDraft`、`generatePlanDraft`
- 提出并校验 Patch：`proposeWorkoutPatch`、`validateWorkoutPatch`
- 校验和策略评估：`validateRoutineDraft`、`validatePlanDraft`、`evaluatePolicy`
- 保存 revision：`saveConversationArtifactRevision`
- 澄清：`askClarification`

工具输入必须通过 Zod Schema，写工具必须引用本轮已登记的 `toolResultId`、`candidateSetId`、`validationId`、`policyDecisionId`、`confirmationId` 或 `revisionId`。用户原始消息可以作为辅助 query，但不能作为唯一检索输入触发可执行候选集合。

## 6. 动作候选与 artifact 事实源

动作候选由 Agent 调用结构化检索工具产生。`searchExercises` 必须接收目标、肌群、器械正负约束、场地、难度、时长、偏好和避免项等结构化字段；服务端先做结构化硬过滤，再做全文或语义排序，并返回 `candidateSetId`。

已有训练内容由 Agent 通过 artifact 工具读取。`recentArtifactSummaries` 只用于帮助模型决定是否需要读取 payload；完整动作列表、section、exerciseId、Patch target 和保存 payload 必须来自 `getArtifactPayload` 或写工具结果，不能从 `conversationSummary`、recent message 或自然语言回复正文反推。

## 7. 推送触发规则

推送不再由 `resolveAssistantAction` 独立决定。训练卡片、Patch、澄清和失败恢复都由 `AgentExecutionResult` 表达：

- `generated`：已生成并保存 exercise recommendation、routine 或 plan artifact。
- `patched`：已基于真实 artifact payload 和候选集合完成局部修改并保存 revision。
- `needs_clarification`：信息不足或目标不明确，需要用户补充。
- `answered`：只回答问题，不推送训练卡片。
- `blocked` / `failed`：Policy、校验或工具执行失败，不能承诺已生成或已修改。

生产聊天流不再输出 `assistant_action` 或 `intent_resolved`。前端和黑盒 runner 只能从 `agent_execution_result`、artifact / patch / suggestion 事件、tool evidence metadata 和 `done` metadata 判断用户可见结果。

## 8. `/api/chat` 流式事件协议

`/api/chat` 返回 NDJSON 流。每一行是一个 JSON 事件。

当前重要事件包括：

- `agent_execution_result`：Agent 主链的结构化终止结果、Response Writer 投影、dependency graph 和 legacy path skip。
- `assistant_suggestions` / `suggested_replies`：澄清、下一步建议或旧前端兼容按钮。
- `artifact` / `artifact_validated`：已保存并可展示的推荐、routine 或 plan。
- `workout_patch`：已保存的局部修改结果。
- `reasoning`：推理加载态。
- `content`：用户可见自然语言回复。
- `done`：本轮完成，包含 `traceId`、`agentExecutionResult`、`agentStatus`、`legacyPathSkip` 和更新后的后台 `conversationSummary`。
- `error`：流式读取或模型请求失败。
- `agent_execution_result`：Agent-only 主执行结果，包含状态、可见投影、依赖图和旧路径缺席证据。

类型定义在 `features/chat/types.ts`：

```ts
type ChatStreamEvent = {
  type:
    | "reasoning"
    | "content"
    | "done"
    | "error"
    | "agent_execution_result"
    | "assistant_action"
    | "intent_resolved"
    | "artifact_validated"
    | "artifact"
    | "workout_patch"
    | "assistant_suggestions"
    | "suggested_replies"
    | "suggested_questions";
  delta?: string;
  agentExecutionResult?: unknown;
  responseProjection?: unknown;
  dependencyGraph?: unknown;
  legacyPathSkip?: unknown;
  action?: string;
  intent?: unknown;
  artifactKind?: "exercise_recommendation" | "routine" | "plan";
  payload?: unknown;
  assistantSuggestions?: AssistantSuggestion[];
  suggestedReplies?: string[];
  traceId?: string;
  agentRunId?: string;
  agentStatus?: string;
  conversationSummary?: string;
};
```

服务端会在聊天正文前先发送 `agent_execution_result`，并在内容后发送 artifact / patch 事件。新运行不会派发旧 `assistant_action` 或 `intent_resolved`，黑盒报告必须把旧字段出现标记为 legacy field leakage。

## 9. 前端接收事件后的分发

前端读取 `/api/chat` 流时，会按事件类型处理：

- `content`：逐段追加到当前 assistant 消息。
- `reasoning`：设置消息加载态。
- `agent_execution_result`：记录本轮 Agent 执行状态和依赖图诊断。
- `assistant_suggestions` / `suggested_replies`：写入当前 assistant 消息的一键回复。
- `artifact` / `artifact_validated`：把推荐、routine 或 plan 挂到当前 assistant 消息。
- `workout_patch`：把修改后的训练卡片挂到当前 assistant 消息。
- `done`：保存 `traceId`，并更新后台 `conversationSummary`。
- `error`：展示错误文案。

聊天流结束后，前端不再根据本轮 action 二次调用生成接口。生成、Patch、校验和保存已经在 `/api/chat` 的 Agent 工具链内完成。

## 10. 动作推荐推送流程

以下接口仍可作为独立 API 或旧兼容入口存在，但首页聊天主链不再依赖前端收到 `assistant_action` 后调用它生成卡片。

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

以下接口仍可作为独立 API 或旧兼容入口存在，但首页聊天主链优先由 Agent 工具在 `/api/chat` 内完成 draft、校验和 revision 保存。

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
