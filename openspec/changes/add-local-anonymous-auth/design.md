## Context

当前 `getCurrentUser()` 在服务端固定 upsert `local-demo-user`，所有聊天、训练编排、日历、artifact 和用户记忆都落在同一个用户下。数据库模型已经有 `User`、`UserIdentity` 和 `AuthProvider.anonymous`，多数私有数据查询也已经按 `userId` 隔离，因此本次不需要重建数据模型，关键是把“当前用户来源”从固定值改成请求级匿名鉴权上下文。

用户当前需求是先不接完整注册登录系统，但前端需要有一个弹窗，允许当前浏览器自动注册登录；凭证暂存在浏览器本地，保证同一个浏览器持续使用同一个用户。服务端接口需要按真实鉴权方式实施，避免后续接入注册登录时再次推翻 API 边界。

## Goals / Non-Goals

**Goals:**

- 用浏览器本地匿名身份替代 `local-demo-user` 作为正常请求的当前用户来源。
- 首次进入应用时通过弹窗完成自动匿名注册登录，不要求用户输入邮箱、密码或第三方账号。
- 同一浏览器复用同一匿名用户，不同浏览器默认创建不同匿名用户。
- 所有用户私有 API 都通过统一服务端 auth context 获取 `userId`，继续沿用现有 `userId` 数据隔离。
- 服务端不信任客户端传入的裸 `userId`，必须校验匿名凭证后再解析用户。
- 为后续注册登录系统保留 `UserIdentity` 兼容路径，让匿名用户将来可以绑定 credentials、Google、GitHub 或 Apple 身份。

**Non-Goals:**

- 不实现邮箱密码注册登录、OAuth、验证码、找回密码、账号合并 UI 或多设备同步。
- 不迁移 `local-demo-user` 的历史数据归属；如需迁移，应单独提出 change。
- 不新增复杂权限角色模型；本次只解决“当前用户是谁”和私有数据隔离。
- 不把匿名凭证设计成长期安全账号体系；它只是本地浏览器匿名会话。

## Decisions

### 1. 使用本地匿名 token，而不是客户端保存 userId

前端在 `localStorage` 中保存服务端签发的匿名凭证，例如 `fitmate.localAuth.v1`。凭证内容对前端是不透明 token，API 请求通过统一客户端请求层加到 `Authorization: Bearer <token>` 或专用 `X-FitMate-Anonymous-Token` 头中。

服务端 token payload 包含匿名主体标识、签发时间、版本和随机 nonce，并使用服务端 secret 做 HMAC 签名。服务端只在签名有效、版本有效、匿名主体存在且能映射到 `UserIdentity(provider = "anonymous")` 时返回 `CurrentUser`。

取舍：

- 相比直接保存 `userId`，签名 token 可以防止客户端伪造任意用户。
- 相比 HttpOnly cookie，`localStorage` 更符合“同一浏览器本地暂存”的当前需求，也便于统一 fetch 请求层注入；代价是 XSS 风险更高，因此 token 不应承载敏感明文，并且后续正式账号体系应优先评估 HttpOnly cookie。
- 相比新增 `AnonymousSession` 表，复用 `UserIdentity(providerAccountId)` 可以减少数据库变更；代价是首版无法做精细会话撤销。如果后续需要撤销、过期轮换或多设备管理，再新增 session 表。

### 2. 新增匿名会话 API，前端弹窗只负责启动流程

新增 `POST /api/auth/local-anonymous`：

- 无 token 时创建新的匿名主体、`User` 和 `UserIdentity(provider = "anonymous")`，返回 token 与用户摘要。
- 有 token 时校验 token 并返回当前用户摘要；如 token 无效，返回 `401` 和明确错误码。
- 接口只暴露 `id`、`displayName` 等最小用户摘要，不返回数据库内部身份记录细节。

前端新增应用级 `LocalAuthProvider` 或等价组件：

- 启动时读取 `localStorage`。
- 有 token 时调用恢复接口；恢复成功后放行应用。
- 没有 token 或恢复失败时展示弹窗。
- 弹窗提供“继续使用 FitMate”这类主操作，点击后自动创建匿名用户并保存 token。
- 创建或恢复期间应用可显示轻量加载态；用户私有页面不应在未认证状态下发起数据请求。

