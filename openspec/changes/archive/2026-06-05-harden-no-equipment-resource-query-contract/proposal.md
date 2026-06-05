## Why

当前 `searchExerciseResources` 将底层数据库的 `homeRequirement = "none" / "无器械"` 暴露给 Planner，导致模型把“无器械”误选为居家条件筛选，并把 `equipment = "body only"` 且 `homeRequirement = "floor"` 的俯卧撑等自重动作排除。这个问题说明 tool 查询合同不应直接复用会误导模型的数据库 facet，而应提供更贴近用户语义、由服务端确定性映射到数据库查询的输入边界。

## What Changes

- **BREAKING** 从 Planner 可见的 `facetCatalog.homeRequirements`、`homeRequirement` schema description 和 examples 中移除 `none` / `无器械`，不再把“无器械”展示为居家条件。
- **BREAKING** 不为旧输入 `homeRequirement = "none"` / `"无器械"` 增加 handler 兼容、alias、自动迁移或 fallback；非法或误用输入应按当前 schema / repair 边界处理。
- 在 `equipment` 查询合同中新增模型可见的 `no_equipment` / `无器械` 筛选语义，用于表达“不需要哑铃、杠铃、固定器械或其他外部器械”的用户约束。
- 在 tool / repository 层将 `equipment = "no_equipment"` / `"无器械"` 确定性映射到数据库自重动作事实，例如 `equipment = "body only"` 或 `equipmentZh = "自重"`，不得同时默认附加 `homeRequirement = "none"`。
- 收紧 `homeRequirement` 的含义为环境、场地或支撑条件，例如 `floor`、`support`、`outdoor`、`partner`、`small_equipment`、`gym_equipment`；它不再表达器械可用性。
- 更新 `searchExerciseResources` manifest、schema description、examples、model observation、trace / projection 摘要和 tests，确保 Planner 看到的是业务语义清晰的查询合同，而不是误导性的底层字段组合。
- 明确禁止新增 `/api/chat` 关键词分流、Agent core 业务 `toolName` 分支、服务端同义词表、短句模板或根据用户原文选择筛选条件的逻辑。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 调整 `searchExerciseResources` 的器械与居家条件查询合同、facetCatalog 暴露、repository 下推查询、manifest/examples/projection 和测试要求；新增 `equipment` 中的 `no_equipment` 语义，移除 Planner 可见 `homeRequirement = none / 无器械`。

## Impact

- 预计影响实现模块：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/agent-tools/index.ts` 或 production registry 构造处的 facet catalog 注入入口
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-core/contract-helper.test.ts` 或等价 model observation / compressed tool result 测试
  - `tests/chat-service.test.ts` 或等价生产聊天回归
- 不修改 `/api/chat` 请求 / 响应合同。
- 不修改 Agent runtime 主循环、`PlannerPort`、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 Response Renderer 主流程。
- 不新增数据库表或 Prisma migration；数据库中现有 `homeRequirement = "none"` 可继续作为存储事实存在，但不得作为 Planner 可见居家条件 facet 暴露。
- 不改训练方案生成、保存、卡片渲染或用户记忆职责。
