## Why

当前本地匿名鉴权把“进入应用”和“创建匿名用户”绑定在一起：没有凭证时会用大面积背景阻塞页面，并且 token 存在 `localStorage` 中。这导致用户无法先正常浏览页面，也不符合“接口鉴权失败后再弹出局部登录弹窗”的产品预期，同时 `localStorage` token 的安全边界弱于 HttpOnly cookie。

## What Changes

- 调整匿名登录触发时机：应用启动时 MUST 正常渲染页面，不得因为缺少匿名凭证而全局阻塞。
- 前端统一请求层在收到 `401 unauthenticated` 或服务端保留的 `403` 未认证响应时，才触发布局内登录 Dialog。
- 匿名登录 Dialog MUST 使用 shadcn/ui Dialog 组件语义，并作为当前应用布局内的局部弹窗出现，不得替换整个页面或使用全屏白背景。
- 匿名 token 存储从 `localStorage + Authorization` 调整为服务端 `Set-Cookie` 的 HttpOnly cookie；前端不再读取、保存或拼接 token。
- `POST /api/auth/local-anonymous` 创建或恢复匿名会话后 MUST 写入匿名 auth cookie，并返回最小用户摘要。
- `requireCurrentUser(request)` MUST 从 cookie 解析匿名 token；API 不再依赖客户端显式传 `Authorization`。
- 设置页“重置本地用户”改为调用服务端接口清除匿名 cookie，并触发当前页面回到未认证状态；旧匿名用户服务器数据不删除。
- 明确 `FITMATE_LOCAL_AUTH_SECRET` 配置策略：本地开发可选择保留固定开发 fallback，但 MUST 在文档、日志和测试中明确；生产环境缺失 secret MUST 失败。
- 更新测试和文档，覆盖首次进入不弹窗、接口未认证后弹窗、cookie 写入/清除、无 `localStorage` token、secret fallback/生产缺失 secret 等行为。

## Capabilities

### New Capabilities

- `local-auth-cookie-dialog`: 定义本地匿名鉴权的 cookie 存储、接口失败触发登录 Dialog、布局内弹窗和重置本地用户行为。

### Modified Capabilities

- `api-layer-boundaries`: 私有 API 继续先建立请求级 auth context，但当前用户凭证来源改为 HttpOnly cookie，并允许前端对 `401 unauthenticated` 或兼容的未认证 `403` 做统一登录触发。
- `shadcn-ui-baseline`: 登录弹窗必须复用项目本地 shadcn/ui Dialog 源码组件语义，不能使用手写全屏替代页。

## Impact

- 影响 `components/auth/local-auth-provider.tsx`、`components/ui/dialog.tsx`、`lib/client/http/client-request.ts`、`lib/client/auth/*`、`lib/server/auth/local-anonymous-auth.ts`、`app/api/auth/local-anonymous/route.ts` 和设置页重置入口。
- 影响所有依赖匿名凭证的 Route Handler：`requireCurrentUser(request)` 的读取来源从 header/localStorage 注入改为 cookie。
- 影响测试：需要更新本地匿名鉴权、API route、client request、auth provider 和设置页相关测试。
- 影响文档：需要更新 `docs/architecture.md`、`docs/database-design.md`、`docs/方案变更历史/`、`docs/项目演变历程.md`，并补充环境变量说明。
