# AI 训练计划编排系统最终改进方案

## 1. 最终结论

本方案的目标不是简单引入 `RAG` 或 `Agent`，而是建设一套可引用、可修订、可验证、可追踪的 **AI 训练计划编排系统**。

系统应从“LLM 每轮重新生成训练内容”，升级为：

```txt
结构化事实源
  +
引用解析
  +
受控工具调用
  +
局部 Patch 修改
  +
领域计划引擎
  +
校验与权限控制
  +
Trace / Replay / Eval
```

最终要解决的核心问题是：

```txt
用户在后续对话中引用 UI 卡片、历史计划、已保存 routine 或未来 schedule 时，系统能够准确定位对象、理解修改范围、只改该改的部分，并保证结果可校验、可回放、可持续迭代。
```

---

## 2. 核心目标

系统需要具备以下能力：

1. 结构化卡片可以被后续对话稳定引用。
2. 用户说“这个”“上次那个”“之前那套练胸的”时，系统能定位真实对象。
3. 用户要求修改动作、训练日、频率或计划周期时，系统通过 Patch 局部修改，而不是重生成整份计划。
4. 长期训练计划由服务端领域引擎展开，LLM 不直接自由生成完整日历。
5. 动作推荐遵守器械、难度、阶段、风险、用户反馈和健康限制。
6. 已完成训练历史默认不可被误改，未来 schedule 的批量修改需要明确边界。
7. 用户反馈可以沉淀为长期偏好，但临时偏好不能污染长期画像。
8. 所有关键 AI 决策、工具调用、引用解析、Patch、校验和保存结果都可追踪、可回放、可测试。

---

## 3. 当前系统需要解决的问题

### 3.1 UI 卡片没有成为 AI 可用的事实源

用户后续对话经常引用之前推送过的结构化卡片，例如：

```txt
三周都练这个
按上次那套改成一周四练
把刚才那个计划里的俯卧撑换掉
后面都别安排平板支撑
```

这些表达依赖的不是普通聊天文本，而是 UI 中出现过的结构化对象：

```txt
动作推荐卡片
单次训练 routine 卡片
长期训练 plan 卡片
未来 schedule 卡片
```

因此，卡片必须被保存为可检索、可引用、可修订的结构化事实对象。

### 3.2 conversationSummary 不能承担事实源职责

`conversationSummary` 适合保存用户目标、偏好、器械条件、近期约束等摘要信息，但不适合保存完整训练卡片。

原因是：

```txt
自然语言压缩会丢失结构化细节
多个卡片之间的关系不清晰
无法稳定支持局部 Patch
上下文会随着轮次增长而膨胀
```

所以，summary 只能作为语义上下文，不能作为训练计划事实源。

### 3.3 LLM 承担了过多训练计划生成职责

LLM 适合理解用户意图、选择策略、解释结果，但不适合直接负责：

```txt
动作合法性判断
训练阶段归类
周期递进
休息日安排
未来 schedule 修改
数据库落库
健康风险控制
```

这些必须由服务端领域系统、Validator、Policy 和 Patch Engine 完成。

### 3.4 局部修改缺少 Patch 语义

用户说“把俯卧撑换掉”时，系统不应该重新生成整份计划。

正确流程是：

```txt
定位目标对象
  ↓
定位目标动作或训练日
  ↓
生成结构化 Patch
  ↓
应用 Patch
  ↓
校验修改后的结果
  ↓
保存新版本
  ↓
返回变更摘要
```

没有 Patch，系统容易误改未被点名的动作、训练日、组数、休息时间或计划结构。

### 3.5 缺少可追踪与可回放能力

复杂 AI 系统上线后，错误来源可能是：

```txt
引用解析错误
动作召回错误
过滤规则错误
Patch scope 错误
Validator 太宽或太严
用户画像污染
候选不足但系统强行回填
```

因此必须建设 Trace、Replay 和 Eval，否则系统不可维护。

---

## 4. 设计原则

### 4.1 数据库是事实来源

训练动作、用户计划、推送卡片、训练记录、用户限制和反馈，都应以服务端数据库为事实来源。

LLM 输出只能作为候选决策，不能未经校验直接落库。

### 4.2 LLM 做语义理解和策略选择

LLM 主要负责：

