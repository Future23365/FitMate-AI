# chat-routine-composition Specification

## Purpose
定义聊天页面推送单次训练编排的结构化数据、展示和保存要求，确保 AI routine 草稿使用热身、训练、拉伸三段式结构，并能无损保存为 `WorkoutRoutine`。
## Requirements
### Requirement: 聊天推送 routine 使用三段式草稿结构
聊天页面推送单次训练编排时，系统 SHALL 使用 routine 专用结构化草稿表达热身、训练和拉伸，不得继续用单日长期计划结构代表 routine。

#### Scenario: AI 生成单次训练编排
- **WHEN** 用户请求生成本次训练、动作组或训练流程，并且意图解析结果为 `routine`
- **THEN** 系统 MUST 生成 `kind = "routine"` 的 routine 草稿
- **AND** 草稿 MUST 包含 `warmup`、`training`、`stretch` 三个 section
- **AND** 草稿 MUST NOT 依赖 `WorkoutPlanDraft.days[0]` 表达单次训练编排

#### Scenario: 三段式结构缺失
- **WHEN** AI routine 草稿缺少 `warmup`、`training` 或 `stretch` 中任一 section
- **THEN** 服务端 MUST 判定草稿校验失败
- **AND** 系统 MUST NOT 将缺失 section 的草稿发送给聊天卡片保存

#### Scenario: Routine section 顺序
- **WHEN** 系统展示、保存或转换 routine 草稿
- **THEN** 系统 MUST 按 `warmup`、`training`、`stretch` 的顺序处理 section
- **AND** 系统 MUST NOT 让主训练循环重复热身或拉伸 section

### Requirement: Routine 草稿包含循环配置和动作执行参数
聊天推送的 routine 草稿 SHALL 将主训练循环配置和每个动作的执行参数作为服务端校验后的结构化字段。

#### Scenario: AI 输出 routine 循环配置
- **WHEN** AI 生成 routine 草稿
- **THEN** 草稿 MUST 包含 `trainingLoopRounds`
- **AND** 草稿 MUST 包含 `trainingLoopRestSeconds`
- **AND** `trainingLoopRounds` MUST 是服务端允许范围内的正整数
- **AND** `trainingLoopRestSeconds` MUST 是服务端允许范围内的非负整数

#### Scenario: AI 输出动作执行参数
- **WHEN** AI 生成 routine 草稿中的动作项
- **THEN** 每个动作项 MUST 包含 `exerciseId`、`section`、`mode`、`sets`、`target`、`setRestSeconds` 和 `transitionRestSeconds`
- **AND** `mode` MUST 只能是 `reps` 或 `duration`
- **AND** `target` MUST 表示单组次数或单组秒数
- **AND** 系统 MUST NOT 使用缺失组数、次数或休息信息的动作项生成可保存 routine

#### Scenario: 动作参数用于时长估算
- **WHEN** 系统计算 routine 草稿的预估时长
- **THEN** 系统 MUST 使用草稿中的动作执行参数和主训练循环配置
- **AND** 估算结果 MUST 与保存后 `WorkoutRoutine` 的估算逻辑保持一致

### Requirement: Routine 生成必须基于动作库候选并经过服务端校验

聊天推送的 routine 草稿 SHALL 只使用后端动作库中存在且属于本轮候选集合的动作，并且 SHALL 在保存或展示前通过服务端确定性结构校验。服务端校验不得仅因训练合理性判断、动作 section 与本地推导元数据不一致、训练量偏高、休息偏短或目标时长来自默认推断而拒绝草稿。用户当前消息、历史已确认约束或用户确认 artifact 明确表达的避免动作、禁忌和时长要求仍可作为 hard fail 依据；未主动提出或未确认的伤病限制不得作为 hard fail 依据。

#### Scenario: AI 选择候选动作

- **WHEN** 系统调用 AI 生成 routine 草稿
- **THEN** 提示词 MUST 要求 AI 只能选择候选动作中的 `exerciseId`
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 存在于数据库动作库
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 属于本轮候选集合
- **AND** 系统 MUST NOT 持久化模型编造、客户端伪造或候选集合外的动作 id

#### Scenario: 候选动作不足

- **WHEN** 动作库候选不足以生成包含热身、训练、拉伸的 routine
- **THEN** 系统 MUST 返回可识别的失败结果
- **AND** 系统 MUST NOT 让 AI 用候选列表之外的动作补足 section

#### Scenario: AI 输出结构无效

