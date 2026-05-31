## Why

用户会在聊天和训练中持续表达偏好、动作反馈、临时约束和健康信号。当前如果只把这些写入 conversationSummary，后续推荐、Patch 和计划生成无法稳定复用；如果不区分长期和临时，又会把“今天不想练腿”错误沉淀为长期画像。

## What Changes

- 新增 `UserMemory` 和 `UserExerciseFeedback` 或等价服务，分层保存显式偏好、动作反馈、约束、临时上下文和健康/不适信号。
- 明确“当前消息 > 当前 artifact > 显式用户画像 > 近期反馈 > 训练完成记录 > 系统默认值”的读取优先级。
- 将“不喜欢俯卧撑”“平板支撑太难”“今天不想练腿”“以后都不要这个动作”等表达写入不同记忆类型。
- 长期限制、健康/不适信号和高影响偏好写入时通过 Policy/Confirmation 控制。
- 训练完成率、跳过动作、实际时长和主观疲劳可作为后续推荐和递进的输入。

## Capabilities

### New Capabilities
- `user-feedback-memory`: 定义用户反馈、长期记忆、临时上下文、动作偏好和训练行为反馈的保存、读取和确认要求。

### Modified Capabilities
- `exercise-metadata-pools`: 动作反馈会影响候选过滤、降阶和风险控制。
- `domain-plan-engine`: 计划引擎读取用户记忆和训练结果作为约束与递进输入。

## Impact

- 影响聊天意图解析、用户画像服务、动作推荐、Patch、计划引擎和训练完成结果读取。
- 可能需要新增 Prisma 表或等价持久化结构：`UserMemory`、`UserExerciseFeedback`、`ExerciseExposure` 或关联表。
- 需要补充长期偏好、临时上下文、确认写入和记忆读取优先级测试。
