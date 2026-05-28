## Why

当前页面 UI 主要由各页面和业务组件直接使用 Tailwind class 自实现，按钮、卡片、输入、筛选、抽屉、弹窗、标签、列表状态在不同页面存在重复实现和细节分叉。随着聊天、训练计划、动作库、动作编排、训练执行和调试台页面继续扩展，需要引入 `shadcn/ui` 作为统一的基础组件层，降低后续页面样式漂移和交互重复维护成本。

## What Changes

- 将 Tailwind CSS 从当前 3.4 升级到 4.3，并按 Tailwind v4 的 CSS-first 配置、PostCSS 插件拆分和浏览器支持边界迁移现有样式入口。
- 引入 `shadcn/ui` 项目配置、基础依赖和 `components/ui/*` 组件目录，保留项目现有浅色 Material Design 3 视觉 token，并将 shadcn 组件适配到 Tailwind v4.3 下的 `primary`、`surface`、`outline`、`muted` 等设计语言。
- 建立项目级 UI 基础组件使用规范，明确哪些交互控件必须优先使用 `components/ui`，哪些业务组件继续保留在 `components/app`、`components/dev` 或 `features/*/components`。
- 逐页替换自实现基础控件：聊天首页、动作库、动作推荐卡、动作详情抽屉、训练计划页、动作编排页、训练执行页、设置页和 AI Trace 调试台都应迁移到统一的 Button、Card、Input、Textarea、Badge、Tabs、Select、Dialog/Sheet/Drawer、ScrollArea、Tooltip、Dropdown/Menu、Skeleton 等组件。
- 清理重复的自实现按钮、表单、标签、筛选选择器、弹窗外壳和卡片样式，但保留承载领域状态和复杂布局的业务组件。
- 建立验收检查清单，覆盖视觉一致性、交互可访问性、响应式布局、自动化检查、OpenSpec 校验和页面级人工核对。
- 不改变聊天编排、训练计划生成、训练执行状态、动作筛选语义、API 契约、Prisma Schema 或 AI 输出结构。

## Capabilities

### New Capabilities

- `shadcn-ui-standardization`: 约束项目引入 `shadcn/ui` 后的基础组件层、逐页替换范围、业务组件边界、样式一致性和验收要求。

### Modified Capabilities

- 无。

## Impact

- 影响依赖与配置：`package.json`、`package-lock.json`、`components.json`、`postcss.config.js`、`tailwind.config.ts` 的迁移或删除策略、`app/globals.css`、`lib/utils.ts` 或等价的 `cn` 工具位置。
- 影响基础 UI 目录：新增 `components/ui/*`，包括按钮、卡片、表单、标签、弹窗、抽屉、菜单、滚动区域、骨架屏和提示等组件。
- 影响应用外壳与共享组件：`components/app/app-sidebar.tsx`、`components/app/right-drawer.tsx`、`components/app/route-transition.tsx`、`components/app/symbol-icon.tsx`、`components/dev/ai-trace-viewer.tsx`。
- 影响页面和业务组件：`features/chat/components/chat-page.tsx`、`features/exercises/components/*`、`features/workouts/components/*`、`app/settings/page.tsx` 以及对应 `app/*/page.tsx` 入口。
- 不涉及数据库迁移、API Route 行为、服务端领域服务、AI Prompt、Tool Calling、训练规则或持久化结构变更。
