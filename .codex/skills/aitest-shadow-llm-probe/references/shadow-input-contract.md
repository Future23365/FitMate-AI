# Shadow Input Contract

`round-xxx-input.json` 是 Codex Shadow 决策唯一可读取的输入包。

## 允许字段

- `systemPrompt`：生产模型可见 system prompt。
- `messages`：当前轮模型可见消息，包含用户消息和上一轮 ToolMessage summary。
- `tools`：当前 provider request 暴露的业务 tool 名称、description、input schema 和 schema description。
- `finalizationTool`：`fitmate_final_response` 或等价终态工具的 description / schema。
- `toolResultSummaries`：上一轮真实 dev-safe tool 执行后进入模型上下文的 summary。
- `budget`：当前轮次、剩余业务 tool 调用数、最大轮次等模型可见预算。
- `sourceRefs`：指向本输入包内部 JSON path 的证据引用，不指向源码路径或 trace debug 字段。

## 禁止字段

- 源码实现、repository 查询细节、Prisma raw payload、完整数据库记录。
- `codex_logs/ai_trace_texts.jsonl` 中 debug-only 内容。
- 历史 OpenSpec、Codex memory、开发者解释或人工修复经验。
- 用户不可见或模型不可见的 trace diagnostic。
- 服务端调用栈、环境变量、密钥、cookie、完整 provider raw response。

## 决策原则

如果一个判断无法引用 `sourceRefs`、`messages`、`tools`、`toolResultSummaries` 或 `budget` 中的模型可见事实，应输出 `contract_gap`。

