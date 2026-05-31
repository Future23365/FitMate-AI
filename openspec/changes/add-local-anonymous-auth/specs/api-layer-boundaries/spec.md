## ADDED Requirements

### Requirement: Route handlers establish authenticated request context
系统 SHALL 由用户私有 API 的 Route Handler 建立请求级鉴权上下文，再将经过校验的当前用户传递给服务层。

#### Scenario: Private route receives authenticated request
- **WHEN** 用户私有 `app/api/*/route.ts` 收到携带有效匿名凭证的请求
- **THEN** Route Handler MUST 在调用业务服务前解析当前用户
- **AND** Route Handler MUST 将 `CurrentUser`、`userId` 或等价的请求上下文传递给服务层
- **AND** 服务层 MUST 基于该上下文执行用户私有数据查询或写入

#### Scenario: Private route receives unauthenticated request
- **WHEN** 用户私有 `app/api/*/route.ts` 收到缺少或无效匿名凭证的请求
- **THEN** Route Handler MUST 返回统一 `401 unauthenticated` 响应
- **AND** Route Handler MUST NOT 调用聊天编排、训练持久化、artifact、用户记忆或其他会读写用户私有数据的服务
- **AND** Route Handler MUST NOT 通过固定开发用户继续执行请求

#### Scenario: Public route does not need user context
- **WHEN** 公开只读 Route Handler 不需要访问用户私有数据
- **THEN** Route Handler MAY 不解析匿名凭证
- **AND** Route Handler MUST NOT 从缺失的鉴权上下文推断默认用户
