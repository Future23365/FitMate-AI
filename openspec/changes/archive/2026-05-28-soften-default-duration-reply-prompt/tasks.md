## 1. Prompt 调整

- [x] 1.1 调整 `chatCompletion` prompt，移除固定默认时长提示模板句。
- [x] 1.2 明确可见回复优先按 `serverWorkoutIntent.sessionMinutes` 描述本次训练，只有缺少 `sessionMinutes` 时才宽泛提示估算。

## 2. 测试与验证

- [x] 2.1 更新聊天服务 prompt 测试，覆盖不再包含固定“未告诉时长”模板，并包含按结构化时长表达的提示规则。
- [x] 2.2 运行相关自动化测试、类型检查，并运行 OpenSpec strict 校验。
