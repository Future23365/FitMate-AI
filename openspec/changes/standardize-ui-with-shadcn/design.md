## Context

当前项目已经在 `docs/architecture.md` 中把 `shadcn/ui` 列为客户端 UI 技术方向，但实际代码尚未落地：仓库没有 `components.json`、没有 `components/ui/*`，`package.json` 也没有 `class-variance-authority`、`clsx`、`tailwind-merge`、Radix 相关组件依赖。现有页面主要通过 Tailwind class 直接拼出按钮、卡片、输入框、筛选器、标签、抽屉、弹窗、菜单和状态块。

当前 UI 分布：

- 应用外壳：`components/app/app-sidebar.tsx`、`components/app/right-drawer.tsx`、`components/app/route-transition.tsx`、`components/app/symbol-icon.tsx`。
- 聊天首页：`features/chat/components/chat-page.tsx` 承载消息气泡、建议回复、输入栏、卡片挂载和错误状态。
- 动作库：`features/exercises/components/exercise-library-page.tsx` 承载筛选、列表、详情面板和筛选抽屉；`exercise-preview-sheet.tsx` 承载动作详情抽屉；`exercise-recommendation-card.tsx` 承载聊天中的动作推荐卡。
- 训练计划与编排：`features/workouts/components/training-plan-page.tsx`、`action-composer-page.tsx`、`workout-plan-draft-card.tsx`、`workout-routine-draft-card.tsx`。
- 训练执行：`features/workouts/components/workout-session-page.tsx` 承载训练状态、控制按钮、动作预览、语音设置弹窗、范围控件和完成反馈。
- 调试台：`components/dev/ai-trace-viewer.tsx` 使用了另一套 slate/blue/red 样式和自实现按钮、标签、详情面板。
- 设置页：`app/settings/page.tsx` 是低复杂度页面，但也应纳入基础组件一致性。

项目当前是 Tailwind CSS 3.4。Tailwind 官方已发布 v4.3，shadcn 当前 Next.js 安装路径也面向 Tailwind v4 项目。因此本 change 将组件库标准化和 Tailwind 4.3 升级合并处理，避免先按 v3 接入 shadcn 后很快再经历一轮基础样式和组件模板迁移。

## Goals / Non-Goals

**Goals:**

- 建立 `shadcn/ui` 基础组件层，形成项目统一的 Button、Card、Input、Textarea、Badge、Tabs、Select、Dialog、Sheet、Drawer、Popover、DropdownMenu、ScrollArea、Tooltip、Skeleton、Separator、Slider、Switch、Label 等基础控件来源。
- 将 Tailwind CSS 升级到 4.3，迁移 `postcss.config.js`、`app/globals.css` 和主题 token 到 v4 可维护结构。
- 将 shadcn 组件主题适配到现有浅色 Material Design 3 风格，保持 `#F6F8FB` 页面背景、白色 panel、蓝色 primary、清晰边框和克制阴影。
- 逐页替换基础控件，减少页面内重复 className 和重复交互实现。
- 保留业务组件边界：领域组件继续表达聊天、动作、训练、计划和 AI Trace 的业务状态；它们内部优先组合 `components/ui`。
- 迁移过程中保持业务语义不变，不改变 API、数据模型、AI 编排、训练状态机和动作选择规则。
- 为每个页面定义替换清单、注意事项和验收检查，便于分阶段实施和 review。

**Non-Goals:**

- 不引入第二套大型 UI 库，不用 MUI、Ant Design、Chakra UI 等替代现有 Tailwind 体系。
- 不把所有业务组件删除。`ExercisePreviewSheet`、`ExerciseRecommendationCard`、`WorkoutSessionPage` 内部子组件等承载领域语义的组件应保留，只替换其中的基础控件和可复用外壳。
- 不重做产品信息架构、路由、训练执行流程、聊天协议、动作筛选语义或计划保存流程。
- 不主动打开浏览器做视觉验证；实现阶段按项目规则优先运行 lint、typecheck、测试和构建，人工视觉验收由明确请求后再进行。

