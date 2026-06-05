## 1. Sonner 基线接入

- [x] 1.1 检查本地是否已有 `components/ui/sonner.tsx` 和 `sonner` 依赖。
- [x] 1.2 使用 shadcn/ui 官方 Sonner 组件生成或补齐 `components/ui/sonner.tsx`，并确保依赖写入 `package.json` 与 lockfile。
- [x] 1.3 在 `app/layout.tsx` 挂载全局 `Toaster`，保持页面内容和 `LocalAuthProvider` 的现有结构。
- [x] 1.4 配置全局 `Toaster` 在页面上方显示 toast。
- [x] 1.5 配置全局 `Toaster` 层级高于 Dialog、Drawer 等全局浮层。

## 2. 未认证事件提示

- [x] 2.1 在 `LocalAuthProvider` 监听 `fitmate:auth-required` 时触发 Sonner toast，文案为用户可见的中文登录提示。
- [x] 2.2 使用稳定 toast id 避免连续未认证请求堆叠多个同类提示。
- [x] 2.3 保持 `clientRequest` 只负责识别未认证合同和派发事件，不直接依赖 toast。
- [x] 2.4 在本地匿名登录成功后触发 Sonner 成功提示。
- [x] 2.5 在本地用户重置成功后触发 Sonner 成功提示。

## 3. 验证与收尾

- [x] 3.1 运行 `openspec validate add-global-auth-toast --strict`。
- [x] 3.2 运行 `npm run typecheck` 和 `npm run lint`。
- [x] 3.3 如依赖、构建边界或客户端边界变化需要，运行 `npm run build` 或记录无法运行的原因。
- [x] 3.4 检查 git diff，确认没有混入无关本地改动。
