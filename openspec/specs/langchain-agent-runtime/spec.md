# langchain-agent-runtime Specification

## Purpose
TBD - created by archiving change replace-agent-core-with-langchain-deepseek-tools. Update Purpose after archive.
## Requirements
### Requirement: 生产聊天必须使用 LangChain Agent Runtime
系统 SHALL 使用 LangChain agent harness 作为生产 `/api/chat` 的 Agent runtime。DeepSeek 模型调用 SHALL 使用 native Tool Calling 模式，系统 SHALL NOT 要求模型输出旧 `AgentAction` JSON 来驱动生产 tool loop。

#### Scenario: 聊天请求进入 LangChain runtime
- **WHEN** 已认证用户向 `/api/chat` 发送合法聊天请求
- **THEN** 系统 MUST 完成现有请求校验、用户身份解析、conversation hydration 和 response message id 准备
- **AND** 系统 MUST 调用生产 LangChain Agent Runtime
- **AND** DeepSeek 请求 MUST 暴露 native `tools` 或等价 Tool Calling 参数
- **AND** 系统 MUST NOT 调用旧 `runAgentRuntime()`、`LlmPlanner`、旧 `DeepSeekModelAdapter` 或旧 `ReplayPlanner`

#### Scenario: DeepSeek 返回 native tool calls
- **WHEN** DeepSeek 返回一个或多个 provider `tool_calls`
- **THEN** LangChain runtime MUST 将每个 tool call 路由到已注册的 LangChain tool wrapper
- **AND** tool name MUST 来自当前生产 tool catalog
- **AND** tool arguments MUST 在执行前经过服务端 schema 校验
- **AND** 系统 MUST NOT 将 provider `tool_calls` 直接当作可信业务结果或用户可见事件

### Requirement: LangChain Tool Wrapper 必须保留服务端确定性边界
系统 SHALL 将业务能力封装为 LangChain tools。每个 tool wrapper MUST 复用项目服务端领域服务、权限隔离、Zod 校验、数据库事实校验、输出投影、trace 摘要和错误归一化。

#### Scenario: 业务 tool 执行成功
- **WHEN** LangChain runtime 调用某个业务 tool wrapper
- **THEN** wrapper MUST 使用当前服务端上下文注入 `userId`、conversation metadata、trace writer 和 abort / timeout 信号
- **AND** wrapper MUST 校验 tool arguments
- **AND** wrapper MUST 调用项目领域 service 或 repository
- **AND** wrapper MUST 返回模型可见安全摘要和内部可审计结果
- **AND** wrapper MUST NOT 暴露 secret、完整敏感 payload、跨用户数据或未经脱敏的大对象给模型

#### Scenario: 业务 tool 输入非法
- **WHEN** DeepSeek `tool_calls.arguments` 缺少必填字段、枚举非法、类型错误或引用不可访问资源
- **THEN** wrapper MUST 拒绝执行领域副作用
- **AND** wrapper MUST 返回稳定错误 code 和可恢复诊断
- **AND** LangChain runtime MAY 让模型基于该诊断继续澄清或失败收口
- **AND** 服务端 MUST NOT 用用户原文关键词改写 tool arguments

#### Scenario: 业务 tool 涉及用户私有数据
- **WHEN** tool wrapper 读取或写入 conversation、artifact、训练事实、用户记忆或其他私有数据
- **THEN** wrapper MUST 基于当前 authenticated `userId` 做权限隔离
- **AND** wrapper MUST NOT 信任客户端或模型提供的 `userId`
- **AND** wrapper MUST NOT 返回其他用户数据

### Requirement: 终态响应必须经过 Production Response Adapter
系统 SHALL 使用 production response adapter 将 LangChain run 结果投影为前端可消费的 NDJSON 白名单事件。模型和 LangChain tool MUST NOT 直接生成任意 NDJSON 事件。

#### Scenario: 普通文本回答完成
- **WHEN** LangChain agent 生成最终用户可见文本
- **THEN** response adapter MUST 输出 `content` 事件
- **AND** response adapter MUST 输出 `done` 事件
- **AND** 用户可见文本 MUST 来自受控最终消息或受控结构化终态投影
- **AND** 系统 MUST NOT 将模型原始 provider payload 直接写给前端

