## 1. 合同收敛

- [ ] 1.1 在 `AgentAction` schema 中为 `final_answer` 和 `ask_user` 统一新增 `suggestedQuestions?: string[]`，限制最多 3 条、非空、长度受控。
- [ ] 1.2 移除或忽略 `final_answer.assistantSuggestions`、`ask_user.suggestions`、前端 `suggestedReplies` 等旧字段的新生产写入路径，不做旧字段转换。
- [ ] 1.3 确认 `AgentAction`、stream event、前端 message 三层只使用 `suggestedQuestions` 表达建议提问。
- [ ] 1.4 更新类型注释，说明 `suggestedQuestions` 是“建议提问”，按钮文字就是点击后发送的用户消息。

## 2. 全局 Prompt 合同

- [ ] 2.1 更新默认 Agent LLM prompt，说明 `suggestedQuestions` 是 `final_answer` / `ask_user` 的全局可选字段。
- [ ] 2.2 在 prompt 中明确最多 3 条、用户口吻、可直接发送、不得重复正文、当前回复自然结束时可省略。
- [ ] 2.3 在 prompt 中明确建议提问不得承诺未注册 tool、未执行结果、未开放保存能力、医疗诊断或康复处方。
- [ ] 2.4 确认 prompt 不新增固定短语触发、服务端语义分流、固定业务 `toolName` 或固定 action 规则。

## 3. 响应投影与前端消费

- [ ] 3.1 更新 Response Renderer，使新主路径输出 `suggested_questions` 事件，payload 为 `suggestedQuestions`。
- [ ] 3.2 更新 chat client NDJSON parser，只消费 `suggested_questions` 作为建议提问主事件，不新增旧 `assistant_suggestions` 兼容转换。
- [ ] 3.3 更新 `useChatController` 和 `ChatMessage` 类型，当前 assistant message 使用 `suggestedQuestions` 保存按钮文本。
- [ ] 3.4 更新聊天页面展示逻辑，按钮直接展示 `suggestedQuestions` 文本，点击后按普通用户消息发送同一文本。
- [ ] 3.5 确认前端不根据按钮文案推断业务 action、toolName、保存操作或训练结构。

## 4. 旧协议清理

- [ ] 4.1 更新聊天历史读写：新消息保存和读取 `suggestedQuestions`，不新增旧字段归一化逻辑。
- [ ] 4.2 更新服务端聊天历史投影，避免新写入继续产生 `suggestedReplies` 或复杂 `assistantSuggestions` 主路径。
- [ ] 4.3 用 `rg` 检查 `assistantSuggestions`、`suggestedReplies`、`assistant_suggestions`、`suggestions` 残留，确认它们不参与新的 `/api/chat` 建议提问主链。
- [ ] 4.4 删除或隔离复杂 `AssistantSuggestion` 对象协议在聊天主链中的引用；如其他业务仍需要，应另起 change，不在本 change 内兼容。

## 5. 测试与验证

- [ ] 5.1 更新 AgentAction schema / parser 测试，覆盖 `final_answer.suggestedQuestions` 和 `ask_user.suggestedQuestions`。
- [ ] 5.2 更新 Response Renderer 测试，断言新主路径只输出 `suggested_questions`。
- [ ] 5.3 更新 chat service NDJSON 测试，覆盖 `content` + `suggested_questions` + `done`。
- [ ] 5.4 更新 chat client / controller 测试，覆盖按钮文本写入 `ChatMessage.suggestedQuestions` 并点击发送同一文本。
- [ ] 5.5 更新 prompt 配置测试，断言默认 system prompt 包含 `suggestedQuestions` 合同、可选性和禁止硬塞规则。
- [ ] 5.6 更新旧字段残留测试，覆盖旧 `suggestedReplies` / `assistantSuggestions` / `assistant_suggestions` 不进入新建议提问主链。
- [ ] 5.7 运行 `openspec validate unify-agent-suggested-questions-contract --strict`。
- [ ] 5.8 运行相关自动化测试，并按改动范围运行 `npm run typecheck`；如触碰构建或路由边界，按需运行 `npm run build`。

## 6. 文档收尾

- [ ] 6.1 如实现阶段确认调整了核心聊天合同，在 `docs/方案变更历史/` 新增上海时间记录，说明字段为什么从多套建议协议收敛到 `suggestedQuestions`。
- [ ] 6.2 如实现阶段影响项目演变主线，在 `docs/项目演变历程.md` 追加简要记录。
- [ ] 6.3 更新相关 prompt / chat contract 文档中关于建议提问单字段方案和旧协议不迁移的说明。
