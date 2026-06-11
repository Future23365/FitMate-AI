# LangChain 成功回复建议提问合同恢复

记录时间：2026-06-11 15:44:20 CST

## 背景问题

生产 `/api/chat` 已迁移到 LangChain Agent Runtime 后，成功路径只从最终 `AIMessage.content` 提取纯文本 `finalText`。这导致模型生成的下一步问题只能混在正文里，无法进入既有 `suggestedQuestions` / `suggested_questions` 按钮协议。最新 trace 中响应事件只有 `content` 和 `done`，`suggestedQuestionCount = 0`，说明问题不在前端渲染，而在 LangChain 成功终态输出合同缺少结构化建议字段。

同一轮回复正文中出现的两条横线来自模型输出的 Markdown `---`，前端只是按 Markdown 默认规则渲染，并没有主动适配出分隔线。

## 调整思路

本次把 LangChain 成功终态从“纯文本 final message”调整为服务端可校验的结构化 final response：

- `content`：用户可见正文。
- `suggestedQuestions`：可选的下一轮用户消息按钮，最多 3 条。

服务端只校验结构、空值、数量和投影边界，不从正文、用户原文、关键词、正则、同义词或具体 `toolName` 里提取建议。业务 tool manifest、handler 和 observation 不参与本次改动。

## 关键改动

- 新增 `LangChainFinalResponseSchema` 和 `langChainFinalResponseJsonSchema`，集中定义成功终态结构。
- `runLangChainAgentRuntime()` 通过 LangChain `responseFormat` 获取 `structuredResponse`，结构非法时归一为安全失败，不再把未校验正文当作成功回复。
- `LangChainAgentRunSuccess` 增加 `suggestedQuestions`，response adapter 从 runtime 成功结果投影既有 `suggested_questions` NDJSON 事件。
- 默认 LangChain prompt 补充 `content` / `suggestedQuestions` 合同，并要求正文不使用独立 `---` 分隔线。
- 测试覆盖结构化成功终态、建议提问投影、结构非法失败、prompt 合同和 response adapter 边界。

## 取舍

选择 LangChain `responseFormat` 而不是手写正文 JSON 解析，是为了保持 native tool calling 主链方向，并避免用户可见正文和协议字段混在一个文本通道里。

没有做前端过滤 `<hr>` 或服务端正则删除 `---`，因为这会把展示问题修成正文适配逻辑。当前更合理的边界是让模型可见输出合同明确不要生成独立 Markdown 分隔线。

## 验证

- `openspec validate restore-langchain-suggested-questions-contract --strict`
- `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-runtime/response-adapter.test.ts`
- `npm run typecheck`
