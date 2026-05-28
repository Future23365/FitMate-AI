## 1. 共享动作条目边界

- [x] 1.1 从 `WorkoutRoutineDraftCard` 当前动作条目结构中提取共享展示组件或共享渲染函数，保留图片、动作名、器械与主要肌群、备注、组数和目标次数/时长布局。
- [x] 1.2 为共享条目边界添加简短中文意图注释，说明它统一聊天训练草稿中的动作条目展示，不负责计划或编排业务状态。
- [x] 1.3 确认共享条目继续使用 `ExerciseDetailIconButton`，且详情打开逻辑仍由调用方传入。

## 2. 卡片接入

- [x] 2.1 将 `WorkoutRoutineDraftCard` 的动作条目渲染切到共享条目边界，保持现有编排卡片视觉表现不变。
- [x] 2.2 将 `WorkoutPlanDraftCard` 的 `activeDay.items` 渲染切到共享条目边界，移除计划卡片独有的 category chip、额外备注分隔线和独立条目间距。
- [x] 2.3 保留长期计划卡片的训练日切换、当天焦点、预估用时、安全建议、排班设置和保存流程。
- [x] 2.4 确认计划卡片和编排卡片缺少动作详情时使用一致的兜底图片、名称、器械和肌群文案。

## 3. 验证

- [x] 3.1 运行 `openspec validate sync-plan-card-item-layout --strict`。
- [x] 3.2 运行 `npm run typecheck`。
- [x] 3.3 运行 `npm run lint`。
- [x] 3.4 运行 `npm test` 或说明无法运行的原因。
