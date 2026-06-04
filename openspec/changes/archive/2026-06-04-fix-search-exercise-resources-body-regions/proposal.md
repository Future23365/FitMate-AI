## Why

最新 `codex_logs/ai_trace_log.js` 显示，用户说“我想练腿”时，模型调用 `searchExerciseResources` 并传入 `muscle: "腿部"`。当前 tool 将 `muscle` 当作数据库精确肌群 facet 执行，动作库中没有精确值 `"腿部"`，导致查询返回 0 个动作并被模型解释为“没有腿部动作”。

这个问题说明 `searchExerciseResources` 的模型可见合同没有区分高层身体区域和真实肌群 facet，也缺少对空结果是否满足用户意图的结构化诊断。

## What Changes

- 为 `searchExerciseResources` 增加结构化 `bodyRegions` 输入，支持 `upper_body`、`lower_body`、`core`、`full_body`，用于表达“上肢、下肢/腿部、核心、全身”等高层身体区域。
- repository 只根据 `bodyRegions` 枚举做确定性展开，将其转换为动作库真实肌群 facet，并继续使用 Prisma `where/count/select/take` 下推查询。
- 收紧 `muscle` 的模型可见说明：它只能表示动作库真实主肌群或辅助肌群 facet，不应用于 `"腿部"` 这类高层区域词。
- 调整空结果 fulfillment：带有 `bodyRegions` 或 `muscle` 等具体筛选条件且查询结果为空时，tool 应返回成功 output，但 fulfillment 应标记为未满足，并提供可恢复诊断摘要，避免模型把可修正的 0 结果直接说成“动作库没有动作”。
- 更新 `searchExerciseResources` 的 examples、model observation、user projection 和 trace summary，使实际筛选条件、区域展开结果和空结果诊断可见但不泄漏完整 handler output。
- 不修改 Agent core 主循环、`PlannerPort`、Executor 主流程、`Policy Guard`、`Resource Contract Validator`、`Response Renderer` 或 `/api/chat` 主链路。
- 不新增服务端关键词、正则、同义词表、短句模板或基于用户原文的语义改写。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的输入、输出、投影、fulfillment 和模型可见说明需要支持高层身体区域与真实肌群 facet 的区分。
- `agent-exercise-facet-contract`: 高层身体区域 `bodyRegions` 的受控 facet 合同需要覆盖 `searchExerciseResources`，不再只覆盖旧 `searchExercises` 候选集合工具。

## Impact

- 预计影响代码：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - 可能涉及 `lib/shared/exercises/types.ts` 或 `lib/shared/exercises/query-schema.ts` 的共享枚举复用。
- 预计影响测试：
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - 如模型可见 schema summary 或 manifest 断言变化，补充相关 contract 测试。
- 预计影响文档：
  - `docs/agent-tool-design.md`
  - `docs/方案变更历史/**`
  - `docs/项目演变历程.md`
- 不涉及 Prisma Schema、数据库迁移、新依赖、前端 UI、训练计划生成、保存 artifact 或用户记忆。
