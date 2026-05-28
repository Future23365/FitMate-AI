## 1. 右侧动作库筛选状态

- [ ] 1.1 在 `ActionComposerPage` 中新增 `libraryHomeRequirement` 状态，并在动作库请求中写入 `homeRequirement` 参数。
- [ ] 1.2 将 `libraryHomeRequirement` 纳入动作库加载 effect dependencies，确保筛选变化会刷新列表。
- [ ] 1.3 将 `libraryHomeRequirement` 纳入 `hasLibraryFilters` 和 `resetLibraryFilters()`，确保清空筛选覆盖新增字段。

## 2. 右侧动作库筛选 UI

- [ ] 2.1 将右侧动作库当前横向 `category` chip 区域改为热身、训练、拉伸三个阶段入口，点击后更新 `selectedSection`。
- [ ] 2.2 将动作分类改为 `LibraryFilterSelect` 下拉框，并继续使用 `libraryFacets.categories` 和 `libraryCategory`。
- [ ] 2.3 新增居家条件下拉框，使用 `libraryFacets.homeRequirements` 和 `libraryHomeRequirement`。
- [ ] 2.4 调整筛选区布局，使分类、肌群、器械、难度、居家条件和清空筛选在右侧窄面板中保持清晰、无文字溢出。

## 3. 行为验证

- [ ] 3.1 验证选择热身、训练、拉伸后，从右侧动作库添加动作会进入对应 section。
- [ ] 3.2 验证分类下拉筛选会请求 `/api/exercises` 并携带 `category` 参数。
- [ ] 3.3 验证居家条件下拉筛选会请求 `/api/exercises` 并携带 `homeRequirement` 参数。
- [ ] 3.4 验证清空筛选会移除搜索词、分类、肌群、器械、难度和居家条件，但不改变当前选中的新增阶段。

## 4. 检查

- [ ] 4.1 运行 `npm run lint`。
- [ ] 4.2 运行 `npm run typecheck`。
- [ ] 4.3 运行 `npm test` 或与动作库筛选相关的测试，并记录结果。
