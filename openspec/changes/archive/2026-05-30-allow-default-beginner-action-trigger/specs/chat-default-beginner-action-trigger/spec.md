## ADDED Requirements

### Requirement: 经验缺失不得单独阻断聊天内部动作

当用户没有明确说明训练经验，但系统已经具备生成所需的核心训练条件时，聊天服务 SHALL 默认按 `beginner` / 简单训练策略触发内部动作事件。

#### Scenario: 模型把经验标为缺失但意图已有默认经验

- **WHEN** 意图解析结果的 `missingActionFields` 包含 `experience`
- **AND** `workoutIntent.experience` 为合法经验值
- **AND** 目标、时长、频率、器械或场地等核心生成条件已经满足
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 服务端 MUST NOT 因 `experience` 缺失阻断内部动作事件
- **AND** 系统 MUST 按默认新手策略触发对应的 `exercise_recommendation`、`workout_routine` 或 `workout_plan`

#### Scenario: 只有经验缺失和健康限制缺失

- **WHEN** 意图解析结果的 `missingActionFields` 只包含 `experience` 和健康、伤病、疼痛或身体限制相关字段
- **AND** 其他核心生成条件已经满足
- **THEN** 服务端 MUST 视为没有阻断字段
- **AND** 系统 MUST 触发对应内部动作事件

### Requirement: 默认经验必须保持保守生成边界

系统 SHALL 将默认经验用于降低训练难度和风险，而不是生成高强度或高风险训练。

#### Scenario: 用户未明确说明经验

- **WHEN** 用户请求动作推荐、单次训练编排或长期计划
- **AND** 用户没有明确说明经验水平
- **THEN** 系统 MUST 使用 `beginner` 或等价的新手友好策略筛选动作和控制训练量
- **AND** 系统 MUST NOT 因默认经验生成需要高级训练基础的训练安排

### Requirement: 回复必须与内部动作状态一致

聊天自然语言回复 SHALL 与服务端是否触发内部动作保持一致。

#### Scenario: 内部动作已触发

- **WHEN** 服务端已触发动作推荐、单次训练编排或长期计划内部动作
- **THEN** 回复 MAY 使用自然过渡说明会按当前条件整理结果
- **AND** 回复 MUST NOT 追问已经由默认经验策略满足的经验字段

#### Scenario: 内部动作未触发

- **WHEN** 服务端没有触发动作推荐、单次训练编排或长期计划内部动作
- **THEN** 回复 MUST 追问仍然阻断生成的缺失信息
- **AND** 回复 MUST NOT 承诺会整理或生成训练结果
