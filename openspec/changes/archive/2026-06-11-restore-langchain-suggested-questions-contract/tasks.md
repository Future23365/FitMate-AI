## 1. OpenSpec 与治理门禁

- [x] 1.1 使用 `agent-tool-change-governance` 确认本次属于 core / production output contract 变更，允许触碰 runtime 和 response adapter，禁止业务 tool 改动。
- [x] 1.2 使用 `agent-prompt-contract-governance` 对齐 `docs/llm-prompt-guidance.md`，确认 prompt 修改只表达通用 output contract。
- [x] 1.3 使用 `agent-fix-abstraction-gate` 检查没有把具体 trace、用户原话、toolName 或字段组合升格成生产规则。
- [x] 1.4 运行 `openspec validate restore-langchain-suggested-questions-contract --strict`。

## 2. Runtime 输出合同

- [x] 2.1 新增 LangChain final response Zod schema，定义 `content` 与可选 `suggestedQuestions` 的结构、数量和 trim 边界。
- [x] 2.2 在 `runLangChainAgentRuntime()` 接入 LangChain `toolStrategy` 形式的 `responseFormat`，从 `state.structuredResponse` 读取成功终态。
- [x] 2.3 更新 `LangChainAgentRunSuccess`、trace summary 和失败归一化，确保结构非法不会作为成功正文返回。
- [x] 2.4 确认结构化 response tool 不被当成业务 toolName 分支、服务端关键词路由或业务 handler。

## 3. Prompt 与响应投影

- [x] 3.1 更新默认 LangChain system prompt，说明 final response 的 `content` / `suggestedQuestions` 合同、最多 3 条建议和正文不使用独立 `---` 分隔线。
- [x] 3.2 更新 response adapter，成功路径从 runtime result 读取 `suggestedQuestions` 并投影现有 `suggested_questions` 事件。
- [x] 3.3 保持前端协议不变，不新增旧字段迁移、不从正文提取按钮、不修改业务 tool manifest 或 observation。

## 4. 测试与验证

- [x] 4.1 更新 `tests/langchain-agent-runtime/runtime.test.ts`，覆盖结构化成功终态、建议提问、非法结构 fallback、prompt 合同和 provider-native structured output 回归边界。
- [x] 4.2 更新 `tests/langchain-agent-runtime/response-adapter.test.ts`，覆盖成功结果自带 `suggestedQuestions` 的投影和最多 3 条限制。
- [x] 4.3 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-runtime/response-adapter.test.ts`。
- [x] 4.4 运行 `npm run typecheck`。
- [x] 4.5 重新运行 `openspec validate restore-langchain-suggested-questions-contract --strict`。
- [x] 4.6 最终 diff 检查确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
