# 实现记录

## 1.x 迁移前审计和依赖确认

### 1.1 Git 工作区

- 当前分支：`dev`
- 检查命令：`git status --short --branch`
- 检查结果：只有 `## dev`，没有未提交文件。

### 1.2 当前生产链路

当前生产 `/api/chat` 链路仍是旧自研 Agent core：

```txt
app/api/chat/route.ts
  -> requireCurrentUser()
  -> chatRequestSchema.safeParse()
  -> getChatConversationById()
  -> prepareChatRequest()
  -> createAgentTextChatResponse()
```

`createAgentTextChatResponse()` 内部继续执行：

```txt
createProductionTextChatRegistry()
  -> createProductionToolRegistry()
  -> ToolRegistry 注册 inspectVisibleTrainingProposals / resolveExerciseResourceMentions / searchExerciseResources

createProductionAgentTextChatPlanner()
  -> new LlmPlanner(new DeepSeekModelAdapter(...))

runAgentRuntime()
  -> 旧 AgentAction validator / policy / executor / observation / response renderer
  -> renderAgentResponseEvents()
  -> NDJSON content / visible_output / assistant_suggestions / done
```

trace 写入仍围绕旧 runtime：

```txt
planner_action
duplicate_tool_call
ToolRegistry manifest snapshot
AgentRunResult
旧 Response Renderer projection
DeepSeekModelAdapter model diagnostics
```

现有生产业务 tool：

```txt
inspectVisibleTrainingProposals
resolveExerciseResourceMentions
searchExerciseResources
```

这些 tool 的 handler、Zod schema、领域 service / repository 调用、`toModelObservation`、`toUserProjection` 和 trace 摘要逻辑可复用为 LangChain wrapper 的领域边界，但旧 `defineTool` / `ToolRegistry` / `AgentAction` wrapper 不再作为生产合同保留。

### 1.3 LangChain JS DeepSeek 接入选择

实现选择：使用 LangChain JS 官方 `@langchain/deepseek` 的 `ChatDeepSeek` 作为模型接入，配合 LangChain agent / tool abstraction。

选择理由：

- LangChain JS 官方文档已经提供 `ChatDeepSeek integration`，包名是 `@langchain/deepseek`，并标记支持 tool calling 和 structured output。
- 相比 OpenAI-compatible `ChatOpenAI`，`ChatDeepSeek` 直接表达 DeepSeek provider 边界，减少 baseURL / provider option 兼容层的歧义。
- 相比项目自定义 LangChain ChatModel adapter，官方 integration 更贴近本 change “减少自研模型 loop / adapter”的目标。
- DeepSeek 官方 Chat Completion API 当前模型枚举包含 `deepseek-v4-flash` 和 `deepseek-v4-pro`；项目现有默认模型是 `deepseek-v4-flash`，迁移后继续从集中配置读取，不在 route 或 tool wrapper 局部硬编码。
- LangChain 文档提示 `deepseek-reasoner` 不支持 tool calling / structured output，因此生产 tool calling 默认不选 `deepseek-reasoner`。

### 1.4 DeepSeek native Tool Calling 合同确认

DeepSeek 官方 Chat Completion API 当前支持：

- 请求参数 `tools`，当前只支持 `function` tool，最多 128 个 function。
- 请求参数 `tool_choice`，支持 `none`、`auto`、`required` 或指定 function name。
- assistant message 返回 `tool_calls[]`，每个 tool call 包含 `id`、`type: "function"`、`function.name` 和 JSON 字符串形态的 `function.arguments`。
- tool result message 使用 `role: "tool"` 和 `tool_call_id` 关联模型返回的 tool call。
- 官方文档明确 `function.arguments` 可能不是合法 JSON，也可能包含 schema 未定义参数，业务代码必须在执行前校验。
- `strict` mode 是 beta，需要 beta base URL、`function.strict: true` 和服务端支持的 JSON Schema 子集；本 change 的服务端 Zod 校验不能依赖 provider strict mode。

已补最小 provider contract fixture / test：

```txt
lib/server/langchain-agent/deepseek-provider-contract.ts
tests/langchain-agent-runtime/deepseek-provider-contract.test.ts
```

### 1.5 旧 core 可复用与删除边界

可复用的纯领域逻辑：

