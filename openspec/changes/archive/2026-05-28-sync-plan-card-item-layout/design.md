## Context

聊天流当前有两类训练草稿卡片：`WorkoutRoutineDraftCard` 展示单次动作编排，`WorkoutPlanDraftCard` 展示多天长期计划。两者都渲染动作条目，也都已经复用 `ExerciseDetailIconButton` 和 `ExercisePreviewSheet`，但条目主体仍分别维护：编排卡片使用更紧凑的图片、动作名、器械/肌群、备注、组数目标布局；计划卡片使用另一套 category/equipment 标签、额外分隔线和不同间距。

这会让用户感觉“长期计划”和“单次编排”是两种不同的动作展示模型。实际产品语义上，长期计划只是由多个训练日组成，每个训练日里的动作条目应与单次编排保持一致。

## Goals / Non-Goals

**Goals:**

- 长期计划卡片中每个训练日的动作条目与单次动作编排卡片使用同一套信息结构和视觉布局。
- 计划卡片继续保留多天计划独有的训练日切换、当天焦点、预估用时、安全建议和排班设置。
- 条目布局统一后，后续动作详情入口、图片、备注、组数目标等样式变化只需要维护一处或一个明确共享边界。
- 保持聊天卡片浅色 Material Design 3 风格，不引入新的视觉体系。

**Non-Goals:**

- 不改变 `WorkoutPlanDraft` 或 `WorkoutRoutineDraft` 的数据结构。
- 不改变计划生成、动作编排、AI 输出、API 契约或保存逻辑。
- 不重新设计计划卡片的训练日 tab、排班设置和底部操作区。
- 不使用浏览器截图作为本 change 的默认验证方式。

## Decisions

### 1. 将动作条目抽成共享展示边界

优先提取 `WorkoutDraftExerciseItem` 这类共享组件，接收动作详情、展示参数、备注和详情点击回调。`WorkoutRoutineDraftCard` 和 `WorkoutPlanDraftCard` 都通过该组件渲染动作条目。

取舍：只把计划卡片 className 手动改成编排卡片样式虽然改动更窄，但会保留两份平行布局，后续任何样式调整都可能再次不一致。共享组件能把“动作条目本身是同一种 UI”编码为模块边界。

### 2. 计划层只负责多天容器，不再定义动作条目内部布局

`WorkoutPlanDraftCard` 继续负责训练日切换、`activeDay` 状态、焦点和用时展示、当天安全建议、排班范围和保存动作。进入 `activeDay.items` 后，条目内部布局交给共享展示组件。

取舍：不把整个计划卡片和编排卡片合并成一个大组件，因为两者的卡片头部、计划天数容器、排班闭环和保存语义不同。共享范围限定在动作条目，可以降低重构风险。

### 3. 信息口径以编排卡片为准

统一后的条目展示使用编排卡片当前口径：图片、动作名、器械、主要肌群、备注、组数、每组目标次数或秒数。长期计划不再在条目中单独展示 category chip，也不使用额外的备注分隔线。

取舍：计划卡片原本的 category/equipment chip 信息更像动作库分类，不是训练执行时最关键的信息。器械和主要肌群与编排卡片一致，更适合用户比较每天动作内容。

### 4. 复用既有详情入口

共享条目继续使用 `ExerciseDetailIconButton` 打开 `ExercisePreviewSheet`，不调整详情抽屉内容、不新增打开方式，也不把整行点击恢复为详情入口。

取舍：详情入口一致性已经由 `unify-chat-exercise-detail-entry` change 约束，本次只处理条目主体布局，避免两个 change 职责重叠。

## Risks / Trade-offs

- [Risk] 共享组件参数过多导致调用处不清晰 → Mitigation: 只传入渲染所需的稳定字段，如 `exercise`、`fallbackName`、`sets`、`target`、`mode`、`notes`、`onOpenPreview`。
- [Risk] 计划卡片缺少动作详情快照时无法显示肌群 → Mitigation: 沿用现有 `exerciseMap` 和兜底加载逻辑，缺失时显示与编排卡片一致的兜底文案。
- [Risk] 提取共享组件影响编排卡片已有布局 → Mitigation: 以当前编排卡片 DOM 结构和 className 为基准迁移，并通过类型检查和现有测试确认没有破坏卡片数据流。
