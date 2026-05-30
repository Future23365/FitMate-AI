## 1. 配置与依赖

- [x] 1.1 新增 Tailwind CSS 4 兼容的 `components.json`，映射项目现有目录和 `@/*` 别名
- [x] 1.2 新增 shadcn 基础依赖，并更新 lockfile
- [x] 1.3 新增 `lib/utils.ts`，提供 shadcn 组件共享的 `cn` className 合并工具

## 2. 基础组件

- [x] 2.1 新增 `components/ui/button.tsx`，提供项目 token 对齐的 Button variant
- [x] 2.2 新增 `components/ui/card.tsx`，提供项目 token 对齐的 Card 组件组
- [x] 2.3 新增 `components/ui/input.tsx`，提供项目 token 对齐的 Input 基线
- [x] 2.4 新增 `components/ui/number-stepper.tsx`，组合 Button 与 Input 提供数字步进输入
- [x] 2.5 将 `/composer` 动作卡片的目标值和组数输入替换为 `NumberStepper`
- [x] 2.6 新增 `components/ui/select.tsx`，提供项目 token 对齐的 Select 基线
- [x] 2.7 保留 `/composer` 右侧动作库筛选为原生 `<select>`，暂不接入 `Select`
- [x] 2.8 将 `/composer` 动作条目的组间间隔下拉替换为 `Select`

## 3. 验证

- [x] 3.1 运行 `openspec validate add-shadcn-ui-baseline --strict`
- [x] 3.2 运行 `npm run typecheck`
- [x] 3.3 运行 `npm run lint`
- [x] 3.4 运行 `npm test`