- `lib/server/exercises/**` repository / policy / resource summary。
- `lib/server/visible-training-proposals/**` fact store、validator、renderer registry 和可见训练方案领域合同。
- 现有业务 tool 中的 input/output Zod schema、handler 调用的领域 service、模型可见摘要、用户投影和 trace 摘要逻辑。
- `/api/chat` 认证、请求校验、conversation hydration、response message id、幂等 user turn 处理、chat history persistence。
- `lib/server/dev/**` 中与 trace 存储、HTTP 导出、长文本外置相关的非旧 AgentAction 专属能力。
- `lib/server/usage/**` token usage summary 记录能力。

必须删除或迁移的旧 runtime 逻辑：

- `lib/server/agent-core/**` 中的 `AgentAction`、`PlannerPort`、`ToolRegistry`、`defineTool`、Executor、ResourceStore 主链、Action Validator、Response Renderer、Replay summary 和旧 trace event 合同。
- `lib/server/agent-planners/**` 中的 `LlmPlanner`、`DeepSeekModelAdapter` 和旧 model adapter contract。
- `tests/agent-core/**` 和 `tests/agent-tools/**` 中只验证旧 `AgentAction` / `ToolRegistry` / `runAgentRuntime()` 的测试。
- `manual-tests/llm/**` 中依赖旧 AgentAction / PlannerPort / ToolRegistry 报告字段的 fixture、assertion 和 runner。
- docs 中把当前生产链路描述为旧 `PlannerPort -> AgentAction -> ToolRegistry -> Response Renderer` 的内容。

## 4.x LangChain Tool Wrapper 迁移和抽象层级检查

### 2.4 配置消费测试补充

当前配置消费覆盖：

- `tests/langchain-agent-runtime/model-factory.test.ts`：`ChatDeepSeek` model factory 从集中配置和 env resolver 读取默认 model / endpoint。
- `tests/langchain-agent-tools/production-tool-catalog.test.ts`：production tool catalog 和 tool timeout 从集中配置读取。
- `tests/langchain-agent-runtime/response-adapter.test.ts`：NDJSON visible output 投影裁剪使用 `agentRuntimeConfig.langChain.trace.ndjsonProjectionPreviewMaxLength`。
- `tests/api-routes.test.ts`：`/api/chat` 配置缺失通过新 LangChain service 返回稳定 503 + NDJSON error。

### 4.2 生产只读 tool 迁移

已新增独立 LangChain tool catalog：

```txt
lib/server/langchain-agent/tools/production-tool-catalog.ts
lib/server/langchain-agent/tools/exercise-resource-tools.ts
lib/server/langchain-agent/tools/visible-training-proposal-tools.ts
```

当前迁移的 production tool：

- `inspectVisibleTrainingProposals`
- `resolveExerciseResourceMentions`
- `searchExerciseResources`

新 tool 不 import 旧 `defineTool`、旧 `ToolRegistry`、旧 `AgentAction` 或旧 executor。领域读取继续调用稳定 service / repository：

- `listRecentVisibleTrainingProposalSummaries()`
- `resolveExerciseResourceMentionSummaries()`
- `searchExerciseResourceSummaries()`
- `getExerciseResourceSummariesByIds()`
- `buildExerciseResourceFilterApplication()`

### 4.3 抽象层级检查

`inspectVisibleTrainingProposals`

- resource type：`visible_training_proposal_fact`
- 能力族：`read / inspect`
- 同类变体：历史可见训练方案事实读取，当前只暴露 `operation = "list_recent"`。
- 命名理由：inspect 表示读取当前 actor 和 conversation 可见的业务事实，不表示生成、保存或渲染训练计划。
- 边界：不接受 `userId`、`conversationId`、`factRef`、`messageId`、`resourceId`、`toolResultId`、`limit` 或 `cursor`；权限范围由服务端 context 注入。

`resolveExerciseResourceMentions`

- resource type：发布态 `Exercise` 候选摘要。
- 能力族：`query / resolve`
- 同类变体：结构化 mention 文本到动作库候选解析。
- 命名理由：resolve 表示解析模型已经结构化提取的动作点名，不读取完整用户原文，不做语义分流。
- 边界：`mentions[].text` 只接受单个点名动作；`matched` 或模型选择后的 ambiguous 候选只可作为 `searchExerciseResources.requiredExerciseIds` 正向锚点，不能直接写入训练方案动作项。

`searchExerciseResources`

