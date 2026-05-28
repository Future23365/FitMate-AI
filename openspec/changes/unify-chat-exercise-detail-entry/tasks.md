## 1. 共享详情入口

- [x] 1.1 新增或提取右上角动作详情 icon button 组件，统一尺寸、定位、hover/focus 样式、`aria-label` 和 `title`。
- [x] 1.2 确认按钮使用 `info` 语义，不复用 warning/叹号样式。

## 2. 卡片接入

- [x] 2.1 将单独动作推荐卡片改为右上角详情按钮触发 `ExercisePreviewSheet`，移除整卡点击打开详情。
- [x] 2.2 将单次动作编排卡片改为右上角详情按钮触发 `ExercisePreviewSheet`，移除标题旁零散 `info` 图标和整行点击打开详情。
- [x] 2.3 将长期计划草稿卡片改为右上角详情按钮触发 `ExercisePreviewSheet`，移除整行点击和 hover 文案“查看教学”。
- [x] 2.4 为三类卡片内容区预留右侧空间，确保长动作名、标签和训练参数不与详情按钮重叠。

## 3. 验证

- [x] 3.1 运行 `openspec validate unify-chat-exercise-detail-entry --strict`。
- [x] 3.2 运行 `npm run typecheck`。
- [x] 3.3 运行 `npm run lint`。
- [x] 3.4 运行 `npm test` 或说明无法运行的原因。
