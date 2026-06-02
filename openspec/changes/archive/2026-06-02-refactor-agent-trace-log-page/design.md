## Context

`/dev/ai-traces` 最初服务于旧版 intent-first 聊天链路，页面分组和字段解释围绕 intent、reference resolution、tool call、patch proposal、model request / response、validation 和 persistence 展开。当前主链已经迁移到 Tool-first Domain Agent Orchestrator：先构造 `ContextPackage`，再由 Agent 在受控 registry 内做 tool decision / tool execution，随后经过 validator、policy、persistence、Response Writer 和 summary update。

现在的问题不是缺少原始 trace，而是页面默认排查路径仍把旧阶段当主线。开发者看到 Agent trace 时，需要手动从 JSON 中拼出工具序列、依赖 id、最终结果和用户可见回复，导致排查“为什么没推卡”“为什么用了旧动作”“为什么没保存 revision”“为什么 Response Writer 承诺了未执行操作”这类问题成本过高。

本 change 只重构日志页面和必要的 trace 读取/摘要层，不改变 `/api/chat` 的编排语义，不新增数据库表，也不让前端参与 Agent 决策。

## Goals / Non-Goals

**Goals:**

- 让 `/dev/ai-traces` 默认以 Tool-first Agent run 为诊断模型。
- 在详情首屏展示最终结果、用户可见回复、关键资源 id、工具调用序列、失败入口、token / latency 分账和 legacy path 信号。
- 将 `agent_context_build`、`agent_tool_decision`、`agent_tool_result`、validator / policy、persistence、`agent_response_writer`、`agent_summary_update` 组织成可扫描的阶段流。
- 为 tool result 与 candidate set、artifact payload、validation、policy、confirmation、revision 等 id 建立可读关联。
- 对常见失败类型提供聚合视图，减少只看 Raw JSON 的排查成本。
- 保留旧 trace 的兼容展示、Raw JSON、保存全链路 log 和保存用户问答记录。

**Non-Goals:**

- 不修改 AgentOrchestrator 的工具选择、校验、保存或 Response Writer 行为。
- 不新增独立日志系统、数据库表、后端搜索索引或外部可观测性依赖。
- 不把旧 intent-first 字段重新作为主诊断模型。
- 不在页面中做自然语言语义判断；页面只解释服务端已经记录的结构化 trace。
- 不主动改变生产用户可见 UI。

## Decisions

### 1. 页面使用 Agent Trace View Model，而不是在 JSX 中直接堆条件判断

新增或提取一个 `AgentTraceViewModel` 构建层，输入仍是现有 `AiTrace`，输出面向页面展示的数据结构：

- `runSummary`: route、status、finalDecision / `AgentExecutionResult`、用户可见回复、耗时、token usage、legacy path 状态。
- `phaseGroups`: ContextPackage、tool loop、domain gates、persistence、response writer、post-processing、legacy compatibility。
- `toolTimeline`: 按 step index 串联 tool decision、tool result、状态、耗时、失败 code 和关联 id。
- `resourceLinks`: candidateSetId、artifactPayloadId、validationId、policyDecisionId、confirmationId、revisionId 等 id 到相关 steps 的映射。
- `diagnosticFindings`: schema / repair、unknown tool、permission、candidate empty、validation、policy blocked、persistence、response writer、post-processing 等问题类型。

这样做比继续在组件内部追加 `if (step.type === "...")` 更可维护。页面组件只负责渲染稳定 view model；新增 Agent step 或字段解释时优先扩展 view model 和测试夹具。

### 2. Agent run 总览成为默认入口，旧流程成为兼容区

对包含 Agent stages 的 trace，详情区顶部先展示 Agent run 总览，随后展示 Agent phase flow。旧 intent / reference / legacy tool_call 只在兼容区展示，并标记其是否参与生产主链。

对旧 trace 或非聊天 trace，页面继续使用现有流程化展示，但总览需要明确这是 legacy trace，避免开发者误以为缺少 Agent stages 一定是业务失败。

### 3. 工具链路按“决策、执行、依赖、结果”展示

tool loop 不应只是若干 `agent_tool_decision` 和 `agent_tool_result` 卡片。页面需要把同一工具调用的决策、参数摘要、执行结果、失败 code、输出摘要、toolResultId 和下游引用放在同一时间线项中。

