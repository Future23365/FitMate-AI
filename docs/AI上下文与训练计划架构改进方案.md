# AI 上下文与训练计划架构改进方案：调整版



## 1. 背景

当前项目已经把自然语言聊天、动作推荐、单次训练编排和长期训练计划拆成多个服务端步骤。这个方向是正确的：系统不应该让 LLM 直接把自然语言回复当成最终训练计划，而应该由服务端生成、校验、保存和推送结构化结果。

但随着对话轮次增加、推送卡片变多、训练计划周期变长，当前架构暴露出一个核心问题：

> 用户在后续对话里引用的是 UI 中已经出现过的结构化卡片，但模型真正可见的上下文主要只有 `conversationSummary` 和 `latestUserMessage`。

例如用户说：

```txt
三周都练这个
按上次那套改成一周四练
把刚才那个计划里的俯卧撑换掉
后面都别安排平板支撑
```

系统必须知道：

```txt
“这个”是哪张卡片
那张卡片是什么类型
里面有哪些动作
动作在哪个训练阶段
每个动作的组数、次数、时长、休息是多少
它是否已经保存成 routine 或 schedule
哪些训练日已经完成
哪些未来 schedule 可以修改
```

这些信息不应该依赖 `conversationSummary` 里的自然语言压缩结果。真正需要的是一套：

```txt
结构化事实源
+
引用解析
+
受控工具
+
局部 patch
+
领域计划引擎
+
校验器
+
trace / replay / eval
```

因此，本方案的核心不是简单“引入 RAG + Agent”，而是将系统从：

```txt
LLM 聊天生成器
```

升级为：

```txt
可引用、可修订、可验证、可追踪的训练计划编排系统
```

---

## 2. 核心结论

本次调整后，推荐目标不再表述为：

```txt
RAG + Agent 架构升级
```

而应改为：

```txt
结构化训练计划编排架构升级
```

其中：

```txt
RAG 是检索实现之一，不是系统中心。
Agent 是任务编排方式之一，不是自由代理。
训练计划稳定性的核心来自 domain model、patch、validator、policy、trace 和 eval。
```

调整后的核心架构目标是：

```txt
ConversationArtifact 保存结构化卡片事实
  +
ArtifactIndex 支持检索和引用
  +
ReferenceResolver 解析“这个 / 上次 / 之前那个”
  +
Controlled Tools 受控读取和修改数据
  +
WorkoutPatch / PlanPatch 执行局部修改
  +
DomainPlanEngine 展开长期计划
  +
Validator 校验动作、阶段、时长、恢复和风险
  +
Policy Engine 控制哪些修改允许自动执行
  +
Confirmation Gate 控制高风险修改是否需要用户确认
  +
User Memory / Feedback 管理长期偏好和动作反馈
  +
Trace / Replay / Eval 保证线上可调试、可回归
```

---

## 3. 当前主要问题

### 3.1 结构化卡片没有成为后续 AI 的事实上下文

当前模型主要看到：

```txt
conversationSummary
latestUserMessage
intent
当前轮动作候选
```

但用户引用的对象往往是之前推送过的结构化卡片：

```txt
动作推荐卡片
单次训练 routine 卡片
长期计划 plan 卡片
```

这些卡片里有大量不能丢失的结构化信息：

```txt
exerciseId
section
sets
reps
duration
rest
training day
progression
schedule range
```

如果这些信息只存在于消息 metadata 或 UI 展示里，而不是作为后续 AI 可检索、可引用的事实对象，那么模型就只能猜。

### 3.2 `conversationSummary` 被迫承担过多职责

`conversationSummary` 适合保存：

```txt
用户目标
训练经验
器械条件
最近偏好
最近约束
未完成问题
```

但不适合保存完整训练卡片。

原因：

```txt
上下文会膨胀
模型压缩会丢事实
多个卡片之间的引用关系不清晰
自然语言 summary 无法稳定支持 patch
```

所以 summary 只能作为短期语义上下文，不能作为训练计划的事实源。

### 3.3 LLM 承担了过多训练计划生成职责

长期训练计划不应该由 LLM 一次性自由生成完整日历。

LLM 可以理解用户意图，但不应该同时承担：

```txt
动作选择
动作阶段归类
训练日安排
休息日安排
周期递进
风险控制
器械过滤
时长控制
数据库合法性校验
```

这些是服务端领域系统应该负责的事情。

### 3.4 动作候选缺少强角色约束

动作不能只按“相关性”召回。

训练计划需要明确区分：

```txt
热身动作
主训练动作
拉伸动作
降阶动作
进阶动作
替代动作
```

动作数据必须补充：

```txt
allowedSections
movementPattern
intensityRole
riskTags
contraindications
regressionExerciseIds
progressionExerciseIds
substitutionGroupId
```

否则模型会继续把主训练动作放到热身里，或者把拉伸动作放到主训练里。

### 3.5 修改计划缺少 patch 能力

用户说：

```txt
把俯卧撑换掉
平板支撑太难，换简单点
第三天之后都别安排这个动作
```

系统不应该重新生成整份计划。

正确方式是：

```txt
定位目标 artifact / routine / schedule
定位目标动作项
生成结构化 patch
应用 patch
校验 patch 后的结果
保存修订版本
返回变更摘要
```

没有 patch，系统就会不断用“整份重生成”模拟“局部修改”，这会导致其他动作、训练日、组数、休息结构被误改。

### 3.6 缺少修改权限和确认边界

Validator 只能判断训练内容是否合理，但不能判断：

```txt
这个对象是否允许被改
已完成 schedule 是否能被改
是否允许批量修改未来日历
是否允许覆盖已保存 routine
是否允许把疼痛反馈写入长期记忆
```

所以除了 Validator，还需要：

