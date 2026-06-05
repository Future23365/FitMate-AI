# local-auth-cookie-dialog Specification

## Purpose
TBD - created by archiving change fix-local-auth-cookie-dialog. Update Purpose after archive.
## Requirements
### Requirement: 页面启动不强制匿名登录
系统 SHALL 允许用户在没有本地匿名凭证时正常进入应用页面，并且 SHALL NOT 在应用启动阶段强制创建匿名用户或用全局页面阻塞当前布局。

#### Scenario: 首次打开应用页面
- **WHEN** 浏览器没有本地匿名 auth cookie 且用户打开应用页面
- **THEN** 系统 MUST 渲染当前路由页面和应用布局
- **AND** 系统 MUST NOT 自动调用匿名注册接口
- **AND** 系统 MUST NOT 显示替换整页的登录页、全屏白背景或全局阻塞层
- **AND** 系统 MAY 在私有数据区域展示局部 loading、空态或错误态

#### Scenario: 私有接口返回未认证
- **WHEN** 页面中的私有 API 请求返回 `401` 且错误语义为 `unauthenticated`
- **THEN** 客户端统一请求层 MUST 触发本地匿名登录 Dialog
- **AND** 当前页面布局 MUST 保持可见
- **AND** 调用方 MUST NOT 需要在每个 feature 中重复实现登录弹窗触发逻辑

#### Scenario: 兼容旧未认证 403
- **WHEN** 页面中的私有 API 请求返回 `403` 且响应体明确表示未认证而不是权限不足
- **THEN** 客户端统一请求层 MUST 将其视为登录需求并触发本地匿名登录 Dialog
- **AND** 系统 MUST NOT 将真实 forbidden 权限错误误判为登录需求

### Requirement: 本地匿名登录使用布局内 Dialog
系统 SHALL 使用项目本地 shadcn/ui Dialog 组件展示本地匿名登录或注册入口，并保持弹窗属于当前应用布局上下文。

#### Scenario: 未认证接口触发登录
- **WHEN** 客户端请求层发出 auth-required 事件
- **THEN** `LocalAuthProvider` MUST 打开一个 shadcn/ui `Dialog`
- **AND** Dialog 内容 MUST 包含创建或恢复本地匿名用户所需的操作
- **AND** Dialog MUST 显示在当前页面布局之上，而不是替换根页面

#### Scenario: 用户完成匿名登录
- **WHEN** 用户在 Dialog 中确认创建或恢复本地匿名用户且接口成功
- **THEN** 服务端 MUST 写入匿名 auth cookie
- **AND** 前端 MUST 保存返回的最小用户摘要到当前运行时状态
- **AND** Dialog MUST 关闭
- **AND** 后续同源私有 API 请求 MUST 能通过 cookie 建立当前用户上下文

#### Scenario: 用户关闭 Dialog
- **WHEN** 用户关闭本地匿名登录 Dialog
- **THEN** 系统 MUST 保留当前页面
- **AND** 系统 MUST NOT 自动跳转到独立登录页
- **AND** 需要私有数据的区域 MAY 继续显示未认证局部状态

### Requirement: 匿名 token 存储在 HttpOnly cookie
系统 SHALL 将本地匿名 token 存储在服务端设置的 HttpOnly cookie 中，前端 SHALL NOT 在 `localStorage` 或可读 JS 状态中保存 token。

#### Scenario: 匿名登录成功
- **WHEN** `POST /api/auth/local-anonymous` 成功创建或恢复匿名用户
- **THEN** 响应 MUST 通过 `Set-Cookie` 写入匿名 auth cookie
- **AND** cookie MUST 设置 `HttpOnly`
- **AND** cookie MUST 设置 `SameSite=Lax`
- **AND** cookie MUST 设置 `Path=/`
- **AND** 生产环境 cookie MUST 设置 `Secure`
- **AND** 响应 JSON MUST NOT 返回匿名 token

#### Scenario: 客户端发起私有请求
- **WHEN** 前端调用同源私有 API
- **THEN** 客户端请求层 MUST NOT 从 `localStorage` 读取匿名 token
- **AND** 客户端请求层 MUST NOT 设置 `Authorization: Bearer <anonymous-token>`
- **AND** 请求 MUST 依赖浏览器自动携带的同源 cookie

#### Scenario: 服务端解析当前用户
- **WHEN** 私有 Route Handler 需要当前用户
- **THEN** 系统 MUST 通过服务端 auth helper 从请求 cookie 读取匿名 token
- **AND** 系统 MUST 验证 token 签名和过期时间
- **AND** 系统 MUST 使用 token 中的 `userId` 建立 request-level auth context
- **AND** 系统 MUST 在缺少、无效或过期 token 时返回稳定的未认证错误

