# agent-runtime-configuration Specification

## Purpose
TBD - created by archiving change centralize-agent-runtime-config. Update Purpose after archive.
## Requirements
### Requirement: Agent runtime 配置必须集中在服务端 TS config
系统 SHALL 在 `lib/server/config/` 中提供集中 Agent runtime 配置，统一管理生产 `/api/chat` 使用的 LangChain agent 运行预算、DeepSeek native Tool Calling 请求参数、业务 tool 可见事实数量、tool wrapper timeout、runtime activity metadata 投影边界和 trace 文本裁剪参数。该配置 MUST 是版本化 TypeScript 代码配置，不要求通过环境变量覆盖。独立 `reportAgentActivity` tool 废弃后，配置层 MUST NOT 继续要求 `maxActivityReports` 作为生产 activity tool 预算。

#### Scenario: 生产 LangChain Agent 从集中配置读取预算
- **WHEN** `/api/chat` 构造生产 LangChain Agent Runtime 输入
- **THEN** 最大模型调用次数、整轮业务 tool 总调用预算、单个业务 tool 单轮调用预算、runtime activity metadata 投影边界、LangChain graph step 限制、整体 timeout、单 tool timeout 和结构化输出校验预算 MUST 来自 `lib/server/config/` 下的集中配置或由集中配置稳定推导
- **AND** 生产聊天接入层 MUST NOT 内联这些 runtime budget 数字
- **AND** 生产配置 MUST NOT 保留或要求 `maxActivityReports` 来控制独立 activity tool 调用次数
- **AND** 如需要限制 UI 摘要刷屏，配置 MUST 使用 runtime metadata projection / de-dup / length 边界表达，而不是 provider-visible activity tool 预算

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

### Requirement: Terminal failure finalizer 配置必须集中管理

系统 SHALL 在 `lib/server/config/` 下集中定义 terminal failure finalizer 的行为预算和默认值。production `/api/chat` adapter、finalizer service 和 model adapter MUST 从该配置读取默认值，MUST NOT 在业务模块局部散落额外模型调用预算。

#### Scenario: finalizer 预算来自集中配置

- **WHEN** production adapter 判断是否调用 terminal failure finalizer
- **THEN** `enabled`、`maxCallsPerRun`、`timeoutMs`、`maxTokens`、`temperature` 和 `maxSuggestedQuestions` MUST 来自集中配置
- **AND** production adapter MUST NOT 内联这些预算数字
- **AND** `maxCallsPerRun` MUST 默认为 1 或等价单次限制

#### Scenario: 配置有中文意图注释

- **WHEN** 开发者打开 finalizer 配置文件
- **THEN** 导出的 finalizer 配置对象 MUST 有中文意图注释
- **AND** 每个核心配置项 MUST 说明它影响失败收口成本、延迟、输出长度或用户体验
- **AND** 注释 MUST 不只重复变量名本身

### Requirement: finalizer 配置不得改变主 Agent runtime budget

系统 SHALL 将 terminal failure finalizer 的预算与主 Agent runtime budget 分离。新增 finalizer 配置 MUST NOT 改变主 Agent 的 `maxRepairAttempts`、`maxPlannerCalls`、`maxSteps`、`maxToolCalls` 或 tool timeout 语义。

#### Scenario: 主 Agent repair budget 不被调大

- **WHEN** 实现 terminal failure finalizer
- **THEN** 主 Agent 的 repair budget MUST 继续由原 runtime 配置控制
- **AND** finalizer 调用 MUST 不计入主 Agent repair 成功
- **AND** finalizer 调用 MUST 不允许主 Agent 再执行新的 planner 或 tool step

#### Scenario: route 不按用户原文选择 finalizer 配置

- **WHEN** 用户发送聊天消息
- **THEN** `/api/chat` MUST NOT 基于用户原文关键词、正则、同义词表、短句模板或 phrasing 动态选择 finalizer token、timeout、启用状态或调用次数
- **AND** 是否启用 finalizer MUST 基于集中配置和确定性失败事实

### Requirement: provider availability gate 必须有可测试配置边界

系统 SHALL 提供可测试的 provider availability gate，确保 provider 不可用时不会再触发 finalizer 调用。该 gate MUST 能消费模型配置状态、adapter diagnostics、HTTP status 分类、timeout 和当前请求剩余时间等确定性事实。

#### Scenario: provider 不可用阻止 finalizer

- **WHEN** provider availability gate 接收到 quota、rate limit、auth failure、HTTP failure、network failure、adapter exception、模型请求 timeout 或配置缺失证据
- **THEN** gate MUST 返回 finalizer 不可调用
- **AND** production adapter MUST 使用确定性 fallback
- **AND** 测试 MUST 能断言 finalizer service 未被调用

#### Scenario: 内部校验失败允许 finalizer

- **WHEN** 主 Agent failure 来自内部 terminal validation 或 repair exhausted
- **AND** provider availability gate 没有发现模型不可用证据
- **THEN** gate MUST 允许 production adapter 调用 finalizer
- **AND** 该允许结果 MUST 不代表主 Agent 可以继续 repair

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

### Requirement: 业务 tool 预算必须区分全局总量和单 tool 上限
系统 SHALL 将生产 LangChain Agent 的业务 tool 预算拆分为整轮总调用上限和单个业务 tool 连续调用上限。整轮总调用上限 MUST 默认为 20；单个业务 tool 连续调用上限 MUST 默认为 2。业务 tool call 的 `runtimeMetadata` MUST 只作为当前 tool invocation 的 request-local UI metadata，不得被建模为独立 activity tool、独立预算或业务 tool 连续序列打断点。

#### Scenario: runtime metadata 不作为 activity tool 预算
- **WHEN** 模型调用业务 tool 并携带 `runtimeMetadata.activitySummary`
- **THEN** 该 metadata MUST NOT 由 `maxActivityReports` 或等价独立 activity report 预算控制
- **AND** 该 metadata MUST NOT 消耗业务 tool 总预算、业务 tool 连续调用上限、模型调用预算或 graph step
- **AND** runtime metadata 投影失败、缺失或被丢弃 MUST NOT 改变业务 tool handler 是否执行
- **AND** Runtime MUST 继续按真实业务 tool call 统计整轮总预算和单 tool 连续调用上限