```txt
Policy Engine
Confirmation Gate
```

### 3.7 缺少 trace、replay 和 eval

RAG 和 Agent 一旦引入，系统错误会变得更难排查。

用户看到的是“结果不对”，但工程上可能有很多原因：

```txt
引用解析错了
RAG 召回错了
动作过滤错了
LLM 策略错了
patch scope 错了
validator 太宽
用户画像污染
候选动作耗尽但系统强行回填
```

所以必须在架构层加入：

```txt
Trace
Replay
Eval Suite
Regression Test
```

否则后续很难稳定迭代。

---

## 4. 目标

本方案目标是建立一个长期可扩展的 AI 训练计划编排系统，使系统具备以下能力：

1. 推送卡片可以被后续对话稳定引用。
2. 模型上下文保持小而相关，不靠堆上下文解决问题。
3. LLM 只负责语义理解、策略选择、解释文案和少量决策。
4. 数据检索、动作过滤、计划展开、patch 应用和校验由服务端负责。
5. 用户说“这个”“上次那个”“之前那个练胸的”时，系统能定位真实对象。
6. 用户说“换掉这个动作”时，系统只改目标动作，不重生成整份计划。
7. 长期训练计划由领域计划引擎展开，而不是由 LLM 自由铺满。
8. 动作选择遵守器械、难度、阶段、风险、用户反馈和健康限制。
9. 用户反馈可以沉淀为长期偏好，但避免临时偏好污染长期画像。
10. 日历调整默认只影响未来未完成安排，不误改已完成训练历史。
11. 系统能在候选不足时明确说明边界，而不是无限重复推荐。
12. 所有 AI 决策、工具调用、patch、validator 结果都可追踪、可回放、可测试。

---

## 5. 非目标

本方案不要求一次性完成以下事情：

```txt
立即引入独立向量数据库
立即引入 LangGraph 或复杂多 Agent runtime
立即重建全部动作数据
让 LLM 直接读写数据库
让 LLM 自动设计所有训练领域规则
用 RAG 替代结构化过滤
用 Agent 替代服务端业务规则
```

第一阶段不应该追求“RAG + Agent 全量架构”。

第一阶段更应该完成：

```txt
Artifact + Reference + Patch + Validator + Trace
```

---

## 6. 核心设计原则

### 6.1 数据库是事实来源

训练动作、用户计划、推送卡片、历史训练记录、用户限制和反馈，都应以服务端数据库为事实来源。

LLM 输出只能作为候选决策，不能作为未经校验的事实直接落库。

### 6.2 LLM 做语义和策略，不做最终执行

LLM 适合做：

```txt
理解用户自然语言
判断用户是否在引用历史卡片
判断用户想重复、扩展、修改还是重新生成
在多个候选策略中选择一个
生成面向用户的解释文案
```

LLM 不适合做：

```txt
直接查询全量数据库
直接生成长周期完整日历
直接判断所有训练规则是否合法
直接保存训练计划
直接修改 schedule
```

### 6.3 RAG 是检索层，不是训练规则引擎

RAG 的职责是：

```txt
找相关 artifact
找相关动作
找相关历史反馈
找相关训练知识
找相关计划模板
```

RAG 不负责：

```txt
判断动作是否允许放入热身
判断计划强度是否合理
判断 schedule 是否允许修改
判断用户是否需要确认
保证推荐永不重复
```

这些必须由结构化规则、Policy、Validator 和业务服务处理。

### 6.4 Agent 是受控编排器，不是自由代理

Agent 可以负责任务拆解和工具调用，但必须受限于：

```txt
工具 schema
权限边界
上下文预算
Policy Engine
Validator
Confirmation Gate
Trace
```

Agent 不能：

```txt
执行任意 SQL
绕过服务端权限
直接保存训练计划
绕过校验器
覆盖已完成训练历史
用整份重生成模拟局部 patch
```

### 6.5 修改必须 patch 化

任何局部修改都应该通过结构化 patch：

```txt
动作替换
动作删除
动作降阶
训练日调整
休息日插入
未来 schedule 批量替换
每周频率调整
```

Patch 必须表达：

```txt
修改目标
修改范围
修改动作
保留字段
是否需要用户确认
校验结果
最终 diff
```

### 6.6 先规则，后知识

训练计划是否合理，首先靠结构化规则和领域引擎。

训练知识 RAG 可以辅助解释和策略选择，但不应该先于规则系统。

优先级应该是：

```txt
动作元数据
训练规则
Validator
PlanEngine
再到 Training Knowledge RAG
```

---

## 7. 调整后的目标架构

### 7.1 总体链路

```txt
User Message
  ↓
Chat API
  ↓
Conversation State Builder
  ↓
Intent Resolver
  ↓
Reference Resolver
  ↓
Task Orchestrator
  ↓
Controlled Tools
  ├─ Artifact Service
  ├─ Exercise Retrieval Service
  ├─ User Memory Service
  ├─ Plan Engine
  ├─ Patch Engine
  ├─ Schedule Service
  ├─ Policy Engine
  └─ Validation Service
  ↓
Confirmation Gate
  ↓
Persistence
  ↓
Trace / Replay / Eval
  ↓
Response Writer
  ↓
Card Push
```

### 7.2 模块职责表

