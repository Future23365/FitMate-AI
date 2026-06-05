# shadcn-ui-baseline Specification

## Purpose
TBD - created by archiving change add-shadcn-ui-baseline. Update Purpose after archive.
## Requirements
### Requirement: Shadcn 配置基线
系统 SHALL 提供 shadcn 组件生成配置，并将组件、工具函数和样式入口映射到项目现有目录结构。

#### Scenario: 配置文件存在
- **WHEN** 开发者查看项目根目录
- **THEN** 系统提供 `components.json`，并声明 `components`、`utils`、`ui`、`lib`、`hooks` 的路径别名

#### Scenario: 样式入口保持一致
- **WHEN** shadcn 组件引用 Tailwind token
- **THEN** 系统继续使用 `app/globals.css` 作为 Tailwind CSS 4 的主题入口

### Requirement: 基础组件可复用
系统 SHALL 在 `components/ui` 中只保留基于 shadcn/ui 本地源码模式的基础 UI 组件，并保持与项目浅色 MD3 token 一致。

#### Scenario: Button 组件可用
- **WHEN** 页面或组件从 `@/components/ui/button` 引入 `Button`
- **THEN** TypeScript 能识别组件类型，并且组件 variant 使用项目语义颜色和圆角 token

#### Scenario: Card 组件可用
- **WHEN** 页面或组件从 `@/components/ui/card` 引入 Card 相关组件
- **THEN** TypeScript 能识别组件类型，并且组件使用项目 surface、border、text token

#### Scenario: Input 组件可用
- **WHEN** 页面或组件从 `@/components/ui/input` 引入 `Input`
- **THEN** TypeScript 能识别组件类型，并且组件使用项目 border、focus ring、text token

#### Scenario: Dialog 组件可用
- **WHEN** 页面或组件从 `@/components/ui/dialog` 引入 Dialog 相关组件
- **THEN** TypeScript 能识别组件类型，并且组件通过 Radix Dialog primitive 提供焦点管理、Portal 和关闭交互

#### Scenario: Select 组件可用
- **WHEN** 页面或组件从 `@/components/ui/select` 引入 Select 相关组件
- **THEN** TypeScript 能识别组件类型，并且组件提供触发器、浮层、选项和选中态

### Requirement: 动作条目组间间隔使用 Select 组件
系统 SHALL 在动作编排页的动作条目中复用 `Select` 组件表达组间间隔设置，并保持动作条目的点击隔离。

#### Scenario: 组间间隔可调整
- **WHEN** 用户在 `/composer` 的动作条目中打开组间间隔下拉并选择选项
- **THEN** 系统更新该动作的 `setRestSeconds`

#### Scenario: 组间下拉点击隔离
- **WHEN** 用户点击动作条目的组间间隔下拉
- **THEN** 系统不因为该点击触发动作条目的其他点击行为

### Requirement: 动作库筛选保留原生下拉
系统 SHALL 暂时保留动作编排页右侧动作库筛选区的原生 `<select>` 实现，`Select` 组件只作为组件基线提供。

#### Scenario: 右侧筛选可选择
- **WHEN** 用户在 `/composer` 右侧动作库打开任一筛选下拉并选择选项
- **THEN** 系统更新对应筛选条件并刷新动作列表

#### Scenario: 右侧筛选可清空
- **WHEN** 用户在 `/composer` 右侧动作库选择筛选下拉的默认项
- **THEN** 系统清空对应筛选条件

### Requirement: 引入后可验证
系统 SHALL 在引入 shadcn 基线后通过相关静态检查，确保依赖、类型和 lint 规则没有破坏现有项目。

#### Scenario: 静态检查通过
- **WHEN** 运行项目类型检查和 lint
- **THEN** 检查通过，且没有因为 shadcn 基线新增未处理错误

### Requirement: 本地匿名登录弹窗复用 Dialog 组件基线
系统 SHALL 使用项目本地 shadcn/ui Dialog 组件实现本地匿名登录弹窗，并保持组件行为、样式 token 和应用浅色布局一致。

#### Scenario: Dialog 组件可用于本地匿名登录
- **WHEN** `LocalAuthProvider` 需要展示本地匿名登录入口
- **THEN** 它 MUST 从 `@/components/ui/dialog` 复用 Dialog 相关组件
- **AND** Dialog 内容 MUST 使用项目 surface、border、text、focus ring token
- **AND** Dialog 内容 MUST NOT 使用替换整页的全屏白色容器

#### Scenario: Dialog 保持当前页面上下文
- **WHEN** 本地匿名登录 Dialog 打开
- **THEN** 当前路由页面和应用 shell MUST 仍作为背景上下文存在
- **AND** Dialog overlay MAY 遮罩当前页面
- **AND** 系统 MUST NOT 导航到独立登录路由或卸载当前页面布局

#### Scenario: Dialog 可访问性
- **WHEN** 本地匿名登录 Dialog 打开
- **THEN** Dialog MUST 提供可识别的标题
- **AND** Dialog MUST 支持键盘关闭或显式关闭
- **AND** Dialog 操作按钮 MUST 有清晰的 focus 状态

### Requirement: Sonner 组件可作为全局提示基线
系统 SHALL 在 `components/ui` 中提供基于 shadcn/ui 官方 Sonner 的本地组件，并在应用根布局中挂载全局 `Toaster`。

#### Scenario: Sonner 组件存在
- **WHEN** 页面或全局 provider 从 `@/components/ui/sonner` 引入 `Toaster`
- **THEN** TypeScript MUST 能识别组件类型
- **AND** `Toaster` MUST 使用项目现有 shadcn/ui 本地源码模式

#### Scenario: 根布局挂载全局 Toaster
- **WHEN** 应用根布局渲染
- **THEN** 系统 MUST 在当前页面内容之外挂载一个全局 `Toaster`
- **AND** 业务页面 MUST NOT 需要单独挂载 `Toaster`

#### Scenario: 全局 Toaster 显示在页面上方
- **WHEN** 任一全局 toast 被触发
- **THEN** `Toaster` MUST 将提示显示在页面上方
- **AND** 业务页面 MUST NOT 需要为相同提示重复配置位置

#### Scenario: 全局 Toaster 覆盖全局浮层
- **WHEN** Dialog、Drawer 或其他全局浮层打开时触发 toast
- **THEN** `Toaster` MUST 将 toast 显示在这些浮层之上
- **AND** 业务页面 MUST NOT 需要为相同提示重复配置层级

#### Scenario: Sonner 依赖可验证
- **WHEN** 运行项目类型检查、lint 和构建
- **THEN** 检查 MUST 不因新增 `sonner` 组件或依赖失败

