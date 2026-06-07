## 1. 现状审计与反馈分层

- [ ] 1.1 对 `clientRequest` 调用点、直接 `fetch` 调用点、现有 `toast` / `showComposerToast` 调用点做一次完整清单审计，标注命令型写操作、用户可见读请求、首屏 / 分页加载、后台静默同步和缓存预取。
- [ ] 1.2 明确每个入口的反馈策略：必须 loading Toast、延迟 loading Toast、失败才提示、完全静默或只保留局部 loading。
- [ ] 1.3 确认已有全局 `Toaster` 层级、`sonner` 图标和样式足以承载 loading Toast，不新增第二套通知容器。

## 2. 统一异步 Toast 基础设施

- [ ] 2.1 新增前端 async feedback helper / hook，封装 `loading`、`success`、`error`、`dismiss`、稳定 toast id、`delayMs`、`minVisibleMs` 和 `silentOnAbort`。
- [ ] 2.2 在 helper 中统一识别 `AbortError`、`ClientRequestError` 和普通 `Error`，确保取消请求默认关闭 loading 且不误报失败。
- [ ] 2.3 为 helper 添加简短中文意图注释，说明它只负责用户可见异步反馈，不替代 `clientRequest` 的 HTTP 合同。
- [ ] 2.4 增加 helper 单元测试，覆盖成功、失败、延迟展示、最短展示、取消请求、并发 id 隔离和重复触发复用。

## 3. 命令型写操作补齐 loading Toast

- [ ] 3.1 迁移 `features/workouts/components/training-plan-page.tsx` 的组件内临时 `toast` 字符串，统一使用全局 async feedback 处理安排训练、设置休息日、更新状态和移除计划。
- [ ] 3.2 对齐 `features/workouts/components/action-composer-page.tsx` 的 `showComposerToast`，让模板导入、保存、复制和删除训练编排具备 loading / success / error 的统一生命周期。
- [ ] 3.3 补齐 `features/workouts/components/workout-plan-draft-card.tsx` 的长期训练方案保存导入 loading Toast，覆盖动作详情补全、routine 保存、schedule 替换和日历写入全链路。
- [ ] 3.4 补齐 `features/workouts/components/workout-routine-draft-card.tsx` 的单次训练编排保存 loading Toast，并保持保存成功后的跳转行为。
- [ ] 3.5 补齐 `app/(main)/settings/page.tsx` / `LocalAuthProvider` 的本地用户重置 loading Toast，成功和失败使用同一个 toast 生命周期。
- [ ] 3.6 补齐 `components/dev/ai-trace-viewer.tsx` 的清理 trace 和保存 trace log loading Toast，失败时保留现有错误区域并同步 Toast 提示。

## 4. 用户可见读请求和聊天空窗反馈

- [ ] 4.1 在 `features/chat/hooks/use-chat-controller.ts` 的发送流程中增加请求启动到首个 stream event 之间的 loading Toast，收到 `agent_loop`、`agent_progress`、`content`、`done` 或 `error` 后交给气泡 / Agent 活动条。
- [ ] 4.2 为聊天请求超时、HTTP 失败和 stream error 更新同一个 Toast 为用户可理解错误，不直接展示未清洗原始错误对象。
- [ ] 4.3 在 `features/exercises/components/exercise-library-page.tsx` 中为筛选、排序、翻页这类用户触发的列表读请求增加延迟 loading Toast，同时保留列表区域局部 loading / empty / error。
- [ ] 4.4 在动作详情打开 / 切换时为缓存未命中的详情请求增加延迟 loading Toast，缓存命中和 abort 请求不展示失败 Toast。
- [ ] 4.5 审核 `features/exercises/components/exercise-recommendation-card.tsx`、`workout-plan-draft-card.tsx`、`workout-routine-draft-card.tsx` 内的动作详情补全请求，确认它们属于缓存 / 背景补全还是用户可见读请求，并按分层补齐或保持静默。

## 5. 后台同步降噪与状态一致性

- [ ] 5.1 保持 `features/chat/lib/chat-history.ts` 的 debounce 保存默认不展示 loading / success Toast；如需失败提示，确保不会打断当前聊天流式回复。
- [ ] 5.2 保持 dev trace 自动刷新、动作详情预取、动作图片加载和路由切换加载默认不展示 loading Toast。
- [ ] 5.3 确保所有补齐 Toast 的入口仍保留按钮禁用、局部 pending、`aria-busy` 或等价可访问性状态，不把 Toast 当作防重复提交的唯一机制。
- [ ] 5.4 确保组件卸载、请求取消、后续同类请求替换前序请求时关闭对应 loading Toast，不留下过期提示。

## 6. 测试与验证

- [ ] 6.1 增加或更新 async feedback helper tests。
- [ ] 6.2 增加或更新聊天发送反馈 tests，覆盖首包前 loading、首个 stream event 后关闭、超时 / error 更新同一 Toast。
- [ ] 6.3 增加或更新训练日历、动作编排、AI 方案卡和设置页关键写操作 tests，覆盖 loading / success / error / disabled 状态。
- [ ] 6.4 增加或更新动作库筛选 / 翻页 / 详情加载 tests，覆盖延迟 Toast、局部 loading 保留、缓存命中不弹 Toast、abort 静默。
- [ ] 6.5 运行 `openspec validate add-frontend-async-loading-toasts --strict`。
- [ ] 6.6 修改 TypeScript / React 后运行 `npm run typecheck`，并按改动范围运行相关前端测试或 `npm test`。
