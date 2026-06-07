## Why

当前前端多个异步接口只更新局部 loading 状态或静默执行，网络较慢时用户无法确认操作是否已经开始、是否仍在处理中。需要建立统一的异步操作 Toast 反馈合同，让高价值用户操作在等待、成功和失败阶段都有清晰提示，同时避免后台同步和高频查询造成提示噪音。

## What Changes

- 新增前端异步反馈能力，规定哪些请求必须展示全局 loading Toast、哪些请求只保留局部 Skeleton / Spinner、哪些后台同步只在失败时提示。
- 在前端沉淀可复用的异步 Toast helper，用于承载 `loading`、`success`、`error`、`dismiss`、去重 id、最短展示时间和取消请求处理。
- 排查并补齐主要用户操作入口的加载反馈，包括聊天发送、聊天历史读写、动作库列表 / 详情、训练日历增删改、AI 训练方案保存、动作编排保存 / 复制 / 删除 / 模板导入、本地用户重置和 dev trace 写操作。
- 保留已有页面内状态反馈能力：列表首屏加载、分页加载、详情面板 Skeleton、聊天 Agent 活动条、按钮禁用态和错误区域仍按各自 UI 职责展示。
- 对高频、自动触发或背景同步请求增加降噪规则，例如 debounce 保存、路由切换历史加载、自动刷新和 aborted 请求不应持续弹出全局 loading Toast。
- 不改变 API 契约、数据库结构、AI 输出结构、权限校验、业务数据模型或服务端路由行为。

## Capabilities

### New Capabilities

- `frontend-async-feedback`: 统一前端异步操作的 Toast 加载、成功、失败、取消和降噪规则。

### Modified Capabilities

- 无。该 change 新增跨页面前端反馈合同，不改变现有业务能力的领域需求。

## Impact

- 影响前端基础设施：`components/ui/sonner.tsx`、`lib/client/http/client-request.ts`、可能新增的前端 Toast helper / hook。
- 影响前端页面和组件：`features/chat/hooks/use-chat-controller.ts`、`features/chat/lib/chat-history.ts`、`features/exercises/components/exercise-library-page.tsx`、`features/workouts/components/training-plan-page.tsx`、`features/workouts/components/action-composer-page.tsx`、`features/workouts/components/workout-plan-draft-card.tsx`、`features/workouts/components/workout-routine-draft-card.tsx`、`app/(main)/settings/page.tsx`、`components/dev/ai-trace-viewer.tsx`。
- 影响测试：前端 async feedback helper tests、聊天发送反馈 tests、训练数据写操作反馈 tests、动作库加载降噪 tests，以及必要的组件行为测试。
- 不影响 Prisma schema、数据库迁移、服务端 API 路由合同、AI 编排、Agent tool、模型 prompt、训练计划生成规则或权限隔离。
