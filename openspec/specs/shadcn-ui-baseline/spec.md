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