- resource type：section-scoped 发布态 `Exercise` 动作事实。
- 能力族：`query / search`
- 同类变体：按 facet、section、器械、肌群、动作 id anchor 查询动作候选。
- 命名理由：search 表示动作库事实查询，不表示训练计划生成、历史方案读取、分页浏览或向量语义召回。
- 边界：`suitabilities`、`requiredExerciseIds`、`excludeExerciseIds`、`filterApplications` 承载结构化 filter / sort / resource reference；不接受 `limit`、`page`、`offset`、`userId`、任意 SQL 或自然语言关键词路由。

### 4.4 模型可见合同语言

- 说明性自然语言默认使用中文。
- `toolName`、字段名、枚举值、resource type、provider 字段保持英文。
- tool description / schema description 只说明能力、输入形状、事实边界和失败含义，不包含“当用户说某句话时必须调用某 tool”的 phrasing 规则。
- 没有新增服务端自然语言判断、关键词规则、同义词表、短句模板或特定 trace 分支。

### 4.5 Tool-level tests

新增直接覆盖 LangChain wrapper 的测试：

```txt
tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts
tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts
tests/langchain-agent-tools/search-exercise-resources.test.ts
tests/langchain-agent-tools/production-tool-catalog.test.ts
```

覆盖内容：

- wrapper 成功路径
- schema 拒绝
- actor-scoped 权限上下文
- 领域边界和诊断输出
- handler 失败归一化
- model-visible summary
- user projection
- trace summary
- production catalog 白名单和 fixture 排除

## 5.x Prompt 和模型可见合同检查

### 5.1 LangChain agent prompt builder

已新增：

```txt
lib/server/langchain-agent/prompt.ts
```

该 prompt builder 只定义稳定顶层策略：

- AI 健身助手角色。
- DeepSeek native tool calling 规则。
- 服务端认证、权限隔离、Zod 校验、数据库事实校验和 NDJSON 投影边界。
- 不得伪造工具成功、保存、确认或卡片生成。
- 最终回答中文、简洁、可执行。

prompt 不再要求模型输出旧 `{ type: "tool_call" | "final_answer" | "ask_user" }` 自定义 `AgentAction` JSON。

### 5.3 分层检查

对照 `docs/llm-prompt-guidance.md`：

- Prompt：只放角色、工具调用原则、安全边界、服务端校验边界和回答风格。
- Schema：由 LangChain wrapper 的 Zod `inputSchema` / `outputSchema` 约束字段形状。
- Tool：tool description 说明能力、输入边界、事实来源和不能支撑的行为。
- Runtime：`runLangChainAgentRuntime()` 注入 actor context、tool wrappers、AbortSignal、预算和 trace 摘要。
- Validator：wrapper 在 handler 前校验 input，在 handler 后校验 output；后续结构化训练输出仍需 response adapter / validator 收口。

### 5.4 模型可见合同测试

已有测试覆盖：

```txt
tests/langchain-agent-runtime/runtime.test.ts
tests/langchain-agent-tools/production-tool-catalog.test.ts
tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts
```

断言内容：

- prompt 不包含旧 `AgentAction`、`ToolRegistry`、`PlannerPort`、`final_answer` 或 `ask_user` 合同词。
- production tool descriptions 不包含旧 core 合同词。
- model-visible tool result 不包含“必须调用 searchExerciseResources”这类强制 tool chaining phrasing。
- `rg` 检查新 `lib/server/langchain-agent` 生产代码未出现旧 core 术语或用户短句触发规则。

## 6.x Response Adapter 和结构化输出收口

### 6.1 / 6.2 NDJSON 白名单投影

已新增：

```txt
lib/server/langchain-agent/response-adapter.ts
tests/langchain-agent-runtime/response-adapter.test.ts
```

新 adapter 消费 `LangChainAgentRunResult`，输出受控事件：

- `content`
- `visible_output`
- `suggested_questions`
- `error`
- `done`

模型最终消息、DeepSeek provider payload、LangChain raw tool output 和 wrapper `userProjection` 不会直接作为任意前端事件透传。tool execution 只进入 projection summary / trace 摘要；只有已经由服务端提供的 `validatedVisibleOutputs` 才会渲染为 `visible_output`。

失败投影：

