# agent-tool-contract-kernel Specification

## Purpose
定义当前生产 `/api/chat` 使用的 LangChain Agent tool 合同边界。历史 M0 自研内核只作为迁移背景，不再作为生产实现目标；新增或修改 Agent tool 时，应以 `lib/server/langchain-agent/*` 的 tool wrapper、production catalog、runtime budget、trace summary 和 response adapter 为准。
## Requirements
### Requirement: 生产 Agent runtime 必须使用 LangChain 主链
系统 SHALL 使用 `lib/server/langchain-agent/*` 的 LangChain Agent Runtime 承载生产 `/api/chat` 工具调用、结构化终态、预算、trace 和用户可见投影。旧自研 Agent core 的 planner/action/registry/renderer 合同 MUST NOT 作为新的生产实现目标。

#### Scenario: /api/chat 调用当前 LangChain 主链
- **WHEN** `/api/chat` 处理文本聊天请求
- **THEN** 生产服务 MUST 经由 `createLangChainAgentTextChatResponse -> runLangChainAgentRuntime -> createProductionLangChainToolCatalog` 或等价链路执行
- **AND** 生产服务 MUST 使用 DeepSeek native `tool_calls` 执行 LangChain tools
- **AND** 生产服务 MUST 使用 `fitmate_final_response` / `toolStrategy` 获取结构化最终回答
- **AND** 生产服务 MUST NOT 恢复旧自定义 action JSON、旧 planner port、旧 tool registry 或旧 response writer 作为主链

#### Scenario: Runtime 不包含业务语义分支
- **WHEN** LangChain runtime 执行任意模型输出
- **THEN** runtime MUST NOT 基于用户自然语言关键词、正则、同义词表或短句模板选择 tool
- **AND** runtime MUST NOT 根据具体业务 `toolName` 改写模型意图、tool input 或 final response
- **AND** runtime MUST 只根据 LangChain tool catalog、Zod schema、运行预算、AbortSignal、工具执行结果和结构化终态校验做确定性处理

### Requirement: Tool wrapper 必须形成可执行合同
系统 SHALL 通过 `defineLangChainToolWrapper` 或等价入口定义生产 LangChain tool。tool wrapper MUST 声明稳定 `name`、中文 `description`、Zod `inputSchema`、可选 `outputSchema`、`handler`、`toModelVisibleSummary`，并按需声明 `toUserProjection`、`toTraceSummary` 和 `timeoutMs`。

#### Scenario: 定义合法生产 tool wrapper
- **WHEN** 开发者新增或修改生产 LangChain tool
- **THEN** tool wrapper MUST 声明 `name`、`description`、`inputSchema`、`handler` 和 `toModelVisibleSummary`
- **AND** tool wrapper SHOULD 声明 `outputSchema` 校验 handler 输出
- **AND** 涉及用户可见结构化输出的 tool MUST 声明 `toUserProjection`
- **AND** 涉及 trace 或调试的 tool MUST 提供脱敏 `toTraceSummary`
- **AND** 描述性自然语言 MUST 使用中文，`toolName`、字段名、enum 和代码标识符保持英文原样

#### Scenario: Tool wrapper 不暴露服务端实现
- **WHEN** tool wrapper 被转成 LangChain tool
- **THEN** provider 可见内容 MUST 只包含工具名、description 和 input schema
- **AND** provider 可见内容 MUST NOT 包含 handler、数据库对象、secret、完整用户 payload、权限上下文、trace 原文或服务端 capability 对象
- **AND** tool description / schema description MUST NOT 包含 prompt injection 式指令或绕过服务端校验的描述

### Requirement: Production catalog 必须由集中配置白名单装配
系统 SHALL 通过 `createProductionLangChainToolCatalog()` 或等价入口装配生产工具集合。生产工具是否启用 MUST 由集中配置白名单、actor context 和服务端装配决定，MUST NOT 按用户原文动态增减工具。