| 模块 | 职责 | 是否由 LLM 执行 |
|---|---|---|
| Conversation State Builder | 构建当前会话、最近 artifact、用户画像摘要 | 否 |
| Intent Resolver | 判断用户是生成、引用、修改、解释还是日历调整 | LLM 辅助 |
| Reference Resolver | 解析“这个”“上次那个”“之前练胸的” | LLM 辅助 + 服务端校验 |
| Task Orchestrator | 编排工具调用和任务流程 | 服务端为主，LLM 辅助 |
| Artifact Service | 保存、检索、读取结构化卡片 | 否 |
| ArtifactIndex | 支持 artifact 的结构化过滤、全文和向量检索 | 否 |
| Exercise Retrieval Service | 检索动作并分池 | 否 |
| User Memory Service | 读取和写入用户偏好、反馈、限制 | 否 |
| Plan Engine | 根据策略展开长期计划 | 否 |
| Patch Engine | 应用 WorkoutPatch / PlanPatch | 否 |
| Schedule Service | 管理日历、未来 schedule、完成记录 | 否 |
| Policy Engine | 判断修改是否被允许 | 否 |
| Confirmation Gate | 判断是否需要用户确认 | 否 |
| Validator | 校验训练内容是否合法 | 否 |
| Response Writer | 生成自然语言解释 | LLM |

---

## 8. ConversationArtifact 设计

### 8.1 目的

`ConversationArtifact` 用于保存每次结构化推送结果，让 UI 卡片成为后续 AI 可检索、可引用、可变更的事实对象。

### 8.2 推荐字段

```ts
type ArtifactKind =
  | "exercise_recommendation"
  | "routine"
  | "plan";

type ArtifactScope =
  | "chat_draft"
  | "saved_routine"
  | "saved_schedule";

type ConversationArtifact = {
  id: string;
  userId: string;
  sessionId: string;
  messageId: string;

  kind: ArtifactKind;
  scope: ArtifactScope;

  title: string;
  summary: string;

  payloadSchemaVersion: number;
  payload: ArtifactPayload;

  exerciseIds: string[];
  tags: string[];

  goal?: string;
  sessionMinutes?: number;
  weeklyFrequency?: number;
  calendarHorizonDays?: number;

  sourceEntityKind?: "chat_message" | "workout_routine" | "workout_schedule";
  sourceEntityId?: string;

  derivedFrom?: {
    artifactId?: string;
    routineId?: string;
    scheduleId?: string;
    planDayId?: string;
  };

  revisionOfArtifactId?: string;
  version: number;
  status: "active" | "superseded" | "archived";

  contentHash: string;

  createdAt: Date;
  updatedAt: Date;
};
```

### 8.3 ArtifactPayload

TypeScript 层不建议长期使用 `unknown`。

数据库里可以继续用 JSON，但业务层最好使用 discriminated union。

```ts
type ArtifactPayload =
  | ExerciseRecommendationPayload
  | RoutineArtifactPayload
  | PlanArtifactPayload;
```

### 8.4 保存规则

```txt
每次成功推送动作推荐、routine、plan，都创建 artifact。
artifact 记录 messageId，保留和聊天气泡的关系。
artifact 被修改时，不覆盖旧版本，而是创建新 version。
旧 artifact 标记为 superseded。
如果 artifact 已导入 routine 或 schedule，记录 sourceEntityKind 和 sourceEntityId。
```

---

## 9. ArtifactIndex 设计

### 9.1 为什么需要 ArtifactIndex

不要每次检索都扫 JSON payload。

需要单独建立一个便于检索、排序、过滤的索引层。

### 9.2 推荐字段

```ts
type ArtifactIndex = {
  artifactId: string;
  userId: string;
  sessionId: string;

  kind: ArtifactKind;
  scope: ArtifactScope;

  titleText: string;
  summaryText: string;
  embeddingText: string;

  exerciseIds: string[];
  primaryMuscles: string[];
  equipment: string[];
  goalTags: string[];
  level?: "beginner" | "intermediate" | "advanced";

  planDays?: number;
  weeklyFrequency?: number;
  sessionMinutes?: number;

  createdAt: Date;
  updatedAt: Date;
};
```

### 9.3 检索方式

```txt
结构化过滤：
  userId / sessionId / kind / scope / createdAt

全文搜索：
  titleText / summaryText / exercise names

向量搜索：
  embeddingText

业务排序：
  当前会话优先
  最近卡片优先
  类型匹配优先
  用户当前表达匹配优先
```

---

## 10. 引用解析设计

### 10.1 需要支持的引用类型

```txt
近指引用：
  这个、这套、刚才那个、上一个

顺序引用：
  上上个、第三个、最早那个

语义引用：
  之前那个练胸的、那套居家自重计划

类型引用：
  上次的长期计划、刚才那张动作推荐

跨会话引用：
  我之前那套增肌计划
```

### 10.2 解析输出

```ts
type ReferenceResolution =
  | {
      status: "resolved";
      artifactId: string;
      confidence: "high" | "medium";
      reason: string;
    }
  | {
      status: "ambiguous";
      candidates: Array<{
        artifactId: string;
        title: string;
        summary: string;
        kind: ArtifactKind;
        createdAt: string;
      }>;
      clarificationQuestion: string;
    }
  | {
      status: "not_found";
      reason: string;
    };
```

### 10.3 解析策略

引用解析不要全部交给向量检索。

#### 近指引用优先走位置规则

```txt
“这个”
“刚才那个”
“上一个”
```

优先从当前会话 recentArtifacts 里按时间和 UI 展示顺序定位。

#### 语义引用再走混合检索

```txt
“之前那个练胸的”
“居家自重的那套”
“上次那个不需要器械的计划”
```

走：

```txt
结构化过滤
  ↓
全文搜索
  ↓
向量检索
  ↓
业务 rerank
```

### 10.4 处理规则

```txt
高置信度唯一命中：直接使用。
多个候选接近：追问。
找不到：提示用户重新说明或走新生成流程。
不允许模型凭空构造历史卡片。
```

---

## 11. Controlled Tools 设计

### 11.1 基本原则

LLM 不直接访问数据库。

所有读取和写入都必须通过服务端工具。

工具必须满足：

```txt
强 schema
权限过滤
结果数量限制
上下文预算控制
trace 记录
写操作返回 diff
写操作经过 policy 和 validator
```