## Decisions

### 1. 先建立本地 `components/ui`，再逐页迁移

采用 shadcn 的本地源码模式：组件被生成到仓库的 `components/ui/*`，作为项目可修改的基础组件，而不是依赖运行时黑盒组件库。

取舍：

- 相比继续每个页面自实现，`components/ui` 能统一变体、focus、disabled、aria、尺寸和 token 映射。
- 相比一次性大规模替换全部 JSX，先建立基础层再分页面迁移，可以让每个页面都有独立验收点。
- 相比引入外部不可控组件库，本地源码更适合当前项目的 MD3 token 和健身业务卡片视觉。

### 2. Tailwind 4.3 升级和 shadcn 接入合并处理

实现时应先确认 Node.js 版本满足 Tailwind v4 升级工具要求，再将 `tailwindcss` 升级到 4.3，并按官方 v4 路径处理 PostCSS 插件、CSS 入口和配置迁移。相比先维持 Tailwind v3 再接入 shadcn，这次直接升级到 v4.3 能让 `components/ui` 使用当前 shadcn 模板，减少二次迁移成本。

建议实施边界：

- 优先评估 `npx @tailwindcss/upgrade` 在本仓库的输出，但必须人工 review diff，不能让升级工具无审查地覆盖项目 token、断点和全局 CSS。
- 将 PostCSS 配置从 `tailwindcss` 插件迁移到 `@tailwindcss/postcss`，并按 v4 要求更新 devDependencies。
- 将 `app/globals.css` 的 `@tailwind base; @tailwind components; @tailwind utilities;` 迁移为 v4 的 CSS-first 入口，并用 `@theme` 或等价方式承载现有项目 token。
- 迁移或删除 `tailwind.config.ts` 前必须保留现有颜色、字体、spacing、radius、shadow、断点和内容扫描语义；如果某些配置必须继续通过 JS 配置表达，需在 design/实现说明中注明原因。
- 扫描并处理 Tailwind v4 破坏性变更：废弃 opacity utilities、`shadow-sm`/`rounded-sm`/`blur-sm` 等 scale rename、`outline-none`、默认 ring、默认 border color、space/divide selector 变化、Preflight 变化。
- 新增 `components.json`，设置 `tsx: true`、`rsc: true`、`aliases.components: "@/components"`、`aliases.utils: "@/lib/utils"`、`aliases.ui: "@/components/ui"`。
- 新增或复用 `lib/utils.ts`，导出 `cn`，用于 `clsx` + `tailwind-merge`。
- 新增依赖时只添加 shadcn 组件实际需要的依赖，不顺手引入 Framer Motion、React Hook Form 或图表库。
- shadcn 的 semantic tokens 必须映射到 Tailwind v4.3 下的现有颜色变量，避免生成一套与项目 token 并行冲突的颜色体系。

### 3. shadcn 组件只承载基础交互，业务组件继续留在领域目录

目录边界：

- `components/ui/*`：shadcn 基础组件和少量项目级变体调整，只包含通用 UI 行为，不 import 健身、聊天、AI Trace 领域类型。
- `components/app/*`：应用外壳、导航、路由过渡、Material Symbols 封装、共享抽屉适配层。
- `components/dev/*`：调试台业务视图。
- `features/*/components/*`：领域组件，内部组合 `components/ui`。

这样可以避免把业务状态塞进基础组件，也避免 `components/ui` 变成不可维护的混合目录。

### 4. `RightDrawer` 迁移为 shadcn Sheet 的业务适配层，而不是直接删除

项目已有 `components/app/right-drawer.tsx`，负责 portal、遮罩、右侧滑入、滚动锁定和 `drawer-open` 页面联动。shadcn 的 `Sheet` 已提供标准侧边弹层、aria 和基础关闭交互，但项目还需要保留现有 `drawer-open` 背景联动和右侧抽屉业务调用方式。

