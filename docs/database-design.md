# 数据库设计说明

本文档是根据当前已有 PostgreSQL / Prisma 数据模型整理的现状说明，事实来源是 `prisma/schema.prisma`，迁移文件位于 `prisma/migrations/`。

本文档用于帮助开发者理解当前数据库设计、表关系和字段含义，不是未来数据库设计规范。后续数据库变更仍应以实际需求、OpenSpec 变更流程和 `prisma/schema.prisma` 为准。

## 时间字段约定

当前所有表示具体时间点的 Prisma `DateTime` 字段都显式映射为 PostgreSQL `@db.Timestamptz(3)`。历史 migration 保留项目演进记录，不回写旧 `TIMESTAMP(3)`；标准化迁移通过 forward migration 把既有值按 UTC+0 解释后转换为 `TIMESTAMPTZ(3)`。

服务端边界统一用 ISO 8601 UTC `Z` 字符串表达数据库时间，例如 `2026-05-31T05:07:20.006Z`。`WorkoutSchedule.scheduledFor` 仍是日期型业务字段，但持久化为对应日期的 UTC 零点，页面和服务 DTO 中的 `YYYY-MM-DD` date key 从这个 UTC 值派生。

## 1. 设计概览

当前数据库围绕 5 个核心业务域组织：

| 业务域 | 相关表 | 说明 |
|---|---|---|
| 用户与身份 | `User`、`UserIdentity`、`UserProfile` | 保存用户主体、登录身份、软删除状态和健身画像。当前本地匿名鉴权通过浏览器 HttpOnly cookie 恢复当前用户。 |
| 用户反馈记忆 | `UserMemory`、`UserExerciseFeedback` | 保存显式偏好、动作反馈、临时上下文和训练行为反馈；健康/不适字段保留为历史兼容，不参与训练生成决策。 |
| 动作库 | `Exercise` | 保存训练动作的标准事实数据，包括来源、分类、肌群、器械、居家可做条件、图片、教学步骤和审核状态。 |
| 训练编排、日历与结果 | `WorkoutRoutine`、`WorkoutRoutineItem`、`WorkoutSchedule`、`WorkoutSessionResult` | 保存用户可复用动作编排、编排项、日历安排和实际训练结果摘要。 |
| 聊天历史 | `ChatSession`、`ChatMessage`、`ConversationArtifact`、`ArtifactIndex`、`ConversationBusinessFact` | 保存用户和 AI 的对话历史、聊天结构化卡片事实源、轻量索引、跨 run 业务事实和自然语言上下文总结。 |

主要关系如下：

```txt
User
  ├─ UserIdentity
  ├─ UserProfile
  ├─ UserMemory
  ├─ UserExerciseFeedback ── Exercise
  ├─ WorkoutRoutine
  │    ├─ WorkoutRoutineItem ── Exercise
  │    ├─ WorkoutSchedule
  │    └─ WorkoutSessionResult
  ├─ WorkoutSchedule
  │    └─ WorkoutSessionResult
  └─ ChatSession
       ├─ ChatMessage
       ├─ ConversationArtifact
       ├─ ArtifactIndex
       └─ ConversationBusinessFact
```

## 2. 枚举

### AuthProvider

用户登录身份来源。

| 值 | 含义 |
|---|---|
| `credentials` | 账号密码登录。 |
| `google` | Google 登录。 |
| `github` | GitHub 登录。 |
| `apple` | Apple 登录。 |
| `anonymous` | 本地匿名身份。当前浏览器匿名 auth cookie 会通过该身份恢复请求级 `CurrentUser`。 |

### ExerciseReviewStatus

动作库内容审核状态。

| 值 | 含义 |
|---|---|
| `machine_translated` | 机器翻译后尚未人工深度处理。 |
| `machine_assisted` | 机器辅助整理过，仍可能需要人工复核。 |
| `human_reviewed` | 已人工审核。 |
| `rejected` | 已拒绝，不应面向用户使用。 |
| `fallback` | 兜底动作数据，通常用于保证系统可用性。 |