### 11.2 建议工具

```ts
searchArtifacts(input: {
  query?: string;
  kind?: ArtifactKind;
  sessionScope: "current_session" | "recent_sessions" | "all_user_sessions";
  limit: number;
}): Promise<ArtifactSearchResult[]>
```

```ts
getArtifactPayload(input: {
  artifactId: string;
}): Promise<ConversationArtifact>
```

```ts
searchExercises(input: {
  goal?: string;
  muscles?: string[];
  equipment?: string[];
  level?: "beginner" | "intermediate" | "advanced";
  allowedSections?: Array<"warmup" | "training" | "stretch">;
  excludeExerciseIds?: string[];
  excludeRiskTags?: string[];
  limit: number;
}): Promise<ExerciseCandidatePools>
```

```ts
getExerciseDetails(input: {
  exerciseIds: string[];
}): Promise<ExerciseDetail[]>
```

```ts
buildPlan(input: {
  strategy: PlanStrategy;
  sourceArtifactId?: string;
  userConstraints: UserTrainingConstraints;
}): Promise<PlanDraft>
```

```ts
validateWorkoutDraft(input: {
  draft: WorkoutDraft | PlanDraft;
  userConstraints: UserTrainingConstraints;
}): Promise<ValidationResult>
```

```ts
proposePatch(input: {
  reference: ReferenceResolution;
  userRequest: string;
  userConstraints: UserTrainingConstraints;
}): Promise<WorkoutPatch | PlanPatch>
```

```ts
applyPatch(input: {
  patch: WorkoutPatch | PlanPatch;
  confirmation?: ConfirmationToken;
}): Promise<PatchApplyResult>
```

```ts
applyScheduleChange(input: {
  scheduleId?: string;
  date?: string;
  change:
    | { type: "mark_rest"; rescheduleOriginal: boolean }
    | { type: "shift_future"; days: number }
    | { type: "replace_future_exercise"; targetExerciseId: string; replacementExerciseId: string };
}): Promise<ScheduleChangeResult>
```

```ts
recordUserFeedback(input: {
  exerciseId?: string;
  feedbackType: "dislike" | "too_hard" | "too_easy" | "pain" | "preferred";
  source: "chat" | "recommendation_card" | "workout_execution";
  note?: string;
  scope: "temporary" | "long_term" | "requires_confirmation";
}): Promise<UserMemoryWriteResult>
```

---

## 12. 动作数据模型与检索

### 12.1 动作元数据

动作表需要补充以下字段：

```ts
type ExerciseMetadata = {
  allowedSections: Array<"warmup" | "training" | "stretch">;

  primaryMuscles: string[];
  secondaryMuscles: string[];

  movementPattern:
    | "push"
    | "pull"
    | "squat"
    | "hinge"
    | "lunge"
    | "carry"
    | "rotation"
    | "anti_rotation"
    | "mobility"
    | "stretch"
    | "cardio";

  intensityRole:
    | "activation"
    | "mobility"
    | "skill"
    | "strength_main"
    | "accessory"
    | "conditioning"
    | "cooldown";

  difficulty: "beginner" | "intermediate" | "advanced";

  equipment: string[];

  riskTags: string[];
  contraindications: string[];

  regressionExerciseIds: string[];
  progressionExerciseIds: string[];

  substitutionGroupId?: string;
};
```

### 12.2 分池检索

动作检索不应该只返回一个 list，而应该返回分池结果。

```ts
type ExerciseCandidatePools = {
  warmupCandidates: ExerciseCandidate[];
  trainingCandidates: ExerciseCandidate[];
  stretchCandidates: ExerciseCandidate[];
  regressionCandidates: ExerciseCandidate[];
  progressionCandidates: ExerciseCandidate[];
  substitutionCandidates: ExerciseCandidate[];
};
```

### 12.3 检索链路

```txt
Pre-filter:
  userId / visibility / equipment / level / risk / allowedSections

Recall:
  exact name
  alias
  full-text
  vector

Post-filter:
  section legality
  contraindications
  user dislike
  pain signal
  schedule constraints

Rerank:
  goal match
  muscle balance
  movement pattern
  novelty
  fatigue
  progression fit
```

### 12.4 替代动作逻辑

替代动作不要只靠“同肌群”。

应优先基于：

```txt
substitutionGroupId
regressionExerciseIds
progressionExerciseIds
movementPattern
primaryMuscles
equipment
difficulty
allowedSections
```

例如：

```txt
push_up
incline_push_up
wall_push_up
knee_push_up
dumbbell_chest_press
machine_chest_press
```

这些应该在同一替代组或降阶链路里。

---

## 13. RAG Retrieval Layer

### 13.1 RAG 的定位

RAG 是检索层，不是业务规则层。

它负责从多个数据源召回小而相关的上下文。

### 13.2 数据源

| 数据源 | 用途 | 第一阶段是否必须 |
|---|---|---|
| Artifact Retrieval | 找历史卡片、卡片摘要、payload | 必须 |
| Exercise Retrieval | 找动作、别名、替代动作 | 建议尽早 |
| User History Retrieval | 找训练历史、反馈、完成情况 | 第二阶段 |
| Training Knowledge Retrieval | 找训练原则、解释依据 | 后置 |
| Plan Template Retrieval | 找计划模板 | 后置 |

### 13.3 输入输出

```ts
type RagQuery = {
  query: string;
  sources: Array<
    | "artifact"
    | "exercise"
    | "user_history"
    | "training_knowledge"
    | "plan_template"
  >;
  filters: Record<string, unknown>;
  limit: number;
  contextBudgetTokens: number;
};
```

