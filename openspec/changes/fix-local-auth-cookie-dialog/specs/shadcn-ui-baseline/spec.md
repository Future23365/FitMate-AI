## ADDED Requirements

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