### WorkoutRoutineStatus

训练编排状态。

| 值 | 含义 |
|---|---|
| `active` | 正在使用或已保存的编排。 |
| `archived` | 已归档，不在常规列表中展示。 |

### WorkoutRoutineSource

训练编排来源。

| 值 | 含义 |
|---|---|
| `ai` | AI 生成。 |
| `manual` | 用户手动编排。 |
| `imported` | 外部导入。 |

### WorkoutScheduleStatus

训练日历安排状态。

| 值 | 含义 |
|---|---|
| `planned` | 已计划，尚未完成。 |
| `completed` | 已完成。 |
| `missed` | 已错过。 |
| `cancelled` | 已取消，当前删除日程时使用软取消。 |
| `rest` | 休息日。 |

### WorkoutSessionResultStatus

训练结果状态。

| 值 | 含义 |
|---|---|
| `completed` | 已完成训练。 |
| `abandoned` | 中途放弃或未完整完成。 |

### UserMemoryKind

用户结构化记忆类型。

| 值 | 含义 |
|---|---|
| `explicit_preference` | 用户明确表达的长期偏好。 |
| `exercise_feedback` | 用户对具体动作的反馈。 |
| `constraint` | 需要后续计划尊重的约束。 |
| `temporary_context` | 只在短期有效的上下文，例如“今天不想练腿”。 |
| `injury_or_pain_signal` | 历史兼容值；当前不再写入为训练约束，也不参与候选排除、计划生成或 Patch 决策。 |
| `training_behavior` | 训练完成率、跳过动作、实际时长和疲劳等行为反馈。 |

### UserMemoryStatus

用户记忆生命周期状态。

| 值 | 含义 |
|---|---|
| `active` | 已生效，可被候选、Patch 和计划引擎读取。 |
| `pending_confirmation` | 需要用户确认，不能作为已生效长期强约束。 |
| `dismissed` | 已被用户或系统放弃。 |
| `expired` | 已过期，不再参与当前上下文。 |

### UserExerciseFeedbackKind

动作级反馈类型。

| 值 | 含义 |
|---|---|
| `dislike` | 用户不喜欢或不想继续安排该动作。 |
| `too_hard` | 用户反馈该动作太难，后续替换优先降阶。 |
| `too_easy` | 用户反馈该动作太轻松。 |
| `pain` | 该动作触发不适或疼痛反馈。 |
| `skipped` | 用户在训练中跳过该动作。 |
| `completed` | 用户完成该动作。 |

### ChatMessageRole

聊天消息角色。

| 值 | 含义 |
|---|---|
| `system` | 系统消息。当前持久化服务会过滤掉该角色。 |
| `user` | 用户消息。 |
| `assistant` | AI 回复。 |
| `tool` | 工具消息。当前持久化服务会过滤掉该角色。 |

### ConversationArtifactKind

聊天结构化卡片类型。

| 值 | 含义 |
|---|---|
| `exercise_recommendation` | 动作推荐卡片。 |
| `routine` | 单次训练编排卡片。 |
| `plan` | 长期训练计划卡片。 |

### ConversationArtifactScope

artifact 的使用范围。当前只有 `chat`，表示来自聊天会话。

### ConversationArtifactStatus

artifact 生命周期状态。

| 值 | 含义 |
|---|---|
| `active` | 当前可优先引用的版本。 |
| `superseded` | 已被新 revision 替代，历史仍可读取。 |
| `archived` | 已归档，常规上下文不再优先读取。 |

### ConversationArtifactSourceEntityKind

artifact 保存后的来源实体类型。

| 值 | 含义 |
|---|---|
| `workout_routine` | 已保存为训练编排。 |
| `workout_schedule` | 已导入为训练日历安排。 |

## 3. 表设计

### User