```ts
type RagResult = {
  source:
    | "artifact"
    | "exercise"
    | "user_history"
    | "training_knowledge"
    | "plan_template";
  id: string;
  title: string;
  summary: string;
  score: number;
  payloadPreview?: unknown;
  reasons: string[];
};
```

### 13.4 技术选型

第一阶段建议：

```txt
PostgreSQL + pgvector
```

原因：

```txt
和现有数据库一致
减少额外基础设施
适合 artifact 摘要、动作库、用户训练记录这类中小规模数据
便于和结构化过滤结合
```

后续再评估：

```txt
Qdrant
Weaviate
Pinecone
Elasticsearch / OpenSearch vector search
```

升级条件：

```txt
向量数量明显增长
ANN 查询影响主库性能
需要复杂多租户隔离
embedding 更新影响 OLTP
需要独立向量服务扩展
```

---

## 14. PlanStrategy 与 DomainPlanEngine

### 14.1 原则

LLM 不直接生成完整长期日历。

LLM 输出策略，服务端负责展开。

### 14.2 PlanStrategy

```ts
type PlanStrategy = {
  goal: string;

  horizonDays: number;
  weeklyFrequency: number;
  sessionMinutes: number;

  strategy:
    | "repeat_previous_routine"
    | "repeat_same_routine_with_progression"
    | "weekly_split"
    | "alternating_ab"
    | "custom";

  sourceArtifactId?: string;

  progressionPolicy:
    | "none"
    | "volume_small_increase"
    | "difficulty_small_increase";

  constraints: string[];

  intensityBias: "conservative" | "normal" | "challenging";
};
```

### 14.3 DomainPlanEngine 职责

```txt
决定训练日和休息日
决定每个训练日引用哪套 routine
处理每周频率
处理周期递进
处理恢复间隔
处理训练容量上限
生成 schedule preview
```

### 14.4 示例：“三周都练这个”

```txt
用户输入：
  “三周都练这个”

ReferenceResolver：
  命中上一张 routine artifact

PlanStrategy：
  repeat_same_routine_with_progression
  horizonDays = 21
  weeklyFrequency = 用户画像默认值或当前消息指定值

DomainPlanEngine：
  生成 21 天计划
  每周 3 练或按用户设置
  第 1 周使用原 routine
  第 2 周小幅增加次数或组数
  第 3 周继续小幅递进

Validator：
  检查训练日数量、连续负荷、动作阶段、时长和风险
```

---

## 15. WorkoutPatch / PlanPatch 设计

### 15.1 Patch 目标

Patch 解决的是：

```txt
只修改目标对象
保留未被点名的内容
明确修改范围
避免误伤已完成训练
保留可追踪 diff
```

### 15.2 Locator 设计

不能只靠 `exerciseId` 定位动作，因为同一动作可能在同一计划中出现多次。

```ts
type ExerciseLocator = {
  artifactId?: string;
  routineId?: string;
  scheduleId?: string;

  dayIndex?: number;
  date?: string;

  section: "warmup" | "training" | "stretch";
  exerciseId: string;

  occurrenceIndex?: number;
};
```

### 15.3 Patch Operation

```ts
type PlanPatchOperation =
  | {
      type: "replace_exercise";
      target: ExerciseLocator;
      replacementExerciseId: string;
      preserve: {
        section: boolean;
        sets: boolean;
        reps: boolean;
        duration: boolean;
        rest: boolean;
        order: boolean;
      };
      reason: string;
    }
  | {
      type: "adjust_load";
      target: ExerciseLocator;
      setsDelta?: number;
      repsDelta?: number;
      durationDeltaSec?: number;
      reason: string;
    }
  | {
      type: "remove_exercise";
      target: ExerciseLocator;
      replacementRequired: boolean;
      reason: string;
    }
  | {
      type: "move_training_day";
      fromDate: string;
      toDate: string;
      conflictPolicy: "ask" | "shift" | "overwrite_empty_only";
      reason: string;
    }
  | {
      type: "mark_rest_day";
      date: string;
      rescheduleOriginal: boolean;
      reason: string;
    }
  | {
      type: "change_weekly_frequency";
      from: number;
      to: number;
      strategy: "preserve_routine" | "rebalance_volume";
      reason: string;
    };
```

### 15.4 Patch 对象

```ts
type PlanPatch = {
  sourceArtifactId?: string;
  sourceRoutineId?: string;
  sourceScheduleIds?: string[];

  scope:
    | "artifact_only"
    | "saved_routine"
    | "future_schedules";

  operations: PlanPatchOperation[];

  requiresConfirmation: boolean;

  policyResult?: PolicyCheckResult;
  validationResult?: ValidationResult;
};
```

### 15.5 修改范围规则

| 用户表达 | 默认目标 | 默认范围 |
|---|---|---|
| “把这个计划里的平板支撑换一个” | 当前引用 artifact | artifact_only |
| “俯卧撑不喜欢，换一个” | 当前卡片中的俯卧撑 | artifact_only |
| “后面都别安排俯卧撑” | 未来 schedule | future_schedules |
| “以后都不要俯卧撑” | 用户长期反馈 + 未来计划 | requires_confirmation |
| “明天休息” | 明天 schedule | future_schedules |
| “把上次那套改成一周四练” | 历史 routine / plan | 新 revision |

---

## 16. Policy Engine

### 16.1 为什么需要 Policy Engine

Validator 判断“训练内容是否合理”。

Policy Engine 判断“这个操作是否允许”。

两者不能混在一起。

### 16.2 Policy 检查内容

```txt
用户是否拥有该 artifact
artifact 是否 active
routine 是否已保存
schedule 是否已完成
是否允许批量修改未来 schedule
是否允许覆盖原 routine
是否需要创建 revision
是否需要用户确认
是否允许写入长期记忆
是否涉及健康风险
```

