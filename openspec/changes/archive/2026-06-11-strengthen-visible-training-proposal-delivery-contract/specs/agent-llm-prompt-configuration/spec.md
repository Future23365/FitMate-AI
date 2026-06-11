## MODIFIED Requirements

### Requirement: Agent LLM prompt 必须表达训练输出结构能力而非固定意图映射
系统 SHALL 通过 LangChain tool description、schema description、tool result summary 或等价模型可见输入表达 `visibleTrainingProposal` 的结构能力、字段要求和事实边界。该能力 MUST 由 `submitVisibleTrainingProposal` 等结构化收口 tool 的 schema / description 或等价说明承载；默认 system prompt 只负责要求模型遵守当前可见工具和服务端 validator。模型可见合同 MUST NOT 通过固定关键词、正则、同义词表、短句模板或示例短语规定模型必须选择某个 `payload.kind`。

#### Scenario: 模型可见合同描述结构能力
- **WHEN** LangChain runtime 构造生产模型请求
- **THEN** 模型可见输入 MUST 说明 `visibleTrainingProposal` 可通过 `payload.kind = "exercise_selection" | "routine" | "plan"` 表达不同训练输出结构
- **AND** 该说明 MUST 位于结构化收口 tool description、schema description 或等价模型可见说明中
- **AND** 该说明 MUST 表达每种结构对应的必需字段、禁止字段和服务端校验边界
- **AND** 该说明 MUST 表达 `exercise_selection` 是动作候选 / 动作推荐卡片的结构化交付形态，只包含可展示动作项，不包含 `prescription` 或 `schedule`
- **AND** 该说明 MUST 表达模型应根据用户目标、上下文、已获得事实和 tool result 自主选择输出结构
- **AND** 该说明 MUST NOT 写入“用户说某个固定词语就必须输出某个 kind”的规则

#### Scenario: 模型可见合同表达事实来源边界
- **WHEN** 模型可见输入描述 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **THEN** 说明 MUST 表达动作 id 应来自模型可见、可被服务端数据库复核的受控动作事实，例如成功动作查询结果、已导入的可见训练事实或等价受控数据库事实
- **AND** 说明 MUST 表达服务端会在渲染和保存前复核数据库事实
- **AND** 说明 MUST NOT 要求模型传递 `factRef`、`messageId`、`toolResultId`、`resourceId` 或等价内部 provenance 字段来证明 current-run 可消费性
- **AND** 说明 MUST NOT 要求模型复写完整动作详情
- **AND** 默认 system prompt MUST NOT 承载这类业务字段的完整来源规则

#### Scenario: 结构化训练结果正文不可替代
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 简短表达正文 `content` 不能替代用户可见训练卡片、routine 或 plan 的结构化交付
- **AND** system message MUST 要求结构化训练结果通过当前 tool catalog 中的结构化收口工具和服务端 validator 交付
- **AND** system message MUST NOT 包含 `visibleTrainingProposal` 的完整 payload 结构、固定 `payload.kind` 选择规则或具体业务 tool 调用流程

#### Scenario: Prompt 不引入旧式 draft tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺或要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 承诺或要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 LangChain tool catalog 的训练生成能力

### Requirement: 模型可见合同必须表达 visibleTrainingProposal 的动作 section 事实来源
系统 SHALL 在生产模型可见的 tool description、schema description、tool result summary、失败反馈或等价合同说明中表达 `visibleTrainingProposal.exerciseItems[*]` 的动作事实边界。说明 MUST 表达 `exerciseId` 和 `section` 需要由模型可见、可被服务端数据库复核的受控动作事实支撑，`allowedSections` 表示该动作可进入哪些 section。该说明 MUST NOT 把具体业务 tool 的调用顺序写成通用 Agent system prompt 规则。

#### Scenario: structured finalization tool 表达 allowedSections 合同
- **WHEN** LangChain runtime 构造生产模型请求
- **THEN** 模型可见输入 MUST 包含 `visibleTrainingProposal.exerciseItems[*]` 与动作事实的合同说明
- **AND** 该说明 SHOULD 位于 `visibleTrainingProposal` output contract 的 `groundingRequirements`、`schemaSummary`、结构化收口 tool description、schema description 或等价字段中
- **AND** 模型可见输入 MUST 表达 `allowedSections` 是校验 `exerciseItems[*].section` 的确定性动作事实字段
- **AND** 模型可见输入 MUST 表达服务端根据数据库事实复核 `exerciseId`、发布态和 `allowedSections`，而不是要求模型提交内部 current-run provenance 字段
- **AND** 模型可见输入 MUST 使用中文描述业务含义
- **AND** 模型可见输入 MUST 保持 `visibleTrainingProposal`、`exerciseItems`、`exerciseId`、`section`、`allowedSections` 等技术标识英文原样

#### Scenario: 通用 prompt 不写具体 tool 恢复流程
- **WHEN** 默认 Agent LLM prompt 配置生成 system message
- **THEN** system message MUST NOT 包含要求模型在 section 事实不足或 validation failure 后必须调用 `searchExerciseResources` 的固定流程
- **AND** system message MUST NOT 根据业务 `toolName` 写恢复分支
- **AND** 具体 tool 能力、`groups.<section>` 语义和 output 说明 MUST 由对应 tool description、schema description、examples、tool result summary 或业务 output contract 表达