#### Scenario: 生产 tool catalog 注册当前工具
- **WHEN** 生产聊天装配 LangChain tools
- **THEN** catalog MUST 至少能注册当前允许的 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 和 `submitVisibleTrainingProposal`
- **AND** 未在 `agentRuntimeConfig.langChain.toolCatalog.allowedToolNames` 或等价集中配置中的 tool MUST NOT 被生产主链暴露
- **AND** 遇到未知 tool name 时 catalog MUST 抛出稳定错误，而不是静默忽略或 fallback 到相邻业务 tool

#### Scenario: 新增业务 tool 不改 runtime 主流程
- **WHEN** 开发者新增同类生产 tool
- **THEN** 开发者 SHOULD 只新增 tool wrapper、集中配置白名单、catalog 注册和相关测试
- **AND** 开发者 MUST NOT 为该 tool 修改 LangChain runtime loop、provider model factory、response adapter 或 `/api/chat` route 主流程
- **AND** 若新增能力改变业务行为、API 契约、模型可见合同或用户流程，必须按项目规则先走 OpenSpec

### Requirement: Executable tool 必须统一校验、预算和错误归一化
系统 SHALL 通过 `createExecutableLangChainTool()` 和 `executeLangChainToolWrapper()` 或等价边界统一执行工具。执行边界 MUST 处理 input schema、output schema、工具调用预算、timeout、AbortSignal、异常消毒、model-visible summary、user projection 和 trace summary。

#### Scenario: 工具参数不合法
- **WHEN** provider tool call 的 arguments 不通过 tool `inputSchema`
- **THEN** 执行边界 MUST 返回 `tool_schema_invalid` 或等价稳定 code
- **AND** model-visible message MUST 要求模型修正当前工具参数，不得假装工具已成功
- **AND** handler MUST NOT 被调用

#### Scenario: 工具执行超过预算
- **WHEN** 本轮工具调用次数超过集中配置的 run budget
- **THEN** 执行边界 MUST 返回 `budget_exhausted` 或等价稳定 code
- **AND** model-visible message MUST 明确不要继续假装工具已执行成功
- **AND** runtime MUST 将预算失败记录到 trace summary

#### Scenario: 工具输出不合法
- **WHEN** handler 输出未通过 `outputSchema`
- **THEN** 执行边界 MUST 返回 `structured_output_validation_failed` 或等价稳定 code
- **AND** model-visible message MUST 明确该工具结果不能作为成功事实
- **AND** user projection MUST NOT 输出未校验结构

#### Scenario: 成功工具结果进入模型和用户投影
- **WHEN** handler 输出通过服务端校验
- **THEN** `toModelVisibleSummary` MUST 生成安全摘要供后续模型推理
- **AND** `toUserProjection` MAY 生成用户可见结构化投影
- **AND** `toTraceSummary` MUST 避免泄漏 secret、完整 raw output 或跨用户事实
- **AND** runtime MUST NOT 用候选数量、业务目标完成度或用户语义判断覆盖工具执行状态

### Requirement: 结构化训练输出必须由业务 tool 校验
系统 SHALL 通过 `submitVisibleTrainingProposal` 或等价业务 tool 提交训练方案结构。该 tool MUST 负责 visible output envelope、payload schema、数据库动作事实、section 边界、renderer 投影和 accepted/rejected 摘要，不得保存计划或解析自然语言。该 tool 的 validator context MUST NOT 重新接入旧 Agent-era `toolResults.fulfillment.satisfied` 视图，也 MUST NOT 通过旧 tool result projection 推断动作来源。

#### Scenario: accepted 结构生成用户投影
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "accepted"`
- **THEN** user projection MUST 包含 `validatedVisibleOutputs` 或等价字段
- **AND** response adapter MUST 只渲染已通过服务端校验的可见训练输出
- **AND** model-visible summary MAY 告诉模型最终回答可以引用这张已验证训练卡片

#### Scenario: rejected 结构不渲染
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "rejected"`
- **THEN** user projection MUST NOT 输出 `validatedVisibleOutputs`
- **AND** model-visible summary MUST 要求模型修正结构、重新调用工具或说明无法生成
- **AND** response adapter MUST NOT 把 rejected payload 渲染或持久化为事实

