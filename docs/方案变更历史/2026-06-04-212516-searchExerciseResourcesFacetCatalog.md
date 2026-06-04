# 2026-06-04 21:25:16 CST searchExerciseResources Facet Catalog 合同收敛

## 当前真实问题

上一版 `searchExerciseResources` 用 `bodyRegions` 让服务端把上肢、下肢、核心、全身这类高层区域展开成真实肌群。这个方案虽然解决了部分“腿部”查询，但也让服务端承担了自然语言语义映射。与此同时，Planner 实际可见 manifest 没有完整暴露数据库支持的 facet，模型只能猜 `muscle`、`category`、`force`、`mechanic`、`goalTag`、`riskTag` 等精确值。

## 调整思路

本次把 `searchExerciseResources` 收敛为纯数据库 facet 查询合同：Planner 通过模型可见 `metadata.facetCatalog` 看到当前发布态动作库的完整可执行词表，自己选择 `muscle` 或 `muscles` 等结构化字段；服务端只负责 schema、去空去重、权限边界和数据库 where 查询，不再展开高层身体区域。

## 关键改动

- 新增 `ToolManifest.metadata` 通用可见字段，用于承载业务 tool 的安全、只读模型上下文，不在 Agent core 写具体 toolName 分支。
- 新增发布态动作 `facetCatalog` repository 读取入口，合并中英文 facet、数组 facet 和 `allowedSections`，只过滤空值、去重并稳定排序。
- `searchExerciseResources` 删除 `bodyRegions` 和 `expandedMuscles`，新增 `muscles: string[]`，repository 将 `muscle + muscles` 合并后下推到四个肌群列的 OR 查询。
- production `/api/chat` registry 构造时注入当前数据库 facet catalog，trace 的 `registry_snapshot` 可看到 Planner 实际可见词表。
- 更新 tool-level、manifest、contract helper、production chat 和 architecture boundary 测试，覆盖旧字段拒绝、catalog 可见、projection 无残留和无服务端语义分流。

## 验证结果

- `openspec validate expose-exercise-facet-catalog-remove-body-regions --strict`
- `npm test -- tests/agent-tools/search-exercise-resources.test.ts`
- `npm test -- tests/agent-core/tool-registry-manifest.test.ts`
- `npm test -- tests/agent-core/contract-helper.test.ts`
- `npm test -- tests/chat-service.test.ts`
- `npm test -- tests/agent-core/architecture-boundary.test.ts`
- `npm test -- tests/agent-core/manifest-hardening.test.ts`
- `npm run typecheck`

残留扫描中，`searchExerciseResources` tool、repository、production chat 链路不再包含旧区域展开字段；旧字符串只保留在负向测试断言和无关旧 `exercise-service` 链路中。
