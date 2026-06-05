## Why

当前客户端请求层已经能把稳定的未认证 API 响应转换为 `fitmate:auth-required` 事件，并触发布局内匿名登录 Dialog，但缺少轻量的全局提示反馈。用户触发私有操作时需要立即看到“需要登录”的提示，避免只看到弹窗状态变化而缺少操作反馈。

## What Changes

- 引入 shadcn/ui 官方推荐的 `sonner` 组件作为全局 toast 容器。
- 在根布局中挂载 `Toaster`，让所有客户端页面共享同一个 toast 展示入口。
- 在 `LocalAuthProvider` 监听到 `fitmate:auth-required` 时触发“需要登录”提示，并继续保留现有 Dialog 登录流程。
- 保持 `clientRequest` 作为唯一未认证响应 adapter，不在业务页面中重复解析 API 错误或散落 toast 调用。

## Capabilities

### New Capabilities

### Modified Capabilities
- `local-auth-cookie-dialog`: 未认证 API 响应触发布局内登录 Dialog 时，同时通过全局 Sonner toast 给出轻量登录提示。
- `shadcn-ui-baseline`: `components/ui` 基线新增 `sonner` 组件，并在根布局中提供全局 `Toaster`。

## Impact

- 影响客户端根布局、`LocalAuthProvider`、shadcn/ui 组件目录和依赖清单。
- 不改变服务端 API 响应 shape、鉴权策略、匿名登录 cookie 存储方式或业务页面调用方式。
- 需要验证 `sonner` 依赖、类型检查、lint，以及未认证事件不会要求业务页面重复接入提示逻辑。
