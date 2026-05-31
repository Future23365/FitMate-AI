## 1. 意图解析边界

- [x] 1.1 调整 `chatIntentSchema` 或意图解析函数，使非执行场景中的 `workoutIntent:null` 归一化为缺省内部值。
- [x] 1.2 将 `suggestedReplies` 的解析和校验从执行型 `workoutIntent` 校验中解耦，确保合法建议回复不会因非关键执行字段失败被清空。
- [x] 1.3 保持执行型请求的强校验：当需要触发动作推荐、routine、plan、patch、替换或讲解时，缺失或非法 `workoutIntent` 必须阻止内部动作。
- [x] 1.4 调整兜底意图路径，避免原始模型输出的交互层可恢复时直接替换成空 `suggestedReplies`。
- [x] 1.5 在意图解析 trace 中记录归一化、部分恢复、最终可见 `suggestedReplies` 和被清空原因。

## 2. Prompt 与文档一致性

- [x] 2.1 复核 `lib/server/ai/prompt-config.ts`，明确非执行场景可以省略 `workoutIntent`，但执行型请求必须提供合法结构。
- [x] 2.2 确认聊天正文中的示例文本不会被当成按钮来源；按钮来源只允许结构化 `suggestedReplies` 或兼容字段。

## 3. 自动化测试

- [x] 3.1 在 `tests/chat-service.test.ts` 覆盖“你好”场景：模型返回 `suggestedReplies` 和 `workoutIntent:null` 时仍输出可见建议回复。
- [x] 3.2 在 `tests/chat-service.test.ts` 覆盖执行型请求缺少合法 `workoutIntent` 时不触发内部动作。
- [x] 3.3 在 `tests/chat-service.test.ts` 覆盖非法 `suggestedReplies` 被清空或过滤，且不会触发内部动作。
- [x] 3.4 如已有流事件测试覆盖 `/api/chat`，补充 `suggested_replies` 事件断言；否则在服务端函数层断言 `resolveVisibleSuggestedReplies` 或等价输出。

## 4. 验证

- [x] 4.1 运行 `npm run test -- tests/chat-service.test.ts`。
- [x] 4.2 运行 `npm run typecheck`。
- [x] 4.3 运行 `openspec validate decouple-suggested-replies-from-workout-intent --strict`。
- [x] 4.4 如用户接受真实模型 token 成本，再运行相关手动 LLM 黑盒测试刷新报告；否则在实现总结中说明未运行原因。
