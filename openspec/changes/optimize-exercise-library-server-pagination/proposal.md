## Why

动作库页面和动作编排页右侧动作库虽然使用分页参数请求 `/api/exercises`，但当前服务端实现会先读取完整 `Exercise` 记录集合，再在内存中筛选、排序和截断。随着动作库图片、教学步骤、embedding 等字段继续增长，这会让普通列表请求占用不必要的服务端内存。

## What Changes

- 将 `/api/exercises` 的列表查询改为数据库分页查询：服务端必须在 PostgreSQL/Prisma 层完成筛选、排序、计数和分页。
- 将列表响应限制为 `ExerciseListItem` 所需字段，完整教学步骤、来源字段和 embedding 继续只通过详情接口读取。
- 将 facets 统计改为数据库聚合，避免为了筛选选项读取完整动作详情集合。
- 保持现有前端请求参数、分页响应结构和详情接口契约不变。

## Capabilities

### New Capabilities

### Modified Capabilities
- `exercise-library-filter-ui`: 动作库列表和 facets 查询必须避免完整动作记录集合的服务端内存扫描。
- `composer-library-filters`: 动作编排页右侧动作库使用同一分页列表接口，阶段筛选后的结果也必须在服务端分页前完成数据库过滤。

## Impact

- 影响 `app/api/exercises/route.ts` 背后的服务端动作列表查询路径。
- 影响 `lib/server/exercises/exercise-service.ts` 与 `lib/server/exercises/exercise-repository.ts` 的职责划分。
- 影响 `/exercises` 页面和 `/composer` 右侧动作库共享的 `/api/exercises` 性能行为。
- 需要更新相关服务测试，验证列表查询不再依赖 `listExerciseRecords()` 的完整读取路径。
