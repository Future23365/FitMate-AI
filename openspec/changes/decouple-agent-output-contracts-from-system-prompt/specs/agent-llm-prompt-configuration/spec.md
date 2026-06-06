## MODIFIED Requirements

### Requirement: 默认 prompt 必须只描述通用 AgentAction 合同
系统 SHALL 将默认 Agent LLM system prompt 限定为通用决策合同、输出格式、grounding、安全边界和不可执行能力边界。默认 system prompt MUST NOT 承载具体业务 output type 的完整 payload 规则、业务 examples、固定 tool 调用流程、动作库、训练生成、保存、用户记忆或业务语义分流规则。

#### Scenario: 默认 prompt 描述允许的 AgentAction
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 要求模型只返回一个 JSON object
- **AND** system message MUST 要求输出匹配 `AgentAction`
- **AND** system message MUST 明确允许的 `type` 为 `tool_call`、`final_answer`、`ask_user`
- **AND** system message MUST 禁止模型直接执行 tool、伪造 confirmation/hash、泄漏 secret 或输出 NDJSON event

#### Scenario: 默认 prompt 不包含业务输出完整规则
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** 默认 system prompt MUST NOT 包含 `visibleTrainingProposal` 的完整 payload 结构说明、`routine` / `plan` section coverage 细则、`prescription` / `schedule` 细则、业务 examples 或具体业务 toolName 的恢复流程说明
- **AND** 默认 system prompt MAY 简短说明模型在输出 `visibleOutputs[]` 时必须遵守当前模型可见 `outputContracts[]`
- **AND** 具体业务能力和业务输出结构的模型可见说明 MUST 来自 `outputContracts`、业务 tool manifest、resource contract、projection、observation 或 repair feedback
- **AND** 默认 system prompt MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板或具体业务 `toolName` 规定 action、toolName、outputType 或 payload kind

### Requirement: Agent LLM prompt 必须表达训练输出结构能力而非固定意图映射
系统 SHALL 通过 Planner 模型可见输入表达 `visibleTrainingProposal` 的结构能力、字段要求和事实边界。该能力 MUST 由 `outputContracts` 或等价 schema summary 承载；默认 system prompt 只负责要求模型遵守当前可见 output contract。模型可见合同 MUST NOT 通过固定关键词、正则、同义词表、短句模板或示例短语规定模型必须选择某个 `payload.kind`。

#### Scenario: 模型可见合同描述结构能力
- **WHEN** `LlmPlanner` 构造生产模型请求
- **THEN** 模型可见输入 MUST 说明 `visibleTrainingProposal` 可通过 `payload.kind = "exercise_selection" | "routine" | "plan"` 表达不同训练输出结构
- **AND** 该说明 MUST 位于 `outputContracts` 或等价 schema summary 中
- **AND** 该说明 MUST 表达每种结构对应的必需字段和服务端校验边界
- **AND** 该说明 MUST 表达模型应根据用户目标、上下文、已获得事实和 tool result 自主选择输出结构
- **AND** 该说明 MUST NOT 写入“用户说某个固定词语就必须输出某个 kind”的规则

#### Scenario: 模型可见合同表达事实来源边界
- **WHEN** 模型可见输入描述 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **THEN** 说明 MUST 表达动作 id 应来自当前 run 可见且可消费的动作事实来源，或当前用户可访问的 `visible_training_proposal_fact`
- **AND** 说明 MUST 表达服务端会在渲染和保存前复核数据库事实
- **AND** 说明 MUST NOT 要求模型复写完整动作详情
- **AND** 默认 system prompt MUST NOT 承载这类业务字段的完整来源规则

#### Scenario: Prompt 不引入旧式 draft tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺或要求调用 `generatePlanDraft`
- **AND** system message MUST NOT 承诺或要求调用 `generateRoutineDraft`
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 `ToolRegistry` 的训练生成能力

### Requirement: 模型可见合同必须表达 visibleTrainingProposal 的动作 section 事实来源
系统 SHALL 在生产 Planner 可见的 `outputContracts`、tool manifest、observation、repair feedback 或等价合同说明中表达 `visibleTrainingProposal.exerciseItems[*]` 的动作事实边界。说明 MUST 表达 `exerciseId` 和 `section` 需要由当前 run 可见动作事实支撑，`allowedSections` 表示该动作可进入哪些 section。该说明 MUST NOT 把具体业务 tool 的调用顺序写成通用 Agent system prompt 规则。

