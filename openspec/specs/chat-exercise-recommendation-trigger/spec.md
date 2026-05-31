# chat-exercise-recommendation-trigger Specification

## Purpose
TBD - created by archiving change allow-goal-only-exercise-recommendation. Update Purpose after archive.
## Requirements
### Requirement: 目标明确的动作推荐必须触发内部推荐事件

当用户请求某个训练目标、身体部位或动作类别的纯动作推荐，且意图解析没有要求先展示建议追问时，系统 SHALL 在动作候选可用时触发 `exercise_recommendation` 内部动作事件，即使用户没有说明器械、场地或训练时长。

#### Scenario: 用户只说明训练部位

- **WHEN** 用户输入“我想练腿”
- **AND** 意图解析结果使用顶层 `type = "exercise_recommendation"`
- **AND** 意图解析结果没有返回需要用户补充信息的 `suggestedReplies`
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `exercise_recommendation` 内部动作事件
- **AND** 系统 MUST NOT 因为缺少 `equipmentOrLocation` 阻断动作推荐

#### Scenario: 用户只要求推荐动作

- **WHEN** 用户输入“推荐几个练腿动作”
- **AND** 意图解析结果没有返回需要用户补充信息的 `suggestedReplies`
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `exercise_recommendation` 内部动作事件
- **AND** 系统 MUST NOT 强制要求用户先提供单次训练时长

#### Scenario: 推荐卡片生成不依赖必填图片字段

- **WHEN** 系统已经触发 `exercise_recommendation`
- **AND** 候选动作包含合法动作 ID、名称、肌群和器械信息
- **AND** 候选动作没有可用图片 URL
- **THEN** 系统 MUST 生成可展示的动作推荐卡片
- **AND** 系统 MUST NOT 在 stream 前抛出运行时异常

#### Scenario: 意图解析要求先追问

- **WHEN** 意图解析结果使用顶层 `type = "exercise_recommendation"`
- **AND** 意图解析结果返回 `canTriggerAction = false`
- **AND** 意图解析结果返回非空 `suggestedReplies`
- **THEN** 系统 MUST NOT 触发 `exercise_recommendation` 内部动作事件
- **AND** 系统 MUST 向用户保留这些建议回复

### Requirement: 动作候选不足时不得触发推荐事件

当动作候选状态不足以支撑推荐时，系统 SHALL 继续阻断 `exercise_recommendation` 内部动作事件，避免前端推送空结果或误导性结果。

#### Scenario: 动作候选不足

- **WHEN** 意图解析结果使用顶层 `type = "exercise_recommendation"`
- **AND** 动作候选状态为 `insufficient`
- **THEN** 系统 MUST NOT 触发 `exercise_recommendation` 内部动作事件

### Requirement: 动作推荐不得升级为单次训练编排

当用户只请求动作推荐且没有提出训练流程、组数次数、休息、顺序或本次训练安排时，系统 SHALL 保持 `exercise_recommendation` 语义，不得因为目标部位明确而触发 `workout_routine`。

#### Scenario: 纯动作推荐保持推荐语义

- **WHEN** 用户输入“我想练腿”
- **AND** 用户没有提供本次训练编排语义
- **THEN** 系统 MUST 使用 `exercise_recommendation` 内部动作事件
- **AND** 系统 MUST NOT 触发 `workout_routine` 内部动作事件

