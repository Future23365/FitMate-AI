## Why

当前 `searchExerciseResources` 要求 Planner 提交数据库可执行 facet，但模型可见合同没有完整暴露当前动作库支持的 facet，导致模型只能猜 `muscle`、`category`、`force`、`mechanic`、`goalTag`、`riskTag` 等值。与此同时，`bodyRegions` 让服务端承担了“上肢 / 下肢 / 核心 / 全身”到肌群的语义展开，不符合“服务端只执行确定性数据库合同，语义选择由模型完成”的边界。

本 change 需要把 `searchExerciseResources` 改成只接受纯数据库 facet，并把所有可查询数据库 facet 完整暴露给模型；Planner 根据用户目标自主选择 facet，服务端不再通过 `bodyRegions` 做单独语义判断。

## What Changes

- **BREAKING** 从 `searchExerciseResources` input schema、manifest、examples、model observation、user projection、trace summary、repository 查询和相关测试中删除 `bodyRegions`。
- **BREAKING** 删除 `bodyRegions` 到真实肌群的服务端展开路径；服务端不得再根据 `upper_body`、`lower_body`、`core`、`full_body` 等非数据库 facet 替模型扩展查询。
- 新增 `muscles: string[]` 查询字段，用于让 Planner 一次提交多个数据库真实肌群 facet；`muscle` 可作为单个肌群便捷字段保留或被 `muscles` 替代，但不得再承载高层身体区域。
- 新增模型可见 `facetCatalog`，完整暴露发布态动作库中 `searchExerciseResources` 支持查询的全部数据库 facet，包括肌群、分类、难度、发力类型、动作机制、器械、居家条件、目标标签、风险标签和用途 section。
- `facetCatalog` 必须来自当前数据库事实或同一生产事实源，不得用手写静态表替代；不得按“大集合 / 小集合”裁剪字段。
- 更新 `searchExerciseResources` 的 manifest、schema description 和 examples，说明 Planner 应基于 `facetCatalog` 自主选择 `muscle` / `muscles`、`category`、`force`、`mechanic`、`equipment`、`homeRequirement`、`goalTag`、`riskTag` 和 `suitabilities`。
- 明确禁止新增 `/api/chat` 关键词分流、Agent core 业务 `toolName` 分支、服务端同义词表、服务端短句模板或 handler 内自然语言语义归一化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的输入字段、模型可见 facet 合同、repository 下推查询、manifest/examples/projection 和测试要求发生变化；删除 `bodyRegions`，新增完整 `facetCatalog` 和多肌群 `muscles` 查询。

## Impact

- 预计影响实现模块：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/agent-tools/index.ts` 或 production registry 构造处的 facet catalog 注入入口
  - `lib/shared/exercises/body-regions.ts` 及其消费者清理，前提是该 helper 不再被本 change 范围内的生产链路使用
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-core/contract-helper.test.ts`
  - `tests/chat-service.test.ts` 或等价生产聊天回归
- 不修改 `/api/chat` 请求/响应合同。
- 不修改 Agent runtime 主循环、`PlannerPort`、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 Response Renderer 主流程。
- 不新增数据库表或 Prisma migration；facet catalog 从现有 `Exercise` 数据读取。
- 不改训练方案生成、保存、卡片渲染或用户记忆职责。
