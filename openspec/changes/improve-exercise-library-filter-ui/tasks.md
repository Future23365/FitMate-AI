## 1. 筛选 UI 重组

- [x] 1.1 在动作库页面新增核心 chip 筛选行，覆盖肌群、分类、器械和目标。
- [x] 1.2 新增“更多筛选”区域，收纳难度、居家条件、发力、机制、风险和状态。
- [x] 1.3 新增已选筛选 chip 列表，支持单项移除和清除全部。
- [x] 1.4 将排序和每页数量移动到结果工具栏，并保留现有刷新行为。

## 2. 验证

- [x] 2.1 运行 `openspec validate improve-exercise-library-filter-ui --strict`。
- [x] 2.2 运行动作库页面相关 ESLint 检查。
- [x] 2.3 运行 `npm run typecheck`。
