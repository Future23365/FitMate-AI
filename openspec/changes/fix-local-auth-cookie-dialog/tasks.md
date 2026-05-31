## 1. 实现前核对

- [ ] 1.1 核对当前 `LocalAuthProvider`、客户端请求层、auth API 和 `requireCurrentUser(request)` 的真实调用链
- [ ] 1.2 确认当前未认证响应中哪些是 `401`，哪些是未认证语义的 `403`，并区分真实 forbidden
- [ ] 1.3 确认 `FITMATE_LOCAL_AUTH_SECRET` 当前开发 fallback 行为和生产缺失行为

## 2. 服务端 cookie 鉴权

- [ ] 2.1 定义匿名 auth cookie 名称、写入参数、清除参数和过期时间
- [ ] 2.2 调整匿名 token 签发逻辑，使 `POST /api/auth/local-anonymous` 通过 `Set-Cookie` 写入 HttpOnly cookie，并且响应体不返回 token
- [ ] 2.3 调整 `requireCurrentUser(request)` 或等价 helper，使其从请求 cookie 读取、校验 token 并建立 `userId`
- [ ] 2.4 统一缺少、过期、无效 token 的未认证错误结构，优先返回 `401 unauthenticated`
- [ ] 2.5 保留并显式化开发 fallback secret；生产环境缺失 `FITMATE_LOCAL_AUTH_SECRET` 时必须失败

## 3. 客户端请求与 auth 状态

- [ ] 3.1 移除客户端 `localStorage` 匿名 token 读写逻辑
- [ ] 3.2 移除客户端请求层的 `Authorization: Bearer <anonymous-token>` 注入
- [ ] 3.3 在统一请求层识别 `401 unauthenticated`，并兼容明确未认证语义的 `403`
- [ ] 3.4 建立 auth-required 事件或等价机制，由请求层统一通知 `LocalAuthProvider` 打开登录 Dialog
- [ ] 3.5 确保真实 forbidden 权限错误不会触发登录 Dialog

## 4. 局部 Dialog 交互

- [ ] 4.1 调整 `LocalAuthProvider`，应用启动时不自动创建匿名用户，也不全局阻塞页面
- [ ] 4.2 使用 `@/components/ui/dialog` 组合本地匿名登录 Dialog
- [ ] 4.3 确保 Dialog 在当前应用布局内打开，不替换页面根节点，不显示全屏白背景
- [ ] 4.4 登录成功后更新当前用户摘要、关闭 Dialog，并让后续请求依赖 cookie
- [ ] 4.5 匿名用户头像继续使用人的图标

## 5. 重置本地用户

- [ ] 5.1 新增或调整服务端重置接口，清除匿名 auth cookie
- [ ] 5.2 设置页“重置本地用户”调用服务端接口，不再直接清 `localStorage` token
- [ ] 5.3 重置后清空前端运行时用户摘要，并允许后续私有接口失败再次触发 Dialog
- [ ] 5.4 确认重置不会删除旧匿名用户的服务器数据

## 6. 测试

- [ ] 6.1 更新服务端 auth 单测，覆盖 cookie 写入、cookie 清除、cookie 校验、无效 token、过期 token
- [ ] 6.2 更新 auth API route 测试，确认响应体不返回 token，并验证 `Set-Cookie` 参数
- [ ] 6.3 更新 client request 测试，覆盖 `401 unauthenticated`、兼容未认证 `403`、真实 forbidden 不弹 Dialog
- [ ] 6.4 更新 `LocalAuthProvider` 或相关组件测试，覆盖首次进入不弹窗、接口未认证后弹窗、登录成功关闭 Dialog
- [ ] 6.5 更新设置页重置测试，覆盖服务端清 cookie 和前端状态清空
- [ ] 6.6 更新 secret 配置测试，覆盖开发 fallback 和生产缺失 secret 失败

## 7. 文档与演进记录

- [ ] 7.1 更新 `docs/architecture.md`，说明本地匿名 auth cookie 链路和请求失败触发 Dialog 的交互
- [ ] 7.2 更新 `docs/database-design.md` 或相关数据说明，明确重置本地用户不删除旧匿名用户数据
- [ ] 7.3 更新环境变量说明，记录 `FITMATE_LOCAL_AUTH_SECRET` 生产必需、本地开发 fallback 可用
- [ ] 7.4 在 `docs/方案变更历史/` 新增本次鉴权交互与 token 存储调整说明
- [ ] 7.5 在 `docs/项目演变历程.md` 追加本次本地匿名鉴权修正

## 8. 验证

- [ ] 8.1 运行 `openspec validate fix-local-auth-cookie-dialog --strict`
- [ ] 8.2 运行相关 auth、API route、client request、auth provider 和设置页测试
- [ ] 8.3 运行 `npm test`
- [ ] 8.4 运行 `npm run typecheck`
- [ ] 8.5 如改动影响构建、路由或服务端/客户端模块边界，运行 `npm run build`，或记录无法运行的具体原因
