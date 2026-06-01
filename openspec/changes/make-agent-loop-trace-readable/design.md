## Context

`/api/chat` 生产主链已经切到 Tool-first Agent loop，但 log-traces 页面仍沿用阶段式 trace debugger 的信息架构：先展示 route、token、duration、stage、summary card 和 Raw JSON，再让开发者自己从多个 step 中拼出模型输入、模型输出和 tool 结果。

这导致两个实际问题：

- 调试者无法按 Agent loop 的真实执行顺序回答“这一轮 LLM 看到了什么、为什么调用这个 tool、tool 返回了什么、下一轮 LLM 有没有看到结果”。
- 指标很多但缺少上下文解释，token、duration、skip reason、resource id 和 dependency graph 更像内部字段，不像排查入口。

本 change 不改变 Agent 决策和业务执行，只调整 trace 记录合同与调试页展示合同，让页面成为 Agent loop 的复盘工具。

## Goals / Non-Goals

**Goals:**

- 将 log-traces 的默认详情视图改为 Agent loop timeline。
- 每个 loop 节点展示 LLM 输入、LLM 输出原文、结构化解析结果、tool 执行结果和下一轮 prompt 可见性。
- 明确连接 `model_request`、`model_response`、`agent_tool_decision`、`agent_tool_result`、`agent_final_result`、`response_write`。
- 为 token、duration、skip reason、resource id、dependency graph 等指标提供中文解释和排查用途。
- 让保存全链路 log 的内容包含可读 Agent loop 摘要，方便复制给 Codex 或人工复盘。
- 保留 Raw JSON 入口，避免解释层遗漏低频字段。

**Non-Goals:**

- 不改变 AgentOrchestrator 的业务决策、tool registry、权限、Validator、Policy、Persistence 或用户可见回复。
- 不新增浏览器录制、网络抓包或外部 observability 依赖。
- 不把完整数据库 payload、其他用户数据、权限 token、cookie 或 API key 写入 trace。
- 不取消 token 截断和敏感字段脱敏；如需更完整文本，只能在开发态受控扩展 trace budget。

## Decisions

### Decision 1: 以 Agent loop 为一等 view model，而不是直接在组件中拼 Raw steps

实现一个稳定的 `AgentLoopTraceViewModel`，由 trace steps 归一化生成：

- `runOverview`: route、status、duration、finalDecision、用户可见回复摘要。
- `loopTurns`: 每轮 Agent loop，包含 model request、model response、parsed decision、tool result、next prompt linkage。
- `finalization`: AgentExecutionResult、Response Writer 输入摘要、最终回复、artifact / patch / suggestion 事件。
- `diagnostics`: orphaned tool result、missing model response、schema parse failure、unlinked resource id、response writer mismatch。

原因：组件直接按 step title 或数组位置拼接会继续扩散脆弱逻辑；view model 可以被单测覆盖，也能服务页面和 log export。

备选方案是继续在 `ai-trace-viewer.tsx` 中按 group 渲染。这个方案改动小，但无法稳定表达“上一轮 tool result 进入下一轮 prompt”的因果关系。

### Decision 2: Trace 记录层补强 loop linkage，而不是只靠页面猜

每次模型调用和 tool 调用应在 trace 中有稳定关联字段：

- `loopTurnId` 或等价 step index。
- `aiStage`: `agent_tool_decision`、`agent_final_result`、`agent_response_writer` 等。
- `modelCallId`、`toolCallId`、`toolResultId`。
- `visibleToolResultIds` 和 `usedToolResultIds`。
- `resourceIds`: `candidateSetId`、`artifactId`、`validationId`、`policyDecisionId`、`revisionId` 等。

页面可以用这些 id 建链，不能依赖中文 step name、用户文本或关键词推断关系。

### Decision 3: LLM 输出同时展示 raw content 和 parsed decision

Agent loop 的模型输出需要两层展示：

- 原始 `content` / `rawResponse`：用于排查模型是否真的输出了预期 JSON。
- 解析后的 decision：用于快速看 action、toolName、tool input、reason、final result、blocking reason 和引用的 tool results。

原因：只看 raw content 难扫读，只看 parsed decision 又会掩盖 JSON 解析、Schema 修复或截断问题。

### Decision 4: 指标降级为解释型辅助信息

token、duration、skip reason、dependency graph、resource id 不再作为默认主内容堆叠展示，而是附着在 loop 节点和诊断卡片中：

- token 用于判断是哪一次 LLM 调用消耗异常。
- duration 用于判断模型慢还是 tool 慢。
- skip reason 用于判断某个阶段为什么没有执行。
- resource id 用于判断 tool result 是否被后续消费。
- dependency graph 用于判断最终结果依赖哪些 tool result。

### Decision 5: 导出格式复用同一个 view model

保存全链路 log 时，应导出 Agent loop timeline、诊断摘要和 Raw trace 入口；保存用户问答记录仍保持窄格式，只包含用户问题和最终文本回答。

原因：导出内容和页面使用同一 view model，能避免“页面看得懂但保存 log 仍然难懂”的分裂。

## Risks / Trade-offs

- [Risk] 旧 trace 缺少 loop linkage 字段，无法完整串联。  
  Mitigation: 页面保留 legacy step-oriented view，并明确标记缺失字段；不要把旧 trace 误判为 Agent 失败。

- [Risk] 完整 prompt 和 raw response 可能较长，影响页面性能或泄漏敏感信息。  
  Mitigation: 继续使用 trace store 的截断和脱敏；长文本默认折叠，并显示 originalLength、maxLength 和 preview。

- [Risk] 页面为了可读性隐藏了关键低频字段。  
  Mitigation: 每个 loop turn、tool result、finalization 和诊断项都保留 Raw JSON 入口。

- [Risk] 如果通过 step name 建链，后续文案调整会破坏页面。  
  Mitigation: 新实现必须优先使用结构化 id 和 metadata；缺失时只能进入 legacy fallback，不能悄悄关键词推断。
