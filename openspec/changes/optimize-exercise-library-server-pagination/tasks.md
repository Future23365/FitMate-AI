## 1. 服务端查询实现

- [x] 1.1 在 `exercise-repository` 中新增列表专用数据库查询，使用 Prisma `where/select/orderBy/count/take/skip` 返回当前页摘要字段。
- [x] 1.2 将 `/api/exercises` 背后的 `listExercises()` 改为调用数据库分页查询，并保留现有分页响应结构。
- [x] 1.3 将 `getExerciseFacets()` 改为数据库聚合统计，数组字段使用安全白名单 SQL 聚合。

## 2. 行为验证

- [x] 2.1 更新 `tests/exercise-service.test.ts`，覆盖筛选、分页、排序、facets 与“不调用完整 `listExerciseRecords()`”的列表路径。
- [x] 2.2 运行相关测试和类型检查，至少包含 `npm test -- --run tests/exercise-service.test.ts` 与 `npm run typecheck`。
