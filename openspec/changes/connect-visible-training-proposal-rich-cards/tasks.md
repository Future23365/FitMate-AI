## 1. 现状确认与实现边界

- [ ] 1.1 运行 `git status --short`，确认实现前工作区状态，并隔离无关改动。
- [ ] 1.2 读取 `features/chat/components/chat-page.tsx` 中当前 `VisibleTrainingProposalPanel`、旧 `bubblePlans` / `bubbleRoutines` / `bubbleExerciseRecommendations` 渲染顺序和 `assistantSuggestions` 传递边界，并标记轻量面板需要删除或停用的用户可见路径。
- [ ] 1.3 读取 `features/chat/hooks/use-chat-controller.ts` 和 `features/chat/api/chat-client.ts`，确认 `visible_output` 事件只写入 `message.visibleOutputs`。
- [ ] 1.4 读取 `lib/shared/workout-plans/draft-schema.ts` 和 `lib/shared/exercise-recommendations/schema.ts`，确认旧三张卡片所需的 draft / card 字段。
- [ ] 1.5 确认本 change 不修改 `AgentAction`、`visibleTrainingProposal.payload`、生产 tool registry、`searchExerciseResources`、`inspectVisibleTrainingProposals` 或跨轮事实桥。

## 2. 前端 adapter

- [ ] 2.1 新增 `features/chat/lib/visible-training-proposal-cards.ts` 或等价模块，集中解析 `ChatVisibleOutput` 并导出 discriminated adapter 结果。
- [ ] 2.2 实现 `exercise_selection` 到 `ExerciseRecommendationCard` 数据的转换，动作事实来自 `payload.exerciseItems`，展示详情来自 `content` 或稳定兜底。
- [ ] 2.3 实现 `routine` 到 `WorkoutRoutineDraft` 的转换，包含 `warmup`、`training`、`stretch` 三个 section，并把 `prescription` 映射为旧 draft item 字段。
- [ ] 2.4 实现 `plan` 到 `WorkoutPlanDraft` 的转换，按 `schedule.assignments` 生成训练日和休息日，训练日复用同一套 routine sections。
- [ ] 2.5 为标题、目标、摘要、恢复提示、缺失动作详情等展示字段提供稳定兜底，不把这些字段加入 AI payload 合同。
- [ ] 2.6 如旧卡片首屏需要完整动作详情，复用 `/api/exercises/:id` 补齐逻辑或已有详情加载 helper，确保展示详情不反写 `visibleTrainingProposal.payload`。

## 3. 聊天气泡接入

- [ ] 3.1 将 `VisibleTrainingProposalPanel` 用户可见渲染路径替换为富卡片 renderer，按 adapter 结果渲染 `ExerciseRecommendationCard`、`WorkoutRoutineDraftCard` 或 `WorkoutPlanDraftCard`。
- [ ] 3.2 保持新消息 `visibleOutputs` 为事实源，不在 `visible_output` 事件消费时写入 `bubblePlans`、`bubbleRoutines` 或 `bubbleExerciseRecommendations`。
- [ ] 3.3 当同一 assistant message 存在可渲染 `visibleTrainingProposal` 时，避免再重复渲染对应旧 `bubble*` 卡片。
- [ ] 3.4 保留旧历史消息兼容：没有可渲染 `visibleTrainingProposal` 时，继续展示已有 `bubblePlans`、`bubbleRoutines` 或 `exerciseRecommendations`。
- [ ] 3.5 确保 `ExerciseRecommendationCard` 底部仍只展示本轮 `assistantSuggestions`，不恢复固定按钮。
- [ ] 3.6 删除或停用 `VisibleTrainingProposalPanel` 的轻量面板 UI，不保留标题、分段 mini list、处方 chip、`exercise_selection` / `routine` / `plan` 技术枚举 badge 或第四种训练卡片 fallback。

## 4. 测试与验证

- [ ] 4.1 新增或更新 adapter 单测，覆盖 `exercise_selection`、`routine`、`plan` 三种 `visibleTrainingProposal.kind`。
- [ ] 4.2 更新聊天 controller 或 chat client 测试，覆盖 `visible_output` 只追加到 `message.visibleOutputs`，不写回旧 `bubble*` state。
- [ ] 4.3 更新聊天页渲染测试，覆盖新富卡片渲染、旧历史卡片兼容、同消息不重复渲染，以及不显示轻量面板或 `exercise_selection` / `routine` / `plan` 技术枚举字段。
- [ ] 4.4 更新或新增卡片相关测试，覆盖 `plan` 训练日复用同一套编排、休息日来自 `schedule.assignments`。
- [ ] 4.5 运行与 adapter、聊天事件消费和卡片渲染相关的最窄自动化测试。
- [ ] 4.6 运行 `npm run typecheck`。
- [ ] 4.7 运行 `openspec validate connect-visible-training-proposal-rich-cards --strict`。

## 5. 收口检查

- [ ] 5.1 扫描确认实现未修改 AI 输出合同、tool manifest、生产 tool registry、跨轮事实桥或服务端语义分流。
- [ ] 5.2 检查最终 diff，确认未混入无关代码、无关格式化或旧链路兼容层扩展。
- [ ] 5.3 检查最终 UI 路径，确认新 Agent 消息只使用旧三张富卡片样式，不保留 `VisibleTrainingProposalPanel` 用户可见 fallback。
- [ ] 5.4 完成实现后按项目规则补充必要的方案变更历史和项目演变记录。
