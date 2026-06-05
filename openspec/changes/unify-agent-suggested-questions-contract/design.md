## Context

当前生产文本聊天已经具备建议按钮的局部链路，但字段分布不统一：

- `final_answer.assistantSuggestions?: string[]` 表示最终回答后的建议。
- `ask_user.suggestions?: string[]` 表示澄清问题的可选回答。
- NDJSON stream 使用 `assistant_suggestions` 事件和 `suggestions` payload。
- 前端消息主要写入 `suggestedReplies`，历史兼容字段中还有 `suggestedQuestions`。
- 共享层另有 `AssistantSuggestion` 对象协议，包含 `label`、`message`、`kind`、`blocking`、`source`、`targetOperation`。

用户端当前目标并不需要复杂对象协议：只需要展示一个或多个按钮，按钮文字就是点击后发送的用户提问文本。因此新主合同应以 `suggestedQuestions: string[]` 表达“建议提问”，并让所有新生产路径围绕这个字段收敛。

本 change 只建立 OpenSpec 边界，不修改代码。后续实现需要同时触碰 AgentAction schema、全局 prompt、Response Renderer、NDJSON stream、前端解析、历史兼容和测试。

## Goals / Non-Goals

**Goals:**

- 将“建议提问”的技术字段统一为 `suggestedQuestions?: string[]`。
- 让 `final_answer` 和 `ask_user` 使用同一个建议提问字段，而不是分别使用 `assistantSuggestions` 和 `suggestions`。
- 在全局 Agent LLM prompt 中表达 `suggestedQuestions` 的输出条件和边界。
- 保持前端交互简单：展示文本按钮，点击后发送同一段文本。
- 允许短期读取旧字段，防止历史消息和已有 fallback 立即断裂。
- 通过测试确保新字段、旧字段兼容、prompt 文案和 stream 事件都一致。

**Non-Goals:**

- 不在本 change 中实现代码。
- 不要求所有 AI 回复都必须输出建议提问。
- 不新增独立 LLM 调用专门生成建议提问。
- 不新增服务端关键词、正则、短句模板或自然语言文案判断。
- 不把建议提问按钮变成直接执行业务操作的确认按钮、保存按钮或内部 action。
- 不修改业务 tool handler、ResourceStore、Policy Guard、Executor 或训练方案校验规则。

## Decisions

### 1. 使用 `suggestedQuestions` 作为唯一新主字段

选择：所有新生产路径统一使用 `suggestedQuestions?: string[]`。

理由：用户看到的是“建议提问”，且每条内容就是下一轮用户消息。`assistantSuggestions` 太宽泛，容易再次混入下一步操作、确认、保存、调整等复杂按钮语义；`suggestedReplies` 更像“建议回复”，不如 `suggestedQuestions` 贴近当前产品表达。

技术标识保持英文，文档和 prompt 中称为“建议提问”。

替代方案：

- 继续使用 `assistantSuggestions` 对象：表达力强，但当前用户端不需要 `kind` / `source` / `targetOperation`，会增加迁移和校验复杂度。
- 继续使用 `suggestedReplies`：兼容成本低，但语义不够准确，且会继续和历史 `suggestedQuestions` 分裂。
- 使用中文字段名：不符合项目 TypeScript / schema 技术标识约定，也会增加序列化和工具链风险。

### 2. `suggestedQuestions` 是全局可选字段，不是强制字段

选择：默认 prompt 要求模型“适合时输出”，而不是每次回复必须输出。

理由：强制每次回复都会诱导模型在无需继续的问题后硬塞按钮，降低对话质量。建议提问应服务恢复、澄清、下一步探索和可继续任务，而不是满足字段形式。

### 3. 新 stream 事件使用 `suggested_questions`

选择：后续实现中 Response Renderer 输出 `{ type: "suggested_questions", suggestedQuestions: string[] }`，前端优先消费该事件。旧 `assistant_suggestions` 事件短期兼容读取，并投影为同一个 `ChatMessage.suggestedQuestions`。