```txt
理解自然语言意图
判断用户是否引用历史对象
判断用户要生成、重复、扩展、修改还是解释
在受控候选中选择策略
生成面向用户的解释文案
```

LLM 不直接负责：

```txt
查询全量数据库
自由生成完整长期日历
绕过校验保存训练计划
直接修改已保存 routine 或 schedule
```

### 4.3 RAG 是检索层，不是规则引擎

RAG 只负责召回相关上下文，例如 artifact、动作、反馈、历史记录或训练知识。

它不能替代：

```txt
器械过滤
难度过滤
训练阶段合法性
动作风险判断
用户 dislike 过滤
schedule 修改权限判断
```

### 4.4 Agent 是受控编排器，不是自由代理

Agent 可以帮助拆解任务和调用工具，但必须受限于：

```txt
工具 schema
权限边界
上下文预算
Policy Engine
Validator
Confirmation Gate
Trace
```

第一阶段不需要引入复杂 Agent runtime，自定义 Orchestrator 更适合快速落地。

### 4.5 修改必须 Patch 化

所有局部修改都应表达为结构化 Patch，包括：

```txt
替换动作
删除动作
动作降阶或进阶
调整组数、次数、时长、休息
移动训练日
插入休息日
调整每周训练频率
批量替换未来 schedule 中的动作
```

Patch 必须包含修改目标、修改范围、保留字段、校验结果和最终 diff。

---

## 5. 最终目标架构

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
  ├─ ArtifactIndex Service
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

### 5.1 模块职责

| 模块                         | 职责                             | LLM 是否参与       |
| -------------------------- | ------------------------------ | -------------- |
| Conversation State Builder | 构建当前会话、recent artifacts、用户画像摘要 | 否              |
| Intent Resolver            | 判断生成、引用、修改、解释、日历调整等意图          | LLM 辅助         |
| Reference Resolver         | 解析“这个 / 上次 / 之前那套”             | LLM 辅助 + 服务端校验 |
| Task Orchestrator          | 编排工具调用和任务流程                    | 服务端为主          |
| Artifact Service           | 保存、读取、修订结构化卡片                  | 否              |
| ArtifactIndex Service      | 支持结构化过滤、全文检索、向量检索              | 否              |
| Exercise Retrieval Service | 检索动作并分池                        | 否              |
| Plan Engine                | 根据策略展开长期计划                     | 否              |
| Patch Engine               | 应用 WorkoutPatch / PlanPatch    | 否              |
| Schedule Service           | 管理未来安排和完成记录                    | 否              |
| Policy Engine              | 判断操作是否允许                       | 否              |
| Confirmation Gate          | 判断是否需要用户确认                     | 否              |
| Validator                  | 校验训练内容是否合法                     | 否              |
| Response Writer            | 生成自然语言解释                       | LLM            |
| Trace / Replay / Eval      | 记录、回放、测试 AI 决策链路               | 否              |

---

## 6. ConversationArtifact：结构化卡片事实源

### 6.1 目的

`ConversationArtifact` 用于保存每次推送给用户的结构化结果，让 UI 卡片成为后续 AI 可检索、可引用、可修改的事实对象。

### 6.2 推荐类型

```ts
type ArtifactKind =
  | "exercise_recommendation"
  | "routine"
  | "plan";

type ArtifactScope =
  | "chat_draft"
  | "saved_routine"
  | "saved_schedule";
```

### 6.3 推荐字段

```ts
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

### 6.4 保存规则

```txt
每次成功推送动作推荐、routine 或 plan，都创建 artifact。
artifact 记录 messageId，保留与聊天气泡的关系。
artifact 被修改时，不覆盖旧版本，而是创建新 version。
旧 artifact 标记为 superseded。
如果 artifact 已保存成 routine 或 schedule，记录 sourceEntityKind 和 sourceEntityId。
```

---

## 7. ArtifactIndex：引用与检索索引

### 7.1 目的

不要每次检索都扫描复杂 JSON payload。需要单独维护 `ArtifactIndex`，用于快速过滤、搜索和排序。

### 7.2 推荐字段

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

### 7.3 检索优先级

```txt
当前会话 artifact 优先
最近推送 artifact 优先
类型匹配优先
用户当前表达匹配优先
已 active 的 artifact 优先
已 superseded 或 archived 的 artifact 降权
```

---

## 8. ReferenceResolver：引用解析

### 8.1 需要支持的引用

```txt
近指引用：这个、这套、刚才那个、上一个
顺序引用：上上个、第三个、最早那个
语义引用：之前那个练胸的、那套居家自重计划
类型引用：上次的长期计划、刚才那张动作推荐
跨会话引用：我之前那套增肌计划
```

### 8.2 输出结构

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

### 8.3 解析策略

近指引用优先走位置规则：

```txt
“这个”
“刚才那个”
“上一个”
```

优先从当前会话 `recentArtifacts` 中按 UI 展示顺序和时间顺序定位。

语义引用再走混合检索：

```txt
结构化过滤
  ↓
