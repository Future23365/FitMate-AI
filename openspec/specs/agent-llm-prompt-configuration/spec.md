# agent-llm-prompt-configuration Specification

## Purpose
TBD - created by archiving change externalize-agent-llm-prompts. Update Purpose after archive.
## Requirements
### Requirement: Agent LLM prompt 必须集中配置
系统 SHALL 为 `LlmPlanner` 使用的模型可见 prompt 提供独立配置模块。模型 adapter MUST NOT 在供应商请求构造函数中硬编码默认 system prompt 文案。

#### Scenario: 默认 prompt 来自配置模块
- **WHEN** 生产 `DeepSeekModelAdapter` 构造模型请求体
- **THEN** system message MUST 来自 Agent LLM prompt 配置模块
- **AND** adapter MUST NOT 在 `createRequestBody()` 或等价函数中内联默认 prompt 句子
- **AND** prompt 配置 MUST 暴露稳定 `promptVersion` 或等价版本标识

#### Scenario: 测试注入自定义 prompt 配置
- **WHEN** 测试或后续 adapter 构造显式传入自定义 prompt 配置
- **THEN** 模型请求体 MUST 使用该配置生成 system message
- **AND** 默认配置 MUST 不被测试用自定义配置全局污染

### Requirement: Prompt 配置必须保持模型供应商边界
系统 SHALL 将 prompt 内容配置与模型供应商协议解耦。`agent-core` MUST NOT 依赖 prompt 配置、DeepSeek message 格式、DeepSeek endpoint、API key 或供应商响应结构。

#### Scenario: agent-core 保持模型无关
- **WHEN** Agent runtime 调用 `PlannerPort`
- **THEN** `agent-core` MUST 只传递 `PlannerInput`
- **AND** `agent-core` MUST NOT 导入 Agent LLM prompt 配置模块
- **AND** `agent-core` MUST NOT 构造 DeepSeek/OpenAI/Anthropic 等供应商请求 messages

#### Scenario: Adapter 只负责供应商请求映射
- **WHEN** `DeepSeekModelAdapter` 收到 `PlannerInput`
- **THEN** adapter MAY 将 prompt 配置和 user payload 映射为 DeepSeek messages
- **AND** adapter MUST NOT 注册 tool、执行 tool、投影用户事件或修改 runtime 校验结果

### Requirement: 默认 prompt 必须只描述通用 AgentAction 合同
系统 SHALL 将默认 Agent LLM prompt 限定为通用决策合同、输出格式和安全边界。默认 prompt MUST NOT 混入具体业务 tool、动作库、训练生成、保存、用户记忆或业务语义分流规则。

#### Scenario: 默认 prompt 描述允许的 AgentAction
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 要求模型只返回一个 JSON object
- **AND** system message MUST 要求输出匹配 `AgentAction`
- **AND** system message MUST 明确允许的 `type` 为 `tool_call`、`final_answer`、`ask_user`
- **AND** system message MUST 禁止模型直接执行 tool、伪造 confirmation/hash、泄漏 secret 或输出 NDJSON event

#### Scenario: 默认 prompt 不包含业务能力说明
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** 默认 prompt MUST NOT 包含 `searchExercises`、训练生成、计划保存、artifact revision、用户记忆、推荐卡片或具体业务 toolName 的流程说明
- **AND** 具体业务能力的模型可见说明 MUST 来自后续独立业务 tool 的 manifest、resource contract、projection 或 observation

### Requirement: Prompt 配置不得改变 /api/chat 业务行为
系统 SHALL 在抽离 prompt 配置时保持当前 `/api/chat` 文本聊天能力边界。该 change MUST NOT 修改 `/api/chat` 外部请求 schema、前端事件合同、业务 tool 注册或用户可见训练业务能力。

#### Scenario: /api/chat 仍使用当前文本聊天链路
- **WHEN** prompt 配置抽离完成
- **THEN** `/api/chat` MUST 仍通过 `PreparedChatRequest -> AgentRunInput -> ToolRegistry -> LlmPlanner -> runAgentRuntime -> Response Renderer` 或等价链路执行
- **AND** 本 change MUST NOT 新增动作推荐、训练生成、保存 artifact、用户记忆或数据库业务查询能力
- **AND** 本 change MUST NOT 在 `/api/chat` 中新增关键词、正则、同义词或短句模板分流

#### Scenario: 架构扫描验证未混入业务
- **WHEN** 本 change 完成实现
- **THEN** 自动化扫描 MUST 证明 prompt 配置模块未导入业务 tool 注册入口、动作库服务、训练生成服务、Prisma 数据访问或旧 `agent-orchestrator`
- **AND** 扫描 MUST 证明生产注册入口没有因 prompt 配置抽离新增 fixture tool 或真实业务 tool

### Requirement: Prompt 文档必须指向当前真实入口
系统 SHALL 更新 prompt 相关文档，使开发者能从文档定位当前生产 prompt 配置入口，并区分旧 prompt module 与新 Agent LLM prompt 配置。

#### Scenario: 文档不再把旧 prompt-config 当作当前入口
- **WHEN** 开发者阅读 prompt 说明文档
- **THEN** 文档 MUST 指向新的 Agent LLM prompt 配置模块作为当前生产 `/api/chat` 的 prompt 来源
- **AND** 文档 MUST 说明旧 `lib/server/ai/prompt-config.ts` 不再是当前生产入口
- **AND** 文档 MUST 说明业务能力说明应来自 tool manifest/resource/projection，而不是混入通用默认 prompt

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

### Requirement: 模型可见合同必须表达 visibleTrainingProposal 的动作 section 事实来源
系统 SHALL 在生产 Planner 可见的 prompt、model input 或等价合同说明中表达 `visibleTrainingProposal.exerciseItems[*]` 的动作事实边界。说明 MUST 表达 `exerciseId` 和 `section` 需要由当前 run 可见动作事实支撑，`allowedSections` 表示该动作可进入哪些 section。该说明 MUST NOT 把具体业务 tool 的调用顺序写成通用 Agent prompt 规则。

#### Scenario: prompt 表达 allowedSections 合同
- **WHEN** `LlmPlanner` 构造生产模型请求
- **THEN** 模型可见输入 MUST 包含 `visibleTrainingProposal.exerciseItems[*]` 与动作事实的合同说明
- **AND** 模型可见输入 MUST 表达 `allowedSections` 是校验 `exerciseItems[*].section` 的确定性动作事实字段
- **AND** 模型可见输入 MUST 使用中文描述业务含义
- **AND** 模型可见输入 MUST 保持 `visibleTrainingProposal`、`exerciseItems`、`exerciseId`、`section`、`allowedSections` 等技术标识英文原样

#### Scenario: 通用 prompt 不写具体 tool 恢复流程
- **WHEN** 默认 Agent LLM prompt 配置生成 system message
- **THEN** system message MUST NOT 包含要求 Planner 在 section 事实不足或 validation failure 后必须调用 `searchExerciseResources` 的固定流程
- **AND** system message MUST NOT 根据业务 `toolName` 写恢复分支
- **AND** 具体 tool 能力、`groups.<section>` 语义和 output 说明 MUST 由对应 tool manifest、schema description、examples 或 observation projection 表达

