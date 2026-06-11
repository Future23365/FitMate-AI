## Context

当前 `/api/chat` 已迁移到 LangChain Agent Runtime 和 DeepSeek native tool calling。主链失败后，`createLangChainAgentResponseProjection()` 会依据 `LangChainAgentRunFailure.code` 直接输出确定性 fallback。旧 `terminal-failure-finalizer.ts` 已随旧 `agent-core` 删除，不再是生产链路的一部分。

最新 trace 证明：模型多轮 tool calling 成功执行，但 `submitVisibleTrainingProposal` 首次在 wrapper schema 层失败，随后又因为 LangChain recursion / tool budget 到达上限而被归类为 `budget_exhausted`，最终投影为 `budget_timeout_fallback`。这类失败有足够的结构化事实可给用户解释，但不应被模型继续当成主 Agent 成功结果。

## Goals / Non-Goals

**Goals:**

- 在 LangChain 主 Agent 失败后恢复一次 terminal failure finalizer 模型调用。
- finalizer 输出只作为普通聊天回复，且只允许 `content` 和可选 `suggestedQuestions`。
- finalizer 输入只包含脱敏、结构化、可恢复的失败事实，不暴露完整 raw payload、secret、完整 prompt 或跨用户数据。
- finalizer 成功与主 Agent 成功在 trace 和 projection type 中明确区分。
- finalizer 不可用时继续使用现有确定性 fallback，保证 stream 必定结束。

**Non-Goals:**

- 不恢复旧 `agent-core`、旧 `PlannerPort`、旧 `AgentAction` JSON 或旧 Response Renderer。
- 不新增业务 tool，不修改 `submitVisibleTrainingProposal` 的输入 schema 或训练方案 validator。
- 不让 finalizer 输出 `visible_output`、tool call、artifact、训练事实或数据库写入。
- 不用用户原文关键词、正则、同义词表或具体 phrasing 做服务端语义分流。

## Decisions

### Decision 1: 新增 LangChain 专用 finalizer adapter，而不是恢复旧文件

选择：新增 `lib/server/langchain-agent/terminal-failure-finalizer.ts`，依赖当前 `LangChainAgentRunFailure`、当前 DeepSeek model factory、Zod 输出 shape 和 response adapter 事件投影。

原因：旧 finalizer 依赖旧 `agent-core` 的 `AgentRunInput`、`AgentRunResult`、`ToolError`、旧 trace event 和旧 prompt config。直接恢复会把已经迁移掉的旧核心合同重新带回生产链路。

取舍：会少量复制旧 finalizer 的“失败摘要 -> 模型回复 -> shape 校验”思想，但不复用旧 runtime 类型和旧 action 合同。

### Decision 2: finalizer 插入在 service 层，而不是 LangChain runtime 主循环

选择：`createLangChainAgentTextChatResponse()` 在得到失败的 `LangChainAgentRunResult` 后调用 finalizer，finalizer 成功则把输出交给 response adapter；失败则使用原 `result` 走确定性 fallback。

原因：finalizer 是主 Agent 失败后的用户体验兜底，不是 planner repair，不应消耗业务 tool 预算或改变 runtime 停止条件。service 层拥有 request、currentUser、trace 和 projection 上下文，适合做失败收口协调。

取舍：response adapter 需要接受可选 `terminalFailureFinalizerOutput`，但不会认识具体业务 tool 或具体用户 phrasing。

### Decision 3: finalizer 输入使用稳定失败事实摘要

选择：输入包含 `failureCategory`、`errorCode`、`userRequestSummary`、`failedToolExecutions`、`schemaIssues`、`verifiedFactsSummary` 和 `allowedResponseMode`。

原因：这符合 `docs/llm-prompt-guidance.md` 的分层：Runtime Context 给当前事实，Prompt 引导表达，Schema 校验输出 shape，Validator 不重新理解用户意图。

取舍：当前 trace 若只记录了 redacted payload，finalizer 只能解释稳定错误码和 schema path，不能还原具体无效字段值；这是正确的安全边界。

### Decision 4: 输出 shape 校验只做结构边界

选择：finalizer 输出 schema 只接受非空 `content` 和最多 3 条非空 `suggestedQuestions`。不再对中文文案做固定短语命中或成功词扫描。

原因：finalizer 的职责是失败后的普通回复，不是又一层语义裁判。主 Agent 的 visible output、训练事实、tool result 和持久化边界仍由原 validator 和 response adapter 保证。

取舍：finalizer 文案质量主要由 prompt 控制；如果文案不理想，后续应调 prompt 或输入摘要，而不是加入服务端关键词拦截。

## Risks / Trade-offs

- [Risk] finalizer 也可能失败或超时。→ Mitigation：保留现有确定性 fallback，任何 finalizer 失败都必须输出 `done`。
- [Risk] 用户误以为原训练方案已经生成。→ Mitigation：prompt 明确要求说明主任务未完成，response adapter 不输出 `visible_output`，trace 区分 `terminal_failure_finalizer`。
- [Risk] 输入摘要泄漏 raw payload。→ Mitigation：只使用 `LangChainAgentToolExecution` 的安全摘要、`schemaIssues` 和裁剪后的 trace summary，不传完整 raw tool input。
- [Risk] finalizer 变成隐藏业务编排器。→ Mitigation：不暴露 tool manifest，不允许 tool call，不读取用户原文做服务端分流，只基于主 Agent 失败事实生成普通回复。
