# LLM 提示词引导机制说明

## 1. 文档范围

本文说明当前项目中 `lib/server/ai/prompt-config.ts` 的提示词如何引导大模型完成聊天、意图解析、动作推荐、训练计划生成和上下文总结。

本文重点解释：

- 每类提示词对应哪一次模型调用。
- 模型在该调用里能看到什么上下文。
- 提示词如何限制模型的职责和输出格式。
- 提示词如何配合服务端校验、候选动作和业务规则。
- 出问题时应该从哪类提示词或服务端规则排查。

## 2. 总体设计原则

当前 LLM 链路不是“让一个聊天模型包办所有事情”，而是拆成多次职责明确的模型调用。

核心原则：

1. 聊天模型只负责自然语言表达，不直接生成结构化卡片。
2. 结构化意图由专门的意图解析提示词生成。
3. 动作推荐和训练计划生成只允许使用服务端给出的候选动作。
4. 模型输出必须经过 JSON / Zod / 业务校验后才能进入前端或持久化。
5. 服务端内部事件 `assistant_action` 是是否推送的事实来源，不让模型正文里的承诺决定是否推送。
6. 长上下文不再直接传完整历史，而是通过 `conversationSummary + latestUserMessage` 控制模型可见信息。

整体调用链：

```txt
用户消息
  ↓
chatIntentResolution：解析用户真实意图
  ↓
服务端动作候选筛选与 assistant_action 决策
  ↓
chatCompletion：生成用户可见自然语言
  ↓
chatContextSummarization：更新下一轮可见上下文
  ↓
如果触发推送：
  ├─ exerciseRecommendationGeneration：生成动作推荐卡片
  └─ workoutPlanIntentExtraction + workoutPlanDraftGeneration：生成 routine / plan 草稿
```

## 3. 提示词总览

`aiPromptConfig` 目前包含这些顶层配置：

| 配置项 | 模型调用场景 | 主要职责 |
|---|---|---|
| `chatContextSummarization` | `/api/chat` 一轮完成后 | 把本轮对话压缩为下一轮使用的自然语言上下文 |
| `chatIntentResolution` | `/api/chat` 回复前 | 判断用户真实意图，生成结构化 `ChatIntent` |
| `chatCompletion` | `/api/chat` 流式回复 | 输出用户可见自然语言 |
| `chatCompletion.exerciseContext` | `/api/chat` 有动作上下文时追加 | 限制自然语言里只能引用候选动作 |
| `exerciseRecommendationGeneration` | `/api/ai/exercise-recommendations` | 从候选动作中选择推荐项 |
| `workoutPlanIntentExtraction` | `/api/ai/workout-plan` 没有客户端 intent 时 | 抽取训练计划或单次编排意图 |
| `workoutPlanDraftGeneration` | `/api/ai/workout-plan` | 生成长期计划或单次训练编排草稿 |

## 4. 上下文边界

当前提示词反复强调一条边界：

```txt
只能根据 conversationSummary 和当前最新用户消息理解上下文；不要假设还能看到完整历史对话。
```

这个设计的作用是：

- 降低完整历史窗口过长导致的信息漂移。
- 让模型输入更稳定、可控。
- 迫使系统把长期有效事实写入 `conversationSummary`。
- 避免某次模型调用依赖它实际看不到的旧消息。

因此，如果模型“忘记”用户之前说过的目标、器械或频率，优先检查：

- `conversationSummary` 是否正确保留了事实。
- `chatContextSummarization` 是否把默认值误写成用户事实。
- 后续调用是否正确传入 `conversationSummary`。

## 5. `chatContextSummarization`

### 5.1 调用场景

`chatContextSummarization` 在 `/api/chat` 一轮流式回复完成后调用。

它收到：

- `previousSummary`
- `latestUserMessage`
- `assistantReply`
- `internalActionSummary`

它输出：

```json
{ "summary": "..." }
```

