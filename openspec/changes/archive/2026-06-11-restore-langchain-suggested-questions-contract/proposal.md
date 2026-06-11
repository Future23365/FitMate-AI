## Why

当前 LangChain 文本聊天主链成功返回时只把最终 assistant message 当作纯文本 `finalText`，导致模型即使自然生成了下一步问题，也只能写进正文，无法进入既有 `suggestedQuestions` / `suggested_questions` 按钮协议。最新 trace 已证明生产响应只有 `content` 和 `done`，推荐提问按钮缺失不是前端渲染问题，而是成功终态输出合同缺少结构化建议字段。

## What Changes

- 将 LangChain 成功终态输出恢复为服务端可校验的结构化回复，包含 `content` 和可选 `suggestedQuestions`。
- 使用 LangChain `responseFormat` 和项目 Zod schema 校验成功终态结构，避免从自然语言正文中提取建议。
- 让 response adapter 从 runtime 成功结果中的 `suggestedQuestions` 投影既有 `suggested_questions` NDJSON 事件。
- 更新默认 LangChain prompt，说明 `content` 与 `suggestedQuestions` 的职责、数量边界和 Markdown 分隔线边界。
- 补充 runtime、response adapter 和 prompt 合同测试，覆盖成功建议提问投影与正文不使用独立 `---` 分隔线。
- 不修改业务 tool manifest、schema summary、handler 或 observation；不新增服务端关键词、正则、同义词或 phrasing 特判。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `assistant-suggestions`: 成功聊天回复中的建议提问必须由结构化 `suggestedQuestions` 承载，并继续投影为 `suggested_questions` 事件。
- `agent-text-chat-flow`: LangChain 文本聊天成功终态必须通过结构化 final response 合同输出用户可见正文和可选建议提问。

## Impact

- 影响 `lib/server/langchain-agent/prompt.ts`、`runtime.ts`、`types.ts`、`response-adapter.ts` 以及 `/api/chat` 的 LangChain 文本聊天服务投影接线。
- 影响 LangChain runtime 成功结果的 TypeScript 类型和相关测试 fixture。
- 不影响数据库、Prisma schema、业务 tool handler、production tool catalog、前端按钮点击协议或旧字段迁移策略。