### 16.3 推荐输出

```ts
type PolicyCheckResult = {
  allowed: boolean;
  requiresConfirmation: boolean;
  reasons: string[];
  safeScope:
    | "artifact_only"
    | "new_revision"
    | "future_schedules"
    | "blocked";
};
```

---

## 17. Confirmation Gate

### 17.1 默认需要确认的操作

```txt
批量修改多个未来训练日
覆盖已保存 routine
改变每周训练频率
重排日历
把疼痛/伤病写入长期限制
大幅提高训练强度
大幅降低训练强度
删除多个动作
```

### 17.2 默认不需要确认的操作

```txt
修改未保存聊天草稿
替换当前卡片里的单个动作
记录明确 dislike
生成新版本但不覆盖旧版本
解释当前计划
```

### 17.3 用户确认流程

```txt
Agent 生成 patch proposal
  ↓
Policy 判断 requiresConfirmation = true
  ↓
Response Writer 向用户展示变更摘要
  ↓
用户确认
  ↓
applyPatch
  ↓
Validator
  ↓
Persist
```

---

## 18. Validator 设计

### 18.1 常规校验

```txt
所有 exerciseId 必须存在
动作器械必须满足用户条件
动作难度必须符合用户水平
动作不能违反 riskTags 和 contraindications
热身阶段不得出现未允许的主训练动作
拉伸阶段不得出现主训练力量动作
单次训练总时长接近用户目标
训练日数量匹配 weeklyFrequency
长期计划不能连续安排过多同肌群高负荷训练
用户要求重复同一套时，动作结构必须保持一致
```

### 18.2 Patch 专用校验

```txt
目标动作必须真实存在
未被点名动作默认保持不变
未被点名训练日默认保持不变
已完成 schedule 默认不被修改
替代动作必须满足原 section、器械、难度和风险约束
替换后总时长不能明显失控
候选不足时返回失败原因，不能凭空生成动作
```

### 18.3 修复策略

优先服务端确定性修复：

```txt
移除不合法动作
替换为同角色低风险动作
调整组数、次数、休息
调整训练日间隔
缩短或延长 session 以匹配目标时长
```

只有需要语义判断时，才让 LLM 在受控候选中选择。

---

## 19. 用户画像、反馈与长期记忆

### 19.1 画像分层

| 层级 | 示例 | 存储建议 |
|---|---|---|
| 显式资料 | 目标、经验、器械、每周频率、每次时长 | UserProfile |
| 动作反馈 | 不喜欢俯卧撑、平板支撑太难 | UserExerciseFeedback |
| 健康/不适信号 | 肩痛、膝盖不适、术后恢复 | UserMemory + requiresConfirmation |
| 训练行为 | 完成率、跳过动作、实际时长、主观疲劳 | WorkoutSessionResult |
| 临时上下文 | 今天不想练腿、明天休息 | TemporaryMemory |

### 19.2 UserMemory 设计

```ts
type UserMemory = {
  id: string;
  userId: string;

  kind:
    | "explicit_preference"
    | "exercise_feedback"
    | "constraint"
    | "temporary_context"
    | "injury_or_pain_signal";

  subjectType?: "exercise" | "muscle" | "equipment" | "schedule" | "goal";
  subjectId?: string;

  value: unknown;

  confidence: "low" | "medium" | "high";

  source: "chat" | "card_action" | "workout_result";
  sourceMessageId?: string;

  effectiveFrom: Date;
  expiresAt?: Date;

  requiresConfirmation: boolean;

  status: "active" | "dismissed" | "superseded";
};
```

### 19.3 写入规则

```txt
“我不喜欢俯卧撑”
  → 长期 dislike，可直接记录

“平板支撑太难”
  → too_hard，优先推荐 regression

“今天不想练腿”
  → 临时上下文，不能永久写入不练腿偏好

“最近肩膀不舒服”
  → injury_or_pain_signal，保守处理，可能需要确认

“以后都不要这个动作”
  → 长期限制，建议确认后写入
```

### 19.4 读取优先级

```txt
当前用户消息
  ↓
当前引用 artifact
  ↓
显式用户画像
  ↓
近期动作反馈
  ↓
训练完成记录
  ↓
系统默认值
```

当前消息永远优先。

例如用户长期默认居家训练，但本轮说“今天去健身房”，本轮应按健身房条件生成。

---

## 20. 推荐刷新与去重

### 20.1 去重职责

去重不应该交给 RAG。

服务端应统一计算排除集合。

```txt
当前卡片已有动作
当前会话已曝光动作
最近 N 次推荐过的动作
用户明确 dislike 的动作
用户反馈 too_hard 且未请求挑战的动作
健康风险相关动作
当前计划未来已大量出现的动作
```

### 20.2 候选耗尽策略

```txt
先严格排除已曝光和 dislike
  ↓
候选不足时放宽非关键条件
  ↓
仍不足时明确告诉用户候选不足
  ↓
提供可放宽选项
  ↓
用户确认后才允许回填相似动作或已曝光动作
```

### 20.3 Trace 字段

```ts
type RecommendationTrace = {
  goal: string;
  filters: Record<string, unknown>;
  excludedExerciseIds: string[];
  excludeReasons: Record<string, string[]>;
  candidateCountBeforeFilter: number;
  candidateCountAfterFilter: number;
  relaxedConstraints?: string[];
  fallbackUsed: boolean;
  finalExerciseIds: string[];
};
```

---

## 21. 健康与安全边界

训练计划系统会不可避免遇到：

```txt
疼痛
受伤
术后恢复
疾病
孕期/产后
眩晕
胸闷
呼吸困难
```

因此建议增加：

```txt
Health Safety Classifier
```

### 21.1 风险等级