全文搜索
  ↓
向量检索
  ↓
业务 rerank
```

### 8.4 处理规则

```txt
高置信度唯一命中：直接使用。
多个候选接近：返回候选，让用户确认。
找不到：提示用户重新说明，或进入新生成流程。
不允许模型凭空构造历史卡片。
```

---

## 9. Controlled Tools：受控工具层

LLM 不直接访问数据库。所有读写都必须通过服务端工具。

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

### 9.1 推荐工具

```ts
searchArtifacts(input: {
  query?: string;
  kind?: ArtifactKind;
  sessionScope: "current_session" | "recent_sessions" | "all_user_sessions";
  limit: number;
}): Promise<ArtifactSearchResult[]>;
```

```ts
getArtifactPayload(input: {
  artifactId: string;
}): Promise<ConversationArtifact>;
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
}): Promise<ExerciseCandidatePools>;
```

```ts
buildPlan(input: {
  strategy: PlanStrategy;
  sourceArtifactId?: string;
  userConstraints: UserTrainingConstraints;
}): Promise<PlanDraft>;
```

```ts
proposePatch(input: {
  reference: ReferenceResolution;
  userRequest: string;
  userConstraints: UserTrainingConstraints;
}): Promise<WorkoutPatch | PlanPatch>;
```

```ts
applyPatch(input: {
  patch: WorkoutPatch | PlanPatch;
  confirmation?: ConfirmationToken;
}): Promise<PatchApplyResult>;
```

```ts
validateWorkoutDraft(input: {
  draft: WorkoutDraft | PlanDraft;
  userConstraints: UserTrainingConstraints;
}): Promise<ValidationResult>;
```

---

## 10. 动作数据模型与分池检索

### 10.1 动作元数据

动作不能只按“相关性”召回。训练系统需要明确动作可放置的阶段、角色、难度、风险和替代关系。

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

### 10.2 分池检索结果

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

### 10.3 检索链路

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

### 10.4 替代动作优先级

替代动作不要只靠同肌群，应按以下优先级选择：

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

---

## 11. PlanStrategy 与 DomainPlanEngine

### 11.1 基本原则

LLM 不直接生成完整长期日历。LLM 只输出计划策略，服务端 `DomainPlanEngine` 负责展开。

### 11.2 PlanStrategy

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

### 11.3 DomainPlanEngine 职责

```txt
决定训练日和休息日
决定每个训练日引用哪套 routine
处理每周训练频率
处理周期递进
处理恢复间隔
处理训练容量上限
生成 schedule preview
```

### 11.4 示例流程：“三周都练这个”

```txt
用户输入：
  三周都练这个

ReferenceResolver：
  命中上一张 routine artifact

PlanStrategy：
  strategy = repeat_same_routine_with_progression
  horizonDays = 21
  weeklyFrequency = 用户画像默认值或当前消息指定值

DomainPlanEngine：
  生成 21 天计划
  按每周频率安排训练日
  第 1 周使用原 routine
  第 2 周小幅增加次数或组数
  第 3 周继续小幅递进

Validator：
  检查训练日数量、连续负荷、动作阶段、时长和风险