- **WHEN** AI 输出的 routine 草稿未通过 Zod Schema、缺少必要 section、缺少动作执行参数，或违反服务端确定性契约边界
- **THEN** 系统 MUST 返回 `invalid_ai_output` 或等价的结构化失败结果
- **AND** AI Trace MUST 记录失败详情
- **AND** 聊天卡片 MUST NOT 展示可保存的错误草稿

#### Scenario: AI section 语义判断优先

- **WHEN** AI 将真实存在且属于本轮候选集合的动态活动、灵活性或拉伸动作放入 `warmup` 或 `stretch`
- **AND** 该动作不违反用户明确器械、权限或动作来源约束
- **THEN** 服务端 MUST 接受 AI 的 section 选择
- **AND** 服务端 MUST NOT 仅因 `allowedSections` 或等价本地推导元数据不匹配而拒绝草稿

#### Scenario: Routine 合理性 warning 不阻止展示

- **WHEN** routine 草稿通过 Schema、候选动作和必要 section 校验
- **AND** 服务端发现训练量偏高、新手训练量偏高、休息偏短、section 语义分歧或用户历史偏好冲突
- **THEN** 服务端 MUST 将这些问题记录为 warning
- **AND** 聊天卡片 MUST 继续展示该 routine 草稿

### Requirement: 聊天 routine 卡片展示三段式编排
聊天页面 SHALL 使用 routine 专用卡片展示 AI 推送的单次训练编排，使用户能检查阶段、循环和动作执行参数。

#### Scenario: 用户查看 routine 推送卡片
- **WHEN** 聊天消息包含 routine 草稿
- **THEN** 卡片 MUST 展示标题、目标、预估时长和主训练循环次数
- **AND** 卡片 MUST 按热身、训练、拉伸三段展示动作
- **AND** training section MUST 展示循环轮数和循环间休息

#### Scenario: 用户查看动作参数
- **WHEN** 用户查看 routine 卡片中的动作
- **THEN** 每个动作 MUST 展示动作名称、动作图片或占位图、器械或肌群摘要
- **AND** 每个动作 MUST 展示组数、次数或秒数、组间休息和动作过渡休息
- **AND** 如果动作有备注，卡片 MUST 展示该备注或提供可查看入口

#### Scenario: Routine 卡片保存状态
- **WHEN** 用户点击保存 routine
- **THEN** 卡片 MUST 展示保存中状态
- **AND** 保存成功后 MUST 展示成功状态并进入动作编排列表或编排页
- **AND** 保存失败时 MUST 展示可理解的错误反馈

### Requirement: 聊天推送 routine 保存全流程保持结构一致
聊天推送 routine 从 AI 草稿到保存为 `WorkoutRoutine` 的全流程 SHALL 保留 section、循环配置和动作执行参数。

#### Scenario: 用户保存 AI 推送 routine
- **WHEN** 用户在聊天 routine 卡片点击保存
- **THEN** 系统 MUST 将 routine 草稿转换为 `WorkoutRoutine`
- **AND** 转换结果 MUST 保留 `trainingLoopRounds` 和 `trainingLoopRestSeconds`
- **AND** 转换结果 MUST 保留每个动作的 `section`、`mode`、`sets`、`target`、`setRestSeconds` 和 `transitionRestSeconds`
- **AND** 系统 MUST 通过 `/api/workout-routines` 保存该 `WorkoutRoutine`

#### Scenario: 保存后的 routine 用于训练执行
- **WHEN** 用户保存聊天推送 routine 并在动作编排或训练日历中使用它
- **THEN** 系统 MUST 能用保存后的 routine 生成包含热身、循环训练、拉伸的训练时间线
- **AND** 主训练循环次数 MUST 与聊天卡片展示一致

#### Scenario: 历史 routine 草稿不兼容
- **WHEN** 旧聊天历史中存在非 `kind = "routine"` 的单日计划式 routine 草稿
- **THEN** 系统 MAY 不恢复该旧草稿卡片
- **AND** 系统 MUST NOT 为旧草稿新增兼容转换层

### Requirement: 明确时长的本次训练请求必须触发 routine

当用户提供训练目标、单次训练时长，并说明器械或场地条件时，聊天意图解析 SHALL 将该请求表达为单次训练编排 `routine`，不得把顶层 `type` 表达为 `exercise_recommendation`。

#### Scenario: 用户提供目标时长和器械条件