#### Scenario: 模型需要用户补充信息
- **WHEN** LangChain run 以澄清或需要用户输入的终态收口
- **THEN** response adapter MUST 输出用户可读的 `content`
- **AND** response adapter MAY 输出 `assistant_suggestions`
- **AND** response adapter MUST 输出 `done`
- **AND** 系统 MUST NOT 伪造旧 `ask_user` AgentAction 或旧 Agent stream event

#### Scenario: 结构化训练输出完成
- **WHEN** LangChain run 产生训练方案、动作推荐、routine、plan 或等价结构化业务输出
- **THEN** 输出 MUST 通过对应服务端 validator
- **AND** 所有 `exerciseId` MUST 经过数据库事实校验
- **AND** 未通过校验的结构化输出 MUST NOT 渲染为卡片、保存 artifact 或写入训练事实
- **AND** response adapter MUST 只渲染通过校验的用户可见结构

### Requirement: 生产 Tool Catalog 必须受控
系统 SHALL 为生产 `/api/chat` 构造明确的 LangChain tool catalog。catalog MUST 只包含当前 OpenSpec 声明、已通过测试并满足权限与投影边界的业务 tools。

#### Scenario: 构造生产 tool catalog
- **WHEN** `/api/chat` 准备 LangChain Agent Runtime
- **THEN** 系统 MUST 从服务端集中注册入口构造 production tool catalog
- **AND** catalog MUST NOT 包含 fixture tools、测试 tools、隐藏业务服务或未声明写入能力
- **AND** catalog MUST NOT 根据用户原文关键词动态增减工具

#### Scenario: 模型请求未注册工具
- **WHEN** DeepSeek 或 LangChain runtime 请求执行未注册 tool
- **THEN** 系统 MUST 拒绝执行
- **AND** trace MUST 记录未知 tool name 和拒绝 code
- **AND** 服务端 MUST NOT 通过业务分支临时执行同名或相邻能力

### Requirement: 旧自研 Agent Core 必须退出生产路径
系统 SHALL 在 LangChain runtime 完成接入后移除旧自研 Agent core 的生产依赖。生产代码 SHALL NOT 同时保留旧 core 和 LangChain runtime 两条 Agent 主链。

#### Scenario: 生产代码扫描旧 core 引用
- **WHEN** 实现完成后运行架构扫描
- **THEN** 生产 `/api/chat` MUST NOT 导入或调用 `lib/server/agent-core/**`
- **AND** 生产 `/api/chat` MUST NOT 导入或调用 `lib/server/agent-planners/**`
- **AND** 生产 `/api/chat` MUST NOT 使用旧 `AgentAction`、旧 `PlannerPort`、旧 `ToolRegistry`、旧 `Executor` 或旧 Response Renderer
- **AND** 旧 core 只能存在于迁移过程的未完成 diff 中，最终交付前 MUST 删除或移出生产代码

### Requirement: LangChain tool schema 失败必须返回字段级 repair payload
系统 SHALL 在 LangChain tool wrapper 的 input schema 校验失败时，向模型可见 tool message 返回脱敏字段级 repair payload，而不是只返回泛化 `tool_schema_invalid` 文案。

#### Scenario: Tool input schema 失败返回可修正字段事实
- **WHEN** DeepSeek native `tool_calls.arguments` 未通过某个已注册 LangChain tool wrapper 的 input schema 校验
- **THEN** wrapper MUST 拒绝执行 handler
- **AND** 模型可见 tool message MUST 包含 `status = "failed"`
- **AND** 模型可见 tool message MUST 包含 `code = "tool_schema_invalid"`
- **AND** 模型可见 tool message MUST 包含 `issues[]`
- **AND** 每个 issue MUST 至少包含脱敏字段路径 `path` 和稳定 `code`
- **AND** issue SHOULD 包含可安全暴露的 `message`、`expected` 或 `actual`
- **AND** 模型可见 tool message MUST NOT 包含 stack trace、完整 Zod schema、内部文件路径、完整 handler payload、数据库对象、secret 或跨用户数据

#### Scenario: 字段级 repair payload 不依赖业务 tool 特判
- **WHEN** 任意业务 LangChain tool 的 input schema 校验失败
- **THEN** 字段级 repair payload MUST 由通用 wrapper / schema issue projector 生成
- **AND** 实现 MUST NOT 为 `searchExerciseResources` 或其他具体业务 `toolName` 增加专属 runtime 分支
- **AND** 实现 MUST NOT 根据用户原文、关键词、正则、同义词表或具体 phrasing 改写 tool input

