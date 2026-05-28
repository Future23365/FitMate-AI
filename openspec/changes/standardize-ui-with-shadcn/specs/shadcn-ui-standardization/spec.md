## ADDED Requirements

### Requirement: shadcn/ui 基础组件层
系统 SHALL 引入 `shadcn/ui` 作为项目基础 UI 组件层，并且 MUST 将通用交互控件集中放在 `components/ui/*`。

#### Scenario: 项目完成 shadcn 初始化
- **WHEN** 开发者查看项目 UI 基础组件配置
- **THEN** 系统 MUST 提供 `components.json`
- **AND** 系统 MUST 提供 `components/ui/*` 基础组件目录
- **AND** 系统 MUST 提供可被 shadcn 组件复用的 `cn` 工具函数

#### Scenario: 基础组件不依赖业务领域
- **WHEN** 开发者检查 `components/ui/*`
- **THEN** 基础组件 MUST NOT import 聊天、动作、训练、AI Trace、Prisma 或服务端领域类型
- **AND** 基础组件 MUST 只表达通用 UI 结构、样式变体和可访问性交互

### Requirement: Tailwind v3 兼容接入
系统 SHALL 在当前 Tailwind CSS 3.4 项目结构下接入 shadcn/ui，并且 MUST NOT 在本 change 中升级 Tailwind 主版本或迁移到 Tailwind v4 配置模型。

#### Scenario: 开发者初始化 shadcn/ui
- **WHEN** 开发者执行 shadcn 初始化或组件生成
- **THEN** 初始化方式 MUST 与 Tailwind CSS 3.4 兼容
- **AND** `tailwind.config.ts` MUST 保持 Tailwind v3 可工作的配置结构
- **AND** `app/globals.css` MUST 继续正确加载 Tailwind base、components 和 utilities

#### Scenario: shadcn 最新模板与 Tailwind v3 不兼容
- **WHEN** shadcn 最新 CLI 或 registry 输出 Tailwind v4 专用配置
- **THEN** 实现 MUST 停止使用该输出直接覆盖项目配置
- **AND** 实现 MUST 选择 Tailwind v3 兼容模板或明确拆出独立 Tailwind 升级 change

### Requirement: 项目主题映射
系统 SHALL 将 shadcn/ui semantic tokens 映射到当前项目浅色 Material Design 3 风格，并且 MUST 避免形成第二套冲突视觉体系。

#### Scenario: 基础组件渲染默认样式
- **WHEN** 页面使用 `Button`、`Card`、`Badge`、`Input`、`Dialog` 或 `Sheet`
- **THEN** 组件 MUST 使用项目现有浅色 surface、primary、outline、muted text 和 danger 语义
- **AND** 组件 MUST 保持常规页面以浅色背景、白色卡片、清晰边框和克制阴影为主

#### Scenario: 页面需要业务状态颜色
- **WHEN** 训练状态、动作难度、AI Trace 状态或错误提示需要状态颜色
- **THEN** 页面 MUST 优先通过基础组件变体或项目 token 表达状态
- **AND** 页面 MUST NOT 引入与现有设计 token 冲突的大面积深色面板或单独调色体系

### Requirement: 页面基础控件替换
系统 SHALL 将现有页面中的自实现基础控件迁移到 shadcn/ui 组件，并且 MUST 保留业务组件的领域职责。

#### Scenario: 迁移聊天首页
- **WHEN** `features/chat/components/chat-page.tsx` 完成迁移
- **THEN** 发送入口、建议回复、错误提示、滚动区和加载状态 MUST 使用统一基础组件或项目适配组件
- **AND** 聊天消息流、`assistant_action`、suggested replies 和卡片挂载语义 MUST 保持不变

#### Scenario: 迁移动作库页面
- **WHEN** `features/exercises/components/exercise-library-page.tsx` 完成迁移
- **THEN** 筛选选择器、筛选 chip、列表卡片、详情面板、筛选抽屉和加载状态 MUST 使用统一基础组件或项目适配组件
- **AND** `/api/exercises` 查询参数、筛选状态和详情选择语义 MUST 保持不变

#### Scenario: 迁移动作推荐和动作详情
- **WHEN** `exercise-recommendation-card.tsx` 和 `exercise-preview-sheet.tsx` 完成迁移
- **THEN** 推荐卡按钮、状态标签、提示区和动作详情抽屉外壳 MUST 使用统一基础组件或项目适配组件
- **AND** 推荐动作选择、替换动作、打开详情和主操作回调 MUST 保持不变

#### Scenario: 迁移训练计划和动作编排页面
- **WHEN** `training-plan-page.tsx`、`action-composer-page.tsx`、`workout-routine-draft-card.tsx` 和仍需保留的 `workout-plan-draft-card.tsx` 完成迁移
- **THEN** 日历操作、计划菜单、tab、输入、选择器、stepper、卡片、状态标签和保存按钮 MUST 使用统一基础组件或项目适配组件
- **AND** 日程选择、routine 编排、section/rest 规则、保存和跳转语义 MUST 保持不变