#### Scenario: finalization validator context 不接入旧 tool result 满足度
- **WHEN** `submitVisibleTrainingProposal` 调用 terminal output validator
- **THEN** validator context MUST NOT 包含旧 `toolResults` 数组
- **AND** validator context MUST NOT 包含 `fulfillment.satisfied`
- **AND** accepted / rejected 判断 MUST 基于 payload schema、数据库动作事实、section 边界、renderer 投影和受控 resource inventory
- **AND** accepted / rejected 判断 MUST NOT 依赖任意旧 Agent tool result projection、具体业务 `toolName` 或用户自然语言 phrasing

### Requirement: Response adapter 必须输出安全 NDJSON 事件
系统 SHALL 由生产 response adapter 将 LangChain runtime result、tool user projection、validated visible outputs、terminal failure finalizer output 和错误转换为 `/api/chat` 白名单 NDJSON event。adapter MUST NOT 让模型直接生成 NDJSON。

#### Scenario: 成功最终回答
- **WHEN** LangChain runtime 返回合法 `fitmate_final_response`
- **THEN** response adapter MUST 输出 `content` event
- **AND** `suggestedQuestions` 存在时 MUST 输出对应建议提问事件或等价兼容投影
- **AND** response adapter MUST 输出 `done` event
- **AND** 用户可见正文 MUST 来自已校验的 structured final response

#### Scenario: validated visible outputs
- **WHEN** tool user projection 中存在已校验 `validatedVisibleOutputs`
- **THEN** response adapter MUST 只输出通过业务 validator 和 renderer 的可见结构
- **AND** response adapter MUST NOT 渲染 raw tool output、rejected payload 或模型正文中的未校验 JSON

#### Scenario: runtime 失败进入 finalizer 或 fallback
- **WHEN** LangChain runtime 返回失败
- **THEN** response adapter MAY 使用 terminal failure finalizer 的 shape 合法输出
- **AND** finalizer 输出只可生成普通用户可见回复和建议问题
- **AND** finalizer 输出 MUST NOT 复活未通过校验的结构化输出、tool result 或业务事实

### Requirement: 内部事实和 trace 不得成为模型输出合同
系统 SHALL 将工具调用 id、trace id、validated visible output metadata、history fact provenance 和服务端内部资源摘要保留在服务端边界内。模型可见内容 MAY 包含脱敏业务事实和数据库业务 id，但 MUST NOT 要求模型复制内部引用 id。

#### Scenario: 模型摘要不暴露内部引用
- **WHEN** tool wrapper 生成 model-visible summary
- **THEN** summary MUST 保留模型判断下一步所需的业务事实、成功/失败状态、约束和诊断摘要
- **AND** summary MUST NOT 要求模型在后续 tool input 或 final response 中引用 `toolResultId`、`resourceId`、`factRef`、`messageId` 或 trace id
- **AND** 如 trace 仍记录这些字段，字段 MUST 留在 trace / server metadata，不作为模型输出合同的一部分

#### Scenario: 内部事实不绕过业务 validator
- **WHEN** 服务端内部事实被用于后续 tool handler、visible output validation、trace 或 persistence
- **THEN** 服务端 MUST 继续校验权限、schemaVersion、状态、resource type、数据库事实和当前用户可访问性
- **AND** `visibleTrainingProposal` 最终输出仍 MUST 通过 payload、prescription、schedule、动作数据库和 section 边界校验
- **AND** runtime MUST NOT 因内部事实曾经存在就绕过最终业务 validator

### Requirement: 测试必须覆盖 LangChain tool 合同
系统 SHALL 使用自动化测试覆盖 LangChain tool wrapper、production catalog、runtime budget、tool execution trace、structured final response 和 response adapter 投影边界。