### Requirement: LangChain graph step 预算必须与模型调用预算同步
系统 SHALL 将传给 LangChain agent 的 `recursionLimit` 视为 graph step 预算，而不是旧自研 Agent 的迭代次数。`recursionLimit` MUST 由集中配置中的真实模型调用预算推导，且 MUST 为工具调用后的最终结构化回答预留 graph step 空间。业务 tool call 的 `runtimeMetadata` MUST 只作为当前 tool invocation 的 request-local metadata，不得产生额外 provider tool call、ToolMessage、model call 或 graph step。

#### Scenario: 工具调用后仍可提交最终回答
- **WHEN** LangChain runtime 的集中配置允许 N 次模型调用
- **AND** 模型在前 N-1 次调用中持续返回合法 provider `tool_calls`
- **THEN** runtime MUST 为第 N 次模型调用提交 `fitmate_final_response` 保留 LangChain graph step 预算
- **AND** runtime MUST NOT 因旧 `maxIterations + 2` 计算提前触发 `budget_exhausted`

#### Scenario: 模型调用预算耗尽
- **WHEN** LangChain runtime 即将发起超过集中配置 `maxModelCalls` 的 provider model call
- **THEN** runtime MUST 停止继续调用 provider
- **AND** runtime MUST 返回稳定 `budget_exhausted` 失败
- **AND** trace summary MUST 保留已经发生的 model call、provider tool call 和 tool execution 摘要

#### Scenario: runtime metadata 不消耗额外预算
- **WHEN** 模型在业务 tool arguments 中携带 `runtimeMetadata.activitySummary`
- **THEN** 该 metadata 本身 MUST NOT 产生额外 provider `tool_call`、LangChain `ToolMessage`、model call 或 graph step
- **AND** 该 metadata 本身 MUST NOT 消耗业务 tool 调用预算、旧 activity report 预算或模型调用预算
- **AND** activity 投影 MUST 只作为当前业务 tool wrapper 执行前的 request-local event
- **AND** runtime MUST NOT 为 activity summary 保留独立 activity report 上限或空转 loop 边界

### Requirement: Runtime 必须限制业务 tool 的单轮重复请求和执行
系统 SHALL 在生产 LangChain Agent Runtime 中限制模型连续重复请求同一个业务 tool。该限制 MUST 基于当前 production tool wrapper 列表自动生成，MUST 只统计 `executionKind = "business"` 的真实业务 tool 连续序列，并且 MUST 不替代整轮业务 tool 总预算。连续同 tool 限制 MUST 以 provider model response 批次作为计数单位：同一 `AIMessage.tool_calls` 批次内同一业务 tool 的多个不同输入请求 SHALL 视为一次模型决策中的并列 fan-out，不得被计为多个跨 observation 的连续 loop。`runtimeMetadata` MUST NOT 被视为一个独立 tool，也不得打断或重置业务 tool 连续计数。Runtime MUST NOT 在该限制中写用户原文、关键词、业务 phrasing 或具体业务 `toolName` 语义分支。

#### Scenario: 每个业务 tool 自动获得连续调用上限
- **WHEN** Runtime 基于 production tool wrappers 构造 `createAgent`
- **THEN** Runtime MUST 为每个 `executionKind = "business"` 的 tool 配置连续模型决策批次上限
- **AND** 连续批次上限 MUST 来自集中配置
- **AND** Runtime MUST NOT 手写用户原文关键词、短句模板或自然语言语义判断来决定某个 tool 是否可重试

#### Scenario: 同一模型响应中的同名不同输入 fan-out 不触发连续超限
- **WHEN** 某次 provider model response 返回同一业务 tool 的多个 `tool_calls`
- **AND** 这些 tool calls 的归一化业务 input 不完全相同
- **THEN** Runtime MUST 将该批次视为一次模型决策中的并列 fan-out
- **AND** Runtime MUST NOT 仅因该批次内同名 tool call 数量超过 `maxToolCallsPerTool` 就触发 `tool_consecutive_call_limit_exceeded`
- **AND** 每个实际执行的业务 tool call MUST 继续消耗整轮业务 tool 总预算
- **AND** 该行为 MUST 不绕过 schema、权限、projection、trace 和最终结构化回复校验

