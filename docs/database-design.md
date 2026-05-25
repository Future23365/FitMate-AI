# 数据库设计说明

本文档说明当前 PostgreSQL / Prisma 数据模型的设计。当前事实来源是 `prisma/schema.prisma`，迁移文件位于 `prisma/migrations/`。

## 1. 设计概览

当前数据库围绕 4 个核心业务域组织：

| 业务域 | 相关表 | 说明 |
|---|---|---|
| 用户与身份 | `User`、`UserIdentity`、`UserProfile` | 保存用户主体、登录身份和健身画像。当前鉴权尚未正式接入，服务端会创建固定的本地演示用户。 |
| 动作库 | `Exercise` | 保存训练动作的标准事实数据，包括来源、分类、肌群、器械、居家可做条件、图片、教学步骤和审核状态。 |
| 训练计划与执行 | `WorkoutPlan`、`WorkoutPlanDay`、`WorkoutPlanItem`、`WorkoutSession` | 保存用户训练计划、计划中的训练日、动作编排和日历执行记录。 |
| 聊天历史 | `ChatSession`、`ChatMessage` | 保存用户和 AI 的对话历史，以及绑定在消息上的计划卡片、推荐卡片和结构化上下文。 |

主要关系如下：

```txt
User
  ├─ UserIdentity
  ├─ UserProfile
  ├─ WorkoutPlan
  │    ├─ WorkoutPlanDay
  │    │    └─ WorkoutPlanItem ── Exercise
  │    └─ WorkoutSession
  └─ ChatSession
       └─ ChatMessage
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
| `anonymous` | 匿名或本地演示身份。当前本地演示用户使用该值。 |

### ExerciseReviewStatus

动作库内容审核状态。

| 值 | 含义 |
|---|---|
| `machine_translated` | 机器翻译后尚未人工深度处理。 |
| `machine_assisted` | 机器辅助整理过，仍可能需要人工复核。 |
| `human_reviewed` | 已人工审核。 |
| `rejected` | 已拒绝，不应面向用户使用。 |
| `fallback` | 兜底动作数据，通常用于保证系统可用性。 |

### WorkoutPlanStatus

训练计划状态。

| 值 | 含义 |
|---|---|
| `draft` | 草稿计划。 |
| `active` | 正在使用或已保存的计划。 |
| `archived` | 已归档，不在常规列表中展示。 |

### WorkoutPlanSource

训练计划来源。

| 值 | 含义 |
|---|---|
| `ai` | AI 生成。 |
| `manual` | 用户手动编排。 |
| `imported` | 外部导入。 |

### WorkoutSessionStatus

训练日程或执行记录状态。

| 值 | 含义 |
|---|---|
| `planned` | 已计划，尚未完成。 |
| `in_progress` | 训练进行中。 |
| `completed` | 已完成。 |
| `missed` | 已错过。 |
| `cancelled` | 已取消，当前删除日程时使用软取消。 |
| `rest` | 休息日。 |

### ChatMessageRole

聊天消息角色。

| 值 | 含义 |
|---|---|
| `system` | 系统消息。当前持久化服务会过滤掉该角色。 |
| `user` | 用户消息。 |
| `assistant` | AI 回复。 |
| `tool` | 工具消息。当前持久化服务会过滤掉该角色。 |

## 3. 表设计

### User

用户主体表，是用户私有数据的权限隔离根节点。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 用户唯一标识。当前本地开发默认用户 id 为 `local-demo-user`。 |
| `email` | `String?` | 唯一，可空 | 用户邮箱。正式鉴权接入后可用于账号识别。 |
| `displayName` | `String?` | 可空 | 用户展示名称。 |
| `createdAt` | `DateTime` | 默认 `now()` | 用户创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 用户最后更新时间。 |

关系：

| 关系 | 说明 |
|---|---|
| `identities` | 一个用户可以绑定多个登录身份。 |
| `profile` | 一个用户最多有一份健身画像。 |
| `workoutPlans` | 一个用户可以拥有多个训练计划。 |
| `sessions` | 一个用户可以拥有多个训练执行或日程记录。 |
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

约束与索引：

| 约束 / 索引 | 作用 |
|---|---|
| `@@unique([provider, providerAccountId])` | 防止同一提供商账号重复绑定。 |
| `@@index([userId])` | 支持按用户查询身份。 |
| `@@index([email])` | 支持按邮箱查找身份。 |
| `onDelete: Cascade` | 删除用户时同步删除身份记录。 |

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
| `injuryLimitations` | `String[]` | 默认 `[]` | 伤病、疼痛或动作限制。 |
| `preferences` | `String[]` | 默认 `[]` | 用户偏好，例如训练形式、动作偏好。 |
| `avoidances` | `String[]` | 默认 `[]` | 用户希望避免的内容。 |
| `createdAt` | `DateTime` | 默认 `now()` | 画像创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 画像最后更新时间。 |

约束：

| 约束 | 作用 |
|---|---|
| `userId @unique` | 保证每个用户最多只有一份画像。 |
| `onDelete: Cascade` | 删除用户时同步删除画像。 |

### Exercise

动作库表，是训练计划动作引用的事实来源。计划中的动作必须引用这里已有的 `Exercise.id`。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键 | 动作唯一标识。通常来自导入或标准化流程，而不是数据库自动生成。 |
| `source` | `String` | 必填 | 数据来源名称。 |
| `sourceUrl` | `String` | 必填 | 数据来源链接或项目地址。 |
| `sourceId` | `String` | 必填 | 来源系统中的原始 id。 |
| `license` | `String` | 必填 | 数据许可信息。 |
| `nameEn` | `String` | 必填 | 英文动作名。 |
| `nameZh` | `String` | 必填 | 中文动作名。 |
| `category` | `String?` | 可空，已建索引 | 英文动作分类。 |
| `categoryZh` | `String?` | 可空 | 中文动作分类。 |
| `level` | `String?` | 可空，已建索引 | 英文难度等级。 |
| `levelZh` | `String?` | 可空 | 中文难度等级。 |
| `force` | `String?` | 可空 | 英文发力类型，例如推、拉。 |
| `forceZh` | `String?` | 可空 | 中文发力类型。 |
| `mechanic` | `String?` | 可空 | 英文动作机制，例如 compound、isolation。 |
| `mechanicZh` | `String?` | 可空 | 中文动作机制。 |
| `equipment` | `String?` | 可空，已建索引 | 英文器械标签。 |
| `equipmentZh` | `String?` | 可空 | 中文器械标签。 |
| `homeRequirement` | `String` | 必填 | 居家训练条件标签，用于区别器械和居家可做性。 |
| `homeRequirementZh` | `String` | 必填 | 中文居家训练条件标签。 |
| `primaryMuscles` | `String[]` | 默认 `[]` | 英文主练肌群。 |
| `primaryMusclesZh` | `String[]` | 默认 `[]` | 中文主练肌群。 |
| `secondaryMuscles` | `String[]` | 默认 `[]` | 英文辅助肌群。 |
| `secondaryMusclesZh` | `String[]` | 默认 `[]` | 中文辅助肌群。 |
| `instructionsEn` | `String[]` | 默认 `[]` | 英文动作步骤。 |
| `instructionsZh` | `String[]` | 默认 `[]` | 中文动作步骤。 |
| `images` | `String[]` | 默认 `[]` | 原始图片路径或图片标识。 |
| `imageUrls` | `String[]` | 默认 `[]` | 可直接展示的图片 URL。 |
| `riskTags` | `String[]` | 默认 `[]` | 风险标签，例如高冲击、膝盖压力等。 |
| `goalTags` | `String[]` | 默认 `[]` | 适配目标标签，例如减脂、核心、活动度。 |
| `reviewStatus` | `ExerciseReviewStatus` | 默认 `machine_translated`，已建索引 | 内容审核状态。 |
| `isPublished` | `Boolean` | 默认 `false`，已建索引 | 是否发布给用户使用。 |
| `createdAt` | `DateTime` | 默认 `now()` | 动作记录创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 动作记录最后更新时间。 |

约束与索引：

| 约束 / 索引 | 作用 |
|---|---|
| `@@unique([source, sourceId])` | 防止同一来源动作重复导入。 |
| `@@index([category])` | 支持按分类筛选。 |
| `@@index([level])` | 支持按难度筛选。 |
| `@@index([equipment])` | 支持按器械筛选。 |
| `@@index([reviewStatus])` | 支持内容审核管理。 |
| `@@index([isPublished])` | 支持只查询已发布动作。 |

### WorkoutPlan

训练计划表，保存用户保存或生成的一套训练方案。当前手动编排的单次训练也持久化为一个 `WorkoutPlan`。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 训练计划唯一标识。保存手动编排时也可能由前端传入。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `title` | `String` | 必填 | 计划标题。 |
| `goal` | `String` | 必填 | 计划目标。手动编排当前写入 `custom_workout`。 |
| `summary` | `String?` | 可空 | 计划摘要。 |
| `weeklyFrequency` | `Int` | 必填 | 计划建议每周训练次数。 |
| `estimatedSessionMinutes` | `Int` | 必填 | 单次训练预估时长，单位分钟。 |
| `status` | `WorkoutPlanStatus` | 默认 `draft`，已建索引 | 计划状态。 |
| `source` | `WorkoutPlanSource` | 默认 `ai` | 计划来源。 |
| `safetyNotes` | `String[]` | 默认 `[]` | 计划级安全提示。 |
| `trainingLoopRounds` | `Int?` | 可空 | 整套训练循环轮数。为空时业务层使用默认值。 |
| `trainingLoopRestSeconds` | `Int?` | 可空 | 每轮训练之间的休息秒数。为空时业务层使用默认值。 |
| `sourceAiTraceId` | `String?` | 可空 | 生成该计划的 AI Trace id，用于调试和追溯。 |
| `createdAt` | `DateTime` | 默认 `now()` | 计划创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 计划最后更新时间。 |

关系与删除策略：

| 关系 | 说明 |
|---|---|
| `user` | 计划属于一个用户，删除用户时级联删除计划。 |
| `days` | 一个计划包含多个训练日，删除计划时级联删除训练日。 |
| `sessions` | 一个计划可以被多个训练日程引用；删除计划时日程的 `workoutPlanId` 会置空。 |

### WorkoutPlanDay

训练计划日表，表示一个计划中的第几天或第几个训练单元。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 训练日唯一标识。 |
| `workoutPlanId` | `String` | 外键，关联 `WorkoutPlan.id` | 所属训练计划。 |
| `dayIndex` | `Int` | 与 `workoutPlanId` 组合唯一 | 计划内第几天或第几个训练单元。 |
| `title` | `String` | 必填 | 训练日标题。 |
| `focus` | `String` | 必填 | 训练重点，例如上肢、核心、全身。 |
| `estimatedMinutes` | `Int` | 必填 | 本训练日预估时长，单位分钟。 |
| `safetyNotes` | `String[]` | 默认 `[]` | 训练日级安全提示。 |
| `createdAt` | `DateTime` | 默认 `now()` | 训练日创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 训练日最后更新时间。 |

约束：

| 约束 | 作用 |
|---|---|
| `@@unique([workoutPlanId, dayIndex])` | 保证同一计划内训练日顺序不重复。 |
| `onDelete: Cascade` | 删除计划时同步删除训练日。 |

### WorkoutPlanItem

训练计划动作表，表示某个训练日中的一个动作编排项。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 动作编排项唯一标识。 |
| `workoutPlanDayId` | `String` | 外键，关联 `WorkoutPlanDay.id` | 所属训练日。 |
| `exerciseId` | `String` | 外键，关联 `Exercise.id`，已建索引 | 引用的动作库动作。 |
| `mode` | `String` | 必填 | 训练目标模式。当前业务层使用 `reps` 或 `duration`。 |
| `target` | `Int` | 必填 | 目标次数或目标秒数，取决于 `mode`。 |
| `sets` | `Int` | 必填 | 组数。 |
| `setRestSeconds` | `Int` | 必填 | 同一动作组间休息秒数。 |
| `transitionRestSeconds` | `Int` | 必填 | 当前动作到下一个动作之间的休息秒数。 |
| `section` | `String?` | 可空 | 所属训练段。当前业务层识别 `warmup`、`training`、`stretch`。 |
| `notes` | `String?` | 可空 | 动作编排备注。 |
| `sortOrder` | `Int` | 与 `workoutPlanDayId` 组合唯一 | 动作在训练日内的排序。 |
| `createdAt` | `DateTime` | 默认 `now()` | 动作编排项创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 动作编排项最后更新时间。 |

约束与索引：

| 约束 / 索引 | 作用 |
|---|---|
| `@@unique([workoutPlanDayId, sortOrder])` | 保证同一训练日内动作顺序不重复。 |
| `@@index([exerciseId])` | 支持从动作反查计划引用。 |
| `@@index([workoutPlanDayId, sortOrder])` | 支持按训练日顺序读取动作列表。 |
| `WorkoutPlanDay onDelete: Cascade` | 删除训练日时同步删除动作编排项。 |
| `Exercise onDelete: Restrict` | 已被计划引用的动作不能直接删除，避免计划悬空。 |

### WorkoutSession

训练日程和执行记录表。当前既用于日历中的计划训练，也用于休息日记录。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 训练日程或执行记录唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `workoutPlanId` | `String?` | 可空外键，关联 `WorkoutPlan.id` | 关联的训练计划。休息日没有训练计划。 |
| `scheduledFor` | `DateTime?` | 可空，已建索引 | 计划训练日期。当前按日期 key 转为 UTC 零点保存。 |
| `startedAt` | `DateTime?` | 可空 | 训练开始时间。 |
| `endedAt` | `DateTime?` | 可空 | 训练结束时间。 |
| `status` | `WorkoutSessionStatus` | 默认 `planned`，已建索引 | 日程或执行状态。 |
| `durationSeconds` | `Int?` | 可空 | 训练持续时间，单位秒。 |
| `feedback` | `Json?` | 可空 | 训练反馈或日程展示补充数据。 |
| `createdAt` | `DateTime` | 默认 `now()` | 记录创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 记录最后更新时间。 |

当前 `feedback` 已使用的结构：

| 场景 | 字段 | 作用 |
|---|---|---|
| 休息日 | `kind: "rest_day"` | 标记这是休息日记录。 |
| 休息日 | `title` | 休息日展示标题。 |
| 休息日 / 训练日 | `minutes` | 日历展示用分钟数。 |
| 休息日 / 训练日 | `calories` | 日历展示用热量估算。 |
| 训练日 | `sourcePlanTitle` | 来源计划标题，用于日历展示。 |

关系与删除策略：

| 关系 | 说明 |
|---|---|
| `user` | 记录属于一个用户，删除用户时级联删除记录。 |
| `workoutPlan` | 记录可关联计划；删除计划时 `workoutPlanId` 置空，保留历史日程。 |

### ChatSession

聊天会话表，表示一条对话线程。

| 字段 | 类型 | 约束 / 默认值 | 作用 |
|---|---|---|---|
| `id` | `String` | 主键，默认 `cuid()` | 会话唯一标识。 |
| `userId` | `String` | 外键，关联 `User.id`，已建索引 | 所属用户，用于权限隔离。 |
| `title` | `String?` | 可空 | 会话标题。为空时业务层可根据第一条用户消息生成标题。 |
| `createdAt` | `DateTime` | 默认 `now()` | 会话创建时间。 |
| `updatedAt` | `DateTime` | `@updatedAt` | 会话最后更新时间。 |

关系：

| 关系 | 说明 |
|---|---|
| `messages` | 一个会话包含多条消息。 |
| `user` | 删除用户时级联删除会话。 |

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
| `suggestedReplies` | AI 回复后的建议追问或快捷回复。 |
| `plan` | 绑定在该消息上的训练计划草稿卡片。 |
| `exerciseRecommendation` | 绑定在该消息上的动作推荐卡片。 |
| `conversationContext` | 结构化对话上下文。当前只写入最后一条消息，用于恢复长对话上下文。 |

约束与索引：

| 约束 / 索引 | 作用 |
|---|---|
| `@@index([chatSessionId, createdAt])` | 支持按会话和时间顺序读取消息。 |
| `onDelete: Cascade` | 删除会话时同步删除消息。 |

## 4. 关系与删除策略总结

| 从表 | 关联主表 | 删除主表时的行为 | 设计原因 |
|---|---|---|---|
| `UserIdentity` | `User` | `Cascade` | 用户删除后登录身份不再有意义。 |
| `UserProfile` | `User` | `Cascade` | 用户画像属于用户私有数据。 |
| `WorkoutPlan` | `User` | `Cascade` | 训练计划属于用户私有数据。 |
| `WorkoutPlanDay` | `WorkoutPlan` | `Cascade` | 训练日不能脱离计划存在。 |
| `WorkoutPlanItem` | `WorkoutPlanDay` | `Cascade` | 动作编排项不能脱离训练日存在。 |
| `WorkoutPlanItem` | `Exercise` | `Restrict` | 防止删除已被计划引用的动作，保证历史计划可读取。 |
| `WorkoutSession` | `User` | `Cascade` | 训练日程属于用户私有数据。 |
| `WorkoutSession` | `WorkoutPlan` | `SetNull` | 删除计划后保留历史日程或执行记录。 |
| `ChatSession` | `User` | `Cascade` | 聊天会话属于用户私有数据。 |
| `ChatMessage` | `ChatSession` | `Cascade` | 消息不能脱离会话存在。 |

## 5. 当前实现注意事项

- PostgreSQL 是业务事实数据来源，所有用户私有数据都应通过 `userId` 隔离。
- 当前正式鉴权尚未接入，`lib/server/users/current-user.ts` 会创建固定的本地演示用户 `local-demo-user`。
- 动作库的 `equipment` 和 `homeRequirement` 是两个不同维度：前者表示器械，后者表示居家训练条件。
- 训练计划动作通过 `WorkoutPlanItem.exerciseId` 强制引用 `Exercise`，避免 AI 或客户端保存不存在的动作。
- `WorkoutSession.feedback` 和 `ChatMessage.metadata` 是 JSON 扩展字段，适合保存展示补充信息和结构化上下文；如果某类数据变成稳定查询条件，应优先升级为显式字段。
- 当前 `ChatSession` 不保存 `metadata`，对话上下文已迁移到 `ChatMessage.metadata.conversationContext`。
