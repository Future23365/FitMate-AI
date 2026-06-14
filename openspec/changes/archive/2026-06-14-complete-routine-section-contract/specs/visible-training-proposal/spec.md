## ADDED Requirements

### Requirement: 完整 routine 默认必须表达三段训练编排
系统 SHALL 在模型可见的 `visibleTrainingProposal` 输出合同中表达完整单次训练 `routine` 的默认组成。除非用户明确只要求部分范围、明确排除热身或拉伸，或当前模型可见事实不足且无法继续补齐，否则完整 `routine` SHOULD 包含 `warmup`、`training`、`stretch` 三段；`training` section SHALL 承载用户的主训练目标，例如核心、胸部、下肢、全身或减脂主训练。

#### Scenario: 主目标落在 training section
- **WHEN** 用户请求一套以核心、胸部、下肢、全身或类似目标为主的可执行单次训练
- **THEN** 模型可见合同 MUST 表达该主目标属于 `training` 段的训练内容
- **AND** 模型可见合同 MUST NOT 将“核心”等主目标当作 `warmup`、`training`、`stretch` 之外的新 section
- **AND** 最终 `visibleTrainingProposal.payload.kind` SHOULD 为 `routine`

#### Scenario: 完整 routine 默认包含 warmup training stretch
- **WHEN** 用户请求一套可执行单次训练编排
- **AND** 用户没有明确要求只安排主训练、只安排动作列表或排除热身 / 拉伸
- **THEN** 模型可见合同 MUST 引导模型默认按 `warmup`、`training`、`stretch` 三段规划
- **AND** 每个最终进入 `exerciseItems` 的动作 MUST 使用与动作事实 `allowedSections` 相容的 `section`
- **AND** 每个 `routine` 动作项 MUST 包含 `prescription`

#### Scenario: 明确部分范围可以只交付部分 section
- **WHEN** 用户明确要求只安排主训练动作、只给动作列表、不要热身、不要拉伸或只处理既有动作的组数次数
- **THEN** 模型 MAY 交付只覆盖部分 section 的 `visibleTrainingProposal`
- **AND** 最终回答 MUST 基于已校验结构说明当前交付范围
- **AND** 如自然存在下一步，`suggestedQuestions` MAY 提供补齐未覆盖 section 的用户口吻消息

### Requirement: accepted 训练方案摘要必须暴露 section 覆盖事实
系统 SHALL 在 `submitVisibleTrainingProposal` accepted 后给模型可见的 tool result summary 中暴露已校验训练方案的 section 覆盖事实。该 summary 只表达当前结构化输出实际覆盖哪些 section，不得表达业务目标满足度、固定下一步动作或强制 tool workflow。

#### Scenario: accepted summary 包含 section 覆盖
- **WHEN** `submitVisibleTrainingProposal` 接受一个 `visibleTrainingProposal`
- **THEN** 模型可见 summary MUST 包含 `sectionSummary`
- **AND** 模型可见 summary MUST 包含 `availableSections`
- **AND** 模型可见 summary MUST 包含 `missingSections`
- **AND** 这些字段 MUST 来自已校验 payload 的 `exerciseItems[*].section`

#### Scenario: accepted summary 不指挥下一步
- **WHEN** accepted summary 包含 `missingSections`
- **THEN** summary MUST NOT 包含 `nextActionHints`
- **AND** summary MUST NOT 包含 `recommendedNextStep`
- **AND** summary MUST NOT 表达缺少某 section 时必须继续调用某个业务 tool
- **AND** summary MUST NOT 表达结构化输出已经满足或没有满足用户业务目标
