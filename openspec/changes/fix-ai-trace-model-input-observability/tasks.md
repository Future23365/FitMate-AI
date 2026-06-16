## 1. 边界与证据确认

- [x] 1.1 确认本 change 类型为 LangChain runtime / trace summary 通用可观测性合同变更，不属于 Shadow Probe、prompt 策略或业务 tool 行为变更。
- [x] 1.2 复核当前证据链：`runtime.ts` 的 `summarizeLangChainModelRequest()`、`types.ts` 的 `requestSummary` 类型、chat service 的 `model_request` trace step、viewer/export 的 long text extraction。
- [x] 1.3 明确允许触碰模块：LangChain trace recorder、trace summary 类型、chat trace projection、`/dev/ai-traces` 保存 log 的导出/展示、trace 相关测试。
- [x] 1.4 明确禁止触碰模块：prompt 文案、tool description 语义、业务 tool handler、provider `tool_calls` 改写、服务端自然语言关键词分流、用户可见 NDJSON 输出。

## 2. Runtime 模型可见输入快照

- [x] 2.1 扩展 `LangChainAgentModelCallTrace["requestSummary"]` 或新增等价 snapshot 类型，承载 system prompt / system message、messages、tools、finalization tool、budget 和 `modelVisibleInputAudit`。
- [x] 2.2 在 LangChain `wrapModelCall` 边界读取真实 `ModelRequest`，记录 system prompt / system message 的安全长文本 envelope、长度和 hash / fingerprint。
- [x] 2.3 记录每条 request message 的 role、content 安全文本 envelope、长度、hash / fingerprint 和顺序。
- [x] 2.4 记录当前 provider request 暴露 tools 的 name、description、input schema、schema description、hash / fingerprint。
- [x] 2.5 记录 finalization tool 的 name、description、schema、hash / fingerprint，以及当前工具可用性和预算摘要。
- [x] 2.6 生成 `modelVisibleInputAudit`，包含 `sourceKind`、`completeness`、`missingModelVisibleParts[]`、字段来源、长度、hash / fingerprint。
- [x] 2.7 为重复 role + content hash 的 message 生成 duplicate message risk 标记，但不得在 trace 层删除、合并、改写或重排 messages。

## 3. Trace Step、导出和展示

- [x] 3.1 更新 chat service 的 `model_request` trace step，使其写入完整模型可见输入快照或引用，而不仅是 `messagePreviews` 和 `toolNames`。
- [x] 3.2 更新 `/dev/ai-traces` 保存全链路 log 的 payload 结构，保留 `modelVisibleInputAudit`、长文本引用、detailRef 和字段路径。
- [x] 3.3 更新 long text extraction，使 system prompt、message content、tool description、schema description 和 tool result summary 能以明确 kind / path 外置到 `codex_logs/ai_trace_texts.jsonl`。
- [x] 3.4 更新导出说明和可见性标注，明确 `contentRef` 只表示 payload 已包含的长文本被外置，不代表未记录的 prompt/tool schema 已保存。
- [x] 3.5 保持 tool execution 可见性语义不变：`modelVisibleSummary` 才表示进入模型，`userProjection` 和 `traceSummary` 不默认进入模型。
- [x] 3.6 对旧 trace 或不完整 trace 标记 `completeness=incomplete` 或等价状态，并保留已有 tool call、tool execution、token usage 和 response projection 证据。

## 4. 测试覆盖

- [x] 4.1 增加 LangChain runtime trace 单测，断言 model request snapshot 包含 system prompt、messages、tools、schema、finalization tool、budget 和 `modelVisibleInputAudit`。
- [x] 4.2 增加 trace 脱敏测试，确认 API key、authorization、cookie、跨用户 payload、完整数据库 raw payload 和完整 tool handler output 不进入模型请求快照。
- [x] 4.3 增加 long text export 测试，确认 system prompt、message content、tool description、schema description 和 tool result summary 能通过 `contentRef` / `detailRef` 精确回查。
- [x] 4.4 增加 incomplete trace 测试，确认只有 `messagePreviews` 和 `toolNames` 时不会被标记为完整模型可见输入。
- [x] 4.5 增加 duplicate message risk 测试，确认重复用户 message 会被标记但不会被 trace 层改写。
- [x] 4.6 增加 tool execution visibility 回归测试，确认 `enteredModelContext=true` 仍只代表 `modelVisibleSummary` 进入模型上下文。

## 5. 验证与回归

- [x] 5.1 运行 `openspec validate fix-ai-trace-model-input-observability --strict`。
- [x] 5.2 运行 LangChain runtime / trace 相关最窄测试，例如 `npm test -- tests/langchain-agent-runtime/runtime.test.ts` 或新增对应测试文件。
- [x] 5.3 运行 AI trace viewer / export 相关最窄测试，例如 `npm test -- tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts`。
- [x] 5.4 运行 `npm run typecheck`；如果无法运行，说明原因。
- [x] 5.5 用最新问题 trace 重新导出或构造 fixture 验证：旧日志缺少 system prompt / tool schema 时明确标记 incomplete，新日志可以通过 refs 查到完整模型可见输入。