### 5.2 引导目标

它不是总结给用户看的内容，而是给下一轮模型看的上下文。

提示词要求优先保留：

- 用户训练目标
- 经验水平
- 器械或场地
- 单次时长
- 训练频率
- 偏好
- 避免项
- 最近意图
- 已生成结果
- 未完成问题

### 5.3 关键约束

它有几个重要约束：

- 只返回合法 JSON。
- 不输出 Markdown。
- 不输出服务端内部 JSON、Trigger 名称或隐藏字段。
- 不超过 2000 字。
- 不要把系统默认值描述成用户明确提供的信息。
- 不确定的信息必须写成待确认。

其中“不要把系统默认值描述成用户明确提供的信息”非常关键。

例如服务端可以默认 `experience=beginner` 来生成新手友好计划，但总结里不能写成“用户明确表示自己是新手”。正确表达应该是“经验未明确，系统按简单/新手友好策略处理”。

### 5.4 服务端兜底

如果总结模型失败，`updateConversationSummary` 会走确定性兜底，把 previousSummary、latestUserMessage、assistantReply 和 internalActionSummary 拼成一个可用 summary。

总结失败不能影响用户可见回复。

## 6. `chatIntentResolution`

### 6.1 调用场景

`chatIntentResolution` 在 `/api/chat` 正式生成用户可见回复前调用。

它是当前推送链路里最重要的提示词之一，因为它决定：

- 用户到底是在问一般建议、动作推荐、单次编排还是长期计划。
- 是否需要动作库上下文。
- 是否可以触发服务端内部动作。
- 缺少哪些关键信息。
- 是否要给用户一键补充回复。

### 6.2 输出结构

模型必须返回 JSON，字段包括：

- `type`
- `needsExerciseContext`
- `workoutIntent`
- `requestedExerciseName`
- `canTriggerAction`
- `missingActionFields`
- `suggestedReplies`

`type` 只能是：

- `general_fitness_advice`
- `exercise_recommendation`
- `workout_plan`
- `routine`
- `exercise_replacement`
- `exercise_explanation`
- `non_fitness`

### 6.3 如何引导模型区分意图

提示词明确把几类场景拆开。

动作推荐：

- 用户只是想看某类动作推荐。
- 用户问某部位有哪些动作。
- 用户要求“换一批”“再来一批”“不要这些”。
- 没有要求组数、次数、休息、训练顺序或训练流程。

单次训练编排 `routine`：

- 用户说“今天”“这次”“现在”。
- 用户给了单次训练时长。
- 用户说“来一套”“编成一套训练”“安排训练流程”。
- 用户给出目标、部位、器械或场地条件，例如“练腿，20分钟，没有器械”。

长期计划 `workout_plan`：

- 用户明确说每周、长期、周期、一个月、计划表、多天安排。
- 用户需要周期性训练安排。

非健身问题 `non_fitness`：

- 用户问题与健身、训练、动作、饮食、运动习惯无关。
- 不返回 `workoutIntent`。
- 不需要动作上下文。

### 6.4 为什么顶层 `type` 很重要

提示词强调：

```txt
顶层 type 是服务端唯一触发意图。
```

这意味着 `workoutIntent.intentType` 不能和顶层 `type` 各说各话。

例如：

- 顶层 `type=exercise_recommendation` 时，不应该让 `workoutIntent.intentType=routine` 表示要生成训练编排。
- 用户已经提供“20 分钟、练腿、无器械”这种本次训练条件时，顶层 `type` 必须是 `routine`。

服务端最终也是根据顶层 `type` 转成 `assistant_action`。

### 6.5 对缺失字段的引导

提示词要求模型区分两类字段：

第一类是可以默认或不阻断的字段：

- 经验未明确时默认按 `beginner` / 简单训练处理。
- 健康、伤病、疼痛、身体限制等字段不再默认阻断。
- 动作推荐不要求器械、场地或训练时长完整。

