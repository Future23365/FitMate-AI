# agent-runtime-configuration Specification

## Purpose
TBD - created by archiving change centralize-agent-runtime-config. Update Purpose after archive.
## Requirements
### Requirement: Agent runtime 配置必须集中在服务端 TS config
系统 SHALL 在 `lib/server/config/` 中提供集中 Agent runtime 配置，统一管理生产 `/api/chat` 使用的 LLM 请求参数、Agent runtime limits、业务 tool 可见事实数量和 trace 文本裁剪参数。该配置 MUST 是版本化 TypeScript 代码配置，不要求通过环境变量覆盖。

#### Scenario: 生产 Agent 从集中配置读取预算
- **WHEN** `/api/chat` 构造生产 `AgentRunInput`
- **THEN** `maxSteps`、`maxPlannerCalls`、`maxToolCalls`、`maxInvalidActions`、`maxRepairAttempts`、`overallTimeoutMs` 和 `perToolTimeoutMs` MUST 来自 `lib/server/config/` 下的集中配置
- **AND** 生产聊天接入层 MUST NOT 内联这些 runtime budget 数字

#### Scenario: 模型请求从集中配置读取默认值
- **WHEN** `DeepSeekModelAdapter` 构造生产模型请求
- **THEN** `temperature`、`max_tokens` 和模型请求 timeout MUST 来自集中配置或显式测试注入配置
- **AND** adapter MUST NOT 自己拥有与生产默认值重复的硬编码 `maxTokens` 或 timeout 来源

#### Scenario: 不要求环境变量覆盖行为预算
- **WHEN** 系统加载 Agent runtime 配置
- **THEN** 系统 MUST NOT 依赖 `AGENT_LLM_MAX_TOKENS`、`AGENT_RUNTIME_MAX_STEPS`、`AGENT_RUNTIME_MAX_REPAIR_ATTEMPTS` 或等价环境变量才能获得生产默认值
- **AND** `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` MAY 继续作为 provider 部署配置从环境变量读取

### Requirement: Agent 配置项必须有中文意图注释
系统 SHALL 为集中 Agent 配置中的每个公开配置项提供简短中文注释。注释 MUST 说明参数负责的链路、主要影响和调大/调小的风险；技术标识保持英文。

#### Scenario: 配置文件可直接解释参数用途
- **WHEN** 开发者打开 `lib/server/config/` 下的 Agent 配置文件
- **THEN** 每个导出的配置对象和核心配置项 MUST 有中文注释
- **AND** 注释 MUST 能说明 `maxTokens`、`maxRepairAttempts`、`maxReturnedPerSection`、`recentFactListLimit` 等参数对模型输出、repair、tool 可见事实或 trace 的影响
- **AND** 注释 MUST NOT 只重复变量名本身

#### Scenario: prompt 配置迁移后仍有注释
- **WHEN** Agent LLM prompt 配置迁移到 `lib/server/config/`
- **THEN** `promptVersion`、prompt 指令集合、请求默认值和 system prompt 构造函数 MUST 保留或补充中文意图注释

### Requirement: Tool 可见事实数量必须通过集中配置表达默认值
系统 SHALL 将生产 Agent tool 暴露给模型的可见事实数量默认值集中配置。业务 tool 或 repository MAY 保留 hard cap，但默认值 MUST 来自 `lib/server/config/`。

#### Scenario: searchExerciseResources 使用集中返回数量
- **WHEN** `searchExerciseResources` 查询发布态动作事实
- **THEN** 每个 section 的默认返回数量 MUST 来自集中配置
- **AND** tool 输出中的 `maxReturned` MUST 反映该配置值或其被 hard cap 限制后的有效值
- **AND** repository MUST 保留确定性 hard cap，防止配置误调导致模型可见 payload 过大

#### Scenario: resolveExerciseResourceMentions 使用集中匹配数量
- **WHEN** `resolveExerciseResourceMentions` 解析动作 mention
- **THEN** 默认 `maxMatches` MUST 来自集中配置
- **AND** handler 或 repository MUST 继续限制最大匹配数量，防止返回无界候选

#### Scenario: inspectVisibleTrainingProposals 使用集中最近事实数量
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 查询当前会话最近可见训练方案事实
- **THEN** 默认最近事实数量 MUST 来自集中配置
- **AND** fact store MUST 继续保留 hard cap，防止读取过多历史事实进入模型上下文

### Requirement: 集中配置不得扩大 Agent 业务能力
系统 SHALL 只通过集中配置管理已有行为预算和默认值。该 change MUST NOT 因配置集中化新增业务 tool、修改用户可见 API 契约、引入服务端自然语言分流或改变模型语义判断来源。

#### Scenario: production registry 不因配置集中化新增 tool
- **WHEN** `/api/chat` 构造 production `ToolRegistry`
- **THEN** registry 中的 tool 集合 MUST 与本 change 前已声明的生产 tool 能力一致
- **AND** 系统 MUST NOT 因新增配置模块注册 fixture tool、训练生成 tool、保存 tool 或隐藏业务服务

#### Scenario: route 和 runtime 不读取用户原文选择配置
- **WHEN** 用户发送聊天消息
- **THEN** `/api/chat`、Agent runtime、validator 和 tool handler MUST NOT 基于用户原文关键词、正则、同义词表或短句模板动态选择不同 runtime budget、tool 返回数量或模型 action
- **AND** 模型自然语言理解仍 MUST 基于模型可见 prompt、messages、metadata、observations 和 toolResults 完成

### Requirement: 配置迁移必须保留可测试的安全边界
系统 SHALL 在集中配置后继续保留 runtime、tool 和 trace 的安全边界，并通过自动化测试证明生产入口使用集中配置。

#### Scenario: runtime budget 测试覆盖生产入口
- **WHEN** 测试构造生产文本聊天 run input
- **THEN** 测试 MUST 断言 run limits 来自集中配置
- **AND** 测试 MUST 防止 `agent-text-chat-service` 重新内联生产 budget 数字

#### Scenario: model adapter 测试覆盖 max_tokens
- **WHEN** 测试构造 DeepSeek 请求体
- **THEN** 测试 MUST 断言 `max_tokens` 来自集中 LLM request config
- **AND** 自定义测试配置 MUST 仍可覆盖默认值且不污染全局默认配置

#### Scenario: architecture boundary 扫描配置目录
- **WHEN** 本 change 完成实现
- **THEN** architecture boundary 测试 MUST 证明 `lib/server/config/` 不导入 `/api/chat` route、业务数据库服务、tool handler、Response Renderer 或旧 agent orchestrator
- **AND** prompt 配置迁移后 MUST 不让 `agent-core` 依赖供应商 adapter、DeepSeek API 或具体业务 toolName 分支

