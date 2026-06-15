## 1. OpenSpec 合同

- [x] 1.1 补充 proposal、design 和两个 capability 的 spec delta
- [x] 1.2 使用 `openspec validate clarify-exercise-resource-grounding --strict` 验证 change

## 2. 模型可见合同实现

- [x] 2.1 更新默认 LangChain Agent system prompt，表达模型通用训练知识和产品动作资源库边界
- [x] 2.2 更新 `searchExerciseResources` tool description，表达资源库用途、空结果含义和结构化输出边界
- [x] 2.3 更新 `searchExerciseResources` Planner-visible summary，新增受控 `resourceBoundary`
- [x] 2.4 更新 model-visible contract gate，允许受控资源库边界字段并继续阻止 diagnostics 泄漏

## 3. 测试与验证

- [x] 3.1 补充 `search-exercise-resources` 回归测试，覆盖点名动作未命中的资源库边界
- [x] 3.2 补充 `model-visible-contract-gate` / `production-tool-catalog` 断言，覆盖新模型可见文案和字段
- [x] 3.3 运行相关 Vitest 和 TypeScript 检查
