## Why

项目文档和技术栈已经将 `shadcn/ui` 作为 UI 基础设施，但仓库缺少 `components.json`、`components/ui` 组件目录和共享样式工具，导致后续页面无法按统一方式引入 shadcn 组件。

现在引入基础配置，可以让后续 UI 迭代复用可生成、可维护、与现有 Material Design 3 视觉 token 对齐的组件基线。

## What Changes

- 新增 `shadcn/ui` 项目配置，固定组件输出目录、别名和 Tailwind CSS 4 兼容配置。
- 新增 shadcn 基础依赖和共享 `cn` 工具函数，供 UI 组件合并 className。
- 新增首批基础 `Button`、`Card`、`Input`、`Select` 组件，并提供组合式 `NumberStepper` 数字步进输入控件，作为后续 UI 迁移和新增组件的基线。
- 保留现有浅色 MD3 token、PC-only 断点和全局布局行为，不引入业务页面流程变化。

## Capabilities

### New Capabilities
- `shadcn-ui-baseline`: 定义项目可以使用 shadcn 组件基线，包括配置、主题对齐、组件目录和验证要求。

### Modified Capabilities
- 无

## Impact

- 影响依赖：`package.json`、`package-lock.json`
- 影响配置：`components.json`
- 影响共享工具：`lib/utils.ts`
- 影响 UI 基础组件：`components/ui/*`
- 影响页面使用：`features/workouts/components/action-composer-page.tsx`
- 不改变 API 契约、数据模型、AI 编排、训练规则或用户流程。