决策：

- 引入 `components/ui/sheet` 后，优先让 `RightDrawer` 内部组合 `Sheet`/`SheetContent`，保留原有对外 props。
- `ExercisePreviewSheet`、动作库筛选抽屉等调用方继续使用 `RightDrawer`，减少重复迁移风险。
- `VoiceSettingsDialog` 这类居中弹窗优先迁移到 `Dialog`，不强行复用右侧抽屉。

### 5. 先迁移高频基础控件，再处理页面结构

迁移顺序按风险和复用价值排序：

1. 基础层：Button、Card、Badge、Input、Textarea、Label、Separator、Skeleton、ScrollArea、Tooltip。
2. 表单与选择：Select、Checkbox、Switch、Slider、Tabs、Toggle/ToggleGroup。
3. 弹层：Dialog、Sheet、Drawer、Popover、DropdownMenu。
4. 页面级替换：先低风险页面和共享组件，再迁移复杂训练执行页和 AI Trace 调试台。

这样能先收敛全局样式，再处理更复杂的状态组件。

### 6. 页面替换清单

| 页面/模块 | 主要替换组件 | 保留业务组件 | 注意事项 |
|---|---|---|---|
| `features/chat/components/chat-page.tsx` | `Button`、`Input` 或 `Textarea`、`Card`、`Badge`、`ScrollArea`、`Skeleton`、`Alert` | `ChatPage`、`MarkdownContent`、消息渲染逻辑、训练/动作卡片挂载 | 不改变 `useChatController`、消息流、`assistant_action` 和 suggested replies 语义；建议回复用 `Button variant="secondary"` 或项目自定义 chip variant。 |
| `components/app/app-sidebar.tsx` | `Button`、`ScrollArea`、`Tooltip`、`Sheet` 或保留移动端业务抽屉适配 | `AppSidebar`、`SidebarPanel`、历史记录数据流 | 移动端导航可基于 `Sheet side="left"`；保留 `md` breakpoint 现有语义和历史删除入口。 |
| `features/exercises/components/exercise-library-page.tsx` | `Button`、`Card`、`Badge`、`Select`、`Tabs`/`ToggleGroup`、`ScrollArea`、`Sheet`、`Skeleton` | `ExerciseLibraryPage`、`ExerciseDetailPanel`、筛选状态和查询参数管理 | `SelectFilter` 应迁移到 shadcn `Select`；chip 筛选可用 `Badge` + `Button` 组合；不能改变 `/api/exercises` 查询参数。 |
| `features/exercises/components/exercise-preview-sheet.tsx` | `Sheet`、`Button`、`Badge`、`Separator`、`ScrollArea` | `ExercisePreviewSheet` 的图片轮播、动作步骤、主操作语义 | 通过 `RightDrawer` 适配，保留训练页打开详情时暂停训练的调用方语义。 |
| `features/exercises/components/exercise-recommendation-card.tsx` | `Card`、`Button`、`Badge`、`Alert`、`Skeleton` | 推荐卡业务结构、动作选择和替换回调 | 不改变推荐卡数据结构和保存/替换动作流程。 |
| `features/workouts/components/workout-plan-draft-card.tsx` | `Card`、`Tabs`、`Button`、`Badge`、`Separator`、`Alert` | 旧计划草稿兼容展示逻辑 | 如果该组件已逐步退场，只做基础控件替换，不扩大旧模型兼容。 |
| `features/workouts/components/workout-routine-draft-card.tsx` | `Card`、`Button`、`Badge`、`Alert`、`Separator`、`ScrollArea` | routine 草稿保存、动作详情打开和错误处理 | 保持保存 routine、跳转编排、打开动作详情的现有回调。 |
| `features/workouts/components/training-plan-page.tsx` | `Card`、`Button`、`Badge`、`DropdownMenu`、`ScrollArea`、`Tooltip`、`Separator` | 月历状态、日程选择、已保存计划列表 | 日历格子可继续是业务自定义布局，但按钮、菜单、状态标签应统一；不能改变 schedule 数据更新语义。 |
| `features/workouts/components/action-composer-page.tsx` | `Button`、`Input`、`Select`、`Card`、`Badge`、`Tabs`/`ToggleGroup`、`Slider` 或项目 Stepper、`ScrollArea`、`Tooltip` | 编排状态、分段 rest、动作库选择、`RoutineCompositionCard` | 复杂 Stepper 可先封装为业务组件并内部用 Button/Input；不改变 section/rest 业务规则。 |
| `features/workouts/components/workout-session-page.tsx` | `Button`、`Dialog`、`Sheet`、`Card`、`Badge`、`Progress`、`Slider`、`Select`、`Switch`、`Alert`、`Tooltip` | 训练执行状态机、语音播报、完成反馈、动作演示 | 控制按钮需保持固定尺寸，避免训练中布局跳动；语音设置弹窗迁移到 `Dialog` 时保留 Web Speech 自检语义。 |
| `app/settings/page.tsx` | `Card`、`Button`、`Switch`、`Separator`、`Label` | 设置页路由和用户可见配置 | 当前设置项少，可作为首个低风险页面验证组件 token。 |
| `components/dev/ai-trace-viewer.tsx` | `Button`、`Card`、`Badge`、`Tabs`、`ScrollArea`、`Accordion`、`Separator`、`Skeleton`、`Alert` | trace 分组、日志复制、JSON 展示和 token 统计 | 保持 dev-only 信息密度，允许比常规页面更紧凑，但颜色 token 要回到项目统一浅色体系。 |

