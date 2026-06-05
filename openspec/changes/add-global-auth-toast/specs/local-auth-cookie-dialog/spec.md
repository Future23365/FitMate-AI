## ADDED Requirements

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