#### Scenario: tool-level tests
- **WHEN** 新增或修改 tool wrapper
- **THEN** 测试 MUST 覆盖 input schema invalid、handler success、output schema invalid、timeout 或失败摘要中的相关分支
- **AND** 测试 MUST 断言 model-visible summary 不泄漏 secret、raw database object 或内部引用 id

#### Scenario: runtime tests
- **WHEN** 新增或修改 LangChain runtime、catalog 或 response adapter
- **THEN** 测试 MUST 覆盖 provider tool call 执行、budget exhausted、structured final response validation、validated visible output projection 和 terminal failure finalizer/fallback
- **AND** 测试 MUST NOT 依赖用户原文关键词或具体 phrasing 判断工具选择是否成功

### Requirement: LangChain tool model-visible summary 必须只表达事实和确定性诊断
系统 SHALL 将所有生产 LangChain tool 的 `toModelVisibleSummary()` 限定为模型可见事实摘要和确定性诊断。Summary MUST 表达工具执行事实、查询事实、受控业务事实、字段级错误、权限 / schema / validator 诊断和可安全展示的有限业务摘要；MUST NOT 表达用户业务目标是否满足，也 MUST NOT 指导模型下一步必须调用哪个业务 tool 或按哪个固定 workflow 收口。

#### Scenario: summary 不暴露业务目标满足度字段
- **WHEN** 任意生产 LangChain tool 生成 model-visible summary
- **THEN** summary MUST NOT 包含 `fulfillment`
- **AND** summary MUST NOT 包含 `satisfied`
- **AND** summary MUST NOT 包含 `fulfillment.satisfied`
- **AND** summary MUST NOT 使用 `satisfied = true` 或 `satisfied = false` 表达该 tool result 是否能完成用户目标
- **AND** summary MAY 使用事实等级字段表达结果类型，例如 `factLevel = "query_facts"`、`"resolved_candidates"`、`"diagnostic"` 或 `"validated_output"`

#### Scenario: summary 不承载下一步 workflow 指导
- **WHEN** 任意生产 LangChain tool 生成 model-visible summary
- **THEN** summary MUST NOT 包含 `visibleDeliveryBoundary`
- **AND** summary MUST NOT 包含 `supportSectionCompletionBoundary`
- **AND** summary MUST NOT 包含 `routinePlanCompositionBoundary`
- **AND** summary MUST NOT 包含 `supportsOutputKinds`
- **AND** summary MUST NOT 包含 `nextActionHints`、`finalAnswerSupport`、`supportsSuccessfulVisibleOutputs` 或等价下一步指导字段
- **AND** summary MUST NOT 包含“下一步应调用某 tool”“缺少某 section 应继续查询”“若要交付应调用结构化收口 tool”或等价固定 workflow 文案

#### Scenario: summary 保留可恢复诊断但不替模型决策
- **WHEN** tool input schema、handler output schema、业务 validator 或数据库事实校验失败
- **THEN** model-visible summary MUST 表达稳定错误 code、字段 path、expected、actual、allowedValues、当前事实覆盖或 diagnostics
- **AND** summary MUST 表达失败结果不能伪装成成功事实
- **AND** summary MUST NOT 根据用户原文、具体 `toolName`、字段组合或业务 section 替模型选择后续 tool、固定回答或固定结构化输出

#### Scenario: repair feedback 不输出下一步 action 枚举
- **WHEN** tool schema、domain validator、finalization validator、duplicate input 或 runtime 预算生成模型可见 repair feedback
- **THEN** feedback MAY 表达错误 code、字段 path、expected、actual、allowedFields、requiredFields、allowedValues、当前事实覆盖和可恢复边界
- **AND** feedback MUST NOT 包含 `nextActionHints`
- **AND** feedback MUST NOT 包含 `final_answer_with_visible_outputs`
- **AND** feedback MUST NOT 包含 `final_answer_without_visible_outputs`
- **AND** feedback MUST NOT 包含 `final_answer_with_current_tool_result`
- **AND** feedback MUST NOT 包含 `continue_tool_call`
- **AND** feedback MUST NOT 包含 `ask_user` 作为下一步建议
- **AND** feedback MUST NOT 根据用户自然语言、具体 phrasing、具体业务 `toolName` 或字段组合改写下一轮 tool call 或最终回答策略

