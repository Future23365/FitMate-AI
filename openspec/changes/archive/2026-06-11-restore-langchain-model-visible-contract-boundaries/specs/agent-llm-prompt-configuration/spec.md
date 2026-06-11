## MODIFIED Requirements

### Requirement: 默认 prompt 必须只描述通用 LangChain Agent 合同
系统 SHALL 将默认 LangChain Agent system prompt 限定为通用决策合同、provider tool calling、structured final response、grounding、安全边界和不可执行能力边界。默认 system prompt MUST NOT 承载具体业务 output type 的完整 payload 规则、业务 examples、固定 tool 调用流程、动作库、训练生成、保存、用户记忆或业务语义分流规则。普通文本建议、解释性回答和筛选结果说明 MAY 基于成功事实直接通过结构化最终文本合同回答；结构化训练结果才需要通过当前可见 finalization / validator 边界提交。

#### Scenario: 默认 prompt 描述允许的 LangChain 输出方式
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 明确模型通过 DeepSeek native `tool_calls` 请求工具
- **AND** system message MUST 明确成功终态通过 `fitmate_final_response` 结构化工具提交
- **AND** system message MUST 禁止模型输出旧自定义 `AgentAction` JSON、直接执行 tool、伪造 confirmation/hash、泄漏 secret 或输出 NDJSON event

#### Scenario: 默认 prompt 不包含业务输出完整规则
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** 默认 system prompt MUST NOT 包含 `visibleTrainingProposal` 的完整 payload 结构说明、`routine` / `plan` section coverage 细则、`prescription` / `schedule` 细则、业务 examples 或具体业务 toolName 的恢复流程说明
- **AND** 默认 system prompt MAY 简短说明模型在提交用户可见、可后续引用、需要服务端 validator 的训练卡片、routine 或 plan 时必须通过当前 tool catalog 中的结构化收口工具和服务端 validator
- **AND** 默认 system prompt MUST 表达普通文本建议、动作说明、热身方法解释、查询结果说明或非持久结构化交付的回答可以基于成功事实直接通过 `fitmate_final_response.content` 回答
- **AND** 具体业务能力和业务输出结构的模型可见说明 MUST 来自 LangChain tool description、schema description、tool result summary、受控业务事实摘要或失败反馈
- **AND** 默认 system prompt MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板或具体业务 `toolName` 规定 action、toolName、outputType 或 payload kind

### Requirement: Agent LLM prompt 必须表达训练输出结构能力而非固定意图映射
系统 SHALL 通过 LangChain tool description、schema description、tool result summary 或等价模型可见输入表达 `visibleTrainingProposal` 的结构能力、字段要求和事实边界。该能力 MUST 由 `submitVisibleTrainingProposal` 等结构化收口 tool 的 schema / description 或等价说明承载；默认 system prompt 只负责要求模型遵守当前可见工具和服务端 validator。模型可见合同 MUST NOT 通过固定关键词、正则、同义词表、短句模板、示例短语或业务 tool result 字段组合规定模型必须选择某个 `payload.kind`、继续调用某个 tool 或强制生成结构化卡片。

#### Scenario: 模型可见合同描述结构能力
- **WHEN** LangChain runtime 构造生产模型请求
- **THEN** 模型可见输入 MAY 说明 `visibleTrainingProposal` 可通过 `payload.kind = "exercise_selection" | "routine" | "plan"` 表达不同训练输出结构
- **AND** 该说明 MUST 位于结构化收口 tool description、schema description 或等价模型可见说明中
- **AND** 该说明 MUST 表达每种结构对应的必需字段和服务端校验边界
- **AND** 该说明 MUST 表达模型应根据用户目标、上下文、已获得事实和 tool result 自主选择输出结构
- **AND** 该说明 MUST NOT 写入“用户说某个固定词语就必须输出某个 kind”的规则
- **AND** 该说明 MUST NOT 写入“某个查询 tool 返回某 section 缺失就必须继续查询”的规则

#### Scenario: 模型可见合同表达事实来源边界
- **WHEN** 模型可见输入描述 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **THEN** 说明 MUST 表达动作 id 应来自模型可见、可被服务端数据库复核的受控动作事实
- **AND** 说明 MUST 表达服务端会在渲染和保存前复核数据库事实
- **AND** 说明 MUST NOT 要求模型传递 `factRef`、`messageId`、`toolResultId`、`resourceId` 或等价内部 provenance 字段来证明 current-run 可消费性
- **AND** 说明 MUST NOT 要求模型复写完整动作详情
- **AND** 默认 system prompt MUST NOT 承载这类业务字段的完整来源规则

#### Scenario: 普通文本建议不强制结构化训练卡片
- **WHEN** 用户请求普通训练建议、动作说明、热身方法、拉伸建议、筛选结果解释或不需要后续引用的文本建议
- **AND** 模型已有足够的用户输入、上下文或成功 tool result summary 支撑回答
- **THEN** 默认 prompt MUST 允许模型通过 `fitmate_final_response.content` 直接回答
- **AND** 默认 prompt MUST NOT 要求模型为了普通文本建议必须调用 `submitVisibleTrainingProposal`
- **AND** 默认 prompt MUST NOT 将“一组动作名称出现在回答中”等同于必须生成 `visibleTrainingProposal`

#### Scenario: Prompt 不引入旧式 draft tool 或固定补查流程
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺或要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 承诺或要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 LangChain tool catalog 的训练生成能力
- **AND** system message MUST NOT 包含要求模型在 section 事实不足或 validation failure 后必须调用 `searchExerciseResources` 的固定流程
- **AND** system message MUST NOT 根据业务 `toolName` 写恢复分支

### Requirement: prompt change 不得引入服务端语义分流
系统 SHALL 保持 `/api/chat`、Agent runtime、validator、tool handler 和 renderer 的语义中立。模型自然语言理解、引用资源操作、tool calling 和最终输出策略 SHALL 继续由模型基于可见输入推理完成。

#### Scenario: route 和 runtime 不识别固定用户短语
- **WHEN** 实现本 change
- **THEN** `/api/chat`、LangChain runtime、validator、policy / confirmation、tool handler 和 response adapter MUST NOT 新增基于用户原文短语的条件分支
- **AND** 系统 MUST NOT 根据用户原文把请求改写成固定 `toolName`、固定 action、固定 `payload.kind` 或固定 final answer
- **AND** 系统 MUST NOT 根据具体 tool result 字段组合替模型决定继续查询、结构化收口、普通回答或澄清

#### Scenario: 具体业务名只作为局部说明或测试样例
- **WHEN** 本 change 涉及 `visibleTrainingProposal`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 或 `submitVisibleTrainingProposal`
- **THEN** 这些业务名 MUST 只出现在对应 tool description、schema description、tool result summary、业务事实合同、spec 或回归测试中
- **AND** 通用 prompt MUST NOT 把这些业务名写成语义触发条件或固定 tool 调用流程
