## Context

`remove-current-agent-core-layer` 已将旧运行时 AI/Agent 流程整体下线，当前 `/api/chat` 只返回 `chat_ai_disabled`。随后 M0/M1/M2 已在新 `lib/server/agent-core/**` 中完成通用 runtime、ToolRegistry、Action Validator、Policy Guard、ResourceStore、Response Renderer、`LlmPlanner`、DeepSeek adapter、redaction、budget、idempotency 和 prompt injection 防护，但这些能力仍未接入 production `/api/chat`。

本 change 的目标是恢复首页聊天的最小真实 AI 闭环：用户消息进入 `/api/chat`，通过新 `agent-core` 生成文本回答或澄清问题，再用 NDJSON 推给前端。此阶段不接任何具体业务 tool，不生成训练卡片，不保存 artifact，不查询动作库，也不恢复旧 `AgentOrchestrator`。

## Goals / Non-Goals

**Goals:**

- 让 production `/api/chat` 从禁用响应切换为新 `agent-core` 的文本聊天执行链路。
- 保留现有请求 schema、服务端 hydration、`conversationId`、`responseMessageId`、当前用户身份和前端历史保存能力。
- 使用空 `ToolRegistry` 跑通 `final_answer`、`ask_user`、非法 `tool_call` 拒绝、错误收口和默认 Response Renderer。
- 使用 `LlmPlanner + DeepSeekModelAdapter` 作为生产 planner，模型输出仍只进入 `AgentAction` candidate。
- 前端恢复 NDJSON 流式消费，只处理通用事件，不恢复旧业务卡片事件。
- 增加测试和架构扫描，证明本阶段不注册 fixture tool、真实业务 tool 或关键词分流。

**Non-Goals:**

- 不接入 `searchExercises`、动作详情查询、训练生成、计划生成、保存 revision、用户记忆或数据库业务 tool。
- 不新增 `agent-tools/<domain>` 业务目录。
- 不恢复旧 `lib/server/agent-orchestrator/**`、旧 `AgentExecutionResult`、旧 Response Writer、旧 `assistant_action`、旧 intent-first prompt 或旧兼容事件。
- 不新增持久化 `ConfirmationStore`、真实 `/api/agent/confirm` 路由或 trace 持久化表。
- 不修改 Prisma Schema、数据库迁移、训练计划领域规则或动作选择规则。
- 不启动 dev server 或要求浏览器验证；本阶段以类型检查、单测和 route/client 自动化验证为主。

## Decisions

### 1. 用聊天接入服务做薄适配，不改 `agent-core`

新增或恢复的聊天服务只负责把 `PreparedChatRequest`、当前用户和请求级 metadata 转换为 `AgentRunInput`，再调用 `runAgentRuntime()` 和 `renderAgentResponseEvents()`。`agent-core` 不读取 HTTP request，不知道 `/api/chat`，也不依赖聊天 UI、DeepSeek 环境变量或业务上下文结构。

取舍：直接把聊天逻辑写进 runtime 会让 core 开始感知业务入口；保留薄适配层可以让后续其它入口复用 core，同时让 `/api/chat` 的职责符合架构文档。

### 2. 本阶段使用空 `ToolRegistry`

生产文本聊天阶段构造 `new ToolRegistry()`，不注册 M0/M1 fixture tools，也不注册任何真实业务 tool。模型可见 manifest 为空，正常情况下只能返回 `final_answer` 或 `ask_user`。如果模型仍返回 `tool_call`，由 Action Validator 以未知工具或不可用工具错误拒绝，并按 runtime repair / failure 预算收口。

取舍：在 `/api/chat` 中手写“禁止 tool_call”会变成新的特殊规则；空 registry 让通用合同自然表达当前能力边界，也能测试非法 tool 请求不会执行。

### 3. DeepSeek 构造留在 planner 边界

生产聊天接入层可以通过一个小型 factory 读取 `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL` 等既有环境变量并创建 `LlmPlanner(new DeepSeekModelAdapter(...))`。如果缺少必需配置，`/api/chat` 返回结构化配置错误，不伪装成模型失败或旧运行时下线。

取舍：让 `agent-core` 读取环境变量会污染模型无关边界；在 route 中散落 DeepSeek 构造又会难以测试。factory 保持可替换，也方便测试注入 fake planner / fake adapter。

### 4. 不限制模型语义，只限制可执行合同

本阶段不在服务端判断用户是不是想要推荐、计划、闲聊或澄清。模型可以基于消息返回普通文本回答或追问。服务端只校验 action 结构、registry 可用性、terminal grounding、预算和安全投影。没有业务 tool 时，模型不得通过服务端分支获得任何业务执行能力。