第二类是仍然会阻断的核心字段：

- 目标不明确。
- 单次训练时长缺失。
- 器械或场地条件缺失。
- 长期计划缺少频率或周期条件。

但阻断规则按场景不同：

- `exercise_recommendation` 更宽松，只要目标或点名动作明确即可。
- `routine` 和 `workout_plan` 更严格，需要核心训练条件满足。

### 6.6 对一键回复的引导

`suggestedReplies` 只用于 `canTriggerAction=false` 的场景。

提示词要求：

- 最多 3 条。
- 必须是用户第一人称。
- 必须是点击后可直接发送的完整回答。
- 不能写成 AI 问用户的问题。
- 不能写疑问句。

正确示例：

```txt
我今天在家自重练 30 分钟核心
我想先练 20 分钟全身
我去健身房练 45 分钟
```

错误示例：

```txt
这次大概多久？
在家还是去健身房练？
```

### 6.7 时间语义引导

提示词特别限制了时间表达，避免长期计划字段混淆：

- “6 天计划 / 安排 6 天动作”表示计划周期，不等于 `weeklyFrequency=6`。
- “每周 6 练 / 一周练 6 天”才表示 `weeklyFrequency=6`。
- “未来 6 天每天练”表示 `calendarHorizonDays=6`。

这是为了避免计划周期、每周频率和日历导入范围混成一个字段。

## 7. `chatCompletion`

### 7.1 调用场景

`chatCompletion` 是 `/api/chat` 中生成用户可见自然语言的提示词。

它在服务端已经完成意图解析、动作候选筛选和 `assistant_action` 决策之后调用。

### 7.2 职责边界

提示词明确告诉模型：

- 服务端已经完成结构化意图解析。
- 服务端会通过内部事件处理动作推荐、单次编排或长期计划。
- 当前模型只负责输出用户可见自然语言。

这条边界是为了防止聊天模型擅自输出结构化触发器或伪造卡片内容。

### 7.3 禁止输出内部协议

模型不能输出：

- 内部 Trigger
- JSON
- 代码块
- Markdown fenced block
- `workout_plan_trigger`
- `workout_routine_trigger`
- `exercise_recommendation_trigger`
- `suggested_reply_trigger`
- `suggested_question_trigger`

这些名字是历史兼容层或内部协议，不应出现在用户可见正文里。

### 7.4 如何防止“承诺生成但没推送”

提示词用 `serverAssistantAction.triggered` 作为自然语言承诺边界。

规则是：

- 只有 `serverAssistantAction.triggered = true` 时，模型才可以说会按当前条件整理推荐、单次编排或长期计划。
- 如果 `serverAssistantAction.triggered = false`，模型必须根据 `blockingMissingFields` 追问缺失信息。
- 不能在未触发内部动作时承诺会生成训练结果。

这解决的是典型问题：

```txt
模型正文说“我来给你整理计划”，但服务端没有真正生成卡片。
```

现在正文承诺必须跟服务端内部动作状态对齐。

### 7.5 为什么不让正文列动作清单

提示词要求：

- 对 `routine` 和 `workout_plan`，正文只做自然过渡。
- 对 `exercise_recommendation`，正文只做简短说明。
- 不直接列具体动作清单。

原因是后续卡片会由专门接口生成。如果正文先列一套动作，可能和卡片结果冲突。

例如正文应该是：

```txt
我先按居家、自重、适合新手的方向整理一组动作。
```

而不是直接列：

```txt
你可以做深蹲、俯卧撑、平板支撑……
```

### 7.6 UI 表述限制

提示词禁止提及：

- 卡片
- 下方
- 马上生成
- 稍后生成
- 后台生成
- 系统正在

原因是这些是 UI / 系统实现细节，不应该进入自然语言回复。模型只做自然沟通，不描述内部流程。

### 7.7 `exerciseContext` 追加约束

