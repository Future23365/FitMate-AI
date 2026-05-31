## ADDED Requirements

### Requirement: Browser local anonymous identity bootstrap
系统 SHALL 在没有正式注册登录系统时，通过浏览器本地匿名身份完成自动注册登录，并保证同一个浏览器持续使用同一个用户。

#### Scenario: First visit without local credential
- **WHEN** 用户首次打开应用且浏览器本地没有有效匿名凭证
- **THEN** 系统 MUST 展示阻塞式登录弹窗
- **AND** 弹窗 MUST 提供一个明确主操作用于继续使用 FitMate
- **AND** 用户触发主操作后系统 MUST 调用服务端匿名会话接口创建匿名用户
- **AND** 创建成功后系统 MUST 将服务端返回的匿名凭证保存到浏览器本地存储
- **AND** 系统 MUST 使用该匿名用户进入应用

#### Scenario: Returning visit with valid local credential
- **WHEN** 用户再次打开同一个浏览器且本地存在有效匿名凭证
- **THEN** 系统 MUST 使用该凭证恢复当前用户
- **AND** 系统 MUST NOT 创建新的匿名用户
- **AND** 用户历史聊天、训练编排、训练日历和 artifact MUST 继续归属于同一个 `userId`

#### Scenario: Different browser has no shared credential
- **WHEN** 用户在另一个没有相同本地凭证的浏览器中打开应用
- **THEN** 系统 MUST 将其视为新的匿名身份
- **AND** 系统 MUST NOT 读取或混用其他浏览器匿名用户的数据

### Requirement: Anonymous session API
系统 SHALL 提供服务端匿名会话接口，用于创建、恢复和校验浏览器本地匿名用户。

#### Scenario: Create anonymous session
- **WHEN** `POST /api/auth/local-anonymous` 收到没有匿名凭证的创建请求
- **THEN** 系统 MUST 创建一个新的 `User`
- **AND** 系统 MUST 创建 `UserIdentity(provider = "anonymous")` 并绑定该 `User`
- **AND** 系统 MUST 返回服务端签发的匿名凭证和最小用户摘要
- **AND** 系统 MUST NOT 要求邮箱、密码或第三方 OAuth 信息

#### Scenario: Restore anonymous session
- **WHEN** `POST /api/auth/local-anonymous` 收到有效匿名凭证
- **THEN** 系统 MUST 校验凭证签名、版本和匿名主体
- **AND** 系统 MUST 通过 `UserIdentity(provider = "anonymous")` 找到对应 `User`
- **AND** 系统 MUST 返回同一个用户摘要
- **AND** 系统 MUST NOT 创建新用户

#### Scenario: Invalid anonymous credential
- **WHEN** 匿名会话接口收到缺失、篡改、签名无效或找不到用户的凭证
- **THEN** 系统 MUST 返回 `401`
- **AND** 响应错误码 MUST 为 `unauthenticated`
- **AND** 系统 MUST NOT 回退到 `local-demo-user`

### Requirement: Authenticated private API requests
系统 SHALL 要求用户私有 API 从请求中的匿名凭证解析当前用户，并拒绝没有有效凭证的请求。

#### Scenario: Private API request with valid credential
- **WHEN** 聊天、训练编排、训练日历、训练结果、conversation artifact、用户记忆或动作反馈接口收到有效匿名凭证
- **THEN** 系统 MUST 解析出当前 `userId`
- **AND** 后续所有用户私有数据查询和写入 MUST 使用该 `userId` 进行权限隔离
- **AND** 系统 MUST NOT 使用固定 `local-demo-user` 作为当前用户

#### Scenario: Private API request without credential
- **WHEN** 用户私有 API 收到没有匿名凭证的请求
- **THEN** 系统 MUST 返回 `401`
- **AND** 响应错误码 MUST 为 `unauthenticated`
- **AND** 系统 MUST NOT 读取、写入或创建任何用户私有业务数据

#### Scenario: Private API request with another user's resource id
- **WHEN** 已认证匿名用户请求读取或修改不属于当前 `userId` 的聊天、训练、日程、结果、artifact 或记忆资源
- **THEN** 系统 MUST 拒绝访问或返回空结果
- **AND** 系统 MUST NOT 泄漏目标资源是否属于其他用户之外的敏感 payload

### Requirement: Frontend request credential propagation
系统 SHALL 通过统一前端请求层携带匿名凭证，并在凭证失效时恢复到匿名登录弹窗。

#### Scenario: Client sends private API request
- **WHEN** 前端通过统一请求工具调用用户私有 API
- **THEN** 请求 MUST 自动携带当前匿名凭证
- **AND** 功能组件 MUST NOT 手动拼接、解析或信任 `userId`

#### Scenario: Client receives unauthenticated error
- **WHEN** 前端请求收到 `401 unauthenticated`
- **THEN** 系统 MUST 清理本地失效匿名凭证
- **AND** 系统 MUST 将应用 auth 状态切换为未认证
- **AND** 系统 MUST 重新展示匿名登录弹窗

### Requirement: Local anonymous auth documentation
系统 SHALL 记录本地匿名鉴权的边界、数据隔离和后续升级路径。

#### Scenario: Documentation is updated
- **WHEN** 本地匿名鉴权实现完成
- **THEN** `docs/database-design.md` MUST 不再描述正常请求默认使用 `local-demo-user`
- **AND** 相关架构文档 MUST 说明匿名凭证、本地存储、`UserIdentity(provider = "anonymous")` 和后续正式注册登录的关系
- **AND** `docs/方案变更历史/` MUST 新增本次鉴权方案变更记录
