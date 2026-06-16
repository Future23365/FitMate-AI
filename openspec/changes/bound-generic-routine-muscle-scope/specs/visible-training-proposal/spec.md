## ADDED Requirements

### Requirement: `submitVisibleTrainingProposal` 必须表达未指定肌群 routine 的提交边界

`submitVisibleTrainingProposal` 模型可见说明 SHALL 表达未指定具体肌群的单次 `routine` 不要求覆盖所有主要肌群或细分肌群。当前可见候选能组成受时长约束的可执行训练主体时，模型 SHOULD 选择候选子集并提交结构化 `routine`，而不是继续按未指定肌群补查动作库。

#### Scenario: 未指定肌群 routine 可以结构化提交

- **WHEN** 用户请求单次可执行训练
- **AND** 用户没有指定具体目标肌群、身体部位、分化训练或全身覆盖
- **AND** 当前可见候选能组成受时长约束的可执行训练主体
- **THEN** `submitVisibleTrainingProposal` 模型可见说明 MUST 表达可以提交 `payload.kind = "routine"`
- **AND** 模型可见说明 MUST 表达不要求覆盖所有主要肌群或细分肌群
- **AND** 模型可见说明 MUST 表达不应为了未指定肌群继续补查动作库

#### Scenario: 明确覆盖请求仍需尊重用户范围

- **WHEN** 用户明确要求全身覆盖、指定身体部位、指定分化训练或指定目标肌群
- **THEN** `submitVisibleTrainingProposal` 模型可见说明 MUST NOT 把未覆盖的明确范围忽略为非阻塞缺口
- **AND** 模型 SHOULD 基于当前可见候选提交、继续获取必要数据库动作事实、追问一个阻塞问题或说明无法可靠交付