#### Scenario: 同一模型响应中的同名同参请求仍按 duplicate input 处理
- **WHEN** 某次 provider model response 返回同一业务 tool 的多个 `tool_calls`
- **AND** 其中至少两个 tool calls 具有相同 `toolName`、相同 `toolVersion` 和等价归一化业务 input
- **THEN** Runtime MUST NOT 因 batch-aware fan-out 重复执行等价 handler
- **AND** Runtime MUST 使用 duplicate input 或等价通用诊断反馈处理重复同参请求
- **AND** Runtime MUST NOT 根据具体业务字段组合或业务 section 判断是否复用事实

#### Scenario: 连续达到单 tool 批次上限后不再暴露给后续 provider 请求
- **WHEN** 当前 Agent run 中最近连续 provider model response 批次已经达到某业务 tool 的连续调用上限
- **THEN** Runtime MUST 在后续 model request 中从可用 `tools` 列表移除该业务 tool
- **AND** 模型后续 provider tool_call 尝试 MUST NOT 继续消耗整轮业务 tool 总预算

#### Scenario: 连续超限后终止主 Agent loop
- **WHEN** 模型跨 provider model response 批次连续调用某个业务 tool 超过集中配置的连续调用上限
- **THEN** LangChain Runtime MUST 阻止该超限 tool call 执行对应 handler
- **AND** Runtime MUST 记录稳定失败 execution、失败摘要和 trace summary
- **AND** Runtime MUST 将当前主 Agent run 归一化为 terminal failure
- **AND** Runtime MUST NOT 允许模型通过调用其他业务 tool、重复历史查询 tool 或改变 tool input 继续推进同一个主 Agent loop
- **AND** 该行为 MUST 不绕过项目现有 schema、权限、projection、trace 和最终结构化回复校验

#### Scenario: runtime metadata 不打断业务 tool 连续计数
- **WHEN** 模型跨 provider model response 批次连续调用同一个业务 tool 达到上限
- **AND** 后续 tool call 仅改变或携带 `runtimeMetadata.activitySummary`
- **THEN** Runtime MUST NOT 将 `runtimeMetadata` 视为独立 tool 或业务 tool 连续序列的打断点
- **AND** Runtime MUST 继续按真实业务 `toolName`、tool version 和模型决策批次计算连续限制
- **AND** `runtimeMetadata.activitySummary` MUST NOT 消耗旧 activity report 预算或任何独立 activity 预算

#### Scenario: 连续超限失败用于受控失败收口
- **WHEN** Runtime 因连续业务 tool 超限终止主 Agent run
- **THEN** `/api/chat` MAY 使用现有 terminal failure finalizer 或确定性 fallback 生成用户可见失败说明
- **AND** terminal failure finalizer MUST NOT 接收 tool catalog 或继续执行原始任务
- **AND** 用户可见回复 MUST NOT 声称已经完成未发生的工具执行、结构化训练输出、保存或训练事实写入

#### Scenario: 全局预算仍然作为安全熔断
- **WHEN** 模型跨多个业务 tool 的总调用次数超过集中配置的整轮业务 tool 总预算
- **THEN** Runtime MUST 继续阻止后续业务 tool handler
- **AND** Runtime MUST 记录或返回稳定预算失败
- **AND** 连续同 tool 限制 MUST NOT 删除整轮安全熔断

### Requirement: Runtime 必须对重复同参 tool call 提供通用 duplicate input 反馈
系统 SHALL 在生产 LangChain Agent Runtime 或 tool execution 边界中识别同一 run 内重复的同参业务 tool call。重复判定 MUST 基于稳定结构，例如 `toolName + toolVersion + normalizedInputHash`；命中后系统 MUST NOT 重复执行 handler、重复注册等价资源或依赖总预算耗尽来终止循环。反馈 MUST 使用 `duplicate_tool_input`、`duplicate_input` 或等价中性命名，只表达事实已存在和重复调用不会产生新事实，不得替模型选择业务下一步，也不得使用 `success` / `satisfied` 表达业务目标已经满足。

