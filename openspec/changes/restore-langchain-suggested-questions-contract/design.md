## Context

生产 `/api/chat` 已迁移到 LangChain Agent Runtime 和 DeepSeek native tool calling。当前 `runLangChainAgentRuntime()` 从最终 `AIMessage.content` 提取纯文本 `finalText`，`createLangChainAgentResponseProjection()` 只有在调用方额外传入 `suggestedQuestions` 时才输出 `suggested_questions` 事件。实际生产服务只调用 `createLangChainAgentResponseProjection({ result, validatedVisibleOutputs })`，因此成功路径没有结构化建议提问来源。

项目已有 `suggestedQuestions` / `suggested_questions` 单字段协议：按钮文本就是下一轮用户消息，旧字段不做迁移。前端和 adapter 已能消费该事件，缺口在 LangChain 成功终态输出合同。

## Goals / Non-Goals

**Goals:**

- 让 LangChain 成功终态能稳定携带 `content` 和可选 `suggestedQuestions`。
- 继续使用既有 `suggested_questions` NDJSON 事件和前端按钮协议。
- 通过服务端结构校验限制建议提问为非空字符串，最多 3 条。
- 让 prompt 明确成功回复的结构化输出形状，并要求用户可见正文不要使用独立 `---` 分隔线。
- 保持服务端只做结构、数量、空值和投影边界校验，不从正文或用户原文推断建议语义。

**Non-Goals:**

- 不修改任何业务 tool 的 manifest、schema summary、handler、observation 或 resource contract。
- 不根据具体用户短句、动作推荐场景、`toolName` 或 tool result 字段组合生成建议。
- 不恢复旧 `assistantSuggestions`、`suggestedReplies`、`assistant_suggestions` 或其他兼容迁移。
- 不在前端或服务端从正文里的问号、编号列表、Markdown 段落中提取建议按钮。

## Decisions

### 1. 使用 LangChain `responseFormat` 承载成功终态结构

给 `createAgent()` 配置项目定义的 `LangChainFinalResponseSchema`。LangChain 官方文档说明 `createAgent` 支持 `responseFormat`，结构化结果会进入 final state 的 `structuredResponse`；当前本地依赖 `langchain@^1.4.4` 也暴露 `toolStrategy` 和 `structuredResponse` 类型。

替代方案是要求模型在正文中输出 JSON，再由服务端手动解析。该方案会把用户可见正文和协议 JSON 混在同一个文本通道里，容易导致 Markdown 噪音、解析失败和提示词漂移，不符合当前 native tool calling 主链方向。

### 2. Runtime 成功结果拥有 `suggestedQuestions`

`LangChainAgentRunSuccess` 增加 `suggestedQuestions: readonly string[]`。runtime 从 `state.structuredResponse` 解析结构化成功终态，`finalText` 继续作为兼容内部命名保存 `content`。response adapter 不再依赖调用方传入成功建议，而是直接读取 `result.suggestedQuestions`。

### 3. 服务端校验只守结构边界

Zod schema 负责：

- `content` 为非空字符串；
- `suggestedQuestions` 可选；
- 每条建议 trim 后非空；
- 最多保留 3 条。

服务端不校验建议是否“像某类业务操作”、不按关键词过滤、不基于用户原文或 tool result 语义改写建议。建议是否自然存在下一步由模型基于当前可见上下文判断。

### 4. Prompt 表达输出合同，不承载业务 tool 规则

默认 LangChain system prompt 补充终态结构规则：最终可见回复必须符合 `content` / `suggestedQuestions` 的结构化合同，`suggestedQuestions` 是用户口吻的下一轮消息，最多 3 条；`content` 不使用独立 `---` 分隔线。该规则属于通用 output contract，不写入任何具体业务 tool 说明。

## Risks / Trade-offs

- [Risk] `responseFormat` 使用 tool strategy 时会把结构化输出作为额外 tool 形态进入 LangChain 内部消息。
  Mitigation: runtime 只把项目业务 tool wrapper 的执行结果用于业务预算和用户投影；结构化 response tool 只用于 `structuredResponse`，测试覆盖不会把它当成业务 tool 分支。

- [Risk] 某些模型调用未产出合法 `structuredResponse`。
  Mitigation: runtime 将其归一为 `structured_output_validation_failed` 或等价失败，走现有安全 fallback，而不是输出未校验正文。

- [Risk] prompt 中禁止 `---` 不能百分百阻止模型生成所有 Markdown 分隔线。
  Mitigation: 这是模型可见输出合同约束；服务端不通过正文正则做语义修正。后续如需强制净化，应作为独立展示层或输出格式策略讨论。

## Migration Plan

1. 新增结构化 final response schema 与类型。
2. 在 LangChain runtime 接入 `responseFormat`，解析 `structuredResponse`。
3. 调整 response adapter 读取成功结果中的建议提问。
4. 更新 prompt 和测试。
5. 运行 OpenSpec 校验、相关 runtime/adapter 测试和 TypeScript 检查。