```ts
type HealthRiskLevel =
  | "none"
  | "minor_discomfort"
  | "pain_or_injury"
  | "high_risk_symptom";
```

### 21.2 处理策略

```txt
minor_discomfort:
  降低强度
  避免相关动作
  使用保守替代

pain_or_injury:
  不推荐高强度替代
  建议停止相关动作
  提醒寻求专业人士意见

high_risk_symptom:
  不生成训练计划
  建议尽快寻求专业帮助
```

这不是医疗诊断，而是训练系统的安全边界。

---

## 22. Trace / Replay / Eval

### 22.1 AiRunTrace

```ts
type AiRunTrace = {
  runId: string;
  userId: string;
  sessionId: string;
  messageId: string;

  model: string;
  promptVersion: string;
  toolVersions: Record<string, string>;

  input: {
    latestUserMessage: string;
    recentArtifactSummaries: unknown[];
    userProfileSnapshot: unknown;
    userMemorySnapshot: unknown;
  };

  steps: Array<{
    type:
      | "intent_resolution"
      | "reference_resolution"
      | "rag_query"
      | "tool_call"
      | "patch_proposal"
      | "policy_check"
      | "confirmation_gate"
      | "validation"
      | "repair"
      | "persistence"
      | "response_write";

    input: unknown;
    output: unknown;
    latencyMs: number;
    tokenUsage?: unknown;
  }>;

  finalDecision: unknown;

  createdAt: Date;
};
```

### 22.2 Replay 要求

必须能用以下快照复现一次 AI 决策：

```txt
用户消息
artifact 快照
用户画像快照
用户反馈快照
promptVersion
toolVersion
model
```

Replay 的目标不是保证模型每次 token 完全一致，而是能复盘：

```txt
为什么引用到了这个 artifact
为什么选了这个 patch scope
为什么替换成这个动作
为什么 validator 放行或拦截
```

### 22.3 Eval Suite

建议建立固定用例集。

```yaml
- name: repeat_current_routine_for_3_weeks
  input: "三周都练这个"
  givenArtifacts:
    - kind: "routine"
      title: "居家胸肩训练"
  expect:
    reference.status: "resolved"
    strategy: "repeat_same_routine_with_progression"
    shouldNotGenerateNewSplit: true

- name: replace_push_up_only
  input: "俯卧撑太难了，换一个"
  givenArtifact:
    kind: "routine"
    containsExercise: "push_up"
  expect:
    patch.operations[0].type: "replace_exercise"
    unchangedExercisesPreserved: true

- name: future_push_up_replacement
  input: "后面都别安排俯卧撑"
  givenSchedule:
    hasCompletedPushUps: true
    hasFuturePushUps: true
  expect:
    completedScheduleChanged: false
    futureScheduleChanged: true

- name: ambiguous_reference
  input: "把这个改成一周四练"
  givenArtifacts:
    - kind: "routine"
    - kind: "plan"
  expect:
    reference.status: "ambiguous"
```

---

## 23. 分阶段实施计划

### 阶段 0：Schema 与边界收敛

目标：先把类型和边界定清楚，不急着做 RAG。

交付：

```txt
ConversationArtifact schema
ArtifactIndex schema
ReferenceResolution schema
PlanStrategy schema
WorkoutPatch / PlanPatch schema
ValidationResult schema
PolicyCheckResult schema
AiRunTrace schema
```

验收：

```txt
核心对象能表达生成、引用、修改、校验、保存、追踪的完整链路。
```

### 阶段 1：Artifact 化 + 引用解析

目标：解决“这个 / 上一个 / 刚才那套”。

交付：

```txt
ConversationArtifact 表
ArtifactIndex 表
每次 card push 后保存 artifact
recentArtifacts context builder
ReferenceResolver v1
getArtifactPayload 工具
基础 trace
```

验收：

```txt
“这个”
“上一个”
“刚才那套”
“三周都练这个”
```

能稳定命中具体 artifact。

### 阶段 2：Patch 化修改

目标：解决“换掉这个动作”。

交付：

```txt
WorkoutPatch / PlanPatch
PatchEngine
PatchValidator
artifact revision
单动作替换
未保存草稿修改
```

验收：

```txt
“俯卧撑不喜欢，换一个”
“平板支撑太难，换简单点”
```

只改目标动作，不重生成整份计划。

### 阶段 3：动作元数据 + 分池检索

目标：解决动作放错阶段。

交付：

```txt
allowedSections
intensityRole
movementPattern
riskTags
substitutionGroupId
warmup / training / stretch 分池
validator 禁止非法 section
```

验收：

```txt
主训练动作不会进热身
拉伸动作不会进主训练
替代动作符合原 section 和难度要求
```

### 阶段 4：DomainPlanEngine v1

目标：长期计划不靠 LLM 铺满。

交付：

```txt
PlanStrategy
repeat_previous_routine
repeat_same_routine_with_progression
weekly_frequency
rest day placement
schedule preview
```

验收：

```txt
“三周都练这个”
“一周三练”
“改成一周四练但别太累”
```

可以稳定生成可解释计划。

### 阶段 5：User Memory + 推荐去重

目标：让反馈和刷新行为变稳定。

交付：

```txt
UserExerciseFeedback
UserMemory
ExerciseExposure
服务端统一 exclude set
候选耗尽判断
```

验收：

```txt
“换一批”不会无限重复
“不喜欢俯卧撑”会影响后续推荐
“今天不想练腿”不会污染长期画像
```

### 阶段 6：RAG 增强

目标：提升模糊检索能力。

交付：

```txt
pgvector
artifact embedding
exercise embedding
hybrid search
business rerank
```

验收：

```txt
“之前那个练胸的”
“拜拜肉”
“核心不稳”
“圆肩”
```

可以召回相关 artifact 或动作，但不会绕过结构化过滤。

