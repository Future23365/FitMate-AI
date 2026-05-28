## 1. Tailwind 4.3 与 shadcn/ui 基础接入

- [ ] 1.1 确认当前 Node.js、Next.js、PostCSS、`tailwindcss`、`tailwind.config.ts`、`postcss.config.js`、`app/globals.css`、`tsconfig.json` alias 和 package manager 状态，记录 Tailwind 4.3 升级前基线。
- [ ] 1.2 评估运行 `npx @tailwindcss/upgrade` 的输出；如使用升级工具，必须人工 review diff 后再保留改动。
- [ ] 1.3 将 `tailwindcss` 升级到 4.3，并添加 Tailwind v4 PostCSS 集成需要的 `@tailwindcss/postcss`，更新 `package.json` 和 `package-lock.json`。
- [ ] 1.4 将 `postcss.config.js` 从 Tailwind v3 插件配置迁移到 Tailwind v4 的 `@tailwindcss/postcss` 配置，删除不再需要的 v3 专用 PostCSS 插件配置。
- [ ] 1.5 将 `app/globals.css` 从 `@tailwind base/components/utilities` 入口迁移到 Tailwind v4 CSS 入口，并迁移项目颜色、字体、spacing、radius、shadow、断点等 token。
- [ ] 1.6 处理 Tailwind v4 破坏性变更：移除或替换废弃 opacity utilities、utility rename、`outline-none`、默认 ring、默认 border color、space/divide selector 和 Preflight 差异。
- [ ] 1.7 初始化 `components.json`，配置 `tsx`、`rsc`、`aliases.components`、`aliases.ui`、`aliases.utils`、`tailwind.css` 和 Tailwind v4 对应配置，确保路径匹配当前仓库结构。
- [ ] 1.8 新增或复用 `lib/utils.ts`，导出供 shadcn 组件使用的 `cn` 工具，并添加简短中文意图注释说明它负责合并条件 className 和 Tailwind 冲突。
- [ ] 1.9 安装 shadcn/ui 基础依赖和当前组件实际需要的 Radix/utility 依赖，不引入与本重构无关的依赖。
- [ ] 1.10 生成第一批基础组件：`button`、`card`、`badge`、`input`、`textarea`、`label`、`separator`、`skeleton`、`scroll-area`、`tooltip`、`alert`。
- [ ] 1.11 生成第二批交互组件：`select`、`tabs`、`switch`、`slider`、`checkbox`、`dropdown-menu`、`popover`、`dialog`、`sheet`、`drawer`、`accordion`、`progress`。
- [ ] 1.12 检查 `components/ui/*` 不 import 任何聊天、动作、训练、AI Trace、Prisma 或服务端领域类型。

## 2. 主题与组件变体适配

- [ ] 2.1 将 shadcn semantic tokens 映射到 Tailwind 4.3 下的项目现有浅色 MD3 token，覆盖 background、foreground、primary、secondary、muted、accent、destructive、border、input、ring、card、popover 等语义。
- [ ] 2.2 调整 `Button` 变体和尺寸，覆盖 `default`、`secondary`、`outline`、`ghost`、`destructive`、`link`，并按项目需要补充 `soft` 或 `chip` 变体。
- [ ] 2.3 调整 `Card`、`Badge`、`Input`、`Textarea`、`Select`、`Tabs`、`Dialog`、`Sheet` 的圆角、边框、focus ring、disabled、hover 和密度，使其符合现有浅色专业风格。
- [ ] 2.4 保留 Material Symbols 图标体系，确认基础组件中的图标按钮通过 `SymbolIcon` 或现有图标约定组合，不引入新的主图标体系。
- [ ] 2.5 检查 `app/globals.css` 中现有滚动条、route transition、drawer、训练完成 confetti 和 body 背景样式没有被 Tailwind 4.3 或 shadcn token 覆盖破坏。
- [ ] 2.6 评估是否用 Tailwind 4.3 原生 scrollbar utilities 替代重复自定义滚动条 class，保留确实需要自定义 CSS 的场景。

## 3. 应用外壳和共享弹层迁移

