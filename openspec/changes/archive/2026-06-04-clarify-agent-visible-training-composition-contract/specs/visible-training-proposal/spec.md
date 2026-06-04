## MODIFIED Requirements

### Requirement: 训练方案生成必须遵循分阶段动作证据流程
Agent SHALL 基于当前可见事实、tool manifest、observations、用户目标和模型自主推理组合 `visibleTrainingProposal`。系统 MUST 表达受控动作事实、结构字段和最终输出边界，但 MUST NOT 用服务端规则、固定关键词、固定工具调用次数或固定工具调用顺序替代模型决策。

#### Scenario: 模型自主选择输出结构
- **WHEN** 模型准备输出用户可见训练内容
- **THEN** 模型可见合同 MUST 提供 `exercise_selection`、`routine` 和 `plan` 的结构字段要求
- **AND** 模型 MUST 基于用户目标、上下文、可见 tool、observations 和 tool results 自主选择是否输出 `visibleTrainingProposal`
- **AND** 服务端 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板替模型选择 `payload.kind`

#### Scenario: 动作事实可作为最终结构原料
- **WHEN** 当前 run 存在 `fulfillment.satisfied = true` 的 `searchExerciseResources` 结果
- **THEN** 该结果中 `groups.<section>.exercises[*].exerciseId` MAY 作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的受控事实来源
- **AND** 最终训练事实 MUST 由 `final_answer.visibleOutputs[]` 中的 `visibleTrainingProposal.payload` 表达
- **AND** tool result 本身 MUST NOT 被保存或渲染为最终训练方案

#### Scenario: 结构缺口由模型自主处理
- **WHEN** 模型选择的最终输出结构需要当前可见事实未提供的 section、动作、`prescription` 或 `schedule`
- **THEN** 模型可见合同 MUST 允许模型基于当前可见工具和事实自主决定继续调用 tool、向用户澄清、失败收口或输出当前事实可支撑的结构
- **AND** 系统 MUST NOT 强制模型按固定顺序调用 `searchExerciseResources`
- **AND** 系统 MUST NOT 通过服务端逻辑补写模型未输出的高层语义决策

#### Scenario: 既有可见训练方案作为可复用事实
- **WHEN** 当前上下文已有可访问的 `visibleTrainingProposal` fact
- **THEN** 模型可见合同 MUST 表达该 fact 中的 `exerciseItems`、section 摘要和 `schedule` 摘要可作为当前 run 的可见事实
- **AND** 模型可见合同 MUST 表达完整历史方案需要通过对应 read/import tool 在权限和 schema 校验后导入
- **AND** 服务端 MUST NOT 从自然语言摘要、正文或 trace 中反向推断未导入的动作事实

#### Scenario: 不新增旧式 draft 生成能力
- **WHEN** 系统实现训练方案组合合同
- **THEN** production `ToolRegistry` MUST NOT 因本 requirement 注册 `generatePlanDraft`
- **AND** production `ToolRegistry` MUST NOT 因本 requirement 注册 `generateRoutineDraft`
- **AND** Agent core、route、renderer 和 tool handler MUST NOT 隐式调用旧式 draft 生成服务来替代模型输出 `visibleTrainingProposal`