### 阶段 7：复杂 Agent Runtime

目标：处理多工具、多步骤、多状态任务。

交付：

```txt
自定义 Orchestrator 强化
或引入 LangGraph / Agents SDK
checkpoint
human confirmation
tool guardrails
replay
```

验收：

```txt
“把之前那个练胸计划改成一周四练，保留动作但强度别太高”
```

能走稳定多步工具流程，并且每一步可追踪。

---

## 24. 推荐技术清单

| 模块 | 优先级 | 说明 |
|---|---:|---|
| ConversationArtifact | P0 | 卡片事实源 |
| ArtifactIndex | P0 | 支持引用和检索 |
| ReferenceResolver | P0 | 解决“这个 / 上次那个” |
| Structured Outputs | P0 | LLM 输出必须 schema 化 |
| WorkoutPatch / PlanPatch | P0 | 局部修改核心能力 |
| Validator | P0 | 保证训练合法性 |
| Trace | P0 | 没有 trace 不能上线复杂 AI |
| Policy Engine | P1 | 控制修改权限 |
| Confirmation Gate | P1 | 防止 AI 自作主张 |
| DomainPlanEngine | P1 | 长期计划稳定性核心 |
| UserMemory / Feedback | P1 | 长期偏好和反馈 |
| Exercise Metadata | P1 | 动作分池和合法性基础 |
| Recommendation Dedup | P1 | 解决“换一批”重复 |
| pgvector | P2 | 向量检索初版 |
| Hybrid Search | P2 | 全文 + 向量 + 结构化 |
| Reranker | P2 | 业务排序 |
| Health Safety Classifier | P2 | 健康风险边界 |
| Replay | P2 | 复盘线上问题 |
| Eval Suite | P2 | 防止模型和 prompt 回归 |
| Agent Runtime | P3 | 工具流程复杂后再引入 |
| Independent Vector DB | P3 | 规模上来后再考虑 |

---

## 25. 推荐 OpenSpec 拆分

可以按以下 changes 拆，而不是一个巨大 change。

```txt
change-001-conversation-artifact
change-002-reference-resolver
change-003-workout-patch
change-004-exercise-metadata-pools
change-005-domain-plan-engine
change-006-user-feedback-memory
change-007-recommendation-dedup
change-008-rag-hybrid-search
change-009-policy-confirmation
change-010-ai-trace-eval
```

第一批建议只做：

```txt
change-001-conversation-artifact
change-002-reference-resolver
change-003-workout-patch
change-010-ai-trace-eval 的基础 trace 部分
```

这四个能最快验证架构方向。

---

## 26. 相对原方案的主要调整

### 26.1 调整表达重点

原方案重点是：

```txt
RAG + Agent 框架
```

调整后重点是：

```txt
结构化训练计划编排系统
```

RAG 和 Agent 仍然重要，但它们不是第一性目标。真正核心是：

```txt
artifact 事实源
引用解析
受控工具
patch 语义
领域引擎
validator
policy
trace / eval
```

### 26.2 降低第一阶段复杂度

原方案容易一次性引入太多模块：

```txt
Artifact RAG
Exercise RAG
User History RAG
Training Knowledge RAG
Plan Template RAG
Agent Orchestrator
DomainPlanEngine
Feedback memory
Schedule change
Trace
Eval
```

调整后第一阶段只做最小闭环：

```txt
ConversationArtifact
ReferenceResolver
getArtifactPayload
WorkoutPatch / PlanPatch 初版
Validator
Trace
```

### 26.3 明确 RAG 边界

RAG 负责召回，不负责决策。

不能用向量相似度替代：

```txt
器械过滤
难度过滤
训练阶段合法性
动作风险过滤
用户 dislike 过滤
schedule 修改权限
```

### 26.4 明确 Agent 边界

Agent 是受控编排器，不是自由代理。

第一阶段可以先用自定义 Orchestrator，不必立刻引入复杂 Agent runtime。

### 26.5 新增 Policy Engine 与 Confirmation Gate

Validator 只判断训练内容是否合法。

Policy Engine 判断操作是否允许。

Confirmation Gate 判断是否需要用户确认。

这三者必须拆开。

### 26.6 新增 ArtifactIndex

Artifact payload 可以很复杂，不适合直接检索。

需要单独维护 ArtifactIndex，用于：

```txt
结构化过滤
全文搜索
向量检索
业务 rerank
```

### 26.7 新增 Trace / Replay / Eval 强约束

RAG 和 Agent 一旦上线，必须能回答：

```txt
为什么命中了这张卡片？
为什么用了这个动作？
为什么这个 patch 被允许？
为什么 validator 放行？
为什么重复推荐了某个动作？
```

没有 trace，复杂 AI 系统不可维护。

---

## 27. 最终推荐结论

原始方向是对的，但应该从“引入 RAG + Agent”改成更准确的工程目标：

> 建立一个以结构化 artifact 为事实源、以受控工具为执行边界、以 patch 为修改语义、以领域引擎和 validator 保证训练质量的 AI 训练计划编排系统。

最小可行闭环应该是：

```txt
ConversationArtifact
  ↓
ReferenceResolver
  ↓
getArtifactPayload
  ↓
PlanStrategy
  ↓
DomainPlanEngine / PatchEngine
  ↓
Validator
  ↓
Trace
  ↓
Card Push
```

不要第一阶段就把所有 RAG、Agent、Knowledge Base、Plan Template、User History 全部做完。

真正优先的是：

```txt
卡片能被引用
引用能被解析
修改能被 patch
计划能被校验
错误能被追踪
```

只要这个闭环跑通，系统就会从“模型每次重新猜”升级成“服务端有事实、有状态、有版本、有校验、有回放”的架构。

这一步价值最大，也最适合作为第一阶段落地。
