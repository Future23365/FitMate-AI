## Why

当前动作库同时使用 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh` 表达器械与执行环境，两个字段语义交叉，导致“无器械”既可能被理解为自重动作，也可能被理解为完全不需要场地、固定设施或支撑物。`searchExerciseResources` 因此需要在旧字段之间做兼容解释，模型也会看到容易误用的筛选口径，出现已经补充完整条件后仍反复查询、或把健身房固定设施动作混入无器械推荐的现象。

本 change 通过两步收敛：先在数据库中新增明确的动作执行条件 taxonomy 并完成回填，再把模型可见合同和 `searchExerciseResources` tool 切换到新字段，避免继续把旧歧义字段暴露给模型。

## What Changes

- 新增动作执行条件 taxonomy，用稳定字段拆分“是否需要外部训练器械”“需要哪些器械”“是否需要地面/瑜伽垫、椅子/墙面、健身房固定设施、搭档或户外空间”等执行条件。
- 保留 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh` 作为历史导入、展示和兼容字段，但不再作为 `searchExerciseResources` 的模型可见输入字段。
- 新增共享 taxonomy 常量与校验边界，供 seed / 回填脚本、Prisma 数据访问、repository、tool schema description、测试和文档复用。
- 为现有动作数据提供一次性回填规则，基于当前 `equipmentZh`、`homeRequirementZh` 和必要的人工审查补齐新字段。
- 调整 `searchExerciseResources` 的模型可见 input schema、description、examples、成功 observation、query summary 和 trace summary，统一使用新 taxonomy 字段表达执行条件。
- **BREAKING**: `searchExerciseResources` 模型可见合同不再暴露 `equipment` 和 `homeRequirement` 作为可传输入字段；模型必须改用新的执行条件字段。
- 不新增服务端自然语言关键词规则、正则、同义词表、固定短句模板、provider `tool_calls` 改写、LangChain runtime 主循环分支或 `/api/chat` 主链路分流。
- 本 change 取代“通过旧字段内部默认筛选低门槛候选”的方向；实施时不应并行引入只依赖旧 `equipment` / `homeRequirement` 的低门槛默认策略。

## Capabilities

### New Capabilities

- `exercise-execution-taxonomy`: 维护动作执行条件 taxonomy、数据库字段、共享枚举/常量、回填规则和数据质量校验边界。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 将 `searchExerciseResources` 的执行条件查询合同从旧 `equipment` / `homeRequirement` 字段迁移到新 taxonomy 字段，并同步模型可见说明、repository 筛选、output summary、trace 和测试边界。

## Impact

- 影响数据模型与数据：
  - `prisma/schema.prisma`
  - Prisma migration
  - seed / 数据回填脚本
  - `data/exercises.zh.json` 或等价动作源数据维护流程
- 影响共享类型与领域常量：
  - `lib/shared/exercises/types.ts`
  - 新增或调整 `lib/shared/exercises/*taxonomy*` 等共享 taxonomy 模块
- 影响动作查询与 AI tool：
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `searchExerciseResources` 的 schema description、examples、model observation、user projection 和 trace summary
- 影响测试：
  - Prisma / seed / taxonomy 回填测试
  - `searchExerciseResources` handler / repository 测试
  - production tool catalog / model-visible contract gate 测试
  - 相关 trace summary 或 projection 测试
- 不影响：
  - LangChain runtime 主循环
  - model factory provider payload
  - production response adapter 主流程
  - `/api/chat` 主链路
  - `submitVisibleTrainingProposal` 的最终动作数据库事实校验
