## Context

`add-local-anonymous-auth` 已经让本地匿名用户可以注册、登录和隔离数据，但当前交互和安全边界还有三个问题：

- 进入页面时会把“缺少本地匿名凭证”当成必须立即处理的全局状态，导致正常页面被大面积背景替换。
- 前端把匿名 token 放在 `localStorage` 并主动拼到请求头里，凭证暴露给客户端脚本，且会让每个调用方继续关心 token 注入。
- `FITMATE_LOCAL_AUTH_SECRET` 在本地开发没有配置时仍能注册登录，是因为服务端存在开发 fallback secret；这个行为没有在产品和协作层面说清楚，容易被误解为配置失效。

本 change 将本地匿名鉴权从“启动时强制建立会话”调整为“页面可先进入，私有接口返回未认证后再引导登录”，同时把 token 改为服务端 HttpOnly cookie。

## Goals / Non-Goals

**Goals:**

- 应用启动时正常渲染页面，不因为没有匿名用户而全局阻塞。
- 统一客户端请求层识别 `401 unauthenticated`，并兼容当前未认证 `403` 响应，触发布局内登录 Dialog。
- 登录 Dialog 使用项目本地 shadcn/ui Dialog 组件，表现为布局内局部弹窗，不替换整页，也不出现全屏白背景。
- 匿名 token 由服务端通过 `Set-Cookie` 写入 HttpOnly cookie；前端不读取、不保存、不拼接 token。
- `requireCurrentUser(request)` 从 cookie 解析当前匿名用户，保持 API 层只建立 request auth context，不承载业务逻辑。
- “重置本地用户”调用服务端接口清除 cookie，并让当前前端会话回到未认证状态。
- 明确 `FITMATE_LOCAL_AUTH_SECRET` 的开发和生产策略，补齐文档、测试和错误路径。

**Non-Goals:**

- 不新增正式账号体系、邮箱登录、第三方登录或多设备同步。
- 不删除旧匿名用户的服务器数据；重置只断开当前浏览器 cookie。
- 不改变用户私有数据仍必须通过 `userId` 隔离的规则。
- 不把未认证页面改造成公开只读产品模式；是否能看到数据仍由接口鉴权决定。
- 不引入额外会话表；cookie 仍承载可校验的匿名 token。

## Decisions

### 1. 页面启动不主动创建匿名用户

`LocalAuthProvider` 不再在 mount 阶段强制创建或恢复本地匿名用户。它只维护三类前端状态：

- `currentUser`：当前已知的本地匿名用户摘要。
- `authDialogOpen`：是否展示本地匿名登录 Dialog。
- `authRequiredReason`：最近一次由私有接口失败触发的原因，用于 Dialog 文案或后续调试。

取舍：这会让首次进入时部分私有数据请求返回未认证错误，但这正符合产品预期：页面可以进入，真正需要私有数据时再引导创建或登录匿名用户。

### 2. 请求层统一触发登录 Dialog

客户端统一请求函数负责识别未认证响应：

- 首选 `401` 且错误码或错误字段为 `unauthenticated`。
- 为兼容当前实现，保留对“未认证语义的 `403`”识别。
- 触发一个客户端 auth-required 事件，由 `LocalAuthProvider` 打开 Dialog。

调用方不应在每个页面重复写“遇到 403 弹登录”的逻辑。私有页面或 feature 可以继续展示自己的局部 loading/error 状态，但登录入口由 auth provider 统一协调。

### 3. Dialog 是布局内 shadcn/ui 弹窗

本地匿名登录 UI 使用 `components/ui/dialog.tsx` 暴露的 `Dialog`、`DialogContent`、`DialogHeader`、`DialogTitle`、`DialogDescription` 等组件组合。弹窗应挂在应用布局中，Dialog overlay 只作为语义遮罩，不替换页面根节点，不使用全屏白色容器承载登录页。

取舍：Dialog 可以有遮罩和居中内容，这是标准模态弹窗行为；但用户仍能看到当前页面上下文，不应变成一张全屏白页。

### 4. token 改为 HttpOnly cookie

`POST /api/auth/local-anonymous` 成功后由服务端写入 cookie：

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- 本地开发可不启用 `Secure`，生产环境必须启用 `Secure`
- `Max-Age` 与匿名 token 有效期保持一致

前端只接收最小用户摘要，不再接收或保存 token。客户端请求默认带 same-origin cookie，不再设置 `Authorization`。

