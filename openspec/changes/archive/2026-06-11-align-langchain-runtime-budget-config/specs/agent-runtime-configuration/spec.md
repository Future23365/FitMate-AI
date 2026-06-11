## MODIFIED Requirements

### Requirement: Agent runtime 配置必须集中在服务端 TS config
系统 SHALL 在 `lib/server/config/` 中提供集中 Agent runtime 配置，统一管理生产 `/api/chat` 使用的 LangChain agent 模型调用预算、LangChain graph step 推导边界、DeepSeek native Tool Calling 请求参数、业务 tool 可见事实数量、tool wrapper timeout 和 trace 文本裁剪参数。该配置 MUST 是版本化 TypeScript 代码配置，不要求通过环境变量覆盖。

#### Scenario: 生产 LangChain Agent 从集中配置读取预算
- **WHEN** `/api/chat` 构造生产 LangChain Agent Runtime 输入
- **THEN** 最大模型调用次数、最大业务 tool calls、最大 activity report 次数、LangChain graph step 限制、整体 timeout 和单 tool timeout MUST 来自 `lib/server/config/` 下的集中配置或由集中配置稳定推导
- **AND** 生产聊天接入层 MUST NOT 内联这些 runtime budget 数字
- **AND** 集中配置 MUST NOT 保留没有真实 runtime 消费点的旧预算字段

#### Scenario: DeepSeek Tool Calling 请求从集中配置读取默认值
- **WHEN** LangChain model factory 构造 DeepSeek 请求
- **THEN** model、temperature、max tokens、timeout、tool calling 开启策略和 thinking / reasoning 策略 MUST 来自集中配置或显式测试注入配置
- **AND** route、tool wrapper 或业务 service MUST NOT 自己拥有与生产默认值重复的硬编码 provider 参数

#### Scenario: 不要求环境变量覆盖行为预算
- **WHEN** 系统加载 Agent runtime 配置
- **THEN** 系统 MUST NOT 依赖 `AGENT_LLM_MAX_TOKENS`、`AGENT_RUNTIME_MAX_STEPS`、`AGENT_RUNTIME_MAX_REPAIR_ATTEMPTS` 或等价环境变量才能获得生产默认值
- **AND** `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` MAY 继续作为 provider 部署配置从环境变量读取

## ADDED Requirements

### Requirement: LangChain runBudget 字段必须真实生效
系统 SHALL 只在 `runBudget` 中保留当前 LangChain production runtime 会真实消费或稳定推导的字段。每个字段 MUST 有一个明确消费点或推导出口；删除字段时 MUST 同步更新类型、注释、OpenSpec 和测试。

#### Scenario: maxModelCalls 是硬门禁
- **WHEN** LangChain runtime 即将发起下一次 provider model call
- **THEN** runtime MUST 使用集中配置的 `maxModelCalls` 判断是否允许继续
- **AND** 超限时 MUST 不调用 provider
- **AND** 超限结果 MUST 归一为 `budget_exhausted`

#### Scenario: recursionLimit 由模型调用预算推导
- **WHEN** LangChain runtime 调用 `createAgent().invoke()` 或等价入口
- **THEN** 传入 LangChain 的 `recursionLimit` MUST 由集中配置中的模型调用预算稳定推导
- **AND** 推导逻辑 MUST 集中在 runtime 或 config helper 中
- **AND** route、tool wrapper、业务 service 和测试 fixture MUST NOT 重复手写不同的 `recursionLimit` 公式

#### Scenario: 删除无消费点配置
- **WHEN** 某个 `runBudget` 字段没有被 production runtime、tool wrapper、model factory、response adapter、trace 或测试注入真实消费
- **THEN** 系统 MUST 删除该字段或补上真实消费点
- **AND** 系统 MUST NOT 只因为旧设计文档提到该字段就继续保留它
