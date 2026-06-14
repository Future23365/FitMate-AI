## 1. 治理与边界

- [x] 1.1 完成 Tool 抽象层级检查：确认稳定 resource type 为 `Exercise`，能力族为 query/list，当前 change 只调整 `searchExerciseResources` 现有只读动作资源查询合同，不新增 tool、不迁移 runtime、不新增服务端自然语言分流。
- [x] 1.2 使用 `agent-prompt-contract-governance` 检查模型可见合同：确认 execution taxonomy 说明放在 `searchExerciseResources` description / schema description / tool result summary，不写入通用 Agent prompt。
- [x] 1.3 确认允许触碰模块：`exercise-resource-tools.ts`、`exercise-repository.ts`、`exercise-resource-filter-policy.ts`、`execution-taxonomy.ts`、model-visible gate、OpenSpec delta 和相关测试。
- [x] 1.4 确认禁止触碰模块：LangChain runtime 主循环、model factory provider payload、production response adapter 主流程、`/api/chat` 主链路、finalization tool 通用合同、服务端关键词 / 正则 / 同义词 / phrasing 路由。

## 2. OpenSpec 合同

- [x] 2.1 更新 `agent-exercise-resource-query-tool` delta spec，覆盖 execution taxonomy 输入字段、旧字段拒绝、repository 下推、模型可见 summary、projection 和测试门禁。
- [x] 2.2 运行 `openspec validate migrate-exercise-resource-execution-taxonomy --strict`。

## 3. Repository 与共享 taxonomy

- [x] 3.1 在共享 taxonomy 模块补充 impact / noise 等级排序或等价 helper，保证 `null` / `unknown` 不匹配上限筛选。
- [x] 3.2 更新 `ExerciseResourceSearchInput`、`ExerciseResourceSummary` 和 facet catalog 类型，加入 execution taxonomy 字段并移除 Agent 查询输入中的旧 `equipment` / `homeRequirement`。
- [x] 3.3 更新 repository select、map、where 构造、filter semantics、facet catalog 和 `requiredExerciseIds` mismatch 判断，使 taxonomy filters 在数据库层执行。
- [x] 3.4 更新 section-aware hard filter policy，让 `training`、`warmup`、`stretch` 使用 execution taxonomy 字段作为 hard filters，并保留非 taxonomy 字段的 support section unapplied 摘要。

## 4. LangChain Tool 合同

- [x] 4.1 更新 `searchExerciseResourcesInputSchema`：新增 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax`，并拒绝不自洽组合。
- [x] 4.2 更新 tool description、schema description 和 facet catalog 文本，使用中文说明输入来源、canonical values、unknown-safe 上限语义和 grounding 边界。
- [x] 4.3 更新 output schema、model-visible summary、user projection 和 trace summary，暴露有限 `executionTaxonomy` 事实，同时继续隐藏统计、placement、handler output 和 workflow 暗示字段。

## 5. 测试与验证

- [x] 5.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖 taxonomy 成功查询、旧字段拒绝、自洽校验、required id mismatch、model/user/trace projection。
- [x] 5.2 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，覆盖 production schema 只暴露 taxonomy 输入和 facet catalog canonical values。
- [x] 5.3 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`，覆盖 Planner-visible summary 中的 `executionTaxonomy` 白名单和旧误导字段不回归。
- [x] 5.4 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [x] 5.5 运行 `npm run typecheck`。
- [x] 5.6 最终 diff 检查，确认没有修改 runtime 主链逻辑、`/api/chat` 生产主链或 response adapter，没有新增服务端自然语言分流，没有把 execution taxonomy 写成通用 prompt 特例。