用户主体表，是用户私有数据的权限隔离根节点。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 用户唯一标识。当前正常请求由浏览器本地匿名 auth cookie 解析得到当前用户。 |
| `email` | `String?` | 唯一，可空 | 用户邮箱。正式鉴权接入后可用于账号识别。 |
| `displayName` | `String?` | 可空 | 用户展示名称。 |
| `deletedAt` | `DateTime?` | 可空，已建索引 | 用户级软删除时间。本地匿名用户重置会按数据库 `Asia/Shanghai` 当前时间写入该字段，旧 cookie 不能再恢复该用户，但旧聊天、训练和 trace 数据不会被物理删除。 |
| `createdAt` | `DateTime` | 默认 `now()` | 用户创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 用户最后更新时间。 |

关系：

| 关系 | 说明 |
|---|---|
| `identities` | 一个用户可以绑定多个登录身份。 |
| `profile` | 一个用户最多有一份健身画像。 |
| `routines` | 一个用户可以拥有多个训练编排。 |
| `schedules` | 一个用户可以拥有多个训练日历安排。 |
| `results` | 一个用户可以拥有多个训练结果。 |
| `chatSessions` | 一个用户可以拥有多个聊天会话。 |

### UserIdentity

用户登录身份表，用于把不同认证提供商的账号映射到同一个 `User`。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 身份记录唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id` | 所属用户。 |
| `provider` | `AuthProvider` | 必填 | 登录提供商。 |
| `providerAccountId` | `String` | 必填 | 提供商侧账号 id。 |
| `email` | `String?` | 可空，已建索引 | 提供商返回的邮箱。 |
| `emailVerifiedAt` | `DateTime?` | 可空 | 邮箱验证时间。 |
| `createdAt` | `DateTime` | 默认 `now()` | 身份记录创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 身份记录最后更新时间。 |

### UserProfile

用户健身画像表，保存训练偏好和限制条件。当前模型是一用户一画像。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 画像记录唯一标识。 |
| `userId` | `String` | 唯一外键，关联 `User.id` | 所属用户。 |
| `goal` | `String?` | 可空 | 用户主要训练目标，例如减脂、增肌、体能提升。 |
| `experience` | `String?` | 可空 | 训练经验水平。 |
| `sessionMinutes` | `Int?` | 可空 | 单次训练期望时长，单位分钟。 |
| `weeklyFrequency` | `Int?` | 可空 | 每周训练频率。 |
| `equipment` | `String[]` | 默认 `[]` | 可用器械。 |
| `injuryLimitations` | `String[]` | 默认 `[]` | 历史兼容字段；当前聊天触发、候选筛选、计划生成和 Patch 决策均不依赖该字段。 |
| `preferences` | `String[]` | 默认 `[]` | 用户偏好，例如训练形式、动作偏好。 |
| `avoidances` | `String[]` | 默认 `[]` | 用户希望避免的内容。 |
| `createdAt` | `DateTime` | 默认 `now()` | 画像创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 画像最后更新时间。 |

### UserMemory

用户结构化记忆表，保存跨会话可复用的偏好、约束和临时上下文。健康/不适类历史值不再作为训练生成决策依据。所有读取都必须带 `userId`，并过滤 `status` 与 `expiresAt`。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 记忆唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `kind` | `UserMemoryKind` | 必填，已建索引 | 记忆类型。 |
| `subjectType` | `UserMemorySubjectType` | 默认 `general` | 记忆主体类型，例如 exercise、body_part 或 health。 |
| `subjectId` | `String?` | 可空 | 结构化主体 id，例如 `Exercise.id`。 |
| `subjectLabel` | `String?` | 可空 | 用户可读主体标签，例如“腿”“俯卧撑”。 |
| `value` | `Json` | 必填 | 结构化记忆内容和原始文本摘要。 |
| `confidence` | `Float` | 默认 `1` | 写入置信度。 |
| `source` | `UserMemorySource` | 必填 | 写入来源。 |
| `expiresAt` | `DateTime?` | 可空，已建索引 | 临时上下文过期时间。为空表示长期或直到用户修改。 |
| `requiresConfirmation` | `Boolean` | 默认 `false` | 是否需要 Confirmation Gate。 |
| `status` | `UserMemoryStatus` | 默认 `active`，已建索引 | 生命周期状态。 |
| `createdAt` / `updatedAt` | `DateTime` | 默认 `now()` / `@updatedAt` | 创建和更新时间。 |

### UserExerciseFeedback

动作级反馈表，便于候选服务按 `exerciseId` 快速读取 dislike、too_hard 等反馈，并影响过滤、排序和替代动作方向。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 反馈唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `exerciseId` | `String` | 外键，关联 `Exercise.id`，已建索引 | 反馈对应动作。 |
| `kind` | `UserExerciseFeedbackKind` | 必填，已建索引 | 动作反馈类型。 |
| `value` | `Json` | 必填 | 结构化反馈内容和原始文本摘要。 |
| `confidence` | `Float` | 默认 `1` | 写入置信度。 |
| `source` | `UserMemorySource` | 必填 | 写入来源。 |
| `expiresAt` | `DateTime?` | 可空，已建索引 | 临时动作反馈过期时间。 |
| `requiresConfirmation` | `Boolean` | 默认 `false` | 长期强约束是否待确认。 |
| `status` | `UserMemoryStatus` | 默认 `active`，已建索引 | 生命周期状态。 |
| `createdAt` / `updatedAt` | `DateTime` | 默认 `now()` / `@updatedAt` | 创建和更新时间。 |

### Exercise

动作库表，是训练编排动作引用的事实来源。编排中的动作必须引用这里已有的 `Exercise.id`。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键 | 动作唯一标识。通常来自导入或标准化流程，而不是数据库自动生成。 |
| `source` | `String` | 必填 | 数据来源名称。 |
| `sourceUrl` | `String` | 必填 | 数据来源链接或项目地址。 |
| `sourceId` | `String` | 必填 | 来源系统中的原始 id。 |
| `license` | `String` | 必填 | 数据许可信息。 |
| `nameEn` | `String` | 必填 | 英文动作名。 |
| `nameZh` | `String` | 必填 | 中文动作名。 |
| `category` / `categoryZh` | `String?` | 可空 | 动作分类。 |
| `level` / `levelZh` | `String?` | 可空 | 难度等级。 |
| `force` / `forceZh` | `String?` | 可空 | 发力类型。 |
| `mechanic` / `mechanicZh` | `String?` | 可空 | 动作机制。 |
| `equipment` / `equipmentZh` | `String?` | 可空 | 器械标签。 |
| `homeRequirement` / `homeRequirementZh` | `String` | 必填 | 居家训练条件标签。 |
| `primaryMuscles` / `primaryMusclesZh` | `String[]` | 默认 `[]` | 主练肌群。 |
| `secondaryMuscles` / `secondaryMusclesZh` | `String[]` | 默认 `[]` | 辅助肌群。 |
| `instructionsEn` / `instructionsZh` | `String[]` | 默认 `[]` | 动作步骤。 |
| `images` / `imageUrls` | `String[]` | 默认 `[]` | 原始图片路径和可直接展示图片 URL。 |
| `riskTags` | `String[]` | 默认 `[]` | 风险标签。 |
| `goalTags` | `String[]` | 默认 `[]` | 适配目标标签。 |
| `reviewStatus` | `ExerciseReviewStatus` | 默认 `machine_translated`，已建索引 | 内容审核状态。 |
| `isPublished` | `Boolean` | 默认 `false`，已建索引 | 是否发布给用户使用。 |
| `createdAt` | `DateTime` | 默认 `now()` | 动作记录创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 动作记录最后更新时间。 |

### WorkoutRoutine

训练编排表，保存用户可复用的一套动作列表。当前动作编排页、AI 草稿保存和日历排期都会以 routine 为训练模板。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 编排唯一标识。保存手动编排时也可能由前端传入。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `title` | `String` | 必填 | 编排标题。 |
| `summary` | `String?` | 可空 | 编排摘要。当前 UI 暂未稳定使用。 |
| `estimatedMinutes` | `Int` | 必填 | 预估训练分钟数。 |
| `estimatedCalories` | `Int` | 默认 `0` | 预估消耗热量。 |
| `status` | `WorkoutRoutineStatus` | 默认 `active`，已建索引 | 编排状态。 |
| `source` | `WorkoutRoutineSource` | 默认 `ai` | 编排来源。 |
| `trainingLoopRounds` | `Int?` | 可空 | 主训练循环轮数。为空时业务层使用默认值。 |
| `trainingLoopRestSeconds` | `Int?` | 可空 | 每轮训练之间的休息秒数。为空时业务层使用默认值。 |
| `sourceAiTraceId` | `String?` | 可空 | 生成该编排的 AI Trace id。 |
| `createdAt` | `DateTime` | 默认 `now()` | 编排创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 编排最后更新时间。 |

### WorkoutRoutineItem

训练编排动作项表，直接挂在 `WorkoutRoutine` 下，不再经过训练日中间层。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 动作编排项唯一标识。 |
| `routineId` | `String` | 外键，关联 `WorkoutRoutine.id` | 所属编排。 |
| `exerciseId` | `String` | 外键，关联 `Exercise.id`，已建索引 | 引用的动作库动作。 |
| `mode` | `String` | 必填 | 训练目标模式。当前业务层使用 `reps` 或 `duration`。 |
| `target` | `Int` | 必填 | 目标次数或目标秒数。 |
| `sets` | `Int` | 必填 | 组数。 |
| `setRestSeconds` | `Int` | 必填 | 同一动作组间休息秒数。 |
| `transitionRestSeconds` | `Int` | 必填 | 当前动作到下一个动作之间的休息秒数。 |
| `section` | `String?` | 可空 | 所属训练段。当前业务层识别 `warmup`、`training`、`stretch`。 |
| `notes` | `String?` | 可空 | 动作编排备注。 |
| `sortOrder` | `Int` | 与 `routineId` 组合唯一 | 动作在编排内的排序。 |
| `createdAt` | `DateTime` | 默认 `now()` | 动作编排项创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 动作编排项最后更新时间。 |

### WorkoutSchedule

训练日历安排表，表示某一天安排哪套 routine，或该日期是休息日。`titleSnapshot`、`estimatedMinutes`、`estimatedCalories` 是日历展示快照，避免 routine 后续改名或调整动作时改写历史日历展示。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 日历安排唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `routineId` | `String?` | 可空外键，关联 `WorkoutRoutine.id` | 关联的训练编排。休息日可为空。 |
| `scheduledFor` | `DateTime` | 必填，已建索引 | 计划训练日期。当前按日期 key 转为 UTC 零点保存。 |
| `status` | `WorkoutScheduleStatus` | 默认 `planned`，已建索引 | 日历安排状态。 |
| `titleSnapshot` | `String` | 必填 | 日历展示标题快照。 |
| `estimatedMinutes` | `Int` | 默认 `0` | 日历展示分钟数快照。 |
| `estimatedCalories` | `Int` | 默认 `0` | 日历展示热量快照。 |
| `createdAt` | `DateTime` | 默认 `now()` | 日历安排创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 日历安排最后更新时间。 |

### WorkoutSessionResult

训练结果表，保存用户实际执行一次训练后的摘要。完成训练时服务端会在事务中创建或更新 result，并同步把对应 `WorkoutSchedule.status` 标记为 `completed`。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 训练结果唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `scheduleId` | `String` | 唯一外键，关联 `WorkoutSchedule.id` | 对应的日历安排。 |
| `routineId` | `String?` | 可空外键，关联 `WorkoutRoutine.id` | 完成时对应的 routine。 |
| `startedAt` | `DateTime` | 必填 | 本次训练开始时间。 |
| `endedAt` | `DateTime` | 必填 | 本次训练结束时间。 |
| `durationSeconds` | `Int` | 必填 | 实际训练秒数。 |
| `completedStepCount` | `Int` | 必填 | 完成的执行步骤数。 |
| `totalStepCount` | `Int` | 必填 | 总执行步骤数。 |
| `completedExerciseCount` | `Int` | 必填 | 完成的动作步骤数。 |
| `totalExerciseCount` | `Int` | 必填 | 总动作步骤数。 |
| `estimatedCalories` | `Int` | 必填 | 本次训练估算热量。 |
| `actualCalories` | `Int?` | 可空 | 后续可接入设备或手动记录的实际热量。 |
| `status` | `WorkoutSessionResultStatus` | 默认 `completed`，已建索引 | 训练结果状态。 |
| `feedback` | `Json?` | 可空 | 训练完成反馈，当前保存 `completionRate`、`skippedExerciseIds`、`actualDurationSeconds` 和 `subjectiveFatigue`，供后续推荐和递进读取。 |
| `createdAt` | `DateTime` | 默认 `now()` | 训练结果创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 训练结果最后更新时间。 |

### ChatSession

聊天会话表，表示一条对话线程。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 会话唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `title` | `String?` | 可空 | 会话标题。为空时业务层可根据第一条用户消息生成标题。 |
| `createdAt` | `DateTime` | 默认 `now()` | 会话创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 会话最后更新时间。 |

### ChatMessage

聊天消息表，保存会话内的用户消息和 AI 回复。当前持久化服务只保存 `user` 和 `assistant` 消息。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 消息唯一标识。 |
| `chatSessionId` | `String` | 外键，关联 `ChatSession.id` | 所属会话。 |
| `role` | `ChatMessageRole` | 必填 | 消息角色。 |
| `content` | `String` | 必填 | 消息正文。 |
| `metadata` | `Json?` | 可空 | 和该消息绑定的结构化附加信息。 |
| `createdAt` | `DateTime` | 默认 `now()`，与 `chatSessionId` 组合建索引 | 消息创建时间，用于恢复会话顺序。 |

当前 `metadata` 已使用的结构：

| 字段 | 作用 |
|---|---|
| `suggestedQuestions` | AI 回复后的建议提问，按钮文字就是点击后发送的下一轮普通用户消息。 |
| `plan` | 绑定在该消息上的长期训练计划草稿卡片。 |
| `routine` | 绑定在该消息上的单次训练编排草稿卡片，包含热身、训练、拉伸三段式动作和主训练循环配置。 |
| `exerciseRecommendation` | 绑定在该消息上的动作推荐卡片。 |
| `conversationSummary` | 服务端维护的自然语言对话总结。当前只作为历史展示和后续重建智能上下文的材料，不再接入已删除的旧模型调用链路。 |
| `conversationContext` | 旧结构化对话上下文。仅用于历史迁移和服务端确定性兜底，不再作为模型可见协议。 |

长期 `plan` 草稿当前不会单独落库为新的计划表，而是保存在 `ChatMessage.metadata.plan` 中，作为聊天消息上的结构化推送卡片。草稿包含 `cycleLengthDays`、`trainingDayCount`、`restDayCount`、`cycleRepeatable`、`progression`、`recoveryStrategy`、`schedulePattern` 和周期日 `days`；非休息周期日必须用 `warmup`、`training`、`stretch` 三段式 `sections` 表达动作，休息日只表达恢复说明。用户导入长期计划时，业务层只为非休息周期日创建 `WorkoutRoutine`，并把每个动作的 `section` 写入 `WorkoutRoutineItem.section`；随后按本周期、重复 2 个周期、重复 4 个周期或明确的 `calendarHorizonDays` 生成 `WorkoutSchedule`。重复导入时只替换同一 `sourceRoutineTitle` 且位于本次导入日期范围内的旧日程，避免误删手动安排或其他计划来源。

### ConversationArtifact

聊天结构化卡片事实源表，保存用户在对话中实际看到过的动作推荐、routine 或 plan payload。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | artifact 唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `sessionId` | `String` | 外键，关联 `ChatSession.id`，已建索引 | 所属聊天会话。 |
| `messageId` | `String?` | 外键，关联 `ChatMessage.id` | 产生该卡片的消息。旧消息删除重写时可为空。 |
| `kind` | `ConversationArtifactKind` | 必填 | 卡片类型。 |
| `scope` | `ConversationArtifactScope` | 默认 `chat` | artifact 使用范围。 |
| `payloadSchemaVersion` | `Int` | 必填 | payload schema 版本。 |
| `payload` | `Json` | 必填 | 服务端校验后的完整结构化卡片 payload。 |
| `status` | `ConversationArtifactStatus` | 默认 `active` | 当前版本状态。 |
| `revision` | `Int` | 默认 `1` | 同一消息同一 kind 的版本号。 |
| `revisionOfArtifactId` | `String?` | 可空 | 被修订的上一个 artifact。 |
| `sourceEntityKind` / `sourceEntityId` | enum / `String?` | 可空 | 用户保存 routine 或导入 schedule 后关联的来源实体。 |

### ArtifactIndex

artifact 轻量检索索引。聊天上下文和后续引用解析优先读取该表，完整 payload 仍从 `ConversationArtifact` 读取。

| 字段 | 类型 | 作用 |
|---|---|---|
| `artifactId` | `String` | 唯一关联 `ConversationArtifact.id`。 |
| `userId` / `sessionId` | `String` | 权限隔离和会话过滤。 |
| `kind` / `scope` / `status` | enum | 检索类型和生命周期过滤。 |
| `title` / `summary` | `String` / `String?` | 后续智能上下文、引用排序和页面展示可复用的摘要文本。 |
| `exerciseIds` | `String[]` | payload 中提取的主要动作 id。 |
| `goals` / `muscles` / `equipment` | `String[]` | 可稳定提取的训练目标、肌群和器械。 |
| `sessionMinutes` / `weeklyFrequency` / `trainingDayCount` | `Int?` | 训练时长、周频率和训练日数量。 |
| `sourceMessageId` | `String?` | 用于聊天历史消息重写后继续匹配来源消息。 |

### ConversationBusinessFact

跨 run 业务事实表。当前用于保存 production 文本聊天中已经通过服务端 `visible_output` 用户事件输出的可见训练方案事实，使下一轮 Agent 能先恢复轻量摘要，再通过 read/import tool 读取完整事实。

该表不依赖 `ChatMessage` 行已经存在，因为 `/api/chat` 响应生成时 assistant 消息通常还没有被前端保存到数据库；因此它用 `conversationId` 和 `messageId` 字符串绑定来源响应。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 业务 fact 引用 id，作为下一轮 recent summary 的 `factRef`。 |
| `userId` | `String` | 外键，关联 `User.id` | 所属用户，用于权限隔离。 |
| `conversationId` | `String` | 已建组合索引 | 所属聊天会话 id；不强制外键，避免响应生成早于会话保存。 |
| `messageId` | `String` | 已建索引 | 产生该 fact 的 assistant 响应消息 id。 |
| `kind` | `String` | 已建组合索引 | 业务 fact 类型。当前使用 `visible_training_proposal_displayed`。 |
| `status` | `String` | 默认 `active` | fact 生命周期；read/import 只读取 active fact。 |
| `schemaVersion` | `Int` | 已参与唯一约束 | payload schema 版本。 |
| `payload` | `Json` | 必填 | 服务端确定性用户投影事实，不从自然语言回复正文反推。 |
| `createdAt` | `DateTime` | 默认 `now()` | fact 创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | fact 最后更新时间。 |

当前唯一约束为 `userId + conversationId + messageId + kind + schemaVersion`，用于同一响应重复投影时幂等覆盖。

## 4. 关系与删除策略总结

| 从表 | 关联主表 | 删除主表时的行为 | 设计原因 |
|---|---|---|---|
| `UserIdentity` | `User` | `Cascade` | 用户删除后登录身份不再有意义。 |
| `UserProfile` | `User` | `Cascade` | 用户画像属于用户私有数据。 |
| `UserMemory` | `User` | `Cascade` | 用户记忆属于用户私有数据。 |
| `UserExerciseFeedback` | `User` | `Cascade` | 动作反馈属于用户私有数据。 |
| `UserExerciseFeedback` | `Exercise` | `Cascade` | 动作删除后对应反馈不再可用。 |
| `WorkoutRoutine` | `User` | `Cascade` | 训练编排属于用户私有数据。 |
| `WorkoutRoutineItem` | `WorkoutRoutine` | `Cascade` | 动作编排项不能脱离 routine 存在。 |
| `WorkoutRoutineItem` | `Exercise` | `Restrict` | 防止删除已被编排引用的动作，保证训练可执行。 |
| `WorkoutSchedule` | `User` | `Cascade` | 训练日历安排属于用户私有数据。 |
| `WorkoutSchedule` | `WorkoutRoutine` | `SetNull` | routine 归档或删除后仍保留日历快照和结果记录。 |
| `WorkoutSessionResult` | `User` | `Cascade` | 训练结果属于用户私有数据。 |
| `WorkoutSessionResult` | `WorkoutSchedule` | `Cascade` | 训练结果必须归属于一条日历安排。 |
| `WorkoutSessionResult` | `WorkoutRoutine` | `SetNull` | routine 删除后仍保留训练结果摘要。 |
| `ChatSession` | `User` | `Cascade` | 聊天会话属于用户私有数据。 |
| `ChatMessage` | `ChatSession` | `Cascade` | 消息不能脱离会话存在。 |
| `ConversationArtifact` | `User` / `ChatSession` | `Cascade` | artifact 属于用户和会话私有事实源。 |
| `ConversationArtifact` | `ChatMessage` | `SetNull` | 聊天历史重写消息时保留 artifact 事实源。 |
| `ArtifactIndex` | `ConversationArtifact` | `Cascade` | 索引不能脱离 artifact 存在。 |
| `ConversationBusinessFact` | `User` | `Cascade` | 跨 run 业务事实属于用户私有数据，删除用户时同步删除。 |

## 5. 当前实现注意事项

- PostgreSQL 是业务事实数据来源，所有用户私有数据都应通过 `userId` 隔离。
- 当前用户来源是浏览器本地匿名鉴权：服务端通过 HttpOnly cookie 保存匿名 token，Route Handler 通过 `UserIdentity(provider = "anonymous")` 解析请求级 `CurrentUser`。
- 设置页“重置本地用户”会清除当前浏览器的匿名 auth cookie，并将旧匿名 `User.deletedAt` 标记为软删除；旧聊天记录、训练编排、训练日历、训练结果、artifact、memory 和动作反馈等业务数据保留，不做物理删除。
- `restoreLocalAnonymousSession()` 和 `requireCurrentUser()` 必须把 `deletedAt != null` 的用户视为未认证，防止旧 cookie 恢复旧身份或继续访问旧用户私有数据。
- 动作库的 `equipment` 和 `homeRequirement` 是两个不同维度：前者表示器械，后者表示居家训练条件。
- 训练编排动作通过 `WorkoutRoutineItem.exerciseId` 强制引用 `Exercise`，避免 AI 或客户端保存不存在的动作。
- `WorkoutSchedule` 保存日历展示快照；routine 后续更新不会自动改写已存在日历安排的标题、分钟数和热量。
- `WorkoutSessionResult` 保存训练完成摘要；`WorkoutSchedule.status = completed` 用于日历筛选、统计和徽标展示。
- `UserMemory` 和 `UserExerciseFeedback` 只读取当前 `userId` 下 `active` 或待确认且未过期的数据；长期强约束在确认前不会作为已生效排除规则。
- `ChatMessage.metadata` 是聊天上下文总结和卡片数据的落点；当前 `plan` 保存长期训练计划草稿，`routine` 保存单次训练编排草稿。如果某类数据变成稳定查询条件，应优先升级为显式字段。
- `ConversationBusinessFact` 是跨 run read/import 的轻量业务事实源；当前可见训练方案事实只保存 Response Renderer 用户事件中的 `visibleTrainingProposal` payload，不保存 `searchExerciseResources` handler 内部候选作为最终方案事实。
- 当前 `ChatSession` 不保存 `metadata`；旧模型可见上下文材料保留在 `ChatMessage.metadata.conversationSummary` 中，仅用于历史迁移和后续重建设计参考。