当本轮需要动作上下文时，服务端会追加 `chatCompletion.exerciseContext`。

它约束：

- 如果回答提到具体动作名，动作必须来自 `providedExercises.nameZh`。
- 不能编造候选列表之外的动作。
- 只有 `candidateStatus=insufficient` 时，才能说动作库没有足够匹配动作。
- 如果候选状态是 `enough` 或 `limited_but_usable`，不能说无法推荐动作。

这层约束防止聊天正文越过服务端动作库事实。

## 8. `exerciseRecommendationGeneration`

### 8.1 调用场景

当 `/api/chat` 返回：

```txt
assistant_action.action = exercise_recommendation
```

前端会调用 `/api/ai/exercise-recommendations`。

该接口再调用 `exerciseRecommendationGeneration`。

### 8.2 输入边界

模型会收到：

- `intent`
- `conversationSummary`
- `latestUserMessage`
- `excludedExerciseIds`
- `candidateExercises`

其中 `candidateExercises` 全部来自后端动作库和服务端候选筛选。

### 8.3 引导目标

提示词把模型定位为：

```txt
动作推荐选择器
```

不是动作生成器。

模型只能从 `candidateExercises` 中选择 `exerciseId`，绝对不能编造动作 ID。

### 8.4 输出结构

模型必须返回：

- `title`
- `goal`
- `summary`
- `items`
- `safetyNotes`

每个 `items` 里包含：

- `exerciseId`
- `reasons`

推荐数量建议 4-8 个；候选不足时可以少于 4 个，但必须至少 1 个。

### 8.5 换一批动作

如果用户是在“换一批”或“不喜欢上一批动作”，提示词要求模型避开 `excludedExerciseIds`。

服务端还会在模型输出后再次过滤：

- 不在候选集合的动作会被过滤。
- 已排除动作会被过滤。
- 重复动作会去重。

如果过滤后没有合法动作，接口返回失败，不会展示非法卡片。

## 9. `workoutPlanIntentExtraction`

### 9.1 调用场景

`workoutPlanIntentExtraction` 用于 `/api/ai/workout-plan`。

但只有在请求没有传入客户端已有 `intent` 时才会调用。

当前从聊天推送过来的主路径通常已经带着 `/api/chat` 解析出的 `intent`，所以这里更多是独立调用或兜底场景。

### 9.2 引导目标

它负责从 `conversationSummary + latestUserMessage` 中抽取：

- `intentType`
- `goal`
- `experience`
- `sessionMinutes`
- `weeklyFrequency`
- `calendarHorizonDays`
- `equipment`
- `injuryLimitations`
- `preferences`
- `avoidances`

### 9.3 默认值策略

如果信息不足，提示词要求使用最保守且合理的默认值：

- `intentType` 默认 `plan`
- `experience` 默认 `beginner`
- `sessionMinutes` 默认 `30`
- `weeklyFrequency` 默认 `3`
- 数组字段默认 `[]`

这些默认值是为了生成合法结构，不等于用户明确提供的信息。

### 9.4 时间语义限制

这里同样要求区分：

- 计划周期
- 每周训练频率
- 具体日历范围

这是为了让后续 `workoutPlanDraftGeneration` 能生成正确的数据结构。

## 10. `workoutPlanDraftGeneration`

### 10.1 调用场景

`workoutPlanDraftGeneration` 用于生成：

- 长期训练计划 `plan`
- 单次训练编排 `routine`

它收到：

- `intent`
- `conversationSummary`
- `latestUserMessage`
- `primaryExercises`
- `supplementaryExercises`

### 10.2 候选动作分层

提示词把候选动作分成两类：

`primaryExercises`：

- 核心候选。
- 根据用户意图推断出的动作。
- 计划里的主要训练动作应优先来自这里。

`supplementaryExercises`：

- 补充候选。
- 可用于热身、拉伸、协同肌群和计划完整性。
- 不必全部使用。