#### Scenario: outputContracts 表达 allowedSections 合同
- **WHEN** `LlmPlanner` 构造生产模型请求
- **THEN** 模型可见输入 MUST 包含 `visibleTrainingProposal.exerciseItems[*]` 与动作事实的合同说明
- **AND** 该说明 SHOULD 位于 `visibleTrainingProposal` output contract 的 `groundingRequirements`、`schemaSummary` 或等价字段中
- **AND** 模型可见输入 MUST 表达 `allowedSections` 是校验 `exerciseItems[*].section` 的确定性动作事实字段
- **AND** 模型可见输入 MUST 使用中文描述业务含义
- **AND** 模型可见输入 MUST 保持 `visibleTrainingProposal`、`exerciseItems`、`exerciseId`、`section`、`allowedSections` 等技术标识英文原样

#### Scenario: 通用 prompt 不写具体 tool 恢复流程
- **WHEN** 默认 Agent LLM prompt 配置生成 system message
- **THEN** system message MUST NOT 包含要求 Planner 在 section 事实不足或 validation failure 后必须调用 `searchExerciseResources` 的固定流程
- **AND** system message MUST NOT 根据业务 `toolName` 写恢复分支
- **AND** 具体 tool 能力、`groups.<section>` 语义和 output 说明 MUST 由对应 tool manifest、schema description、examples、observation projection 或 output contract 表达

### Requirement: 默认 prompt 必须表达 final_answer 的终态完成语义
系统 SHALL 在默认 Agent LLM system prompt 中表达 `final_answer` 是当前 run 的终态动作。Prompt MUST 说明 `final_answer.content` 只能解释本轮已经完成、明确阻断或由 runtime fallback 收口的结果；如果还需要执行 tool、查询事实、生成结构、保存结果或等待内部步骤，模型 MUST 返回合法 `tool_call`、`ask_user` 或让失败边界收口。

#### Scenario: Prompt 说明 final_answer 不会触发后续 tool
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明 `final_answer` 是终态，不会让 runtime 在本轮回复后继续自动调用 tool
- **AND** system message MUST 使用中文描述业务含义
- **AND** `final_answer`、`tool_call`、`ask_user`、`visibleOutputs`、`usedRefs` 等技术标识 MUST 保持英文原样

#### Scenario: Prompt 禁止未执行步骤的成功承诺
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明模型不得用 `final_answer.content` 承诺尚未执行的查询、生成、保存、等待或后续内部动作
- **AND** system message MUST 说明需要继续获取事实时必须返回当前可见且合法的 `tool_call`
- **AND** system message MUST NOT 要求固定 tool 调用次数、固定 tool 调用顺序或固定业务 `toolName`

#### Scenario: Prompt 表达 tool 后 final_answer 的 grounding
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明当前 run 已经有 tool result 时，成功 `final_answer` 应通过 `usedRefs` 或合法 `visibleOutputs[]` 连接到当前 run 已满足事实
- **AND** system message MUST 说明 failed、diagnostic、不可消费 resource 或 `satisfied=false` 的 tool result 不能支撑成功 `final_answer`
- **AND** system message MUST 说明如果模型需要解释这类失败事实，应优先返回 `ask_user`、继续合法 `tool_call`，或交由 production terminal failure fallback / finalizer 收口

#### Scenario: Prompt 保持普通文本聊天能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明普通聊天、概念解释、能力说明、总结整理、训练原则说明等不需要工具执行的问题仍可直接使用 `final_answer`
- **AND** system message MUST NOT 暗示所有 `final_answer` 都必须引用 tool result

#### Scenario: Prompt 不新增服务端隐藏业务能力
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 承诺服务端会自动补齐训练动作、自动生成训练编排、自动保存 artifact 或执行未注册 tool
- **AND** system message MUST NOT 要求调用 `generatePlanDraft` 或 `generateRoutineDraft`

## ADDED Requirements

### Requirement: Planner 模型输入必须暴露 outputContracts
系统 SHALL 在生产 Planner user payload 中暴露 `outputContracts`，并使其与 `tools`、`observations` 和 `toolResults` 并列成为模型可见事实。`outputContracts` MUST 只描述可输出的用户可见结构化结果能力，不得成为服务端 action 路由或业务语义判断入口。

