## ADDED Requirements

### Requirement: visibleTrainingProposal 必须复核当前 run 动作事实来源
系统 SHALL 在 `visibleTrainingProposal` 终态输出校验中复核每个 `exerciseItems[*].exerciseId + section` 来自当前 run 已满足的动作查询结果，或来自当前 run 中已导入的 `role=consumable` 训练事实 resource。仅数据库存在、发布态和 section 允许，MUST NOT 单独支撑新的用户可见训练卡片。

#### Scenario: 无当前 run 动作事实来源时拒绝 visibleTrainingProposal
- **WHEN** Planner 输出 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal`
- **AND** 当前 run 没有 satisfied tool result 或 consumable resource 可支撑其中某个 `exerciseId + section`
- **THEN** terminal output validator MUST reject the visible output before rendering or persistence
- **AND** rejection details MUST include recoverable directions to query facts, import visible facts, ask the user, or fail without rendering unsupported structure

#### Scenario: satisfied searchExerciseResources 可支撑同 section 动作项
- **WHEN** 当前 run 存在 `searchExerciseResources` 的 `ok=true` 且 `fulfillment.satisfied=true` result
- **AND** its model projection includes `groups.<section>.exercises[*].exerciseId`
- **THEN** matching `visibleTrainingProposal.exerciseItems[*].exerciseId + section` MAY pass current-run source validation
- **AND** database existence, published status and allowedSections validation MUST still run

#### Scenario: unsatisfied tool result 不能支撑可见训练卡片
- **WHEN** 当前 run 只有 `fulfillment.satisfied=false` 的 tool result
- **THEN** `visibleTrainingProposal` MUST NOT consume exercise facts from that result
- **AND** validator MUST reject matching exerciseItems as lacking current-run consumable source

#### Scenario: 已导入可消费 visible_training_proposal_fact 可作为来源
- **WHEN** 当前 run 的 `ResourceStore` 中存在 `role=consumable` 的 `visible_training_proposal_fact`
- **THEN** validator MAY accept matching `exerciseItems[*].exerciseId + section` from that resource summary
- **AND** validator MUST NOT accept `visible_training_proposal_fact_index` or metadata-only recent summaries as action fact sources