取舍：HttpOnly cookie 不能被前端脚本读取，减少 XSS 后直接窃取 token 的风险；代价是登出/重置必须通过服务端接口清 cookie。

### 5. 服务端 auth context 从 cookie 建立

`requireCurrentUser(request)` 或等价 helper 负责从请求 cookie 读取匿名 token、验证签名和过期时间，再建立 `userId`。Route Handler 只调用该 helper，不解析 cookie 细节，也不在路由层拼业务权限逻辑。

旧 `Authorization: Bearer <token>` 支持不作为长期方案。实现阶段可选择直接移除，或仅在测试迁移期短暂保留并立即清理；最终验收必须保证前端不依赖 header token。

### 6. 开发 fallback secret 显式化

`FITMATE_LOCAL_AUTH_SECRET` 策略：

- `NODE_ENV !== "production"` 且未配置时，可以使用固定开发 fallback secret。
- 使用 fallback 时应有可定位的日志或文档说明，避免误以为注册登录不需要 secret。
- `NODE_ENV === "production"` 缺失时必须失败，不允许静默生成临时 secret，也不允许使用开发 fallback。

取舍：保留本地 fallback 能降低开发启动成本；生产强制 secret 保证 token 签名边界明确。

## Risks / Trade-offs

- **首次进入时数据区可能先看到未认证错误态** → 请求层应尽快触发 Dialog，页面局部错误文案不要覆盖整个布局。
- **cookie 调整影响所有私有 API 测试** → 先更新 auth helper 和测试工具，再迁移 route/client 测试，避免每个测试重复构造 cookie。
- **兼容 `403` 容易掩盖真正无权限错误** → 只把明确未认证错误码或错误字段的 `403` 当成登录触发；真实 forbidden 不弹登录。
- **HttpOnly cookie 让前端无法判断 token 是否存在** → 以前端已知用户摘要和接口响应作为事实来源，不在客户端猜测 cookie 状态。
- **生产环境 secret 缺失会导致启动或请求失败** → 文档必须同步说明环境变量要求，测试覆盖生产缺失 secret。

## Implementation Plan

1. 调整服务端本地匿名 auth 模块：
   - 定义匿名 auth cookie 名称、序列化参数和清除参数。
   - 将 token 签发结果用于 `Set-Cookie`，不返回给客户端。
   - `requireCurrentUser(request)` 从 cookie 读取并校验 token。
   - 生产缺失 `FITMATE_LOCAL_AUTH_SECRET` 时失败；开发 fallback 保持显式。
2. 调整 auth API：
   - `POST /api/auth/local-anonymous` 成功写 cookie 并返回用户摘要。
   - 新增或调整重置接口，清除 cookie 并返回未认证后的前端状态所需信息。
   - 错误响应使用稳定的未认证错误码，保证客户端可区分 unauthenticated 与 forbidden。
3. 调整客户端请求层：
   - 移除 `localStorage` token 读写和 `Authorization` 注入。
   - 默认使用 same-origin cookie。
   - 未认证响应触发统一 auth-required 事件。
4. 调整 `LocalAuthProvider` 和 UI：
   - 启动时不强制创建用户。
   - 接收 auth-required 事件后打开 shadcn/ui Dialog。
   - 登录成功后关闭 Dialog，并更新用户摘要。
   - 重置本地用户通过服务端清 cookie。
5. 更新设置页和头像：
   - 匿名用户头像继续使用人的图标。
   - 设置页不再直接清 `localStorage` token。
6. 更新测试和文档：
   - 覆盖首次进入不弹窗、接口未认证后弹窗、cookie 写入/清除、无 `localStorage` token、生产缺失 secret、开发 fallback secret。
   - 更新架构、数据库/环境变量说明、方案变更历史和项目演变历程。

## Verification Plan

- `openspec validate fix-local-auth-cookie-dialog --strict`
- 相关 auth 单测和 route 测试
- 相关 client request / auth provider 组件测试
- `npm run typecheck`
- `npm test`
- 如改动影响构建、路由或服务端/客户端边界，运行 `npm run build`；如果沙盒端口限制导致失败，需要记录失败原因并在非沙盒环境验证。

## Open Questions

- 是否保留短期 `Authorization` header 兼容只用于测试迁移？当前建议最终实现中删除前端依赖，测试也改 cookie。
- 未认证错误响应是否统一改为 `401`？当前建议服务端长期统一 `401 unauthenticated`，客户端只为历史响应兼容明确未认证语义的 `403`。
