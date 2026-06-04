## Why

当前 `buildAgentDecisionModelInput` 会把 Agent tool 的完整 JSON Schema 压缩成轻量 `inputFields`，但只展开顶层字段。`filters`、`resultRequirements`、`intent`、`strategy`、`patch`、`payload` 等对象字段进入模型上下文时只剩字段名和类型，模型看不到内部结构，容易把合法字段写到错误层级，或把对象合同误写成数组、自由文本。

这会让复杂 Agent Tools 在真实 LLM 调用中出现 `schema_validation_failed`，即使服务端 Zod Schema 本身正确、用户请求也合理。

## What Changes

- 增强 Agent decision 模型可见的 JSON Schema 摘要，使其在受控深度内保留对象属性、record 值结构、数组 item、枚举、const、默认值和 required 信息。
- 为复杂 Agent Tools 增加回归测试，覆盖 `searchExercises.resultRequirements.sectionCoverage`、`searchExercises.softPreferences`、`generateRoutineDraft.intent`、`generatePlanDraft.strategy`、`evaluatePolicy` 分支等模型需要稳定看到的结构。
- 保持真实工具输入仍由原始 Zod Schema 校验，不放宽任何工具执行边界。
- 不修改 repair runtime、工具执行逻辑、动作检索语义或服务端自然语言判断逻辑。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `readonly-llm-tool-calling`: Agent registry 暴露给模型的工具输入摘要必须包含复杂工具调用所需的嵌套结构，而不是只保留顶层字段名。

## Impact

- 主要影响 `lib/server/chat/chat-service.ts` 中的 `buildAgentDecisionModelInput` / JSON Schema 摘要逻辑。
- 增加或更新 `tests/chat-service.test.ts` 中对模型可见工具摘要的回归测试。
- 不影响数据库、API 请求契约、真实工具 Zod Schema、工具执行结果或持久化结构。