理由：如果只改 AgentAction 字段、不改 stream 和前端字段，服务端字段仍会继续分裂。事件名采用 snake_case，payload 字段采用 camelCase，保持现有 NDJSON 事件风格和 TypeScript 字段风格。

### 4. 旧复杂对象协议降级为兼容来源，不作为新主合同

选择：`AssistantSuggestion` 对象、`assistantSuggestions`、`suggestedReplies`、`ask_user.suggestions` 和 `assistant_suggestions.suggestions` 进入迁移兼容清单。实现时可以读取并转换为 `suggestedQuestions`，但新模型输出、renderer 输出、前端消息和测试断言以 `suggestedQuestions` 为准。

理由：当前需求明确不需要 label/message 分离，也不需要 targetOperation。保留复杂对象作为主合同会让字段继续混乱。

### 5. 服务端只做结构校验，不做按钮文案语义判断

选择：服务端校验条数、类型、长度、去重和安全边界；不得读取 `suggestedQuestions` 文案做业务意图、tool、action、保存能力或训练结构判断。

理由：点击按钮后只是发送普通用户消息，下一轮语义理解仍由模型完成。服务端如果根据按钮文案推断业务操作，会重新引入自然语言分流。

## Risks / Trade-offs

- [Risk] `suggestedQuestions` 与历史已废弃字段同名，容易误以为只是恢复旧字段。→ Mitigation：文档和实现任务明确它是新主合同，旧历史兼容也统一迁移到该字段，并删除 deprecated 说明。
- [Risk] 改 stream 事件可能影响现有前端测试和历史客户端。→ Mitigation：实现阶段短期同时兼容 `assistant_suggestions`，但新 renderer 和新测试以 `suggested_questions` 为主。
- [Risk] 去掉 `AssistantSuggestion` 对象会失去 `targetOperation` 等结构化 gate。→ Mitigation：本能力只用于“下一轮普通用户消息”，不直接执行写入、保存或内部 action；下一轮仍走 AgentAction、tool schema、Policy Guard 和 runtime 校验。
- [Risk] prompt 要求过强导致模型每次硬塞建议。→ Mitigation：prompt 必须明确 `suggestedQuestions` 是可选字段，只有自然存在可继续问题、澄清选项或恢复路径时才输出。
- [Risk] 旧 fallback 代码仍输出 `assistant_suggestions`。→ Mitigation：任务包含残留扫描、兼容转换和测试，确保旧字段不会作为新生产主路径继续扩散。

## Migration Plan

1. 扩展并迁移 AgentAction schema：`final_answer` 和 `ask_user` 增加 `suggestedQuestions?: string[]`，旧 `assistantSuggestions` / `suggestions` 进入兼容读取或清理路径。
2. 更新默认 Agent LLM prompt：说明 `suggestedQuestions` 的可选性、数量、用户口吻、可直接发送和能力边界。
3. 更新 Response Renderer：新路径输出 `suggested_questions`，兼容旧 terminal 字段时投影到同一 payload。
4. 更新前端 stream parser 和 controller：优先消费 `suggested_questions.suggestedQuestions`，并把旧 `assistant_suggestions.suggestions` 兼容写入 `ChatMessage.suggestedQuestions`。
5. 更新聊天历史读写：保存 `suggestedQuestions`，读取旧 `suggestedReplies` / `assistantSuggestions` / `suggestedQuestions` 时统一归一。
6. 更新测试和 trace 断言，确认模型输出、stream、前端消息和历史兼容全部围绕 `suggestedQuestions`。

## Open Questions

- 是否需要保留 `AssistantSuggestion` 对象给推荐卡片或 workout patch 的专属按钮？本 change 默认不作为聊天主链建议提问合同保留；如果某些业务卡片仍需要复杂按钮，应后续单独设计为卡片内部 action，而不是混入通用建议提问。