- **WHEN** 用户输入“练腿，20分钟，没有器械”
- **THEN** 意图解析结果 MUST 使用顶层 `type = "routine"`
- **AND** `workoutIntent.intentType` MUST 为 `routine`
- **AND** `canTriggerAction` MUST 为 `true`
- **AND** 系统 MUST 触发 `workout_routine` 内部动作事件

#### Scenario: 动作推荐请求没有本次训练编排语义

- **WHEN** 用户只要求推荐某类动作，例如“推荐几个练腿动作”
- **THEN** 意图解析结果 MAY 使用顶层 `type = "exercise_recommendation"`
- **AND** 系统 MUST NOT 因为目标部位存在而强制触发 `workout_routine`

### Requirement: 聊天意图解析不得返回互相冲突的动作类型

聊天意图解析 SHALL 让顶层 `type` 与 `workoutIntent.intentType` 表达一致的用户意图，避免同一次回复同时表达动作推荐和单次训练编排。

#### Scenario: 顶层类型和训练意图冲突

- **WHEN** 用户请求已经满足单次训练编排条件
- **THEN** 意图解析结果 MUST NOT 返回顶层 `type = "exercise_recommendation"` 且 `workoutIntent.intentType = "routine"` 的混合语义作为最终意图

### Requirement: 经验未明确时 routine 必须默认推送简单编排

当用户提出单次训练编排需求，并且目标、单次时长、器械或场地条件已经足够时，系统 SHALL 在经验未明确时默认按简单/新手友好的方式触发 `workout_routine`。

#### Scenario: 用户补充无器械但没有说明经验

- **WHEN** 对话上下文已经包含训练目标和单次训练时长
- **AND** 用户补充“我没有器械”或等价的无器械条件
- **AND** 意图解析结果为 `routine`
- **AND** `missingActionFields` 包含 `experience`
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `workout_routine` 内部动作事件
- **AND** 生成结果 MUST 使用简单/新手友好的训练强度和动作选择

#### Scenario: 经验缺失不得覆盖候选不足阻断

- **WHEN** 意图解析结果为 `routine`
- **AND** 动作候选状态为 `insufficient`
- **THEN** 系统 MUST NOT 因默认经验策略强行触发 `workout_routine`

### Requirement: Routine 校验失败必须可恢复

聊天推送单次 routine 时，系统 SHALL 将违反用户明确约束的可调整契约失败转成自动修复或继续对话引导。训练合理性 warning 不得触发失败恢复。

#### Scenario: 用户明确时长下 routine 时长超出

- **WHEN** AI 生成的 routine 草稿通过结构解析
- **AND** 用户明确提供目标时长
- **AND** 服务端估算时长明显超过用户目标时长
- **THEN** 系统 MUST 先尝试自动压缩并重新校验
- **AND** 系统 MUST NOT 直接把该失败作为终止型错误展示给用户

#### Scenario: 推断时长下 routine 时长不一致

- **WHEN** AI 生成的 routine 草稿通过结构解析
- **AND** `sessionMinutes` 来源是默认值或 LLM 推断
- **AND** 服务端估算时长与该值明显不一致
- **THEN** 系统 MUST NOT 因该不一致阻止 routine 卡片展示
- **AND** 系统 MAY 记录时长 warning

#### Scenario: Routine 修复失败

- **WHEN** routine 自动修复后仍未通过服务端契约校验
- **THEN** 系统 MUST 展示“计划生成失败”
- **AND** 系统 MUST 引导用户选择压缩时长、补足时长、重新生成或调整明确约束
- **AND** 系统 MUST NOT 展示未通过契约校验的 routine 卡片

### Requirement: 明确时长的 routine 必须接近目标可执行时长

当用户明确提供单次训练时长时，聊天推送 routine 的服务端估算结果 SHALL 接近该目标时长；当时长来自默认值或 LLM 推断时，估算不一致 SHALL 仅作为 warning，不得阻止卡片展示。

#### Scenario: 用户明确提供时长

- **WHEN** 用户明确输入“练腿 40 分钟”或等价表达
- **AND** routine 草稿实际估算明显低于或高于 40 分钟
- **THEN** 系统 MUST 将该不一致作为可恢复契约失败
- **AND** 系统 MUST 尝试修复或返回可继续对话的引导

#### Scenario: 时长来自默认值

- **WHEN** 用户没有明确提供单次训练时长
- **AND** 系统使用默认或 LLM 推断的 `sessionMinutes`
- **AND** routine 草稿实际估算与该值不一致
- **THEN** 系统 MUST NOT 因该不一致阻止卡片展示
- **AND** 系统 MAY 在 trace 中记录 warning