#### Scenario: 重复同参调用不重复执行 handler
- **WHEN** 同一 LangChain Agent run 中某个业务 tool 已使用相同 `toolName`、相同 `toolVersion` 和等价归一化 input 执行并产生 tool result
- **AND** 模型再次请求同一 tool 和同一归一化 input
- **THEN** Runtime MUST NOT 再次执行该 tool handler
- **AND** Runtime MUST NOT 重复注册等价业务 resource、validated visible output 或事实桥记录
- **AND** Runtime MUST 记录该次请求命中 duplicate input 或等价稳定诊断
- **AND** Runtime MUST NOT 将该诊断命名为 `duplicate_tool_success`、`duplicate-success` 或其他暗示业务目标已成功的名称

#### Scenario: duplicate input 反馈不承载业务下一步
- **WHEN** Runtime 向模型返回重复同参成功调用的可恢复反馈
- **THEN** 反馈 MUST 表达该同参调用已经产生过 tool result 或事实摘要
- **AND** 反馈 MAY 提供有限事实摘要或指示模型可继续基于当前可见事实推理
- **AND** 反馈 MUST NOT 使用 `success`、`satisfied`、`unsatisfied` 或等价词表达用户业务目标已经满足或未满足
- **AND** 反馈 MUST NOT 包含固定用户短语、关键词、正则、同义词表或具体 phrasing
- **AND** 反馈 MUST NOT 根据具体业务 `toolName`、字段组合或业务 section 指导模型调用某个下一步 tool
- **AND** 反馈 MUST NOT 暴露内部 `resourceId`、`toolResultId`、`factRef`、`messageId` 或 trace id 作为模型需要复制的合同

#### Scenario: duplicate input 不依赖预算耗尽收场
- **WHEN** 模型连续重复请求已经成功的同参业务 tool call
- **THEN** Runtime MUST 在重复调用处提供稳定反馈
- **AND** handler 执行次数 MUST 保持为一次
- **AND** Runtime MUST NOT 让同一重复同参请求持续消耗到 `maxModelCalls`、整轮业务 tool 总预算或 terminal failure finalizer 才结束
- **AND** per-tool limit 和整轮总预算 MAY 继续作为安全熔断保留

#### Scenario: duplicate input 机制不写业务 toolName 语义分支
- **WHEN** Runtime 构造 duplicate input key 或处理重复命中
- **THEN** Runtime MUST 使用通用 tool wrapper metadata、tool version 和归一化 input
- **AND** Runtime MUST NOT 为 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`submitVisibleTrainingProposal` 或未来业务 tool 编写语义特判
- **AND** Runtime MUST NOT 根据用户自然语言、关键词、短句模板或业务字段组合决定是否复用事实

### Requirement: Runtime 不得把成功空结果归类为 repair failure
系统 SHALL 区分 tool 执行失败与成功事实为空。只要 LangChain tool wrapper 返回 `ok = true` 或等价成功执行状态，且 handler output / output schema / 权限 / 执行合同均通过，0 条结果、空候选、空 `facts[]` 或候选不足 diagnostics MUST 作为 current-run 事实材料进入模型可见边界；Runtime MUST NOT 因业务目标未满足、候选数量不足或 section 覆盖不足而把该结果归类为 repair failure、terminal failure 或业务失败。

#### Scenario: 0 条动作查询是成功事实
- **WHEN** `searchExerciseResources` 或等价查询 tool 成功执行
- **AND** output 表达 `totalMatches = 0`、空候选或候选不足 diagnostics
- **THEN** Runtime MUST 将该结果作为 current-run 事实材料提供给模型
- **AND** 模型 MAY 基于该事实输出普通文本解释、澄清、放宽条件建议或继续调用其他合法工具
- **AND** Runtime MUST NOT 因中间结果为空而强制进入 repair failure 或 terminal failure finalizer

#### Scenario: 空历史事实是成功状态查询
- **WHEN** `inspectVisibleTrainingProposals` 或等价历史事实读取 tool 成功执行
- **AND** output 表达当前 actor / conversation 下空 `facts[]`
- **THEN** Runtime MUST 将该空事实集合作为 current-run 事实材料提供给模型
- **AND** Runtime MUST NOT 把空 `facts[]` 伪装成已导入历史方案事实
- **AND** Runtime MUST NOT 因空结果强制改写用户意图、生成新方案或进入固定 answer 模板