取舍：用关键词把“训练计划”拦成错误能减少模型误判，但违反项目 AI 语义边界。当前阶段应该让模型自然回答能力范围内的问题，并通过空 registry 明确不能执行工具。

### 5. NDJSON 只恢复通用事件

后端使用默认 Response Renderer 产生 `content`、`assistant_suggestions`、`error`、`done`，以及理论上的 `confirmation_request` / `tool_result` 白名单事件。由于空 registry 不会产生业务 tool result，前端本阶段只需要消费文本、建议、错误和完成事件。后续业务 card event 必须由对应业务 tool 的安全 projection 独立接入。

取舍：恢复旧 `assistant_action` 或卡片事件可以更快显示旧 UI，但会重新引入旧执行合同。先恢复通用事件能证明聊天闭环，同时不给业务结果编造来源。

### 6. 前端流式解析负责 UI 状态，不负责业务推断

`features/chat/api/chat-client.ts` 应提供 NDJSON stream 读取能力，能处理分块、空行、解析错误、abort 和 HTTP 错误。`use-chat-controller` 只把 `content` 追加到当前 assistant bubble，把 `assistant_suggestions` 写入现有建议字段，把 `error` 写入错误状态，并在 `done` 或 abort 后清理 loading。

取舍：让 hook 直接操作 `fetch` 流可以少一层文件，但会把协议解析和 UI 状态混在一起。独立 client helper 更容易测试，也便于后续加入新的白名单事件。

### 7. 测试优先覆盖生产边界

自动化测试应覆盖：

- route 成功返回 NDJSON 并投影 `final_answer`。
- route 能投影 `ask_user` 和建议回复。
- 缺少 DeepSeek 配置时返回稳定配置错误。
- 空 registry 下非法 `tool_call` 不执行任何 handler。
- 前端 client 能解析多行和跨 chunk NDJSON。
- 架构扫描证明 `/api/chat` 不注册 fixture tool、真实业务 tool，不包含业务关键词分流，不导入旧 `agent-orchestrator`。

取舍：真实 DeepSeek 黑盒可作为 gated 验证，但不应成为普通单测前置条件。默认测试使用 fake planner / fake adapter 保持稳定。

### 8. 文档更新只记录真实阶段，不提前写业务 tool

实现阶段需要更新 `docs/agent-tool-orchestrator-design.md`，把 production text chat flow 记录为 M2 之后的独立接入阶段。若代码实现涉及核心链路变化，还需要按项目规则更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`。这些文档不得宣称真实业务 tool 已接入。

取舍：不更新架构文档会让 M2 “未接 production `/api/chat`”的状态过期；但提前描述业务 tool 会误导后续实现边界。

## Risks / Trade-offs

- [Risk] 模型看到空 manifest 后仍尝试调用不存在的 tool。→ Mitigation：由 Action Validator 和 runtime repair / failure 预算收口，并测试未知 tool 不执行。
- [Risk] 用户提出具体训练生成请求时，只能得到文本回答或追问，不能生成卡片。→ Mitigation：用户可见文案应诚实表达当前能力，不承诺已生成训练卡片；业务 tool 留给后续 change。
- [Risk] 前端 NDJSON 解析失败导致 assistant bubble 卡在 loading。→ Mitigation：client helper 覆盖跨 chunk、非法 JSON、abort、HTTP 错误和 done 收尾测试。
- [Risk] route 为了可用性重新引入旧事件或 fixture tool。→ Mitigation：架构扫描和测试明确禁止旧 `assistant_action`、旧 `AgentExecutionResult`、fixture registry 和真实业务 tool 注册。
- [Risk] DeepSeek 环境变量缺失时开发者误以为聊天 runtime 坏了。→ Mitigation：返回明确 `chat_ai_not_configured` 或等价配置错误，并在测试中固定错误码。

## Migration Plan

1. 新增聊天 Agent 接入服务和 planner factory，将 `PreparedChatRequest` 转成 `AgentRunInput`。
2. 修改 `/api/chat`，从 `createChatUnavailableResponse()` 切换到文本聊天 NDJSON 响应。
3. 修改前端 chat client 和 `use-chat-controller`，恢复 NDJSON 流式消费。
4. 增加 route、service、client、hook 和架构扫描测试。
5. 更新架构文档和项目演变文档，运行 OpenSpec 校验、相关测试和 `npm run typecheck`。
6. 回滚策略：保留 `prepareChatRequest()` 和页面壳；如生产接入失败，可移除新增接入服务与前端 stream client，临时恢复禁用响应，但不得恢复旧 Agent runtime。

## Open Questions

无。本 change 只接入无业务 tool 的文本聊天。真实动作库、训练生成、保存、用户记忆、持久化 confirmation 和真实 trace 表均留给后续独立 change。