#### Scenario: 迁移训练执行页面
- **WHEN** `features/workouts/components/workout-session-page.tsx` 完成迁移
- **THEN** 训练控制按钮、状态卡片、动作详情入口、语音设置弹窗、范围控件、选择器和提示状态 MUST 使用统一基础组件或项目适配组件
- **AND** 训练执行状态机、计时、暂停/继续、语音播报、自检和完成反馈语义 MUST 保持不变

#### Scenario: 迁移设置页和 AI Trace 调试台
- **WHEN** `app/settings/page.tsx` 和 `components/dev/ai-trace-viewer.tsx` 完成迁移
- **THEN** 设置项、调试台按钮、状态标签、详情面板、滚动区、展开区和数据块 MUST 使用统一基础组件或项目适配组件
- **AND** AI Trace 分组、复制日志、token 统计和 JSON 展示语义 MUST 保持不变

### Requirement: 弹层组件统一
系统 SHALL 使用 shadcn/ui 的 `Dialog`、`Sheet`、`Drawer` 或项目适配层统一弹层基础行为，并且 MUST 保留已有业务弹层语义。

#### Scenario: 右侧抽屉迁移
- **WHEN** 页面打开动作详情、动作库筛选或移动端导航等侧边弹层
- **THEN** 系统 MUST 使用 `Sheet` 或基于 `Sheet` 的项目适配组件承载侧边弹层
- **AND** 右侧抽屉 MUST 保留现有 `drawer-open` 页面背景联动和背景滚动锁定语义

#### Scenario: 居中弹窗迁移
- **WHEN** 页面打开语音设置、自检详情或确认类居中弹窗
- **THEN** 系统 MUST 使用 `Dialog` 或基于 `Dialog` 的项目适配组件承载弹窗
- **AND** 弹窗 MUST 提供可访问标题、关闭行为和键盘交互

### Requirement: 可访问性与响应式验收
系统 SHALL 在迁移后保持基础控件可访问性和响应式布局稳定，并且 MUST 避免文本溢出、控件遮挡和训练中布局跳动。

#### Scenario: 用户通过键盘操作交互控件
- **WHEN** 用户通过键盘聚焦按钮、输入框、选择器、tab、菜单、弹窗或抽屉
- **THEN** 控件 MUST 提供清晰 focus 状态
- **AND** 弹层 MUST 支持合理的关闭和焦点管理行为

#### Scenario: 页面在窄视口展示
- **WHEN** 页面在项目支持的移动端或窄屏布局下展示
- **THEN** 文字 MUST NOT 溢出按钮、卡片或状态标签容器
- **AND** 控件 MUST NOT 相互遮挡或导致关键操作不可见

#### Scenario: 训练执行中状态变化
- **WHEN** 训练执行页在步骤切换、暂停、继续、语音提示或完成状态之间变化
- **THEN** 核心训练控制区 MUST 保持稳定尺寸
- **AND** 基础组件替换 MUST NOT 造成训练操作按钮位置跳动

### Requirement: 清理重复自实现组件
系统 SHALL 在页面迁移完成后删除被 shadcn/ui 取代的重复基础控件实现，并且 MUST 保留有业务语义的领域组件。

#### Scenario: 页面自实现基础控件已被替换
- **WHEN** 某个页面的自实现按钮、选择器、tab、菜单、弹窗外壳、badge 或 skeleton 已迁移到基础组件
- **THEN** 旧的重复实现 MUST 被删除
- **AND** 页面 MUST NOT 同时保留两套等价基础控件实现

#### Scenario: 业务组件承载领域语义
- **WHEN** 组件负责训练编排、动作详情、训练执行、AI Trace 分组或计划展示等业务语义
- **THEN** 组件 MAY 保留在业务目录
- **AND** 组件内部 MUST 优先组合 `components/ui` 基础组件表达通用交互

### Requirement: 自动化与人工验收检查
系统 SHALL 为 shadcn/ui 重构提供自动化验证和页面级人工验收清单。

#### Scenario: 开发者完成实现
- **WHEN** shadcn/ui 引入和页面迁移完成
- **THEN** 开发者 MUST 运行 `openspec validate standardize-ui-with-shadcn --strict`
- **AND** 开发者 MUST 运行 `npm run lint`
- **AND** 开发者 MUST 运行 `npm run typecheck`
- **AND** 开发者 MUST 运行 `npm test`
- **AND** 开发者 MUST 运行 `npm run build` 或说明无法运行的原因

#### Scenario: 人工验收页面一致性
- **WHEN** 人工 review 迁移后的页面
- **THEN** 聊天、动作库、动作详情、训练计划、动作编排、训练执行、设置和 AI Trace 调试台 MUST 使用一致的按钮、卡片、输入、标签、弹层和状态反馈风格
- **AND** review MUST 确认业务流程、核心操作入口和页面密度没有因基础组件替换而退化