### 7. 样式和可访问性规范

- `Button` 需要提供项目常用变体：`default`、`secondary`、`outline`、`ghost`、`destructive`、`link`，以及需要时新增 `soft`/`chip` 项目变体。
- `Card` 默认圆角不超过现有大型摘要规范；动作卡片和列表项继续控制在约 12px，页面大摘要可用 20px。
- 所有 interactive icon button 必须有 `aria-label` 或可见文本。
- `Dialog`/`Sheet` 必须有标题语义；如果视觉不需要标题，也应使用可访问的隐藏标题。
- `ScrollArea` 只替换真实需要滚动容器的区域，不把整个页面嵌套进多层滚动；可以用 Tailwind 4.3 原生 scrollbar utilities 逐步替代项目中重复的自定义滚动条 class。
- `Select`、`Switch`、`Slider`、`Checkbox` 必须配合 `Label` 或明确 `aria-label`。
- 不新增大面积深色面板，不引入紫蓝渐变、装饰球或营销式 hero。

### 8. 删除和收敛策略

- 页面内重复的 `SelectFilter`、自实现 tab 按钮、自实现菜单、重复 toast/snackbar、重复弹层外壳应在对应页面迁移后删除。
- 如果某个自实现组件承载业务语义，例如 `RoutineCompositionCard`、`CurrentPlanCard`、`ExerciseDetailPanel`，应保留组件名和业务边界，只替换内部基础 UI。
- 不要求所有 className 消失。布局、网格、业务状态颜色、训练进度、图片容器仍可以使用 Tailwind class。
- 新增核心基础组件或业务适配组件时必须添加简短中文意图注释，说明职责边界。

## Risks / Trade-offs

