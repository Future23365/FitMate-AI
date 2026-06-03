## ADDED Requirements

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
