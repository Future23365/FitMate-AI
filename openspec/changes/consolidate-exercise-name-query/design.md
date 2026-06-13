## Context

本次问题暴露的是 Agent tool 能力边界重叠，而不是数据库缺少动作，也不是模型完全没有查询。当前生产可见 tool 中，`resolveExerciseResourceMentions` 负责把模型结构化传入的点名动作文本解析为数据库动作，`searchExerciseResources` 又负责按结构化筛选查询动作资源。实际编排中，模型为了获得主训练动作，会先尝试解析点名动作，再围绕训练 section 多次查询动作资源，导致同一业务目标被拆到两个 tool 合同里。

另一个问题是 `q` 字段语义过宽。当前系统没有语义搜索或向量召回能力，只有数据库结构化过滤和确定性文本匹配。把字段命名为 `q` 会让模型误以为可以传完整自然语言或泛搜索意图，但服务端不能也不应该基于这个字段做自然语言理解。

因此本 change 把点名动作名称查询收口到 `searchExerciseResources.exerciseNames`，删除 `resolveExerciseResourceMentions` 的 production 可见入口，并废弃 `q`。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 同时承担点名动作名称查询和结构化筛选查询。
- 用 `exerciseNames` 明确表达“模型已经提取出的动作名称数组”，避免 `q` 的泛搜索误导。
- 支持动作名称字段上的确定性模糊匹配，包括精确、前缀和包含匹配。
- 保持 `searchExerciseResources` 输出结构稳定，名称查询结果继续进入 `groups.<section>.exercises[]`，失败和冲突进入 `diagnostics`。
- 删除 `resolveExerciseResourceMentions` production 模型可见合同，降低模型重复 tool call 的概率。
- 保持模型语义理解优先：动作名称由模型填写，服务端只做 schema、数据库事实和权限边界校验。

**Non-Goals:**

- 不引入向量搜索、embedding、语义召回或数据库外的自然语言搜索。
- 不让服务端根据用户原文、关键词、正则、同义词表或短句模板抽取 `exerciseNames`。
- 不增加“深蹲”“俯卧撑”等具体动作名特判。
- 不修改 LangChain runtime 主循环、provider payload、production response adapter 或 `/api/chat` 主路由。
- 不修改 Prisma schema 或新增动作 alias 数据模型。
- 不新增名称查询专属顶层 output，例如 `exerciseNameResults`、`resolvedMentions` 或 `nameMatches`。

## Decisions

### 1. 使用 `exerciseNames` 替代 `q` 和 `resolveExerciseResourceMentions`

`exerciseNames` 比 `q` 更准确：它不是泛搜索字段，而是动作名称数组。模型仍负责从用户请求、上下文和 tool observation 中识别动作名；服务端只在数据库动作名称字段上执行确定性匹配。

替代方案是保留 `q` 并强化 description。这个方案会继续留下宽口径字段，模型仍可能传完整自然语言，因此不采用。

替代方案是保留 `resolveExerciseResourceMentions` 并让 `searchExerciseResources` 只接受 `requiredExerciseIds`。这个方案会保留两段式解析链路，增加循环消耗，也会让模型在名称未命中时难以判断到底是解析失败还是查询失败，因此不采用。

### 2. 名称模糊查询限定在动作名称字段

Repository 只在当前动作名称字段中做精确、前缀和包含匹配。可匹配字段应来自现有 `Exercise` 记录的名称字段，例如 `nameZh`、`nameEn` 或当前代码中等价的动作名称字段。没有 schema 迁移前，不新增 alias 表或语义扩展字段。

这个选择保证查询能力和数据库事实一致，也避免把 `exerciseNames` 变成隐式语义搜索。

### 3. 多名称按名称分桶查询后合并

当 `exerciseNames` 包含多个动作名时，repository 应按名称分别取有限候选，再合并到现有 section group。这样可以避免某个宽泛名称命中大量候选并挤掉其他名称。合并时按 `exerciseId` 去重，并保留 section、筛选冲突和未命中 diagnostics。

替代方案是把多个名称合成一个 OR 条件后统一排序。这个方案更简单，但候选分布不可控，容易让一个名称占满返回上限，因此不采用。

### 4. 输出结构保持稳定

名称查询不会引入并行结果结构。成功候选继续进入 `groups.<section>.exercises[]`；未命中、section 冲突、筛选冲突或候选过宽通过 `diagnostics` 表达。`query.appliedFilters` 需要记录 `exerciseNames`，让模型和 trace 能看到实际查询口径。

这样做可以保证同一个 tool 不会因为传不传 `exerciseNames` 而输出两套结构。

### 5. 删除 production 可见的 `resolveExerciseResourceMentions`

实现时应从 production tool catalog、模型可见 manifest、schema/examples 和相关 tests 中移除 `resolveExerciseResourceMentions`。如果存在旧测试覆盖点名动作解析，应迁移到 `searchExerciseResources.exerciseNames` 的 tool-level tests。

不保留长期兼容别名。保留兼容别名会继续让模型看到两套能力，无法解决根因。

## Risks / Trade-offs

- `exerciseNames` 被传入完整自然语言句子 → 通过 schema description、examples 和 tests 约束字段只能包含单个动作名称；必要时由 schema 长度/数量上限拒绝明显越界输入。
- 名称包含匹配过宽 → 每个名称使用有限候选上限，过宽结果通过 `diagnostics` 表达，模型可自主澄清或收窄查询。
- 删除 `resolveExerciseResourceMentions` 影响现有测试和 manifest 快照 → 实现任务包含 catalog tests、tool-level tests、`rg` 检查和 `npm run typecheck`。
- 名称查询与 section/facet 冲突 → 不由服务端替模型决定放弃动作，冲突进入 `diagnostics`，由模型基于可见事实自主处理。
- 旧 `q` 调用失败影响 repair → input schema 应拒绝 `q`，失败反馈表达可使用 `exerciseNames` 或对应结构化筛选字段。

## Migration Plan

1. 更新 `searchExerciseResources` input schema，新增 `exerciseNames`，删除 `q`。
2. 更新动作 repository 查询入口，新增名称分桶匹配和 `exerciseNames` 查询摘要。
3. 更新 `searchExerciseResources` handler、model-visible summary、user projection 和 trace summary，保持 `query`、`groups`、`diagnostics` 输出结构。
4. 从 production tool catalog 和模型可见 manifest 中移除 `resolveExerciseResourceMentions`。
5. 删除或迁移 `resolveExerciseResourceMentions` 的 handler / tests / exports，保留范围以实现阶段实际依赖扫描为准。
6. 补充 tool-level tests、production catalog tests 和模型可见合同测试。

## Open Questions

无需要先确认的阻塞问题。实现阶段如果发现当前 `Exercise` 模型存在额外名称字段，可在不修改数据库 schema 的前提下纳入名称字段匹配；不能把标签、肌群或描述字段纳入 `exerciseNames` 的确定性名称匹配范围。

