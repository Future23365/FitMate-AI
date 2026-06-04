## 1. 范围确认

- [x] 1.1 读取 `codex_logs/ai_trace_log.js` 和对应 `codex_logs/ai_trace_texts.jsonl`，确认当前失败链路中模型只看到单个 `muscle` 查询能力、未看到完整数据库 facet catalog。
- [x] 1.2 运行 `git status --short`，确认不混入无关本地改动。
- [x] 1.3 确认本 change 类型为 Agent tool 执行合同 + 模型可见合同变更，允许触碰 `searchExerciseResources` tool bundle、repository、production registry/model input、manifest/projection 和相关测试。
- [x] 1.4 确认禁止边界：不改 `/api/chat` 主链路、不改 Agent runtime 主循环、不改 `PlannerPort`、不改 `Policy Guard`、不改 `ResourceStore`、不改 `Resource Contract Validator`、不改 Response Renderer 主流程。
- [x] 1.5 确认禁止新增服务端关键词、正则、同义词表、短句模板或基于用户原文的 facet 选择逻辑。

## 2. 数据库 facetCatalog

- [x] 2.1 新增或调整 repository/service 查询，按发布态 `Exercise` 读取所有 `searchExerciseResources` 支持查询的 distinct facet。
- [x] 2.2 `facetCatalog` 必须包含完整 `muscles`、`categories`、`levels`、`forces`、`mechanics`、`equipment`、`homeRequirements`、`goalTags`、`riskTags` 和 `suitabilities`。
- [x] 2.3 `facetCatalog` 只过滤空值、去重并确定性排序；不得按大小集合裁剪字段，不得用手写静态表替代数据库事实。
- [x] 2.4 如加入 `facetCatalogHash`、`source`、`publishedOnly` 或 `generatedAt`，确认它们只用于诊断，不替代完整 facet 列表。
- [x] 2.5 确认 `facetCatalog` 只表达数据库可执行值，不包含自然语言目标映射、服务端同义词、关键词规则或用户原文解析结果。

## 3. searchExerciseResources 输入合同

- [x] 3.1 更新 `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts` 的 input schema，新增 `muscles: string[]`。
- [x] 3.2 从 input schema 中删除 `bodyRegions`，不保留 alias 或兼容入口。
- [x] 3.3 更新 schema descriptions，表达 `muscle` 是单个真实肌群 facet，`muscles` 是多个真实肌群 facet 的 OR 查询。
- [x] 3.4 确认 `muscle` 和 `muscles` 都只接受来自 `facetCatalog.muscles` 的真实数据库 facet；服务端只做 schema、去空、去重和数据库查询。
- [x] 3.5 确认未知字段、`bodyRegions`、分页字段、消费侧字段和旧候选集合字段在 handler 执行前被拒绝。

## 4. Repository 查询

- [x] 4.1 更新 `lib/server/exercises/exercise-repository.ts`，删除 `bodyRegions`、`expandedMuscles` 和 `expandExerciseBodyRegionTargetMuscles` 在 `searchExerciseResources` 查询链路中的使用。
- [x] 4.2 将 `muscle` 与 `muscles` 合并去重后，下推到 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh` 的数据库 OR 查询。
- [x] 4.3 确认 repository 仍使用 `count()` 和 `findMany({ take: maxReturned + 1, select })`，不回退到全表读取、旧 `searchExercises()`、hybrid search 或 pgvector rerank。
- [x] 4.4 更新 applied filters / query summary，记录 `muscle` 和 `muscles` 的实际结构化输入，不输出 `bodyRegions` 或 `expandedMuscles`。

## 5. 模型可见合同和投影

- [x] 5.1 将完整 `facetCatalog` 注入 Planner 实际可见的 `searchExerciseResources` manifest、tool-specific model input 或等价模型输入区域。
- [x] 5.2 更新 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse`，说明该 tool 只接受数据库真实 facet，Planner 应基于 `facetCatalog` 自主选择字段。
- [x] 5.3 更新 examples，删除 `bodyRegions` 示例，增加 `muscles` 多肌群查询示例和基于数据库 facet 的结构化查询示例。
- [x] 5.4 确认 examples 不包含“练胸必须查某些肌群”这类自然语言目标映射表。
- [x] 5.5 更新 `toModelObservation`、`toUserProjection` 和 trace projection，删除 `bodyRegions` / `expandedMuscles` 输出，保留实际 applied filters、groups 和 diagnostics。
- [x] 5.6 确认通用 Agent prompt 不新增 `searchExerciseResources` toolName 特例，不写自然语言目标到 facet 的固定映射。

## 6. 删除 bodyRegions 残留

- [x] 6.1 用 `rg "bodyRegions|expandedMuscles|exerciseBodyRegion|expandExerciseBodyRegionTargetMuscles"` 检查本 change 范围内残留。
- [x] 6.2 删除 `searchExerciseResources` manifest、schema summary、examples、model observation、compressed tool result、trace summary 和 OpenSpec 中的 `bodyRegions` 可用字段说明。
- [x] 6.3 如 `lib/shared/exercises/body-regions.ts` 在生产聊天链路和本 tool 查询链路中已无消费者，删除该 helper；如仍被无关模块使用，确认它不再影响 `searchExerciseResources`。
- [x] 6.4 确认 `/api/chat`、Agent core、renderer 和 tool handler 没有新增任何替代 `bodyRegions` 的服务端语义分流。

## 7. 自动化测试

- [x] 7.1 更新或新增 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 `muscles` 多肌群查询、`muscle + muscles` 去重、`bodyRegions` schema 拒绝、applied filters、projection / redaction 和 handler 失败归一化。
- [x] 7.2 更新或新增 repository 测试，覆盖 `muscles` 下推到 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles`、`secondaryMusclesZh` 的 OR 查询，并确认不调用 `bodyRegions` 展开。
- [x] 7.3 更新 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖 Planner 可见 manifest 包含完整 `facetCatalog`，不含 `bodyRegions`，且描述性自然语言仍为中文。
- [x] 7.4 更新 `tests/agent-core/contract-helper.test.ts` 或等价 model observation 测试，覆盖 `bodyRegions` / `expandedMuscles` 不再进入模型观察或压缩 tool result。
- [x] 7.5 更新 `tests/chat-service.test.ts` 或等价生产聊天回归，覆盖 ReplayPlanner 使用 `muscles` 和 `facetCatalog` 可见信息完成动作事实查询。
- [x] 7.6 更新 `tests/agent-core/architecture-boundary.test.ts`，确认没有新增 `/api/chat` 关键词分流、Agent core 业务 `toolName` 分支、handler 自然语言模板或服务端同义词表。

## 8. 验证

- [x] 8.1 运行 `openspec validate expose-exercise-facet-catalog-remove-body-regions --strict`。
- [x] 8.2 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 8.3 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 8.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 8.5 运行 `npm test -- tests/chat-service.test.ts` 或更窄的 production chat 回归。
- [x] 8.6 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [x] 8.7 如修改 TypeScript、schema、AI orchestration 或共享业务逻辑，运行 `npm run typecheck`。
- [x] 8.8 最终检查 `git diff`，确认只包含本 change 范围内的 OpenSpec、tool、repository、manifest/projection 和测试改动，未混入无关本地文件。
