## 1. 服务端匿名鉴权基础

- [x] 1.1 新增服务端 auth 模块，定义 `CurrentUser`、匿名 token payload、签发、校验、错误码和统一 `unauthenticated` 结果。
- [x] 1.2 复用 `User`、`UserIdentity(provider = "anonymous")` 实现匿名用户创建和恢复逻辑，禁止客户端传入裸 `userId` 作为身份依据。
- [x] 1.3 新增 `POST /api/auth/local-anonymous`，支持无 token 创建匿名会话、有 token 恢复匿名会话、无效 token 返回 `401 unauthenticated`。
- [x] 1.4 为匿名 token secret、版本、签发时间、`180 days` 过期时间和本地开发默认配置建立明确策略，避免缺少配置时静默生成不可预期用户。
- [x] 1.5 扩展 `lib/server/http/api-error.ts` 的错误码，新增统一 `unauthenticated` 响应 helper，保证所有鉴权失败响应 shape 一致。

## 2. 请求级用户上下文接入

- [x] 2.1 重构 `lib/server/users/current-user.ts`，让正常请求路径从请求凭证解析当前用户，不再默认 upsert `local-demo-user`。
- [x] 2.2 为 Route Handler 建立统一 `requireCurrentUser(request)` auth context 入口，在调用业务服务前解析 `CurrentUser`。
- [x] 2.3 改造 `app/api/chat/route.ts`、`app/api/chat/conversations/route.ts` 和 `app/api/chat/conversations/[id]/route.ts`，确保聊天流、聊天历史和 conversation artifact 相关调用链都使用请求级当前用户。
- [x] 2.4 改造 `app/api/workout-routines/route.ts`、`app/api/workout-routines/[id]/route.ts`、`app/api/workout-schedules/route.ts`、`app/api/workout-schedules/[id]/route.ts` 和 `app/api/workout-schedules/[id]/result/route.ts`，确保训练编排、训练日历和训练结果都使用请求级当前用户。
- [x] 2.5 改造 `app/api/exercises/route.ts`、`app/api/exercises/[id]/route.ts`、`app/api/ai/workout-plan/route.ts`、`app/api/ai/exercise-recommendations/route.ts` 和 `app/api/dev/ai-traces/route.ts`，确保动作库、AI 生成和开发 trace API 也要求有效匿名凭证。
- [x] 2.6 移除正常业务路径中对固定 `local-demo-user` 的依赖，只保留测试、seed 或显式本地开发兜底所需的受控 helper。

## 3. 前端本地匿名登录体验

- [x] 3.1 新增前端本地 auth 存储工具，使用固定 key 保存、读取、清理匿名凭证，并处理版本不兼容。
- [x] 3.2 新增应用级 `LocalAuthProvider` 或等价组件，启动时恢复匿名用户，未认证时阻塞页面、侧栏历史和开发 trace 的 API 请求。
- [x] 3.3 新增本地匿名登录弹窗，提供明确主操作，点击后自动调用匿名会话接口并进入应用。
- [x] 3.4 改造 `clientRequest()` 或统一请求层，让 API 自动携带匿名凭证，并在收到 `401 unauthenticated` 时清理凭证并触发重新登录。
- [x] 3.5 更新侧栏或用户摘要展示，避免继续写死 `FitMate 用户` 作为唯一用户来源；如暂无展示需求，至少保证展示来自当前 auth state。
- [x] 3.6 在设置页新增“重置本地用户”入口，点击后清理当前浏览器匿名凭证并重新进入匿名登录流程，不删除服务器上旧匿名用户数据。

## 4. 数据隔离与错误处理

- [x] 4.1 确保聊天、训练编排、训练日历、训练结果、artifact、用户记忆、动作反馈、动作库和开发 trace 查询都继续按当前 `userId` 或当前请求上下文过滤。
- [x] 4.2 覆盖“当前用户访问另一个用户资源 id”的服务端行为，返回空结果、拒绝访问或统一错误，不泄漏其他用户 payload。
- [x] 4.3 为 token 缺失、token 篡改、用户不存在、identity 不存在和 provider 不匹配建立统一错误处理和日志边界。
- [x] 4.4 确保 AI Trace、聊天后处理、artifact 创建和训练保存链路记录当前匿名用户 id，但不把 token 写入 trace、日志或持久化业务 payload。

## 5. 测试与验证

- [x] 5.1 新增匿名 token 单元测试，覆盖签发、校验、篡改、过期、版本错误和 secret 缺失。
- [x] 5.2 新增匿名会话 API 测试，覆盖首次创建、同 token 恢复、无效 token `401` 和不回退 `local-demo-user`。
- [x] 5.3 更新 API route 测试，覆盖现有 `app/api` 路由缺少凭证被拒绝、有效凭证使用当前 `userId`、跨用户资源无法访问，并确认未认证时不调用业务服务。
- [x] 5.4 更新持久化服务、聊天历史、conversation artifact、训练编排和训练日历相关测试，显式传入或 mock 请求级当前用户。
- [x] 5.5 新增前端 auth provider / 请求层测试，覆盖本地凭证恢复、首次弹窗创建、`401 unauthenticated` 清理凭证和重新展示弹窗，包括 `throwOnError: false`、`responseType: "raw"` 和流式聊天响应路径。
- [x] 5.6 新增设置页重置本地用户测试，覆盖清理本地凭证、auth 状态回到未认证、重新展示匿名登录弹窗。
- [x] 5.7 新增 auth 初始化竞态测试，覆盖 `AppSidebar`、页面数据请求和开发 trace 在 auth ready 前不会提前请求 API。
- [x] 5.8 运行 `npm test` 验证用户隔离、API 和前端 auth 回归。
- [x] 5.9 运行 `npm run typecheck` 验证服务端/客户端 auth 类型边界。
- [x] 5.10 由于本 change 影响 Route Handler、根布局或服务端/客户端模块边界，运行 `npm run build`；如无法运行，记录原因。

## 6. 文档与收尾

- [x] 6.1 更新 `docs/database-design.md`，说明当前用户来源改为浏览器本地匿名鉴权，不再描述正常请求默认 `local-demo-user`。
- [x] 6.2 按需更新 `docs/architecture.md` 或相关 API 文档，记录匿名凭证、请求级 auth context 和正式登录系统升级路径。
- [x] 6.3 在 `docs/方案变更历史/` 新增本次鉴权方案变更记录，说明固定用户方案的问题、匿名鉴权思路、关键改动和限制。
- [x] 6.4 在 `docs/项目演变历程.md` 末尾追加本次用户鉴权链路变化摘要。
- [x] 6.5 运行 `openspec validate add-local-anonymous-auth --strict`，确认 proposal、design、spec 和 tasks 可归档。