- `config_missing` -> `error` + `done`，不暴露 `DEEPSEEK_API_KEY` 等内部配置细节。
- `provider_error` / `provider_timeout` -> 安全 content fallback + `suggested_questions` + `done`。
- `budget_exhausted` -> 安全 content fallback + `suggested_questions` + `done`。
- tool schema / handler / timeout / unknown tool -> 安全 content fallback + `suggested_questions` + `done`。

### 6.3 结构化训练输出收口选择

实现选择：采用“专用 finalization tool / validator result -> response adapter”的收口方向，不从 LangChain final text 中用正则或自然语言猜测训练 JSON。

选择理由：

- final text 面向用户自然语言，不应成为训练卡片事实来源。
- 训练方案、routine、plan 必须先经过服务端 validator，尤其是 `exerciseId` 数据库事实校验和 section coverage 校验。
- response adapter 只接受已经标记为 `validatedVisibleOutputs` 的结构化输出，未通过 validator 的结构不会产生 `visible_output`。

已完成生产接入：

- 新增 `lib/server/visible-outputs/**`，把结构化可见输出 envelope、validator registry 和 renderer registry 从旧 `agent-core` 类型中抽出。
- `visibleTrainingProposal` validator / renderer 改为依赖通用 `visible-outputs` 合同；旧自研聊天服务只通过 `legacy-visible-training-proposal-*.ts` 适配，避免新 LangChain 链路依赖旧 core 类型。
- 新增 `submitVisibleTrainingProposal` LangChain tool，作为训练方案、动作推荐、routine、plan 的结构化终态收口工具。
- 该 tool 不读取用户原文、不做语义分流、不保存或写入用户数据；它只接收模型已经构造好的 `visibleTrainingProposal` payload，运行服务端 validator 和数据库动作事实校验，然后生成 `validatedVisibleOutputs`。
- `/api/chat` 新链路只从成功 tool execution 的 `userProjection.validatedVisibleOutputs` 收集结构化输出，再交给 response adapter 输出 `visible_output`。
- 未通过 validator 的结构只作为模型可见 rejected 诊断进入下一次模型调用，不会输出前端卡片，不会保存训练事实。

4.6 当前结论：本阶段没有迁移或新增写入 / 高风险 tool。`submitVisibleTrainingProposal` 是 validate / finalize 能力，不保存、不覆盖、不写入，不接受 confirmation，也不能让模型自行生成可信 confirmation。

### 6.5 Response adapter tests

测试覆盖：

- 普通文本 -> `content` / `done`
- 澄清建议 -> `content` / `suggested_questions` / `done`
- validator-approved `visible_output`
- config failure -> `error` / `done`
- provider failure
- budget failure
- tool wrapper failure
- projection summary 不泄漏 raw tool output

## 7.x `/api/chat` 生产入口切换

### 7.1 / 7.2 主链切换

已新增：

```txt
lib/server/chat/langchain-agent-text-chat-service.ts
```

`app/api/chat/route.ts` 已从旧 `createAgentTextChatResponse()` 切到：

```txt
createLangChainAgentTextChatResponse()
  -> createProductionLangChainTextChatTools()
  -> createLangChainAgentTextChatMessages()
  -> runLangChainAgentRuntime()
  -> createLangChainAgentResponseProjection()
  -> NDJSON stream
```

保留的 route 外围能力：

- `requireCurrentUser()`
- `chatRequestSchema.safeParse()`
- `getChatConversationById()`
- `prepareChatRequest()`
- `conversationId`
- `responseMessageId`
- `rawMessages`
- conversation hydration 摘要

`/api/chat` 入口当前不再直接调用旧 `runAgentRuntime()`、`LlmPlanner`、旧 `DeepSeekModelAdapter`、旧 `ToolRegistry` 或旧 Response Renderer。

### 7.3 无服务端自然语言分流

新 service 只把请求历史和 hydration 摘要转成模型可见 messages，并从集中配置白名单构造 tools。没有新增基于用户原文关键词、正则、短句模板或同义词表的 tool 选择分支。

### 7.4 当前测试覆盖

已更新：

```txt
tests/api-routes.test.ts
```

当前覆盖：

