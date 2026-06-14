## MODIFIED Requirements

### Requirement: Agent runtime 配置必须集中在服务端 TS config
系统 SHALL 在 `lib/server/config/` 中提供集中 Agent runtime 配置，统一管理生产 `/api/chat` 使用的 LangChain agent 运行预算、DeepSeek native Tool Calling 请求参数、业务 tool 可见事实数量、tool wrapper timeout、runtime activity metadata 投影边界和 trace 文本裁剪参数。该配置 MUST 是版本化 TypeScript 代码配置，不要求通过环境变量覆盖。独立 `reportAgentActivity` tool 废弃后，配置层 MUST NOT 继续要求 `maxActivityReports` 作为生产 activity tool 预算。

#### Scenario: 生产 LangChain Agent 从集中配置读取预算
- **WHEN** `/api/chat` 构造生产 LangChain Agent Runtime 输入
- **THEN** 最大模型调用次数、整轮业务 tool 总调用预算、单个业务 tool 单轮调用预算、runtime activity metadata 投影边界、LangChain graph step 限制、整体 timeout、单 tool timeout 和结构化输出校验预算 MUST 来自 `lib/server/config/` 下的集中配置或由集中配置稳定推导
- **AND** 生产聊天接入层 MUST NOT 内联这些 runtime budget 数字
- **AND** 生产配置 MUST NOT 保留或要求 `maxActivityReports` 来控制独立 activity tool 调用次数
- **AND** 如需要限制 UI 摘要刷屏，配置 MUST 使用 runtime metadata projection / de-dup / length 边界表达，而不是 provider-visible activity tool 预算

### Requirement: 业务 tool 预算必须区分全局总量和单 tool 上限
系统 SHALL 将生产 LangChain Agent 的业务 tool 预算拆分为整轮总调用上限和单个业务 tool 连续调用上限。整轮总调用上限 MUST 默认为 20；单个业务 tool 连续调用上限 MUST 默认为 2。业务 tool call 的 `runtimeMetadata` MUST 只作为当前 tool invocation 的 request-local UI metadata，不得被建模为独立 activity tool、独立预算或业务 tool 连续序列打断点。

#### Scenario: runtime metadata 不作为 activity tool 预算
- **WHEN** 模型调用业务 tool 并携带 `runtimeMetadata.activitySummary`
- **THEN** 该 metadata MUST NOT 由 `maxActivityReports` 或等价独立 activity report 预算控制
- **AND** 该 metadata MUST NOT 消耗业务 tool 总预算、业务 tool 连续调用上限、模型调用预算或 graph step
- **AND** runtime metadata 投影失败、缺失或被丢弃 MUST NOT 改变业务 tool handler 是否执行
- **AND** Runtime MUST 继续按真实业务 tool call 统计整轮总预算和单 tool 连续调用上限