#### Scenario: user payload 包含 outputContracts
- **WHEN** `DeepSeekModelAdapter` 或等价 Planner model input builder 构造模型请求
- **THEN** user payload MUST 包含 `outputContracts`
- **AND** `outputContracts` MUST 至少覆盖当前 production 可输出的 `visibleTrainingProposal`
- **AND** `outputContracts` MUST 使用中文描述性说明并保留英文技术标识
- **AND** tests MUST 能断言该 payload 中的 `outputContracts` 与 `tools`、`observations`、`toolResults` 同级或等价可见

### Requirement: Planner 模型输入必须暴露 actionContract 字段字典
系统 SHALL 在生产 Planner user payload 中暴露 `actionContract`，用于集中描述 `AgentAction` 最小形状、字段含义、决策顺序、grounding、引用操作、repair 边界和少量 few-shot。默认 system prompt MUST NOT 把这些字段说明重复展开成后端接口文档。

#### Scenario: user payload 包含 actionContract
- **WHEN** `DeepSeekModelAdapter` 或等价 Planner model input builder 构造模型请求
- **THEN** user payload MUST 包含 `actionContract`
- **AND** `actionContract.schemaId` MUST 为 `AgentAction`
- **AND** `actionContract` MUST 包含 `tool_call`、`final_answer`、`ask_user` 的最小合法形状
- **AND** `actionContract.fieldDictionary` MUST 集中解释 `content`、`suggestedQuestions`、`usedRefs`、`visibleOutputs`、`toolResults[].fulfillment.satisfied`、`producedResources` 和 `resource summary`
- **AND** `actionContract.examples` MUST 覆盖普通文本回答、缺少训练约束澄清、需要注册事实的 tool call、事实不足的结构化输出恢复和已满足事实后的 visible output 收口
- **AND** trace SHOULD 记录 `actionContract` 的 schema id 和 version 摘要

#### Scenario: ask_user 只有唯一正确形状
- **WHEN** Planner 需要向用户澄清必要信息
- **THEN** 模型可见 `actionContract` MUST 给出 `ask_user` 的唯一形状：`type`、`content`、可选 `suggestedQuestions` 和可选 `usedRefs`
- **AND** 默认 system prompt SHOULD NOT 反复列举旧字段黑名单
- **AND** schema validator / repair feedback MUST 继续拒绝当前 schema 未声明的同义字段

#### Scenario: system prompt 只引用 outputContracts
- **WHEN** 默认 system prompt 需要说明结构化用户可见输出
- **THEN** system prompt MUST 只要求模型遵守当前可见 `outputContracts[]`
- **AND** system prompt MUST NOT 内联 `visibleTrainingProposal` 的完整 schema summary、完整 examples、section 组合细则或 payload kind 选择指南

### Requirement: 默认 prompt 必须集中不可执行请求决策顺序
系统 SHALL 在默认 Agent LLM system prompt 中提供短的通用不可执行请求决策顺序。该顺序 MUST 只基于 action、tool capability、事实充分性和 grounding 抽象，不得包含具体用户短语、业务 toolName、业务 outputType 或服务端自然语言分流规则。

#### Scenario: 不需要工具时直接回答
- **WHEN** 用户请求是普通解释、总结、能力说明、训练原则说明或其他不需要工具且模型能可靠回答的问题
- **THEN** system prompt MUST 允许模型返回 `final_answer`
- **AND** system prompt MUST NOT 要求先调用工具或输出 unsupported capability fallback

#### Scenario: 缺少必要信息时澄清
- **WHEN** 当前可见信息不足以可靠回答或生成可校验结构化输出
- **THEN** system prompt MUST 引导模型返回 `ask_user`
- **AND** `ask_user.content` MAY 说明缺少什么信息和可选补充方向

#### Scenario: 需要未注册能力时不得执行
- **WHEN** 用户请求需要当前 `tools[]` 未注册的能力、写入、保存、查询或外部执行
- **THEN** system prompt MUST 要求模型不得输出该未注册能力的 `tool_call`
- **AND** system prompt MUST 要求模型不得承诺已执行、已保存、已查询、已生成卡片或已等待内部流程
- **AND** 在没有已有 failed tool result 的情况下，模型 MAY 用 `final_answer` 说明当前能力边界和可行替代方向

#### Scenario: 已有事实不足时恢复或失败收口
- **WHEN** 当前 run 已有 tool result、observation 或 resource，但事实不足以支撑用户目标
- **THEN** system prompt MUST 引导模型优先继续当前可见且合法的 `tool_call`
- **AND** 如果不能继续获取事实或缺少用户必要信息，模型 MUST 返回 `ask_user`
- **AND** 如果 runtime 已经进入不可恢复 terminal failure，用户可见回复 MUST 由 production fallback / finalizer 收口
- **AND** system prompt MUST NOT 用成功 `final_answer` 承诺未完成结果