- `/api/chat` 请求体校验。
- DeepSeek 配置缺失时保持 HTTP 503 + NDJSON `error` / `done`。
- 普通 final text 使用 LangChain / DeepSeek native request，响应 `content` / `done`。
- DeepSeek native `tool_calls` 进入 LangChain production tool catalog，工具结果回到第二次 provider 请求。
- provider 传入非法 tool arguments 时，执行不会进入 repository，模型只看到项目 wrapper 消毒后的 `tool_schema_invalid` 结果。
- provider failure 投影为安全 `content` / `suggested_questions` / `done`，不泄漏 provider 原始错误。
- provider request body 使用 native `tools`，不再把 tool manifest prompt-encode 到旧 planner message。
- route trace 写入 LangChain runtime 摘要和 response projection 摘要。
- `submitVisibleTrainingProposal` 成功时，`/api/chat` 输出 validator-approved `visible_output`，并通过事实桥保存可见训练方案事实。
- `submitVisibleTrainingProposal` validator 拒绝时，`/api/chat` 不输出 `visible_output`，只把 rejected 诊断返回给模型继续收口。
- trace 写入失败时，`/api/chat` 不重试模型、不重复执行 tool、不改变用户可见响应。

## 8.x Trace 和调试视图迁移

### 8.1 LangChain run trace 投影

当前 trace 投影覆盖：

- request context：route、runtime version、userId、conversationId、responseMessageId、messageCount、toolNames 和 hydration 摘要。
- model request summary：输入 message 数、message preview、tool count。
- model response summary：生成 message 数、assistant message 数、tool message 数和 final text preview。
- DeepSeek native `tool_calls`：tool call id、tool name 和 arguments 安全摘要。
- tool wrapper execution：toolName、status、duration、input summary、model-visible summary、user projection、trace summary、failureCode 和是否进入模型上下文。
- structured output validation：`validatedVisibleOutputCount`。
- final NDJSON projection：event types、visible output count、suggestion count、projectionType 和 errorCode。

### 8.2 trace 非致命

`lib/server/chat/langchain-agent-text-chat-service.ts` 中 request context trace、runtime trace 和 response projection trace 都通过 `try/catch` 包裹。测试 `tests/api-routes.test.ts` 已覆盖 `trace.addStep` 抛错时仍返回正常 NDJSON 响应，并且不会触发额外 provider 调用。

## 10.x 文档和 OpenSpec 收口

已更新：

- `docs/architecture.md`：生产聊天链路改为 LangChain Agent Runtime、`@langchain/deepseek`、DeepSeek native `tool_calls`、LangChain tool wrappers 和 production response adapter；同时标明旧 `agent-core` / `agent-planners` 是迁移遗留代码，不再是当前 `/api/chat` 主链。
- `docs/agent-tool-orchestrator-design.md`：顶部标注旧自研 core 设计的历史属性，并把后续新增业务 tool 的默认路径改为 LangChain tool wrapper + production catalog。
- `docs/llm-prompt-guidance.md`：顶部标注 `AgentAction` 示例属于旧自定义 JSON action 设计，当前生产应映射为 native tool calling、tool schema、tool result summary、finalization tool 和 response adapter。
- `docs/方案变更历史/2026-06-11-124534-langchain-agent-runtime.md`：记录旧方案问题、迁移思路、关键改动、验证方式和剩余风险。
- `docs/项目演变历程.md`：追加本次核心链路迁移摘要。

旧设计文档没有整篇删除，因为它仍保留了历史推导和部分治理原则；当前状态已经用顶部说明和第 24-26 节覆盖，避免后续把旧 `AgentAction` / `PlannerPort` / `ToolRegistry` 当作新生产主链要求。

## 11.x 验证

已运行：

```txt
openspec validate replace-agent-core-with-langchain-deepseek-tools --strict
npm test
npm run typecheck
npm run build
rg -n "\b(AgentAction|PlannerPort|ToolRegistry|runAgentRuntime|LlmPlanner|DeepSeekModelAdapter|planner_action|duplicate_tool_call|AgentRunResult)\b" app/api/chat/route.ts lib/server/chat/langchain-agent-text-chat-service.ts lib/server/langchain-agent
git diff --name-status
```

结果：

- OpenSpec strict validate 通过。
- 全量 `npm test` 通过：90 个测试文件，611 个用例。
- `npm run typecheck` 通过。
- `npm run build` 首次在 sandbox 内失败，Turbopack 报 `binding to a port` / `Operation not permitted (os error 1)`；按权限规则在 sandbox 外重跑同一命令后通过。
- 生产新路径旧核心标识扫描无命中；测试中的旧术语只作为反向断言存在。
- `git diff --name-status` 没有 `D` 或 `R`，本阶段没有删除或重命名已跟踪文件。
