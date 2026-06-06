## 2026-06-06 17:45:16 CST searchExerciseResources support section 查询策略收紧

### 当前问题

`searchExerciseResources` 原来把 `warmup`、`training`、`stretch` 复用同一套 repository hard filters。主训练动作使用 `level`、`q`、`category`、`goalTag`、`riskTag` 等字段做强过滤是合理的；但热身和拉伸属于 support section，动作库事实更依赖发布态、section、器械、场地和目标肌群。如果 support section 也强行套用主训练难度或文本搜索，数据库里存在可用热身 / 拉伸动作时仍可能查空。

### 调整思路

本次把查询策略下沉到稳定的 section-aware policy helper：

- `training` 使用 `training` hard filter policy，继续应用现有严格结构化筛选。
- `warmup` / `stretch` 使用 `support_section` policy，只应用发布态、section、器械、场地、肌群、`requiredExerciseIds` 和 `excludeExerciseIds` 这类确定性边界。
- `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 和 `q` 如果传入 support section，不进入 Prisma `where`，而是通过 `query.filterApplications[].unappliedInputFilters` 披露未作为 hard filter 使用。

### 关键改动

- 新增 `lib/server/exercises/exercise-resource-filter-policy.ts`，让 repository `where` 构造和 tool output 的 `filterApplications` 共用同一份 policy helper。
- 更新 `searchExerciseResources` output schema、model observation 和 user projection，增加 section 级 `filterApplications` 摘要。
- 保留 legacy `appliedFilters`，但在混合 section 查询中只表示所有 section 共同应用的 hard filters；真实 section 级执行口径以 `filterApplications` 为准。
- 更新 manifest / schema description，说明 `support_section`、`hardFilterPolicy` 和未应用输入字段的边界，不新增固定 tool 调用顺序、用户短句规则或服务端自然语言分流。

### 验证结果

- `openspec validate harden-exercise-support-section-query-policy --strict`
- `npm test -- tests/agent-tools/search-exercise-resources.test.ts`
- `npm test -- tests/exercise-repository.test.ts`
- `npm test -- tests/agent-core/contract-helper.test.ts`
- `npm test -- tests/agent-core/tool-registry-manifest.test.ts`
- `npm test -- tests/agent-core/architecture-boundary.test.ts`
- `npm run typecheck`

本次验证确认 support section 不再把 `level`、`q` 等字段下推到 Prisma `where`，同时仍保留自重器械、场地、肌群、section 和排除约束的数据库下推。
