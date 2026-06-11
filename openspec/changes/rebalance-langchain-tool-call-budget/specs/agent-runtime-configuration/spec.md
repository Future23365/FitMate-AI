## MODIFIED Requirements

### Requirement: Agent runtime 配置必须集中在服务端 TS config
系统 SHALL 在 `lib/server/config/` 中提供集中 Agent runtime 配置，统一管理生产 `/api/chat` 使用的 LangChain agent 运行预算、DeepSeek native Tool Calling 请求参数、业务 tool 可见事实数量、tool wrapper timeout 和 trace 文本裁剪参数。该配置 MUST 是版本化 TypeScript 代码配置，不要求通过环境变量覆盖。

#### Scenario: 生产 LangChain Agent 从集中配置读取预算
- **WHEN** `/api/chat` 构造生产 LangChain Agent Runtime 输入
- **THEN** 最大模型调用次数、整轮业务 tool 总调用预算、单个业务 tool 单轮调用预算、最大 activity report 次数、LangChain graph step 限制、整体 timeout、单 tool timeout 和结构化输出校验预算 MUST 来自 `lib/server/config/` 下的集中配置或由集中配置稳定推导
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

### Requirement: 业务 tool 预算必须区分全局总量和单 tool 上限
系统 SHALL 将生产 LangChain Agent 的业务 tool 预算拆分为整轮总调用上限和单个业务 tool 单轮调用上限。整轮总调用上限 MUST 默认为 20；单个业务 tool 单轮调用上限 MUST 默认为 2。

#### Scenario: 全局业务 tool 安全上限为 20
- **WHEN** Runtime 执行生产业务 tool call
- **THEN** 系统 MUST 使用集中配置的 `maxToolCalls = 20` 作为整轮业务 tool 安全熔断上限
- **AND** 超过该上限时 Runtime MUST NOT 执行后续业务 tool handler
- **AND** 超限结果 MUST 归一为 `budget_exhausted` 或等价预算失败

#### Scenario: 单个业务 tool 有独立单轮上限
- **WHEN** 同一轮 Agent run 中模型重复调用同一个业务 tool
- **THEN** 系统 MUST 使用集中配置的 `maxToolCallsPerTool = 2` 或等价字段限制该业务 tool 的单轮调用次数
- **AND** 达到单 tool 上限后，后续 provider model request MUST NOT 继续暴露该业务 tool
- **AND** 同一 provider response 内超过单 tool 上限的调用 MUST 被阻止执行 handler
- **AND** 其他业务 tool 的调用机会 MUST NOT 因该 tool 达到自身上限而被直接耗尽

#### Scenario: activity tool 不计入业务 tool per-tool 限制
- **WHEN** 模型调用 `reportAgentActivity`
- **THEN** 该调用 MUST 继续由 `maxActivityReports` 控制
- **AND** 该调用 MUST NOT 消耗业务 tool 总预算或业务 tool per-tool 上限