### Requirement: 重置本地用户清除 cookie
系统 SHALL 通过服务端接口重置当前浏览器的本地匿名会话，并且 SHALL NOT 删除旧匿名用户的服务器数据。

#### Scenario: 用户重置本地用户
- **WHEN** 用户在设置页触发“重置本地用户”
- **THEN** 前端 MUST 调用服务端重置接口
- **AND** 服务端 MUST 清除匿名 auth cookie
- **AND** 前端 MUST 清空当前运行时用户摘要
- **AND** 系统 MUST NOT 删除旧匿名用户、聊天记录、训练记录或其他服务器数据

#### Scenario: 重置后再次请求私有接口
- **WHEN** cookie 已被清除且用户再次触发私有 API 请求
- **THEN** 服务端 MUST 返回未认证响应
- **AND** 客户端请求层 MUST 再次触发布局内登录 Dialog

### Requirement: 本地匿名 secret 策略明确
系统 SHALL 明确 `FITMATE_LOCAL_AUTH_SECRET` 的开发与生产行为，避免本地 fallback 被误认为生产可用配置。

#### Scenario: 本地开发未配置 secret
- **WHEN** `NODE_ENV` 不是 `production` 且未设置 `FITMATE_LOCAL_AUTH_SECRET`
- **THEN** 系统 MAY 使用固定开发 fallback secret
- **AND** 文档 MUST 说明这是本地开发便利行为
- **AND** 测试 MUST 覆盖该 fallback 行为

#### Scenario: 生产环境未配置 secret
- **WHEN** `NODE_ENV` 是 `production` 且未设置 `FITMATE_LOCAL_AUTH_SECRET`
- **THEN** 系统 MUST 拒绝签发或校验本地匿名 token
- **AND** 系统 MUST 返回可定位的服务端配置错误
- **AND** 系统 MUST NOT 使用开发 fallback secret

#### Scenario: 文档说明环境变量
- **WHEN** 开发者查看项目环境变量或架构说明
- **THEN** 文档 MUST 说明 `FITMATE_LOCAL_AUTH_SECRET` 的用途、生产要求和本地 fallback 行为
- **AND** 文档 MUST 说明匿名 token 存储在 HttpOnly cookie 中，而不是 `localStorage`

### Requirement: 未认证事件提供全局登录提示
系统 SHALL 在客户端统一请求层确认未认证响应并触发 `fitmate:auth-required` 事件后，通过全局 toast 给用户展示需要登录的轻量提示，同时保留布局内匿名登录 Dialog 作为操作入口。

#### Scenario: 私有接口返回未认证时提示登录
- **WHEN** 页面中的私有 API 请求返回未认证响应，且客户端请求层触发 `fitmate:auth-required` 事件
- **THEN** `LocalAuthProvider` MUST 打开本地匿名登录 Dialog
- **AND** `LocalAuthProvider` MUST 触发全局 toast 提示用户当前操作需要登录
- **AND** 调用方 MUST NOT 需要在每个 feature 中重复实现登录 toast 触发逻辑

#### Scenario: 真实 forbidden 不触发登录提示
- **WHEN** 页面中的私有 API 请求返回真实权限不足响应，而响应体未明确表示 `code: "unauthenticated"`
- **THEN** 客户端统一请求层 MUST NOT 触发 `fitmate:auth-required` 事件
- **AND** 系统 MUST NOT 弹出需要登录的全局 toast

#### Scenario: 多个未认证请求不会堆叠提示
- **WHEN** 多个私有 API 请求连续触发 `fitmate:auth-required` 事件
- **THEN** 全局登录提示 MUST 使用稳定标识避免同类 toast 在界面上无序堆叠
- **AND** 本地匿名登录 Dialog MUST 继续保持单一入口

### Requirement: 本地匿名身份操作提供成功提示
系统 SHALL 在本地匿名登录或本地用户重置成功后，通过全局 toast 给用户展示操作已完成的轻量反馈。

#### Scenario: 匿名登录成功后提示
- **WHEN** 用户在本地匿名登录 Dialog 中确认登录，且 `POST /api/auth/local-anonymous` 成功返回用户摘要
- **THEN** `LocalAuthProvider` MUST 关闭登录 Dialog
- **AND** `LocalAuthProvider` MUST 触发全局 toast 提示登录成功
- **AND** 登录成功提示 MUST 使用稳定标识避免同类 toast 无序堆叠

#### Scenario: 本地用户重置成功后提示
- **WHEN** 用户确认重置本地用户，且 `DELETE /api/auth/local-anonymous` 成功清除当前浏览器 cookie
- **THEN** 前端 MUST 清空当前运行时用户摘要
- **AND** 前端 MUST 触发全局 toast 提示本地用户重置成功
- **AND** 重置成功提示 MUST 使用稳定标识避免同类 toast 无序堆叠