所有 `exerciseId` 必须来自这两组候选，禁止编造。

### 10.3 `routine` 引导

当 `intent.intentType = routine` 时，提示词要求输出单次编排结构。

关键要求：

- 不能输出 `days` 数组。
- 不能写成长期训练计划。
- 必须包含三个 sections：
  - `warmup`
  - `training`
  - `stretch`
- 每个 section 至少 1 个动作。
- `trainingLoopRounds` 表示主训练循环轮数。
- 主训练循环只重复 `training` section。
- `warmup` 和 `stretch` 不参与循环。
- 每个动作 item 必须包含：
  - `section`
  - `exerciseId`
  - `mode`
  - `sets`
  - `target`
  - `setRestSeconds`
  - `transitionRestSeconds`
- `item.section` 必须与所属 section 一致。

这个提示词让单次训练编排能直接进入训练执行页的阶段模型。

### 10.4 `plan` 引导

当 `intent.intentType = plan` 时，提示词要求输出长期计划周期结构。

关键要求：

- 不能输出旧的 `days[].items` 扁平动作列表。
- 必须先判断用户说的是计划周期、每周频率还是日历范围。
- 必须安排周期内训练日、休息日和恢复节奏。
- 非休息训练日必须包含：
  - `warmup`
  - `training`
  - `stretch`
- 休息日必须：
  - `isRestDay=true`
  - 提供 `recoveryNotes`
  - 不生成训练动作 routine 所需的 sections
- 多个训练日必须有可区分的 `dayType`、`focus` 或动作组合。
- 不能复制同一套动作只改标题。

这保证长期计划不是多个重复单次训练，而是一个有周期节奏的计划。

### 10.5 Schema 引导

`workoutPlanDraftGeneration.schema` 直接把目标 JSON 结构写成 TypeScript interface。

这类提示词的作用是让模型输出字段尽量贴近 Zod Schema，降低结构校验失败概率。

对 `plan`，模型必须输出：

- `kind`
- `title`
- `goal`
- `summary`
- `cycleLengthDays`
- `trainingDayCount`
- `restDayCount`
- `cycleRepeatable`
- `weeklyFrequency`
- `calendarHorizonDays`
- `estimatedSessionMinutes`
- `progression`
- `recoveryStrategy`
- `schedulePattern`
- `safetyNotes`
- `days`

对 `routine`，模型必须输出：

- `kind`
- `title`
- `goal`
- `summary`
- `estimatedSessionMinutes`
- `trainingLoopRounds`
- `trainingLoopRestSeconds`
- `safetyNotes`
- `sections`

最后还要求：

```txt
组数、次数、时长、循环轮数和休息必须保守可执行。
```

这是对训练强度的直接约束。

## 11. 提示词之外的服务端约束

提示词只是第一层引导，不能作为唯一安全边界。

当前系统还通过服务端做这些约束：

### 11.1 JSON 解析

所有结构化模型输出都必须能解析为 JSON。

解析失败会返回错误或走兜底。

### 11.2 Zod 结构校验

模型输出会经过 Zod Schema：

- `chatIntentSchema`
- `conversationSummaryContextSchema`
- `exerciseRecommendationCardSchema`
- `workoutPlanIntentSchema`
- `workoutRoutineDraftSchema`
- `workoutPlanDraftSchema`

### 11.3 候选动作校验

训练计划和动作推荐都必须使用服务端给出的候选动作。

服务端会校验：

- `exerciseId` 是否存在于数据库动作库。
- `exerciseId` 是否来自本次候选集合。
- 推荐动作是否被排除。

### 11.4 训练计划业务校验

长期计划还会检查：

- 周期天数和 `days.length` 是否一致。
- 训练日数量和休息日数量是否一致。
- 单次训练是否明显超时。
- 新手训练量是否偏高。
- 训练日动作组合是否高度重复。
- 非休息训练日是否缺少必要 section。
- 动作风险和用户经验是否匹配。

