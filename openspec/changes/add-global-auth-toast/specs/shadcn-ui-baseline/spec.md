## ADDED Requirements

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

#### Scenario: Sonner 依赖可验证
- **WHEN** 运行项目类型检查、lint 和构建
- **THEN** 检查 MUST 不因新增 `sonner` 组件或依赖失败
