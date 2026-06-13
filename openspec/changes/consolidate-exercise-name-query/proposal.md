# consolidate-exercise-name-query

## Why

当前生产 Agent 同时暴露 `resolveExerciseResourceMentions` 和 `searchExerciseResources`，两者都试图处理“用户点名某个训练动作后查数据库动作资源”的能力。这个重叠会让模型在同一个目标上先解析动作提及、再重复调用动作资源查询，消耗循环预算，也让失败归因变得不清晰：问题不是“模型没有查”，而是点名动作查询能力分散在两个 tool 合同里。

同时，`searchExerciseResources` 中的 `q` 容易被理解为泛搜索或语义搜索字段。但当前数据库查询能力是结构化过滤和确定性文本匹配，系统并没有向量检索或自然语言语义搜索能力。继续暴露 `q` 会误导模型把完整用户意图或自然语言片段塞进一个服务端不能真正语义理解的字段。

需要把动作名称查询收口到一个稳定 tool 中，让模型显式传入已经识别出的动作名称，并保持 tool 输出结构稳定。

## What Changes

- **BREAKING** 从 production 模型可见 tool catalog 中移除 `resolveExerciseResourceMentions`，不再向模型暴露独立的点名动作解析 tool。
- **BREAKING** 从 `searchExerciseResources` 的 production 模型可见 input 合同中移除 `q`，不再暴露宽口径自然语言查询字段。
- 在 `searchExerciseResources` 中新增 `exerciseNames?: string[]`，表示模型已经从用户请求或上下文中结构化提取出的点名动作名称。
- `exerciseNames` 只支持动作名称字段上的确定性匹配，包括精确、前缀和包含匹配；不表示语义搜索、向量召回、肌群推断或服务端自然语言理解。
- `exerciseNames` 可以与 `suitabilities`、`equipment`、`level`、`homeRequirement`、`muscles` 等结构化筛选字段组合使用。
- 多个 `exerciseNames` 必须按名称分桶查询后合并，避免单个名称的大量候选挤占其他名称的候选。
- `searchExerciseResources` 输出结构保持稳定，继续使用 `query`、`groups` 和 `diagnostics`；不得因为传入 `exerciseNames` 新增 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行顶层结果。
- 通过 `diagnostics` 表达名称未命中、名称与 section 冲突、名称与筛选条件冲突、候选过宽等确定性查询事实。
- 更新 tool schema、tool description、schema description、examples、tool-level tests 和 production catalog/model-visible contract tests。
- 不新增服务端关键词规则、用户原文分流、phrasing 特判或 provider tool call 改写。

## Capabilities

### New

无新增能力模块。

### Modified

- `agent-exercise-resource-query-tool`
  - 新增 `exerciseNames` 输入字段。
  - 移除 `q` 输入字段。
  - 明确名称匹配边界、组合筛选边界和稳定输出结构。
- `agent-exercise-mention-resolution-tool`
  - 废弃并移除 production 中的 `resolveExerciseResourceMentions`。
  - 点名动作查询职责迁移到 `searchExerciseResources.exerciseNames`。

## Impact

- 预计影响文件：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/langchain-agent/tools/production-tool-catalog.ts`
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts`
  - production tool catalog / model-visible contract 相关测试
- 不涉及：
  - LangChain runtime 主循环
  - provider payload / native `tool_calls`
  - `/api/chat` 路由
  - production response adapter
  - Prisma schema 或数据库迁移
  - 服务端从用户自然语言中抽取动作名

