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
