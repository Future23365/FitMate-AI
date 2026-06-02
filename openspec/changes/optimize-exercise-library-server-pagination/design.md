## Context

`/exercises` 页面和 `/composer` 右侧动作库都通过 `/api/exercises` 读取动作列表。当前 API 已经暴露 `page/pageSize/limit/offset/sort/facets`，前端也按分页参数请求；问题在服务端 `listExercises()` 先调用 `listExerciseRecords()` 读取完整 `Exercise[]`，再执行筛选、排序、分页和摘要投影。`getExerciseFacets()` 也读取完整动作集合后在内存中统计。

这条路径会把完整动作详情、教学步骤、图片字段和 embedding 一并加载到 Node.js 内存中。动作库数据量和字段继续增长后，普通列表筛选会产生不必要的内存压力，并且动作编排页右侧面板会重复触发同样问题。

## Goals / Non-Goals

**Goals:**
- `/api/exercises` 列表查询在数据库层完成筛选、排序、计数和分页。
- 列表查询只读取 `ExerciseListItem` 需要的列，不读取详情专用字段和 embedding。
- facets 统计使用数据库聚合，不依赖完整 `Exercise[]`。
- 保持现有前端请求参数、响应结构和详情接口不变。
- 保留 `searchExercises()` / AI 候选生成当前语义搜索行为，避免把本次列表优化扩大成 AI 搜索重构。

**Non-Goals:**
- 不改变动作库 UI 布局、筛选入口或分页交互。
- 不调整 Prisma schema、数据库索引或迁移。
- 不重写 AI `searchExercises()` 的候选生成和 hybrid search 内存模型。

## Decisions

1. **新增 repository 列表查询，而不是继续在 service 内筛选完整集合。**
   - 方案：在 `exercise-repository` 中新增列表专用查询函数，由 service 负责参数归一化和响应组装。
   - 理由：repository 是唯一读取 PostgreSQL 动作事实的位置；把 `where/select/orderBy/count/take/skip` 放在 repository 能保持数据访问边界清晰。
   - 取舍：service 会保留少量分页和 DTO 组装逻辑，但不再拥有列表数据扫描职责。

2. **列表投影使用 Prisma `select`，详情接口继续使用完整 record mapper。**
   - 方案：列表查询只选择 `ExerciseListItem` 字段；详情和 AI 搜索继续走完整 `Exercise` mapper。
   - 理由：列表卡片不需要 `instructions*`、`source*`、`license`、`embeddingText` 和 `embedding`，直接省掉这些字段的传输和映射成本。
   - 取舍：需要维护一份列表列清单，但它与 `ExerciseListItem` 类型边界一致，长期更清晰。

3. **facets 使用数据库聚合，数组字段使用 `unnest`。**
   - 方案：标量 facets 用 Prisma `groupBy`，数组 facets 用 `$queryRaw` + `unnest` 聚合。
   - 理由：facets 是统计问题，不应该为了统计读取完整动作详情；数组字段无法用普通 `groupBy` 拆元素，使用 PostgreSQL 原生能力更合适。
   - 取舍：数组 facets 的 SQL 需要白名单字段映射，避免拼接任意字段名。

4. **用途筛选优先使用结构化 `allowedSections`，兼容旧记录的派生逻辑保留为后备。**
   - 方案：列表数据库过滤以 `allowedSections has section` 为主；如果记录缺少 `allowedSections`，在有限的分页补取后用现有 `getExerciseSuitability()` 后备筛选。
   - 理由：当前 seed 已有 `allowedSections`，它是可下推的结构化事实；派生逻辑只服务旧数据兼容。
   - 取舍：极少数旧数据可能需要补取更多候选才能填满页，但不会回到完整动作集合扫描。

## Risks / Trade-offs

- **Risk:** facets 聚合需要保持 label 与 value 对齐。 → **Mitigation:** 标量 facets 同时按 value/label 分组，数组 facets 使用 `WITH ORDINALITY` 对齐中英文数组下标。
- **Risk:** 列表查询和旧内存筛选结果顺序可能有细微差异。 → **Mitigation:** 保持现有 sort 枚举语义，并为筛选、分页、facets 补充单元测试。
- **Risk:** 旧记录缺少 `allowedSections` 时用途筛选不能完全下推。 → **Mitigation:** 用分批查询和服务端派生筛选兜底，设置固定批量上限，避免全量一次性加载。
