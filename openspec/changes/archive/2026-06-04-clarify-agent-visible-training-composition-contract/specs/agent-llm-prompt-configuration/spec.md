## ADDED Requirements

### Requirement: Agent LLM prompt 必须表达训练输出结构能力而非固定意图映射
系统 SHALL 在默认 Agent LLM prompt 中说明 `visibleTrainingProposal` 的结构能力、字段要求和事实边界。Prompt MUST NOT 通过固定关键词、正则、同义词表、短句模板或示例短语规定模型必须选择某个 `payload.kind`。

#### Scenario: Prompt 描述结构能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `visibleTrainingProposal` 可通过 `payload.kind = "exercise_selection" | "routine" | "plan"` 表达不同训练输出结构
- **AND** system message MUST 说明每种结构对应的必需字段和服务端校验边界
- **AND** system message MUST 说明模型应根据用户目标、上下文、已获得事实和 tool result 自主选择输出结构
- **AND** system message MUST NOT 写入“用户说某个固定词语就必须输出某个 kind”的规则

#### Scenario: Prompt 表达事实来源边界
- **WHEN** system message 描述 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **THEN** system message MUST 说明动作 id 应来自当前 run 可见且 `satisfied=true` 的动作事实来源，或当前用户可访问的 `visible_training_proposal_fact`
- **AND** system message MUST 说明服务端会在渲染和保存前复核数据库事实
- **AND** system message MUST NOT 要求模型复写完整动作详情

#### Scenario: Prompt 不引入旧式 draft tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺或要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 承诺或要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 `ToolRegistry` 的训练生成能力
