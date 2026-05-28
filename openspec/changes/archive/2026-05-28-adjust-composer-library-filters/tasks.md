## 1. 右侧动作库筛选状态

- [x] 1.1 在 `ActionComposerPage` 中新增 `libraryHomeRequirement` 状态，并在动作库请求中写入 `homeRequirement` 参数。
- [x] 1.2 将 `libraryHomeRequirement` 纳入动作库加载 effect dependencies，确保筛选变化会刷新列表。
- [x] 1.3 将 `libraryHomeRequirement` 纳入 `hasLibraryFilters` 和 `resetLibraryFilters()`，确保清空筛选覆盖新增字段。
- [x] 1.4 新增右侧动作库阶段筛选状态，并在动作库请求中写入 `workoutSection` 参数。

## 2. 右侧动作库筛选 UI

- [x] 2.1 将右侧动作库当前横向 `category` chip 区域改为热身、训练、拉伸三个阶段筛选，点击后更新右侧筛选状态。
- [x] 2.2 将动作分类改为 `LibraryFilterSelect` 下拉框，并继续使用 `libraryFacets.categories` 和 `libraryCategory`。
- [x] 2.3 新增居家条件下拉框，使用 `libraryFacets.homeRequirements` 和 `libraryHomeRequirement`。
- [x] 2.4 调整筛选区布局，使分类、肌群、器械、难度、居家条件和清空筛选在右侧窄面板中保持清晰、无文字溢出。

## 3. 服务端阶段筛选

- [x] 3.1 在动作库查询 Schema 和类型中增加 `workoutSection`，仅允许 `warmup`、`training`、`stretch`。
- [x] 3.2 在动作库服务中增加阶段推断逻辑，并在分页前按 `workoutSection` 过滤动作。
- [x] 3.3 为动作库服务补充阶段筛选测试，覆盖热身、训练、拉伸。

## 4. 行为验证

- [x] 4.1 验证选择热身、训练、拉伸后，右侧动作库请求会携带对应 `workoutSection` 参数。
- [x] 4.2 验证分类下拉筛选会请求 `/api/exercises` 并携带 `category` 参数。
- [x] 4.3 验证居家条件下拉筛选会请求 `/api/exercises` 并携带 `homeRequirement` 参数。
- [x] 4.4 验证清空筛选会移除搜索词、分类、肌群、器械、难度和居家条件，但不改变当前选中的阶段筛选。
- [x] 4.5 验证右侧阶段筛选不会直接改变中间编排区的添加位置。

## 5. 检查

- [x] 5.1 运行 `npm run lint`。
- [x] 5.2 运行 `npm run typecheck`。
- [x] 5.3 运行 `npm test` 或与动作库筛选相关的测试，并记录结果。
