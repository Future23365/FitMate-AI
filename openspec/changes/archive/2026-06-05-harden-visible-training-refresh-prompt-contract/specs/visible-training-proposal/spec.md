## ADDED Requirements

### Requirement: visibleTrainingProposal 刷新必须优先替换用户已看到动作
`visibleTrainingProposal` 的刷新语义 SHALL 以用户可见结果为边界：当用户基于上一套可见训练方案要求替换、重新来一套、不满意或同类继续请求时，新方案 SHOULD 保留原目标和约束，并优先替换上一套用户已看到的 `exerciseItems`。系统 MUST NOT 通过服务端关键词、正则、同义词表或短句模板替模型判断刷新语义。

#### Scenario: 刷新一次训练编排
- **WHEN** 当前会话存在上一套用户可见 `payload.kind = "routine"` 的 `visibleTrainingProposal`
- **AND** 模型判断用户目标是替换上一套一次训练编排
- **THEN** 新 `visibleTrainingProposal.payload.kind` SHOULD 仍为 `routine`，除非用户目标明确改变
- **AND** 新 `payload.exerciseItems` SHOULD 保留原目标、器械、难度、时长和 `warmup` / `training` / `stretch` 结构约束
- **AND** 新 `payload.exerciseItems` SHOULD 优先排除上一套用户已看到动作
- **AND** 系统 MUST NOT 在服务端根据用户原文强制选择刷新 action 或 tool

#### Scenario: 刷新多天训练计划
- **WHEN** 当前会话存在上一套用户可见 `payload.kind = "plan"` 的 `visibleTrainingProposal`
- **AND** 模型判断用户目标是替换上一套计划
- **THEN** 新 `visibleTrainingProposal.payload.kind` SHOULD 仍为 `plan`，除非用户目标明确改变
- **AND** 新 payload SHOULD 保留原计划目标、周期、训练日 / 休息日结构和可执行编排边界
- **AND** 新 payload SHOULD 优先替换上一套用户已看到动作，再组成完整 `warmup` / `training` / `stretch` 和 `schedule.assignments`
- **AND** 新 payload MUST NOT 仅复制上一套 `exerciseItems` 并声称已经换新

#### Scenario: 刷新动作推荐
- **WHEN** 当前会话存在上一套用户可见 `payload.kind = "exercise_selection"` 的 `visibleTrainingProposal`
- **AND** 模型判断用户目标是换一批动作推荐
- **THEN** 新 `visibleTrainingProposal.payload.kind` SHOULD 仍为 `exercise_selection`，除非用户目标明确升级为 `routine` 或 `plan`
- **AND** 新 `exerciseItems` SHOULD 优先排除上一套用户已看到 training 动作
- **AND** 新结果 MUST NOT 排除上一轮未展示给用户的内部候选

#### Scenario: 候选不足或用户要求保留动作
- **WHEN** 用户明确要求保留上一套中的某些动作
- **OR** 在当前目标、器械、难度、section、时长或计划约束下没有足够替代动作
- **THEN** 模型 MAY 复用部分已展示动作
- **AND** 模型 SHOULD 在 `content` 中说明保留或复用的原因
- **AND** 系统 MUST NOT 为了满足“完全换新”而接受不存在、未发布或不被受控事实支撑的 `exerciseId`

### Requirement: visibleTrainingProposal 刷新事实必须来自受控可见事实
系统 SHALL 以用户已经看到的 `visibleTrainingProposal.payload.exerciseItems` 作为刷新排除的事实边界。模型 MAY 通过当前 run 可见事实、受控 read/import tool result 或当前 satisfied 动作查询结果构造新方案，但 MUST NOT 从自然语言正文、trace 摘要、未展示内部候选或未导入的历史 payload 中猜测动作事实。

#### Scenario: 排除集合来源
- **WHEN** 模型刷新上一套 `visibleTrainingProposal`
- **THEN** 默认排除集合 SHOULD 只来自上一套用户可见 `payload.exerciseItems[*].exerciseId`
- **AND** 未进入上一套用户可见 payload 的 tool 候选 MUST NOT 默认进入排除集合
- **AND** 服务端 MUST NOT 从 assistant 自然语言正文反向重建排除集合

#### Scenario: 新方案动作来源
- **WHEN** 模型输出刷新后的 `visibleTrainingProposal.payload.exerciseItems`
- **THEN** 每个 `exerciseId` MUST 继续来自当前 run 已满足的动作事实来源或当前用户可访问的 `visible_training_proposal_fact`
- **AND** 服务端 MUST 继续复核数据库存在性、发布态和 section 边界
- **AND** 刷新语义 MUST NOT 放宽既有 `visibleTrainingProposal` validator
