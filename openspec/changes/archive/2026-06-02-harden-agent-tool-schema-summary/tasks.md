## 1. 实现

- [x] 1.1 扩展 `summarizeJsonSchemaFields`，在受控深度内递归摘要 object、array、record / additionalProperties 和 union 分支。
- [x] 1.2 保留字段 required、enum、const、default、min/max、minItems/maxItems 等模型调用所需边界。
- [x] 1.3 避免发送完整 JSON Schema；对深层 payload 做截断摘要。

## 2. 测试

- [x] 2.1 增加 `searchExercises` 回归测试，断言 `resultRequirements.sectionCoverage` 的 record value 结构和 `softPreferences` 子字段对模型可见。
- [x] 2.2 增加复杂工具回归测试，覆盖 `generateRoutineDraft.intent`、`generatePlanDraft.strategy` 和 `evaluatePolicy` union 分支摘要。
- [x] 2.3 运行相关测试和 `npm run typecheck`；如失败，记录失败原因和边界。