- [ ] 3.1 迁移 `components/app/app-sidebar.tsx` 的新建对话、导航项、历史删除、设置入口和移动端导航按钮到 `Button`、`ScrollArea`、`Tooltip` 或 `Sheet` 组合。
- [ ] 3.2 将移动端导航弹层迁移到 shadcn `Sheet` 或项目适配层，保留当前断点、遮罩关闭、关闭按钮和历史记录交互。
- [ ] 3.3 将 `components/app/right-drawer.tsx` 改为基于 shadcn `Sheet` 的右侧抽屉适配层，保留现有 props、`drawer-open` 背景联动、滚动锁定和业务调用方式。
- [ ] 3.4 确认 `components/app/route-transition.tsx` 和 `components/app/symbol-icon.tsx` 不需要强行迁移，只保留与基础组件兼容的职责边界。

## 4. 设置页和低风险页面验证

- [ ] 4.1 迁移 `app/settings/page.tsx` 到 `Card`、`Button`、`Switch`、`Label`、`Separator`，作为基础组件 token 的低风险首个页面。
- [ ] 4.2 检查设置页文字、按钮、切换项在窄视口下不溢出、不遮挡，并确认不新增无关设置能力。

## 5. 聊天首页迁移

- [ ] 5.1 迁移 `features/chat/components/chat-page.tsx` 的顶部操作、示例问题、建议回复和发送按钮到 `Button` 或项目 chip 变体。
- [ ] 5.2 将聊天输入栏迁移到 `Input` 或 `Textarea`，保留 Enter 发送、disabled、loading 和 `useChatController` 状态语义。
- [ ] 5.3 将错误提示、思考中状态、计划生成中状态迁移到 `Alert`、`Skeleton`、`Badge` 或统一状态块。
- [ ] 5.4 将聊天滚动区域迁移到 `ScrollArea` 或保留现有滚动容器但统一滚动条样式，确保消息自动滚动语义不变。
- [ ] 5.5 确认 `assistant_action`、suggested replies、训练卡片和动作推荐卡挂载逻辑没有因 UI 组件替换改变。

## 6. 动作库、动作推荐与动作详情迁移

- [ ] 6.1 迁移 `features/exercises/components/exercise-library-page.tsx` 的筛选入口、筛选 chip、列表卡片、详情操作、空状态和 loading 状态到统一基础组件。
- [ ] 6.2 将 `SelectFilter` 替换为 shadcn `Select` 或项目封装的筛选选择器，保留肌群、分类、器械、目标和更多筛选参数语义。
- [ ] 6.3 将动作库筛选抽屉迁移到 `RightDrawer`/`Sheet` 适配层，删除页面内重复 portal、body class、滚动锁定和过渡时序实现。
- [ ] 6.4 迁移 `ExerciseDetailPanel` 内部的状态标签、操作按钮、相关动作入口和信息分组到 `Card`、`Badge`、`Button`、`Separator`。
- [ ] 6.5 迁移 `features/exercises/components/exercise-preview-sheet.tsx` 的抽屉外壳、关闭按钮、动作标签、步骤分隔和主操作按钮到统一基础组件，保留图片预加载和轮播语义。
- [ ] 6.6 迁移 `features/exercises/components/exercise-recommendation-card.tsx` 的推荐卡外壳、动作项、替换按钮、加入按钮、提示区和空状态到统一基础组件。
- [ ] 6.7 确认 `/api/exercises` 查询参数、动作选择、动作详情打开和推荐动作替换回调保持不变。

## 7. 训练计划与草稿卡迁移

- [ ] 7.1 迁移 `features/workouts/components/workout-routine-draft-card.tsx` 的卡片外壳、section 标识、动作行、保存按钮、错误提示和动作详情入口到统一基础组件。
- [ ] 7.2 迁移仍需保留的 `features/workouts/components/workout-plan-draft-card.tsx` 基础控件，避免继续扩大旧计划草稿组件职责。
- [ ] 7.3 迁移 `features/workouts/components/training-plan-page.tsx` 的月份切换、已保存计划菜单、安排按钮、状态标签、统计卡片和右侧活动列表到统一基础组件。
- [ ] 7.4 保留训练计划月历格子的业务布局，确保日程选择、计划安排、完成状态展示和 `WorkoutSchedule` 数据语义不变。

## 8. 动作编排页迁移

