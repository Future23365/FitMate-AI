## Why

当前前端已经有 Next.js 路由级拆分，但首页聊天、动作编排、动作图片和全局 layout 仍存在同路由首包过大、图片未优化、列表接口返回过重和全局客户端副作用过早执行的问题。这个 change 用一个明确的性能优化合同收敛这些问题，避免后续只做局部懒加载而留下数据与资源层面的瓶颈。

## What Changes

- 新增前端性能优化能力，覆盖路由内懒加载、首包预算、图片资源优化、动作列表轻量 DTO、全局客户端组件副作用隔离和验证基线。
- 首页聊天页应延迟加载仅在 AI 回复或产物卡片出现时才需要的 Markdown 渲染、训练计划卡、训练编排卡和动作推荐卡。
- 动作编排和训练执行页应延迟加载非首屏或交互后才需要的动作详情 Sheet、语音设置诊断等重交互面板。
- 客户端不应为了类型定义或少量运行时判断而把完整 Zod schema 包进首屏 bundle；需要拆分服务端校验、前端轻量 guard 和交互后动态校验。
- 动作图片应恢复或引入可控优化路径，避免 `next/image` 在 `images.unoptimized: true` 下直接发送原始图片；需要支持本地动作图片的缩略图、多尺寸或 Next 图片优化策略。
- 动作列表接口应提供列表摘要响应，只返回卡片和筛选展示必需字段；完整说明、embedding、长数组和详情数据应在详情请求或明确需要时读取。
- 根 layout 中的侧栏、历史读取和路由过渡副作用应只在实际展示或实际需要时执行，避免 `/training`、`/dev/*` 等独立页面加载无用客户端逻辑。
- 建立可重复的性能验证方式：构建产物入口大小、gzip 大小、图片请求体积、接口响应体积、类型检查、自动化测试和构建检查。

## Capabilities

### New Capabilities

- `frontend-performance-optimization`: 约束前端 bundle、图片资源、列表接口响应和全局客户端副作用的优化目标、验收标准与验证方法。

### Modified Capabilities

无。

## Impact

- 影响首页聊天页：`features/chat/components/chat-page.tsx`、`features/chat/hooks/use-chat-controller.ts`、聊天产物卡片相关组件和 Markdown 渲染链路。
- 影响动作编排与训练执行页：`features/workouts/components/action-composer-page.tsx`、`features/workouts/components/workout-session-page.tsx`、`features/exercises/components/exercise-preview-sheet.tsx`。
- 影响动作库数据出口：`app/api/exercises/route.ts`、`lib/server/exercises/exercise-service.ts`、`lib/server/exercises/exercise-repository.ts`、`lib/shared/exercises/types.ts`。
- 影响图片配置和资源服务：`next.config.ts`、`app/api/exercise-images/[...path]/route.ts`、`lib/server/exercise-images/*`、`exercises_picture/` 派生资源策略。
- 影响根布局与全局客户端组件：`app/layout.tsx`、`components/app/app-sidebar.tsx`、`components/app/route-transition.tsx`、认证 Provider 的全局挂载方式。
- 可能需要新增前端性能统计脚本、轻量 DTO 类型、动态导入边界和相关单元测试；如涉及环境变量、图片目录或构建方式调整，应同步更新项目文档。