```

---

## 12. WorkoutPatch / PlanPatch

### 12.1 Patch 目标

Patch 要保证：

```txt
只修改目标对象
保留未被点名的内容
明确修改范围
避免误伤已完成训练
保留可追踪 diff
```

### 12.2 Locator

同一动作可能在同一计划中出现多次，所以不能只靠 `exerciseId` 定位。

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

### 12.3 Patch Operation

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

### 12.4 PlanPatch

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

### 12.5 默认修改范围

| 用户表达           | 默认目标              | 默认范围                  |
| -------------- | ----------------- | --------------------- |
| 把这个计划里的平板支撑换一个 | 当前引用 artifact     | artifact_only         |
| 俯卧撑不喜欢，换一个     | 当前卡片中的俯卧撑         | artifact_only         |
| 后面都别安排俯卧撑      | 未来 schedule       | future_schedules      |
| 以后都不要俯卧撑       | 用户长期反馈 + 未来计划     | requires_confirmation |
| 明天休息           | 明天 schedule       | future_schedules      |
| 把上次那套改成一周四练    | 历史 routine / plan | new revision          |

---

## 13. Policy Engine 与 Confirmation Gate

### 13.1 Policy Engine 职责

Validator 判断训练内容是否合理，Policy Engine 判断操作是否允许。

Policy 需要检查：

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

### 13.2 Policy 输出

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

### 13.3 默认需要确认的操作

```txt
批量修改多个未来训练日
覆盖已保存 routine
改变每周训练频率
重排日历
把疼痛或伤病写入长期限制
大幅提高训练强度
大幅降低训练强度
删除多个动作
```

### 13.4 默认不需要确认的操作

```txt
修改未保存聊天草稿
替换当前卡片里的单个动作
记录明确 dislike
生成新版本但不覆盖旧版本
解释当前计划
```

---

## 14. Validator

### 14.1 常规校验

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

### 14.2 Patch 专用校验

```txt
目标动作必须真实存在
未被点名动作默认保持不变
未被点名训练日默认保持不变
已完成 schedule 默认不被修改
替代动作必须满足原 section、器械、难度和风险约束
替换后总时长不能明显失控
候选不足时返回失败原因，不能凭空生成动作
```

### 14.3 修复策略

优先使用服务端确定性修复：

```txt
移除不合法动作
替换为同角色低风险动作
调整组数、次数、休息
调整训练日间隔
缩短或延长 session 以匹配目标时长
```

只有需要语义判断时，才让 LLM 在受控候选中选择。

---

## 15. 用户画像、反馈与长期记忆

### 15.1 画像分层

| 层级      | 示例                 | 存储建议                              |
| ------- | ------------------ | --------------------------------- |
| 显式资料    | 目标、经验、器械、每周频率、每次时长 | UserProfile                       |
| 动作反馈    | 不喜欢俯卧撑、平板支撑太难      | UserExerciseFeedback              |
| 健康/不适信号 | 肩痛、膝盖不适、术后恢复       | UserMemory + requiresConfirmation |
| 训练行为    | 完成率、跳过动作、实际时长、主观疲劳 | WorkoutSessionResult              |
| 临时上下文   | 今天不想练腿、明天休息        | TemporaryMemory                   |

### 15.2 UserMemory

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

### 15.3 写入规则

```txt
“我不喜欢俯卧撑”
  → 长期 dislike，可直接记录

“平板支撑太难”
  → too_hard，优先推荐 regression

“今天不想练腿”
  → 临时上下文，不能永久写入不练腿偏好

“最近肩膀不舒服”
  → injury_or_pain_signal，保守处理，必要时确认

“以后都不要这个动作”
  → 长期限制，建议确认后写入
```

### 15.4 读取优先级

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

---

## 16. 推荐刷新与去重

去重不应该交给 RAG，而应由服务端统一计算排除集合。

### 16.1 排除集合

```txt
当前卡片已有动作
当前会话已曝光动作
最近 N 次推荐过的动作
用户明确 dislike 的动作
用户反馈 too_hard 且未请求挑战的动作
健康风险相关动作
当前计划未来已大量出现的动作
```

### 16.2 候选不足策略

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

### 16.3 RecommendationTrace

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

## 17. 健康与安全边界

系统需要识别训练相关风险，但不做医疗诊断。

### 17.1 风险等级

```ts
type HealthRiskLevel =
  | "none"
  | "minor_discomfort"
  | "pain_or_injury"
  | "high_risk_symptom";
