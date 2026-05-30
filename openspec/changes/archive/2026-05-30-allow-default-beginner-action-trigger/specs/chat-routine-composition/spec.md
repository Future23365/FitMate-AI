## ADDED Requirements

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