- [Risk] Tailwind 4.3 是主版本升级，可能改变 Preflight、默认 border/ring、space/divide selector 和部分 utility 名称，导致页面视觉细节回归 → Mitigation: 先运行升级工具并人工 review，再按页面分阶段迁移和验收。
- [Risk] Tailwind v4 的现代浏览器要求高于 v3，旧浏览器可能不再被支持 → Mitigation: 明确本项目按 Tailwind v4 官方浏览器边界验收；如未来需要旧浏览器支持，应另开兼容 change。
- [Risk] 一次性替换所有页面导致 review 困难且容易引入交互回归 → Mitigation: 按基础层、共享组件、页面分批提交任务，每个页面都有独立检查项。
- [Risk] shadcn 默认 token 与现有 MD3 token 并存造成颜色体系冲突 → Mitigation: 将 shadcn semantic token 映射到现有 `primary`、`canvas`、`panel`、`line`、`muted`，不要生成另一套视觉风格。
- [Risk] Radix 弹层默认行为与现有 `drawer-open` 页面缩放或训练页语音弹窗交互冲突 → Mitigation: 先在 `RightDrawer` 和 `VoiceSettingsDialog` 这类适配层中统一处理，不让每个业务页面直接绕过适配。
- [Risk] 调试台迁移后信息密度下降 → Mitigation: dev 页面允许使用更紧凑的组件尺寸和 monospace block，但颜色、按钮、状态标签仍使用统一基础组件。
- [Risk] 自定义业务卡片全部强行改成 shadcn Card 会丢失运动场景的信息层级 → Mitigation: 只用 `Card` 作为基础外壳，肌群、训练进度、日历格子和动作图片区继续保留领域布局。

## Migration Plan

1. 基础准备：确认 Node.js、Next.js、PostCSS、Tailwind、shadcn CLI 当前状态，制定 Tailwind 4.3 升级 diff review 清单。
2. Tailwind 升级：升级 `tailwindcss` 到 4.3，新增 `@tailwindcss/postcss`，迁移 `postcss.config.js`、`app/globals.css` 和 token 配置。
3. 兼容扫描：处理 Tailwind v4 破坏性变更、旧 utility、默认 border/ring、space/divide selector、Preflight 和自定义滚动条策略。
4. shadcn 初始化：初始化 `components.json`、`components/ui`、`lib/utils.ts`，安装 shadcn 基础依赖。
5. 组件生成：添加基础组件 `button card badge input textarea label separator skeleton scroll-area tooltip alert`。
6. 交互生成：添加 `select tabs switch slider checkbox dropdown-menu popover dialog sheet drawer accordion progress` 等页面需要的组件。
7. 主题适配：让 shadcn semantic token 映射现有项目 token，并检查浅色 MD3 风格不漂移。
8. 共享层迁移：迁移 `AppSidebar`、`RightDrawer`、低风险设置页，验证基础组件视觉和可访问性。
9. 内容页迁移：迁移聊天页、动作推荐卡、动作库和动作详情抽屉。
10. 训练页迁移：迁移计划草稿卡、routine 草稿卡、训练计划页、动作编排页和训练执行页。
11. 调试台迁移：迁移 AI Trace Viewer 的按钮、状态标签、面板、滚动区和详情展开结构。
12. 清理重复实现：删除已替换的页面内基础控件实现、重复弹层外壳和不再使用的样式 class。
13. 验收：运行 OpenSpec 校验、lint、typecheck、相关测试和 build；按页面检查清单做人工 review。

## Rollback Strategy

- `components/ui` 是本地源码，若某个基础组件变体有问题，应优先修复组件变体，而不是回退页面。
- 如果某个页面迁移造成严重交互回归，可以保留基础层和其他已迁移页面，只回退该页面对应 commit 或任务分支。
- 如果 Tailwind 4.3 升级导致构建链路不可恢复，应先回退 Tailwind/PostCSS/CSS 入口相关改动，再继续 shadcn 页面迁移；不要带着半可用基础层继续替换页面。

## Open Questions

- `components/ui` 是否完全采用 shadcn `new-york` 风格，还是在初始化后立即统一改成项目自定义变体？默认建议采用 `new-york` 作为结构模板，再映射到项目 token。
- 是否在这次重构中引入 `sonner` 或 toast 组件？默认不引入，除非现有页面已有明确 toast/snackbar 需求需要统一。
- `workout-plan-draft-card.tsx` 是否仍作为长期入口保留？如果后续已确认旧计划草稿退场，实现时应只做必要迁移或删除，而不是重度打磨旧组件。