### 3. `getCurrentUser()` 改成基于请求上下文解析

当前 `getCurrentUser()` 无参数，导致服务层可以在没有请求上下文时隐式得到固定用户。改造后应引入明确的 request auth context，例如：

- Route Handler 从 `Request` 读取 token 并调用 `resolveCurrentUserFromRequest(request)`。
- 服务层接收 `CurrentUser` 或 `ServerRequestContext`，或通过明确的请求作用域 helper 获取用户。
- 禁止服务层在缺少 auth context 时回退到 `local-demo-user`。

为了控制改动面，可以保留一个兼容函数名，但其实现必须要求调用方提供请求上下文，或者仅用于显式测试/脚本上下文。长期方向是让私有服务函数显式接收 `userId` 或 `CurrentUser`，减少隐式全局依赖。

### 4. 私有 API 统一未认证响应

所有读取或写入用户私有数据的 API 在缺少有效凭证时必须返回统一错误，例如：

- HTTP status: `401`
- code: `unauthenticated`
- message: `Authentication is required.`

前端请求层收到 `401 unauthenticated` 时清理本地匿名凭证并通知 auth provider 重新展示弹窗。非私有资源，例如公开动作库只读查询，可保持无需鉴权，除非接口需要访问用户个性化数据。

### 5. 保留现有数据隔离，不把 auth 逻辑写进业务模块

服务端 auth 模块只负责“解析当前用户”。聊天、训练、artifact、记忆等业务服务继续通过 `userId` 做权限隔离，不直接解析 token，不读取浏览器存储，不处理弹窗状态。

Route Handler 是 HTTP 边界，负责把请求转换成服务端执行上下文；业务服务只接受经过校验的 `CurrentUser` / `userId`。这可以避免未来接入正式注册登录时改动所有业务模块。

## Risks / Trade-offs

- [Risk] `localStorage` 中的 token 可能被 XSS 读取。→ Mitigation: token 使用服务端签名、最小 payload，不放敏感明文；继续保持 React 默认转义，避免把不可信 HTML 注入页面；正式账号体系阶段评估 HttpOnly cookie。
- [Risk] 没有新增 session 表导致无法单独撤销某个匿名 token。→ Mitigation: token 增加版本和签发时间，服务端支持按 secret 轮换整体失效；如后续需要细粒度撤销，再新增 session 表。
- [Risk] 改造 `getCurrentUser()` 会影响多个 API 和测试。→ Mitigation: 先建立统一 auth helper 和测试夹具，再逐个替换依赖固定用户的服务调用，保证所有私有接口都有 `401` 覆盖。
- [Risk] 前端初始化 auth 前触发私有 API，产生竞态或错误弹窗闪烁。→ Mitigation: 应用级 provider 在 auth 状态为 `checking` 或 `unauthenticated` 时阻止私有页面发起请求；请求层统一处理失效 token。
- [Risk] 历史 `local-demo-user` 数据不会自动出现在新匿名用户下。→ Mitigation: 文档明确这是新鉴权边界的行为；历史数据迁移单独处理。

## Migration Plan

1. 新增匿名 auth server helper、token 签发/校验和 `POST /api/auth/local-anonymous`。
2. 新增前端本地 auth 存储、应用级 auth provider 和弹窗。
3. 改造 `clientRequest()` 自动等待/注入匿名 token，并处理 `401 unauthenticated`。
4. 改造私有 Route Handler，先解析当前用户，再传入服务层或请求上下文。
5. 移除正常请求路径对 `local-demo-user` 的依赖，保留测试和脚本所需的显式 mock/fixture。
6. 更新数据库设计、架构说明和方案变更历史。
7. 运行单元测试、类型检查，并按影响面运行构建。

Rollback 策略：如果匿名鉴权影响核心使用，可以临时通过开发环境 feature flag 回到 `local-demo-user`，但该回退必须只允许本地开发环境使用，并在 trace 或日志中明确标记，不能作为生产默认路径。

## Open Questions

- token 是否需要短期过期时间，例如 30 天，还是本地开发阶段先长期有效。
- 私有 API 的边界是否包括 `/api/exercises` 的个性化排序；如果只是公开动作库查询，可暂不要求鉴权。
- 是否需要在 UI 中提供“重置本地用户”入口，用于清空当前浏览器匿名身份并创建新用户。
