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
聊天推送的 routine 草稿 SHALL 只使用后端动作库中存在的动作，并且 SHALL 在保存或展示前通过服务端结构校验。

#### Scenario: AI 选择候选动作
- **WHEN** 系统调用 AI 生成 routine 草稿
- **THEN** 提示词 MUST 要求 AI 只能选择候选动作中的 `exerciseId`
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 存在于数据库动作库
- **AND** 系统 MUST NOT 持久化模型编造或客户端伪造的动作 id

#### Scenario: 候选动作不足
- **WHEN** 动作库候选不足以生成包含热身、训练、拉伸的 routine
- **THEN** 系统 MUST 返回可识别的失败结果
- **AND** 系统 MUST NOT 让 AI 用候选列表之外的动作补足 section

#### Scenario: AI 输出结构无效
- **WHEN** AI 输出的 routine 草稿未通过 Zod Schema 或领域校验
- **THEN** 系统 MUST 返回 `invalid_ai_output` 或等价的结构化失败结果
- **AND** AI Trace MUST 记录失败详情
- **AND** 聊天卡片 MUST NOT 展示可保存的错误草稿

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