- [ ] 8.1 迁移 `features/workouts/components/action-composer-page.tsx` 的标题输入、动作库筛选、添加按钮、保存按钮、状态标签和工作台指标到统一基础组件。
- [ ] 8.2 将 `LibraryFilterSelect` 替换为 shadcn `Select` 或项目封装筛选组件，保留筛选项来源和选中状态。
- [ ] 8.3 将 `Stepper`、`RestIntervalControl` 和 `SectionBoundaryRestControl` 内部按钮/输入迁移到 `Button`、`Input`、`Slider` 或清晰的项目业务控件。
- [ ] 8.4 将 `WorkoutSectionBlock`、`RoutineCompositionCard`、`WorkoutExerciseRow` 的卡片、按钮、badge 和 tooltip 迁移到统一基础组件，同时保留 section/rest 业务边界。
- [ ] 8.5 确认动作编排、分段休息、动作详情打开、保存 routine 和跳转训练执行语义不变。

## 9. 训练执行页迁移

- [ ] 9.1 迁移 `features/workouts/components/workout-session-page.tsx` 的主控制按钮、顶部状态、动作计时、步骤状态、指标卡和完成反馈到统一基础组件。
- [ ] 9.2 将 `VoiceSettingsDialog` 迁移到 shadcn `Dialog` 或项目弹窗适配层，保留语音开关、语音选择、音量/语速/音调范围控件和自检流程。
- [ ] 9.3 将训练页中的 select、range input、提示气泡、错误/警告/成功状态迁移到 `Select`、`Slider`、`Alert`、`Badge` 等基础组件。
- [ ] 9.4 保留训练执行状态机、暂停/继续、步骤自动推进、语音播报、动作详情打开暂停训练、完成态和本地 session state 语义。
- [ ] 9.5 检查训练执行核心控制区在步骤切换、暂停、继续、语音提示和完成状态下保持稳定尺寸，不因文字或组件替换跳动。

## 10. AI Trace 调试台迁移

- [ ] 10.1 迁移 `components/dev/ai-trace-viewer.tsx` 的刷新、清空、复制、导出等操作按钮到统一 `Button` 变体。
- [ ] 10.2 迁移 trace 列表、分组卡片、步骤详情、token 统计和状态标签到 `Card`、`Badge`、`Accordion`、`Tabs`、`ScrollArea`、`Separator`。
- [ ] 10.3 保留 JSON/pre 数据块的 monospace 可读性和信息密度，但将边框、背景、状态色映射到项目 token。
- [ ] 10.4 确认 trace 分组、日志复制、导出 payload、token usage 计算和 dev log 可读化语义不变。

## 11. 清理与边界复核

- [ ] 11.1 删除已被 `components/ui` 替代的页面内重复按钮、select、tab、menu、badge、skeleton、dialog/sheet 外壳实现。
- [ ] 11.2 使用 `rg` 扫描 `<button`、`<input`、`<textarea`、`<select`、`role=\"dialog\"`、重复 `rounded-xl border` 状态块，确认剩余自实现都是布局或业务组件需要。
- [ ] 11.3 检查 `components/ui/*`、`components/app/*`、`components/dev/*`、`features/*/components/*` 目录边界，确保基础组件不吸收业务逻辑。
- [ ] 11.4 为新增或重构的核心基础组件、业务适配组件和共享工具补充简短中文意图注释。
- [ ] 11.5 更新 README.md 或相关文档中关于 UI 基础组件、shadcn/ui、组件目录边界和开发约定的说明。

## 12. 验收检查

- [ ] 12.1 运行 `openspec validate standardize-ui-with-shadcn --strict`。
- [ ] 12.2 运行 `npm run lint`。
- [ ] 12.3 运行 `npm run typecheck`。
- [ ] 12.4 运行 `npm test`。
- [ ] 12.5 运行 `npm run build`，如因环境权限或外部条件失败，记录原始失败信息和原因。
- [ ] 12.6 运行 `rg` 扫描 Tailwind v4 已移除或改名 utilities，确认没有遗漏的 v3 写法导致样式失效。
- [ ] 12.7 人工核对聊天、动作库、动作详情、训练计划、动作编排、训练执行、设置和 AI Trace 调试台页面的按钮、卡片、输入、标签、弹层、状态反馈风格一致。
- [ ] 12.8 人工核对窄视口下主要页面文字不溢出、控件不遮挡、关键操作入口可见。
- [ ] 12.9 人工核对训练执行页在步骤切换、暂停/继续、语音设置打开、完成状态下核心控制区不跳动。
