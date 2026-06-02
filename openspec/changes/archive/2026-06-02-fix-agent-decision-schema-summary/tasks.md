## 1. Agent Decision Schema 摘要

- [x] 1.1 更新 `buildAgentDecisionModelInput` 的 schema 字段摘要，保留数组 `items.type`、`items.enum` 和关键边界。
- [x] 1.2 增加测试验证 `searchExercises.allowedSections` 在瘦身输入中仍暴露合法枚举。

## 2. 工具名 action 规范化

- [x] 2.1 在 Agent decision 解析边界规范化 `action` 等于已注册工具名的输出形态。
- [x] 2.2 增加测试验证 `action: "askClarification"` 能转为合法工具调用，未注册 action 仍失败。

## 3. 验证

- [x] 3.1 运行相关测试。
- [x] 3.2 运行 `npm run typecheck`。
- [x] 3.3 运行 `openspec validate fix-agent-decision-schema-summary --strict`。
