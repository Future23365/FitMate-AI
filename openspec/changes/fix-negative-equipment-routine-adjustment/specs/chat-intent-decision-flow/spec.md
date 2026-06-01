## ADDED Requirements

### Requirement: 否定器械短指令必须触发受控训练调整

系统 SHALL 在 LLM 已表达用户要调整、替换或重新生成已有训练内容时，将当前消息中的否定器械或场地约束作为本轮训练调整条件，而不是退化为普通回答或跨会话引用澄清。

#### Scenario: 已有哑铃 routine 后用户要求不用哑铃
- **WHEN** 当前会话最近存在一个 active `routine`
- **AND** 该 routine 的标题、摘要、动作或结构化字段表明使用哑铃
- **AND** LLM resolved intent 表达用户要调整、替换、重新生成或 patch 该训练
- **AND** 最新用户消息表达当前不再使用哑铃或等价否定器械约束
- **THEN** 系统 MUST 沿用最近 routine 的训练目标和时长
- **AND** 系统 MUST 将本轮器械条件覆盖为不使用哑铃或等价无哑铃约束
- **AND** 系统 MUST 触发 `workout_patch`、受控 routine 重新生成或等价可执行调整流程
- **AND** 系统 MUST NOT 仅因为模型没有重复输出完整 `workoutIntent` 而降级为 `answer_only`

#### Scenario: 调整链路需要引用对象
- **WHEN** resolved intent 表达对已有 routine 或 plan 的器械调整
- **THEN** resolved intent MUST 声明引用需求或携带等价 current artifact hint
- **AND** 服务端 MUST 在执行 Patch 或重新生成前解析到当前用户可访问的目标 artifact
- **AND** 引用无法唯一确定时 MUST 进入可读澄清流程

#### Scenario: 回复必须反映真实执行状态
- **WHEN** 用户要求把已有训练改为不使用某器械
- **AND** 服务端没有成功执行 Patch、重新生成或返回可恢复失败
- **THEN** 用户回复 MUST NOT 表达已经完成无器械替换
- **AND** 用户回复 MUST 明确说明当前需要确认的对象、缺失条件或失败原因

### Requirement: 器械覆盖不得被旧历史事实反向污染

系统 SHALL 在同一轮决策中让最新用户消息中的器械覆盖条件优先于历史 summary、knownFacts 和 recent artifact 摘要中的旧器械事实。

#### Scenario: 当前消息否定历史器械
- **WHEN** 历史上下文记录用户有哑铃或最近 routine 使用哑铃
- **AND** 最新用户消息表达本轮不用哑铃、不要哑铃、换成无器械或等价覆盖
- **THEN** 本轮 resolved intent、下游候选选择和最终回复 MUST 使用覆盖后的器械条件
- **AND** 系统 MUST NOT 把旧哑铃条件继续当作本轮可用器械条件

#### Scenario: 覆盖条件进入 artifact 生成
- **WHEN** 系统因器械覆盖重新生成 routine 或 plan
- **THEN** 下游生成输入 MUST 包含覆盖后的器械限制
- **AND** 生成结果 MUST 通过动作候选和校验链路确认不违反该限制

