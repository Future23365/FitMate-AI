# searchExerciseResources 身体区域合同修复

记录时间：2026-06-03 21:14:21 CST

## 当前真实问题

最新 trace 中，用户输入“我想练腿，给我推荐几个动作。”后，模型调用 `searchExerciseResources`，传入 `muscle: "腿部"`、`suitability: "training"`。当前 tool schema 允许 `muscle` 是自由字符串，repository 又把它当作数据库精确肌群 facet 查询；动作库里真实下肢肌群是 `股四头肌`、`腘绳肌`、`臀部`、`小腿` 等，不存在精确值 `腿部`。因此工具返回 0 个动作，并且原先 fulfillment 仍为 `satisfied=true`，最终模型把这个 0 结果解释成“系统中没有腿部训练动作”。

## 原方案为什么不合适

`searchExerciseResources` 作为只读结构化动作查询 tool，只暴露了单值 `muscle`，但没有给高层身体区域提供受控字段。模型面对“练腿”这类自然表达时，只能把它塞进 `muscle`。这不是数据库缺动作，也不是单纯 prompt 表达不谨慎，而是 tool 合同没有把“高层区域”和“真实肌群 facet”分开。

原先空结果一律 `satisfied=true` 也不合适。查询执行成功不等于用户筛选目标被满足；0 命中的结果应作为诊断或失败解释，而不是成功动作推荐的 grounding。

## 调整思路

本次沿用旧 `searchExercises` 已验证过的结构化区域合同，为 `searchExerciseResources` 增加 `bodyRegions` 枚举：

- `upper_body`
- `lower_body`
- `core`
- `full_body`

服务端只根据这个结构化枚举确定性展开到动作库真实肌群 facet，不读取用户原文，不做关键词、正则、同义词或语义改写。`muscle` 继续保留，但只用于真实肌群 facet，例如 `股四头肌`、`腘绳肌`、`臀部`、`胸部`、`肩部` 等。

## 关键改动

- 新增共享 `bodyRegions` 枚举和区域到肌群的确定性展开函数。
- `searchExerciseResourcesInputSchema` 增加 `bodyRegions`，并更新模型可见说明和 examples。
- repository 在 Prisma `where` 中把 `bodyRegions` 展开后的真实肌群与显式 `muscle` 合并查询，继续保持 `where/count/select/take` 数据库下推。
- output/query 投影增加 `expandedMuscles`，trace、模型观察和用户投影可以看清结构化区域实际展开到了哪些真实 facet。
- `totalMatches=0` 时 fulfillment 改为 `satisfied=false`，避免 0 结果支撑成功动作推荐。
- 增加 tool-level 回归，覆盖 `bodyRegions=["lower_body"]` 返回下肢动作，以及 `muscle="腿部"` 0 命中不再 `satisfied=true`。

## 验证结果

- `npm test -- tests/agent-tools/search-exercise-resources.test.ts`
- `npm test -- tests/agent-core/tool-registry-manifest.test.ts`
- `npm run typecheck`
- `openspec validate fix-search-exercise-resources-body-regions --strict`
