## Context

当前项目使用 Next.js App Router、React、TypeScript 和 Tailwind CSS 4，并已在文档中声明采用 `shadcn/ui`。实际仓库尚未包含 `components.json`、`components/ui` 和 shadcn 组件所需的 className 合并工具。

项目全局样式已经通过 `app/globals.css` 的 `@theme` 定义 MD3 风格 token、浅色 surface 和 PC-only 断点，因此引入 shadcn 时必须复用这些 token，不能让初始化流程覆盖现有视觉基线。

## Goals / Non-Goals

**Goals:**
- 建立可被 shadcn CLI 和人工维护共同使用的组件基线。
- 让组件输出到 `components/ui`，共享工具输出到 `lib/utils.ts`，并继续使用 `@/*` 路径别名。
- 让首批基础组件使用现有 `background`、`foreground`、`primary`、`muted`、`border`、`ring`、`radius` 等 Tailwind 4 token。
- 通过类型检查和 lint 验证引入后的项目可编译性。

**Non-Goals:**
- 不批量迁移现有页面到 shadcn 组件；仅将 `/composer` 中目标值和组数的数字步进控件接入新增组件，验证基线可复用。
- 不改变现有全局布局、断点策略、AI 编排、API 契约、数据模型或训练业务规则。
- 不引入深色主题切换。

## Decisions

1. 使用 Tailwind CSS 4 兼容的 `components.json`
   - 原因：项目没有 `tailwind.config.*`，主题事实在 `app/globals.css` 的 `@theme` 中。
   - 取舍：不使用旧版 Tailwind config，避免出现两套主题来源。

2. 首批新增 `Button`、`Card`、`Input`、`Select` 和 `NumberStepper`
   - 原因：`Button`、`Card`、`Input`、`Select` 复用面高；`NumberStepper` 能覆盖动作编排中“目标次数 / 目标时长 / 组数”的实际输入场景，右侧动作库筛选能验证下拉选择组件是否可用。
   - 取舍：暂不批量生成 Dialog、Select、Form 等组件，避免一次性引入大量 Radix 依赖和未使用代码。

3. 将数字步进器做成本地组合组件
   - 原因：shadcn 提供基础组件模板，不直接提供项目语义完整的“拨轮输入框”；本地组合 `Button + Input` 可以保留数值边界、后缀显示和卡片点击隔离。
   - 取舍：不在页面里继续散落加减按钮和输入框逻辑，后续相同数字输入可以复用同一组件。

4. 手动对齐项目 token 后再允许后续 CLI 增量生成
   - 原因：默认 shadcn 样式变量与项目现有 MD3 token 已部分重合，但圆角、颜色层级和语义类需要保持项目风格。
   - 取舍：不让 CLI 初始化覆盖 `globals.css`，只补必要配置和组件文件。

5. 新增 `cn` 工具并添加意图注释
   - 原因：shadcn 组件依赖 `clsx` 和 `tailwind-merge` 进行 className 合并，项目规则要求导出工具函数说明业务边界。
   - 取舍：暂不扩展额外样式工具，保持工具职责单一。

## Risks / Trade-offs

- [Risk] Tailwind 4 与部分 shadcn 模板存在版本差异 → 通过保留 CSS-first token、运行类型检查和 lint 降低风险。
- [Risk] 一次性引入过多组件会扩大依赖面 → 首批只引入 `Button`、`Card`、`Input`、`Select` 和已被 `/composer` 使用的 `NumberStepper`，其他组件后续按页面需求生成。
- [Risk] 默认 shadcn 视觉可能偏离项目 MD3 风格 → 组件 variant 使用项目现有语义 token，并保留浅色 surface 层级。