### Requirement: LangChain tool description 必须描述能力边界而非业务编排
系统 SHALL 让生产 LangChain tool 的 description、schema description 和 examples 只描述该 tool 的稳定资源、能力、输入来源、输出事实含义和确定性边界。Tool description MUST NOT 承担完整业务 workflow、Planner policy 或 finalization 编排职责。

#### Scenario: description 不写固定调用流程
- **WHEN** production tool catalog 序列化任意 LangChain tool
- **THEN** tool description MUST NOT 根据用户短句、关键词、正则、同义词表或具体 phrasing 规定必须调用该 tool
- **AND** tool description MUST NOT 规定“先调用 A，再调用 B”的固定业务流程
- **AND** tool description MUST NOT 表达成某个 tool result 缺少某字段或某 section 时必须调用指定业务 tool
- **AND** tool description MUST 使用中文描述业务含义，`toolName`、字段名、enum、schema id 和代码标识符保持英文原样

#### Scenario: schema description 只写字段来源和确定性边界
- **WHEN** production tool catalog 序列化任意 LangChain tool input schema
- **THEN** schema description MUST 表达字段可用值、输入来源、结构边界和本工具特有约束
- **AND** schema description MUST NOT 写完整训练生成 workflow
- **AND** schema description MUST NOT 把服务端 validator、runtime budget 或 response adapter 的职责复制为该字段的业务下一步说明

### Requirement: submitVisibleTrainingProposal 模型可见说明必须只描述 finalization 和 validator 边界
系统 SHALL 将 `submitVisibleTrainingProposal` 作为结构化训练输出 finalization tool。它的模型可见 description、schema description、accepted summary 和 rejected summary MUST 只描述提交结构、服务端 validator、accepted / rejected 事实和确定性 diagnostics；MUST NOT 指挥模型补查特定业务 tool 或补齐固定训练 section。

#### Scenario: accepted summary 表达已验证输出事实
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "accepted"`
- **THEN** model-visible summary MUST 表达结构已通过服务端 validator
- **AND** summary MAY 表达 validated visible output 的有限摘要、payload kind、section coverage 和可渲染状态
- **AND** summary MUST NOT 要求模型复制内部 `resourceId`、`toolResultId`、`factRef`、`messageId` 或 trace id

#### Scenario: rejected summary 只表达确定性失败事实
- **WHEN** `submitVisibleTrainingProposal` 返回 `status = "rejected"`
- **THEN** model-visible summary MUST 表达 rejected 状态、错误 code、字段 path、expected、actual、allowedValues、section coverage 或 validator diagnostics
- **AND** summary MUST 表达 rejected payload 不会渲染为训练卡片或保存为已展示事实
- **AND** summary MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定 tool 流程
- **AND** summary MUST NOT 指导模型补查 `warmup`、`training`、`stretch` 或其他固定业务 section
- **AND** summary MUST NOT 根据具体业务字段组合替模型选择下一步
- **AND** summary MUST NOT 包含 `nextActionHints`、`final_answer_with_visible_outputs`、`continue_tool_call`、`ask_user` 或等价下一步 action 枚举

#### Scenario: finalization tool 不承担动作查询职责
- **WHEN** production catalog 序列化 `submitVisibleTrainingProposal` description 或 schema description
- **THEN** description MUST 表达该 tool 只提交并校验模型已经构造的结构化训练输出
- **AND** description MUST NOT 表达该 tool 会查询动作库、自动补全动作、保存计划、生成处方或替模型选择动作
- **AND** 若结构需要动作事实，description MUST 只表达动作 id 和 section 会被服务端基于数据库事实校验
