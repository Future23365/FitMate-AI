## ADDED Requirements

### Requirement: 私有 API 通过 cookie 建立匿名用户上下文
系统 SHALL 让私有 Route Handler 通过服务端 auth helper 从 HttpOnly cookie 建立当前匿名用户上下文，并保持 Route Handler 只承担 HTTP 边界适配职责。

#### Scenario: 私有接口收到有效匿名 cookie
- **WHEN** 私有 `app/api/*/route.ts` 收到包含有效匿名 auth cookie 的请求
- **THEN** Route Handler MUST 调用服务端 auth helper 建立 request-level auth context
- **AND** Route Handler MUST 将解析出的 `userId` 传递给服务层
- **AND** Route Handler MUST NOT 直接在路由中复制 token 校验、签名解析或用户隔离业务逻辑

#### Scenario: 私有接口缺少匿名 cookie
- **WHEN** 私有 `app/api/*/route.ts` 收到缺少匿名 auth cookie 的请求
- **THEN** 服务端 auth helper MUST 返回稳定的 unauthenticated 结果
- **AND** Route Handler MUST 将该结果映射为 `401 unauthenticated`
- **AND** 如果历史兼容路径暂时返回 `403`，响应体 MUST 明确表达这是未认证而不是权限不足

#### Scenario: 私有接口收到无效匿名 cookie
- **WHEN** 私有 `app/api/*/route.ts` 收到签名错误、过期或格式无效的匿名 auth cookie
- **THEN** 系统 MUST 拒绝建立当前用户上下文
- **AND** Route Handler MUST NOT 调用需要 `userId` 的服务层写入或读取私有数据
- **AND** 响应 MUST 能被客户端请求层识别为需要登录

#### Scenario: 已认证但无权访问资源
- **WHEN** 请求包含有效匿名 cookie 但用户访问不属于自己的资源
- **THEN** 服务层 MUST 继续基于 `userId` 做权限隔离
- **AND** Route Handler MUST 返回 forbidden 或 not found 语义
- **AND** 客户端请求层 MUST NOT 因该响应打开登录 Dialog，除非响应体明确表示未认证
