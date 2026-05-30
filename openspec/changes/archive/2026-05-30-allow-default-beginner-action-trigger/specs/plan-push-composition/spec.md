## ADDED Requirements

### Requirement: 经验未明确时长期计划必须默认推送简单计划

当用户提出长期、每周、多天或周期性训练计划需求，并且目标、单次时长、频率、器械或场地条件已经足够时，系统 SHALL 在经验未明确时默认按简单/新手友好的方式触发 `workout_plan`。

#### Scenario: 用户补充无器械完成计划条件

- **WHEN** 对话上下文已经包含长期计划需求、训练目标、单次训练时长和每周频率
- **AND** 用户补充“我没有器械”或等价的无器械条件
- **AND** 意图解析结果为 `workout_plan` 或根据上下文可继续长期计划生成
- **AND** `missingActionFields` 包含 `experience`
- **AND** 动作候选状态为 `enough` 或 `limited_but_usable`
- **THEN** 系统 MUST 触发 `workout_plan` 内部动作事件
- **AND** 生成结果 MUST 使用简单/新手友好的周期安排、动作选择和训练量

#### Scenario: 核心计划条件不足仍需追问

- **WHEN** 用户提出长期计划需求
- **AND** 目标、单次时长、每周频率、器械或场地等核心条件仍有缺失
- **THEN** 系统 MUST 继续追问缺失的核心训练条件
- **AND** 系统 MUST NOT 仅凭默认经验触发 `workout_plan`