#### Scenario: 结构化输出失败只归因于 finalization 或 validator
- **WHEN** 模型基于空结果或候选不足事实提交结构化训练输出
- **AND** finalization tool、terminal validator 或业务 validator 判定该结构不满足数据库事实、section、prescription、schedule 或可渲染边界
- **THEN** Runtime MUST 将失败归因于 finalization / validator
- **AND** Runtime MUST NOT 把中间 tool result 的空结果或候选不足 diagnostics 当作结构化输出失败的替代判定

### Requirement: Runtime 必须拒绝执行当前 request 未暴露的 provider tool call
系统 SHALL 在每次 LangChain model request / response 边界维护当前 request 实际暴露的 tool name 集合。Provider 返回的 `tool_calls[].name` 如果不在该集合中，runtime MUST NOT 执行任何业务 tool handler，并 MUST 以受控失败记录 trace 和进入失败收口。该校验 MUST 使用通用 tool name 可用性集合，不得读取用户原文、关键词、短句模板或具体业务字段组合。

#### Scenario: 已移除工具不得继续执行
- **WHEN** 某次 model request 的 `tools` 列表不包含某个业务 tool
- **AND** provider response 仍返回该 tool name 的 `tool_call`
- **THEN** runtime MUST NOT 调用该 tool wrapper 的 handler
- **AND** runtime MUST 记录稳定失败 execution 或 run failure
- **AND** failure MUST 可由 production response adapter / terminal failure finalizer 受控收口
- **AND** runtime MUST NOT 为该未暴露 tool call 消耗业务 handler 执行预算

#### Scenario: 拦截逻辑不写业务 toolName 分支
- **WHEN** runtime 判断 provider `tool_call` 是否可执行
- **THEN** 判断 MUST 基于当前 request 暴露的 tool name 集合
- **AND** runtime MUST NOT 为 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`submitVisibleTrainingProposal` 或其他具体业务 tool 编写语义分支
- **AND** runtime MUST NOT 根据用户自然语言、关键词、正则、同义词表或具体 phrasing 改写 provider `tool_calls`

#### Scenario: 合法暴露工具保持原执行路径
- **WHEN** provider response 返回的 `tool_call.name` 存在于当前 request 的 `tools` 列表
- **THEN** runtime MUST 继续使用现有 LangChain tool wrapper、schema 校验、权限隔离、投影和 trace 边界执行该 tool
- **AND** 本可用性校验 MUST NOT 绕过现有 schema、permission、projection、trace 或最终结构化回复校验

### Requirement: Runtime 必须把连续上限移除后的同 tool 调用归一为 terminal loop failure
系统 SHALL 区分“当前 request 未暴露的普通未知 tool”和“因连续业务 tool 上限被当前 request 移除的 exhausted tool”。当 provider 继续请求后者时，runtime MUST 将该 tool call 归一为连续业务 tool 超限失败，并进入 terminal loop failure 收口。该判断 MUST 只基于 runtime 维护的 tool catalog、当前 request tools、业务 tool 连续调用计数和集中配置上限，MUST NOT 基于用户原文、关键词、正则、同义词、短句模板或具体 phrasing。

#### Scenario: 已移除业务 tool 被继续调用时终止主 Agent loop
- **WHEN** 某个 `executionKind = "business"` 的 tool 在当前 Agent run 中最近连续调用序列已达到集中配置的连续调用上限
- **AND** runtime 在下一次 provider request 的 `tools` 列表中移除了该 tool
- **AND** provider 仍返回该 tool 的 `tool_call`
- **THEN** runtime MUST 拒绝执行该 tool handler
- **AND** runtime MUST 记录 `code = "tool_consecutive_call_limit_exceeded"` 或等价稳定 trace summary
- **AND** runtime MUST 将当前主 Agent run 归一化为 terminal failure
- **AND** runtime MUST NOT 继续向同一主 Agent loop 提供普通 `unknown_tool` 反馈让模型重复尝试
- **AND** runtime MUST NOT 因该非法尝试重复消耗业务 tool handler 执行预算

#### Scenario: 普通未暴露 tool 仍按 unknown_tool 拒绝
- **WHEN** provider 返回当前 request `tools` 列表之外的 tool call
- **AND** 该 tool 不属于当前 request 因连续业务 tool 上限移除的 exhausted tool
- **THEN** runtime MUST 拒绝执行 handler
- **AND** runtime MUST 记录 `code = "unknown_tool"` 或等价稳定拒绝 code
- **AND** runtime MUST NOT 临时执行同名、相邻或历史注册的业务能力

