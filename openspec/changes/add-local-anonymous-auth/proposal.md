## Why

当前服务端通过 `local-demo-user` 固定用户处理所有私有数据，无法保证不同浏览器、不同使用者之间的数据隔离。现在需要先接入真实的请求级鉴权上下文，但暂不引入完整注册登录系统，用浏览器本地匿名身份实现自动注册登录，为后续账号体系保留清晰边界。

## What Changes

- 新增本地匿名鉴权能力：前端首次进入应用时弹出轻量确认弹窗，用户确认后自动创建或恢复当前浏览器的匿名身份。
- 前端将匿名身份凭证暂存在浏览器本地存储中，确保同一个浏览器持续使用同一个用户，不同浏览器默认是不同用户。
- 新增服务端匿名会话接口，用于创建匿名用户、绑定 `UserIdentity(provider = "anonymous")`、签发本地匿名凭证，并返回当前用户摘要。
- 新增当前用户解析链路：服务端 API 从请求携带的匿名凭证解析 `CurrentUser`，不再依赖固定 `local-demo-user`。
- 统一更新前端 API 请求层，让聊天、训练编排、训练日历、动作推荐、计划生成、artifact 读取等用户私有接口自动携带匿名凭证。
- 用户私有接口在缺少凭证、凭证无效或用户不存在时返回明确的未认证错误，不静默回退到固定用户。
- 保留 `local-demo-user` 仅作为迁移前历史数据或显式开发兜底的可选处理，不作为正常请求默认用户。
- 更新数据库与架构文档，说明本地匿名鉴权的边界、凭证生命周期、用户数据隔离和后续升级到注册登录系统的路径。

## Capabilities

### New Capabilities

- `local-anonymous-auth`: 定义浏览器本地匿名身份、自动注册登录弹窗、服务端匿名会话接口、请求凭证解析和未认证处理。

### Modified Capabilities

- `api-layer-boundaries`: API Route 需要先建立请求级 auth context，再将 `userId` 传递给服务层；用户私有数据接口不得在缺少鉴权上下文时执行默认固定用户逻辑。

## Impact

- 主要影响 `lib/server/users/current-user.ts`、新增服务端 auth/session 模块、`app/api/auth/*`、`lib/client/http/client-request.ts`、根布局或应用级 provider、聊天/训练相关 API 调用链。
- 影响所有依赖 `getCurrentUser()` 的服务：聊天历史、聊天编排、conversation artifact、训练编排、训练日历、训练结果、用户记忆和动作反馈。
- 复用现有 `User`、`UserIdentity`、`AuthProvider.anonymous` 数据模型；预计不需要新增核心业务表。
- 需要增加匿名凭证签名或随机 token 校验策略，避免客户端伪造任意 `userId`。
- 需要新增测试覆盖匿名会话创建、同一浏览器复用、无凭证拒绝、无效凭证拒绝、API userId 隔离和前端请求自动携带凭证。
