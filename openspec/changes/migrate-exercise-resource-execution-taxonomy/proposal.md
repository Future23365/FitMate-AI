## Why

`add-exercise-execution-taxonomy` 已经完成 `Exercise` execution taxonomy 字段落库，且动作数据已由人工回填。当前 `searchExerciseResources` 仍让模型通过旧 `equipment` / `homeRequirement` 字段表达器械、支撑和场地约束，导致模型无法直接使用新的执行条件事实，也会继续沿用旧字段的语义交叉。

本 change 将 `searchExerciseResources` 的模型可见合同和 repository 查询逻辑迁移到 execution taxonomy。这样模型可以用结构化字段表达“无外部器械、需要哪些器械、是否需要地面/支撑/固定设施、准备复杂度、冲击程度、噪音程度”等执行条件，服务端只执行确定性 schema 校验和数据库过滤，不新增自然语言分流。

## What Changes

- 修改 `searchExerciseResources` input schema：移除模型可见 `equipment` / `homeRequirement` 输入，新增 execution taxonomy 过滤字段：
  - `requiresExternalEquipment`
  - `requiredEquipmentTags`
  - `supportRequirementTags`
  - `setupComplexityMax`
  - `impactLevelMax`
  - `noiseLevelMax`
- 修改动作资源 repository：将新增字段转换为数据库 `where` 条件，并继续保留 section-aware hard filter policy、受控候选数量、名称查询、肌群均衡查询、`requiredExerciseIds` 和 `excludeExerciseIds` 行为。
- 修改 `searchExerciseResources` 模型可见说明、schema description、facet catalog、model-visible summary、user projection 和 trace summary，让模型看到 execution taxonomy 的输入来源、canonical value、输出事实和 grounding 边界。
- 输出动作摘要新增有限 `executionTaxonomy` 事实；旧 `equipmentZh` / `homeRequirementZh` 可继续作为用户可读展示摘要，但不再作为 Planner 可填写筛选字段。
- 更新 `requiredExerciseIds` 冲突诊断，使指定动作与 taxonomy 筛选不一致时返回稳定 conflict fields。
- 更新 `agent-exercise-resource-query-tool` spec、tool-level tests、production catalog / model-visible contract tests 和 TypeScript 检查。
- 不新增服务端关键词、正则、同义词表、固定短句模板、provider `tool_calls` 改写、LangChain runtime 主循环分支或 `/api/chat` 主链路分流。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 将 `searchExerciseResources` 的执行条件输入、查询过滤、facet catalog 和模型可见输出迁移到 `Exercise` execution taxonomy 字段。

## Impact

- 影响 Agent tool 合同与实现：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/exercises/exercise-resource-filter-policy.ts`
  - `lib/server/langchain-agent/model-visible-contract-gate.ts`
- 影响共享 taxonomy 运行辅助：
  - `lib/shared/exercises/execution-taxonomy.ts`
- 影响 OpenSpec：
  - `openspec/specs/agent-exercise-resource-query-tool/spec.md`
  - `openspec/changes/migrate-exercise-resource-execution-taxonomy/specs/agent-exercise-resource-query-tool/spec.md`
- 影响测试：
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
- 不影响：
  - Prisma schema 或 migration
  - 动作数据回填脚本
  - LangChain runtime 主循环
  - model factory provider payload
  - production response adapter 主流程
  - `/api/chat` 主链路
  - `submitVisibleTrainingProposal` 的最终动作数据库事实校验
