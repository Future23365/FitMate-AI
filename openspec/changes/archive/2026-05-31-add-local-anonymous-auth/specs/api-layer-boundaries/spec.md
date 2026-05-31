## ADDED Requirements

### Requirement: Route handlers establish authenticated request context
系统 SHALL 由除匿名会话 bootstrap 之外的现有 API Route Handler 建立请求级鉴权上下文，再将经过校验的当前用户传递给服务层。

#### Scenario: Existing API route receives authenticated request
- **WHEN** 除 `app/api/auth/local-anonymous/route.ts` 之外的现有 `app/api/*/route.ts` 收到携带有效匿名凭证的请求
- **THEN** Route Handler MUST 在调用业务服务前解析当前用户
- **AND** Route Handler MUST 将 `CurrentUser`、`userId` 或等价的请求上下文传递给服务层
- **AND** 服务层 MUST 基于该上下文执行用户私有数据查询或写入

#### Scenario: Existing API route receives unauthenticated request
- **WHEN** 除 `app/api/auth/local-anonymous/route.ts` 之外的现有 `app/api/*/route.ts` 收到缺少或无效匿名凭证的请求
- **THEN** Route Handler MUST 返回统一 `401 unauthenticated` 响应
- **AND** Route Handler MUST NOT 调用聊天编排、训练持久化、artifact、用户记忆或其他会读写用户私有数据的服务
- **AND** Route Handler MUST NOT 通过固定开发用户继续执行请求

#### Scenario: Anonymous session bootstrap route receives unauthenticated request
- **WHEN** `app/api/auth/local-anonymous/route.ts` 收到没有匿名凭证的创建请求
- **THEN** Route Handler MAY 创建新的匿名用户和匿名凭证
- **AND** Route Handler MUST NOT 通过固定开发用户继续执行请求