## REMOVED Requirements

### Requirement: Agent LLM prompt 必须表达 visibleTrainingProposal 刷新语义
**Reason**: 该 requirement 把 `visibleTrainingProposal` 业务刷新规则绑定到默认 system prompt，和本 change 的 prompt 分层目标冲突。刷新语义仍然需要保留，但应迁移到 `visibleTrainingProposal` output contract、相关 reference tool manifest、observation projection 或 repair feedback 中。

**Migration**: 使用 `agent-visible-output-contracts` 和局部 tool / observation 合同表达刷新目标、保留约束、差异化要求和候选不足处理；默认 system prompt 只表达通用引用对象推理和不可新增服务端语义分流。

### Requirement: Agent LLM prompt 必须区分刷新动作与调整处方
**Reason**: 该 requirement 属于 `visibleTrainingProposal` 业务操作语义，继续写在默认 system prompt 会让通用 prompt 承担业务实例规则。

**Migration**: 在 `visibleTrainingProposal` output contract、reference resource contract 或相关 tool manifest 中表达替换动作、调整处方和保留动作的事实边界；通用 system prompt 仅保留 `reuse`、`derive`、`modify`、`replace`、`clarify` 等稳定引用操作抽象。

### Requirement: Agent LLM prompt 必须表达多天计划组合路径
**Reason**: `plan` 的组合顺序、section coverage、`prescription` 和 `schedule` 规则属于业务输出 schema summary，不应继续作为默认 system prompt 的业务细则。

**Migration**: 将 `plan` 结构选择、组合路径、`warmup` / `training` / `stretch`、`prescription` 和 `schedule.assignments` 规则迁移到 `visibleTrainingProposal` output contract；默认 system prompt 只要求遵守当前 `outputContracts[]`。

### Requirement: 默认 prompt 必须表达结构输出受可见事实覆盖约束
**Reason**: 该 requirement 的核心原则仍然成立，但具体 `visibleTrainingProposal` 结构强度和 section 覆盖规则应由 output contract 与 validator 共同表达，而不是塞入默认 system prompt。

**Migration**: 通用 system prompt 保留“结构化输出必须由当前 run 可见事实支撑”的抽象规则；`visibleTrainingProposal` 的 section、动作、处方和 schedule 覆盖规则迁移到 `outputContracts`。

### Requirement: 默认 prompt 必须表达明确 routine 请求的正向组合路径
**Reason**: 该 requirement 将 `routine` 业务组合路径固定在默认 system prompt 中，和业务输出合同解耦目标冲突。

**Migration**: 将 `routine` 的三段式结构、处方要求和缺失 section 恢复方向迁移到 `visibleTrainingProposal` output contract、tool manifest 或 repair feedback；默认 system prompt 不写固定业务 tool 调用流程。

### Requirement: 默认 prompt 必须表达新训练输出的信息充分性门槛
**Reason**: `exercise_selection`、`routine`、`plan` 的最低信息门槛属于具体业务 outputType 的输出条件，应由 output contract 和局部 examples 表达。

**Migration**: 在 `visibleTrainingProposal` output contract 中表达各 `payload.kind` 的最低信息门槛和事实不足时的 `ask_user` / 安全收口方向；默认 system prompt 保留通用“缺必要信息则 ask_user”规则。

### Requirement: 默认 prompt 必须把 routine 和 plan section readiness 表达为 final 前置条件
**Reason**: routine / plan section readiness 是 `visibleTrainingProposal` 的业务结构输出前置条件，继续放在默认 system prompt 会导致通用 prompt 业务化。

**Migration**: 将 section readiness 作为 `visibleTrainingProposal` output contract 的 grounding / validator boundary 表达，并通过 terminal output validator 和 repair feedback 执行；默认 system prompt 只要求结构化输出遵守 `outputContracts[]` 和 grounding。

### Requirement: 默认 prompt 必须提供训练输出类型选择指南
**Reason**: `payload.kind` 选择指南是业务 output contract 的使用说明，不属于通用 AgentAction system prompt。

**Migration**: 将 `exercise_selection`、`routine`、`plan` 的使用边界、优先级、候选不足恢复方向和 examples 迁移到 `visibleTrainingProposal` output contract；默认 system prompt 不内联业务 examples 或固定业务语义范式。
