## MODIFIED Requirements

### Requirement: Agent runtime 配置必须集中在服务端 TS config
系统 SHALL 在 `lib/server/config/` 中提供集中 Agent runtime 配置，统一管理生产 `/api/chat` 使用的 LangChain agent 运行预算、DeepSeek native Tool Calling 请求参数、业务 tool 可见事实数量、tool wrapper timeout 和 trace 文本裁剪参数。该配置 MUST 是版本化 TypeScript 代码配置，不要求通过环境变量覆盖。

#### Scenario: 生产 LangChain Agent 从集中配置读取预算
- **WHEN** `/api/chat` 构造生产 LangChain Agent Runtime 输入
- **THEN** 最大 agent 迭代次数、最大 tool calls、最大模型调用次数、整体 timeout、单 tool timeout 和结构化输出校验预算 MUST 来自 `lib/server/config/` 下的集中配置
- **AND** 生产聊天接入层 MUST NOT 内联这些 runtime budget 数字

#### Scenario: DeepSeek Tool Calling 请求从集中配置读取默认值
- **WHEN** LangChain model factory 构造 DeepSeek 请求
- **THEN** model、temperature、max tokens、timeout、tool calling 开启策略和 thinking / reasoning 策略 MUST 来自集中配置或显式测试注入配置
- **AND** route、tool wrapper 或业务 service MUST NOT 自己拥有与生产默认值重复的硬编码 provider 参数

#### Scenario: 不要求环境变量覆盖行为预算
- **WHEN** 系统加载 Agent runtime 配置
- **THEN** 系统 MUST NOT 依赖 `AGENT_LLM_MAX_TOKENS`、`AGENT_RUNTIME_MAX_STEPS`、`AGENT_RUNTIME_MAX_REPAIR_ATTEMPTS` 或等价环境变量才能获得生产默认值
- **AND** `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` MAY 继续作为 provider 部署配置从环境变量读取

## ADDED Requirements

### Requirement: LangChain Tool Catalog 配置必须集中管理
系统 SHALL 在集中配置或等价生产注册入口中声明生产 LangChain tool catalog 的允许列表、默认启用状态和模型可见预算。

#### Scenario: production tool catalog 从集中入口构造
- **WHEN** `/api/chat` 准备生产 LangChain tools
- **THEN** 系统 MUST 从集中 tool catalog 入口读取允许的 tool 列表
- **AND** route MUST NOT 在局部硬编码工具集合
- **AND** tool catalog MUST NOT 根据用户原文关键词动态变更工具集合

#### Scenario: tool 可见 payload 预算来自集中配置
- **WHEN** tool wrapper 构造模型可见 result summary
- **THEN** 返回数量、摘要长度、trace 裁剪长度和大 payload 截断策略 MUST 来自集中配置或 tool 局部 hard cap
- **AND** tool wrapper MUST 保留确定性 hard cap，防止配置误调导致模型可见 payload 过大

### Requirement: LangChain 配置项必须有中文意图注释
系统 SHALL 为集中 LangChain / DeepSeek / tool calling 配置中的公开配置项提供简短中文注释。注释 MUST 说明参数负责的链路、主要影响和调大/调小的风险。

#### Scenario: 开发者查看配置文件
- **WHEN** 开发者打开 `lib/server/config/` 下的 LangChain Agent 配置
- **THEN** 导出的配置对象和核心配置项 MUST 有中文意图注释
- **AND** 注释 MUST 能说明参数对模型调用、tool loop、成本、延迟、trace 或用户体验的影响
- **AND** 注释 MUST NOT 只重复变量名本身

## REMOVED Requirements

### Requirement: DeepSeek 模型与 Thinking Mode 默认值必须集中配置
**Reason**: 该 requirement 绑定旧 `DeepSeekModelAdapter`。迁移后仍集中管理 DeepSeek 模型与 thinking 参数，但消费方变为 LangChain model factory。

**Migration**: 将默认模型、thinking / reasoning、timeout 和 tool calling 参数迁移到 LangChain / DeepSeek 集中配置。