因此，正确理解当前设计时要区分：

```txt
提示词负责引导模型尽量输出正确内容。
服务端校验负责阻止错误内容进入系统。
```

## 12. 常见问题排查

### 12.1 模型把动作推荐误判成单次编排

重点检查 `chatIntentResolution`：

- 用户是否要求组数、次数、休息或流程。
- 顶层 `type` 是否错误设成 `routine`。
- `workoutIntent.intentType` 是否和顶层 `type` 不一致。

### 12.2 用户给了“20 分钟、无器械”，仍只推荐动作不生成训练

重点检查：

- `chatIntentResolution` 是否把 `type` 设成 `exercise_recommendation`。
- 提示词是否命中“有单次时长或本次训练条件时必须是 routine”的规则。
- `missingActionFields` 是否错误包含 `equipmentOrLocation`。

### 12.3 用户只缺少经验，系统仍追问

重点检查：

- `chatIntentResolution` 是否把 `experience` 放入 `missingActionFields`。
- 服务端 `getActionBlockingMissingFields` 是否过滤经验字段。
- `chatCompletion` 是否错误把默认 `beginner` 说成用户明确确认。

### 12.4 自然语言说会生成，但没有卡片

重点检查：

- `serverAssistantAction.triggered` 是否为 `true`。
- `assistant_action` 流事件是否发送。
- `chatCompletion` 是否违反“未触发不能承诺生成”的约束。
- 前端是否收到 `assistant_action` 后调用后续接口。

### 12.5 模型编造动作

重点检查：

- `chatCompletion.exerciseContext` 是否追加。
- `exerciseRecommendationGeneration` 是否只从 `candidateExercises` 选。
- `workoutPlanDraftGeneration` 是否只从 `primaryExercises` / `supplementaryExercises` 选。
- 服务端候选动作校验是否拦截了非法 `exerciseId`。

### 12.6 长期计划把“6 天计划”当成“每周 6 练”

重点检查：

- `chatIntentResolution` 的时间语义输出。
- `workoutPlanIntentExtraction` 的时间语义输出。
- `workoutPlanDraftGeneration.plan` 是否按 `cycleLengthDays` 生成周期。
- 草稿里的 `weeklyFrequency` 和 `calendarHorizonDays` 是否被误填。

## 13. 修改提示词时的注意事项

修改提示词时不要只看单句文案，要同时检查：

1. 这次模型调用的职责是否改变。
2. 输出结构是否仍和 Zod Schema 对齐。
3. 服务端是否已有对应确定性规则。
4. 测试是否覆盖了新的行为边界。
5. `chatCompletion` 的自然语言承诺是否仍和 `assistant_action` 对齐。
6. `conversationSummary` 是否会把默认值误写成用户事实。
7. 动作 ID 是否仍只能来自动作库候选集合。

如果提示词改变核心业务行为，例如触发条件、计划生成规则、动作选择规则、AI 输出结构或训练领域规则，应先走 OpenSpec。

## 14. 关键代码索引

提示词配置：

- `lib/server/ai/prompt-config.ts`

聊天意图和回复：

- `lib/server/chat/chat-service.ts`
- `lib/server/chat/conversation-summary-service.ts`

动作推荐：

- `app/api/ai/exercise-recommendations/route.ts`
- `lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts`

训练计划生成：

- `app/api/ai/workout-plan/route.ts`
- `lib/server/workout-plans/ai-workout-plan-service.ts`
- `lib/server/workout-plans/workout-plan-validation-service.ts`

结构定义：

- `lib/shared/chat/fitness-conversation-context.ts`
- `lib/shared/exercise-recommendations/schema.ts`
- `lib/shared/workout-plans/draft-schema.ts`

测试：

- `tests/chat-service.test.ts`
- `tests/ai-workout-plan-service.test.ts`
- `tests/exercise-recommendation-service.test.ts`