#### Scenario: 连续上限终止不写业务语义分支
- **WHEN** runtime 判断 provider 返回的 tool call 是否命中 exhausted tool
- **THEN** 判断依据 MUST 来自通用 tool wrapper metadata、当前 request tools、连续调用计数和集中配置
- **AND** runtime MUST NOT 为 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`submitVisibleTrainingProposal` 或未来具体业务 tool 编写语义特判
- **AND** runtime MUST NOT 根据用户自然语言、业务字段组合或具体 trace phrasing 改写 provider tool call、tool input 或最终回答策略

### Requirement: Runtime 必须在结构化最终回答无效时先尝试受限 repair
系统 SHALL 在 LangChain 主 Agent 完成但未产出合法 `fitmate_final_response` 时，将该问题视为可恢复的终态结构缺失，并在进入 terminal failure finalizer 前尝试一次受限 repair。Repair MUST 基于当前模型可见消息、当前已成功工具事实、当前 tool catalog 和结构化最终回答 schema 错误进行，不得根据用户原文关键词、正则、同义词表、短句模板或具体 phrasing 改写 provider tool call、`toolName`、调用顺序或最终回答策略。

#### Scenario: 结构化最终回答缺失先进入 repair
- **WHEN** LangChain 主 Agent 返回的 `state.structuredResponse` 缺失或无法通过 `fitmate_final_response` schema 校验
- **THEN** runtime MUST 在返回 `structured_output_validation_failed` 前尝试一次结构化最终回答 repair
- **AND** repair 输入 MUST 包含脱敏的 schema 校验失败事实和当前可见上下文
- **AND** repair 输入 MUST NOT 包含服务端根据用户自然语言推断出的业务 intent
- **AND** runtime MUST NOT 直接进入 terminal failure finalizer

#### Scenario: repair 成功返回正常结果
- **WHEN** 结构化最终回答 repair 产出合法 `fitmate_final_response`
- **THEN** runtime MUST 将该结果作为正常 LangChain run 结果返回
- **AND** response adapter MUST 按正常成功路径投影 `content`、`suggested_questions` 和已通过 validator 的 `visible_output`
- **AND** runtime MUST 保留 repair 过程中发生的模型调用、provider tool call 和 tool execution trace

#### Scenario: repair 可以继续使用当前 tool catalog
- **WHEN** repair 过程中模型需要交付训练卡片、routine、plan 或其他结构化业务结果
- **THEN** 模型 MUST 只能调用当前 LangChain tool catalog 暴露的 tools
- **AND** 对应业务结构 MUST 继续通过 finalization tool、schema 和服务端 validator
- **AND** response adapter MUST NOT 渲染未通过 validator 的结构化训练结果

#### Scenario: repair 不替代澄清能力
- **WHEN** 当前事实不足以完成原始用户任务
- **THEN** repair MAY 产出合法 `fitmate_final_response.content` 追问一个关键条件
- **AND** 追问 MUST 围绕原始任务继续推进
- **AND** runtime MUST NOT 将缺少 `submitVisibleTrainingProposal` 或缺少 `visible_output` 本身视为失败，除非 repair 后仍没有合法最终回答或结构化业务结果

#### Scenario: repair 失败后才进入 terminal failure
- **WHEN** 结构化最终回答 repair 未产出合法 `fitmate_final_response`
- **THEN** runtime MAY 返回 `structured_output_validation_failed`
- **AND** `/api/chat` MAY 使用 terminal failure finalizer 或确定性 fallback 收口
- **AND** terminal failure MUST 保持为最后兜底，不得作为第一次结构化终态缺失后的直接出口

#### Scenario: repair 不写业务 toolName 语义分支
- **WHEN** runtime 构造结构化最终回答 repair 输入或处理 repair 结果
- **THEN** runtime MUST 使用通用 schema、tool catalog、tool wrapper 和 finalization 合同
- **AND** runtime MUST NOT 为 `searchExerciseResources`、`submitVisibleTrainingProposal`、`inspectVisibleTrainingProposals` 或未来业务 tool 编写语义特判
- **AND** runtime MUST NOT 根据业务字段组合决定是否自动生成 plan、routine、tool input 或用户可见正文