```

### 17.2 处理策略

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

---

## 18. Trace / Replay / Eval

### 18.1 AiRunTrace

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

### 18.2 Replay 要求

系统必须能用以下快照复盘一次 AI 决策：

```txt
用户消息
artifact 快照
用户画像快照
用户反馈快照
promptVersion
toolVersion
model
```

Replay 的目标不是保证每次生成 token 完全一致，而是能回答：

```txt
为什么引用到了这张卡片？
为什么选择这个 Patch scope？
为什么替换成这个动作？
为什么 Validator 放行或拦截？
为什么重复推荐了某个动作？
```

### 18.3 Eval Suite 初始用例

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

## 19. 分阶段实施计划

### 阶段 0：Schema 与边界收敛

目标：先把核心类型和职责边界定清楚。

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
核心对象能够表达生成、引用、修改、校验、保存、追踪的完整链路。
```

### 阶段 1：Artifact 化 + 引用解析

目标：解决“这个 / 上一个 / 刚才那套”。

交付：

```txt
ConversationArtifact 表
ArtifactIndex 表
card push 后保存 artifact
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

能够稳定命中具体 artifact。

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

目标：解决动作放错阶段和替代不合理。

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
主训练动作不会进入热身
拉伸动作不会进入主训练
替代动作符合原 section、器械、难度和风险要求
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

目标：让反馈、偏好和刷新行为稳定。

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

目标：提升模糊检索能力，但不绕过结构化过滤。

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

可以召回相关 artifact 或动作，并且仍通过规则、Policy 和 Validator 约束。

### 阶段 7：复杂 Orchestrator / Agent Runtime

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

能够走稳定多步流程，并且每一步可追踪。

---

## 20. 优先级清单

| 模块                       | 优先级 | 说明                 |
| ------------------------ | --: | ------------------ |
| ConversationArtifact     |  P0 | 卡片事实源              |
| ArtifactIndex            |  P0 | 支持引用和检索            |
| ReferenceResolver        |  P0 | 解决“这个 / 上次那个”      |
| Structured Outputs       |  P0 | LLM 输出必须 schema 化  |
| WorkoutPatch / PlanPatch |  P0 | 局部修改核心能力           |
| Validator                |  P0 | 保证训练合法性            |
| Trace                    |  P0 | 没有 trace 不能上线复杂 AI |
| Policy Engine            |  P1 | 控制修改权限             |
| Confirmation Gate        |  P1 | 防止 AI 自作主张         |
| DomainPlanEngine         |  P1 | 长期计划稳定性核心          |
| UserMemory / Feedback    |  P1 | 长期偏好和反馈            |
| Exercise Metadata        |  P1 | 动作分池和合法性基础         |
| Recommendation Dedup     |  P1 | 解决“换一批”重复          |
| pgvector                 |  P2 | 向量检索初版             |
| Hybrid Search            |  P2 | 全文 + 向量 + 结构化      |
| Reranker                 |  P2 | 业务排序               |
| Health Safety Classifier |  P2 | 健康风险边界             |
| Replay                   |  P2 | 复盘线上问题             |
| Eval Suite               |  P2 | 防止模型和 prompt 回归    |
| Agent Runtime            |  P3 | 工具流程复杂后再引入         |
| Independent Vector DB    |  P3 | 规模上来后再考虑           |

---

## 21. 推荐 OpenSpec 拆分

建议拆成多个小 change，而不是一个巨大 change。

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

这四个可以最快验证架构方向。

---

## 22. 最小可行闭环

第一阶段最小闭环建议如下：

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

这条链路跑通后，系统就不再依赖“模型每轮重新猜”，而是具备：

```txt
有事实源
有引用能力
有局部修改能力
有版本管理
有校验边界
有调试与回放能力
```

---

## 23. 最终落地建议

优先级不要从“RAG + Agent 全量升级”开始，而应该从最小工程闭环开始：

```txt
卡片能被保存
引用能被解析
payload 能被读取
修改能被 Patch
结果能被校验
决策能被 Trace
```

这是当前系统最值得先做的改进。

当这个闭环稳定后，再逐步增强：

```txt
动作元数据
长期计划引擎
用户反馈记忆
推荐去重
混合检索
复杂 Agent 编排
```

最终系统形态应是：

```txt
以结构化 artifact 为事实源，
以受控工具为执行边界，
以 Patch 为修改语义，
以领域引擎和 Validator 保证训练质量，
以 Policy 和 Confirmation 控制风险，
以 Trace / Replay / Eval 保证可维护性的 AI 训练计划编排系统。
```