当 trace 只能提供部分信息时，view model 应保留缺失状态，例如 `missing_result`、`missing_decision`、`unlinked_result`，并在诊断区展示为可排查问题。页面不应自行猜测缺失字段的语义。

### 4. 资源关联用 id 索引，而不是文本搜索

candidateSetId、artifactPayloadId、validationId、policyDecisionId、confirmationId、revisionId 等字段应通过结构化字段扫描建立索引。页面可以在工具时间线、domain gate、persistence 和 final result 中显示“被谁产生、被谁消费”。

不使用用户文本、step title 或关键词去推断资源关系，避免重新引入服务端语义判断问题。

### 5. 错误聚合按排查入口分组

错误区按 Agent 架构边界组织：

- Context：上下文缺失、artifact payload 未读取、ContextPackage 截断异常。
- Tool Decision：模型输出解析失败、未知工具、非法参数、repair 失败。
- Tool Execution：权限、候选为空、资源不存在、工具超时。
- Domain Gate：validation / policy / confirmation 阻断。
- Persistence：revision 保存失败、幂等冲突、artifact event 缺失。
- Response Writer：用户可见回复缺失、事实引用无法映射、承诺未执行写操作。
- Post-processing：summary update 或后台步骤失败。

每个发现都应链接到相关 step 或 Raw JSON。无法定位 step 时，也要保留 trace-level 诊断项。

### 6. 保存 log payload 随 Agent 视角补充摘要

现有“保存全链路log”和“保存用户问答记录”保留。全链路 log payload 应在原始 trace 之外增加 Agent 诊断摘要，包括 final result、tool timeline、resource links、diagnostic findings 和用户可见回复，便于后续人工复制到 issue 或黑盒报告。

用户问答记录仍只保存用户问题和最终文本回答，不保存动作卡片、候选池、完整 tool payload 或敏感字段。

## Risks / Trade-offs

- [Risk] Agent step 类型继续演进导致页面再次堆满特例。→ Mitigation：先提取 view model 和字段分类表，组件只消费稳定结构；新增 step 只扩展分类表和 fixture。
- [Risk] 旧 trace 可读性下降。→ Mitigation：保留 legacy flow，并在无 Agent stages 时自动回落到旧分组。
- [Risk] 页面展示过多信息，反而难扫描。→ Mitigation：首屏只展示结果、失败入口、工具序列和关键 id；Raw JSON 与低频字段默认收起。
- [Risk] 资源 id 可能存在于不同字段名或嵌套 payload 中。→ Mitigation：只从白名单字段和已知摘要结构提取，未知字段仍可在 Raw JSON 查看，不做文本猜测。
- [Risk] 保存 log 时误写敏感或过大 payload。→ Mitigation：保存摘要层默认脱敏和裁剪，完整原始 trace 仍沿用现有保存逻辑；用户问答记录继续只保存问题和最终文本回答。

## Migration Plan

1. 先补 trace fixture，覆盖 Agent 成功生成、Agent patch、clarification、validation blocked、tool parse failure、persistence failure、Response Writer mismatch 和 legacy trace。
2. 提取 `AgentTraceViewModel` 构建函数和字段分类表，并为工具时间线、资源关联、错误聚合补单元测试。
3. 改造 `components/dev/ai-trace-viewer.tsx`：引入 Agent 总览、Agent phase flow、tool timeline、resource links、diagnostic findings 和 legacy compatibility 区域。
4. 调整保存 log payload，将 Agent 诊断摘要写入 `codex_logs/ai_trace_log.js`，保留 `codex_logs/prompt.js` 的用户问答记录边界。
5. 运行 `npm run typecheck`、相关组件/工具测试、`openspec validate refactor-agent-trace-log-page --strict`。

Rollback 策略：如果新视图出现渲染问题，可以保留 view model 构建层但暂时默认展开 legacy flow；不需要回滚 Agent trace 数据结构或 `/api/chat` 主链。

## Open Questions

- 无需要暂停实现的问题。具体 Agent step 字段以当前 `AiRunTrace` 类型和真实 trace fixture 为准，缺失字段只做显式缺失诊断，不在页面中推断。
