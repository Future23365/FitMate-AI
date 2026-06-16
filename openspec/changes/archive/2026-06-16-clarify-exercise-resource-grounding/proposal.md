## Why

当前 Agent 对动作库查询结果的事实边界表达不够完整：当点名动作名称或查询条件没有返回候选时，模型容易把“产品动作库当前没有可渲染资源”误解成“不能回答这个现实训练动作相关问题”，从而继续做等价查询，而不是诚实说明产品库未收录并给出普通文本建议。

项目中的 Exercise 数据库本质上是产品资源库：它提供可渲染动作卡片、动作图片、动作详情、结构化训练结果和训练执行界面所需的受控动作事实。它不是健身知识全集，也不应该替代模型自身的通用训练知识。

## What Changes

- 默认 LangChain Agent system prompt 增加“模型通用训练知识”和“产品动作资源库”的边界说明。
- `searchExerciseResources` 的模型可见说明增加产品资源库角色：该 tool 查询的是可用于卡片、图片和结构化训练输出的动作资源，不是现实世界动作知识的全集检索。
- `searchExerciseResources` 的 Planner-visible summary 增加受控 `resourceBoundary`，表达空结果或点名动作未命中时只说明产品库当前没有匹配的可渲染资源，不表示现实训练动作不存在。
- 保持内部 `diagnostics`、命中数量、截断状态和名称歧义诊断只用于 `userProjection` / `traceSummary` / debug，不回灌给 Planner。
- 补充模型可见合同门禁和 tool-level 回归测试，覆盖普通文本知识边界、产品资源库边界和诊断不泄漏。
- 不新增服务端关键词分流、短句特判、自然语言语义归一化或自动改写 provider tool call。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`：默认 prompt 明确产品动作资源库与模型通用训练知识的边界。
- `agent-exercise-resource-query-tool`：动作资源查询 tool 的模型可见 description、summary 和合同门禁表达产品可渲染资源边界。

## Impact

- 影响文件：
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/langchain-agent/model-visible-contract-gate.ts`
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
- 验证方式：
  - `openspec validate clarify-exercise-resource-grounding --strict`
  - 相关 Vitest：`search-exercise-resources`、`model-visible-contract-gate`、`production-tool-catalog`
  - TypeScript 检查
