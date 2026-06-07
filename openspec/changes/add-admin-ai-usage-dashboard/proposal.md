## Why

生产环境需要一个简易后台，能查看用户、用户聊天内容，以及 AI 模型 token 消耗。当前 token usage 主要出现在开发诊断 Trace 中，而 Trace 在生产环境可以关闭、截断和清理，不能作为生产统计来源；聊天消息正文也不适合承载正式 token 统计。

本 change 需要新增独立的生产 AI token usage 汇总表，并提供只读后台页面按全站、用户、会话和消息 / 请求粒度展示输入 token、输出 token 和总 token。第一版只记录 token 数量和后台聚合所需的最小归属关系，不记录 Agent loop、planner call、模型调用步骤、错误日志或内部执行轨迹。

## What Changes

- 新增生产级 AI token usage summary，用稳定数据库表记录每次聊天请求或助手消息对应的 `promptTokens`、`completionTokens` 和 `totalTokens`。
- 在聊天请求处理链路中汇总 provider 返回的 usage；如果一次请求内部发生多次模型调用，只累计 token 数量，不持久化每一步 loop / planner call 做了什么。
- 新增后台访问权限边界，第一版通过集中配置声明允许访问后台的管理员身份，后台 API / 页面必须统一经过 admin guard。
- 新增简易只读后台页面，展示全站 token 汇总、用户列表、用户 token 汇总、用户会话、聊天消息和消息 / 请求级 token 汇总。
- 后台页面只读取生产 usage summary、`User`、`ChatSession`、`ChatMessage` 等业务表；不得依赖 `/dev/ai-traces`、内存 trace store 或 `ChatMessage.metadata` 推断 token。
- 保持 Trace 的诊断职责：Trace 可以继续展示 usage 诊断信息，但 Trace 不是生产 usage 统计来源，生产关闭 Trace 不影响后台 token 汇总。

## Capabilities

### New Capabilities

- `admin-ai-usage-dashboard`: 后台只读查看生产用户、聊天内容和 AI token usage 汇总，支持按全站、用户、会话和消息 / 请求粒度聚合输入 / 输出 / 总 token。

### Modified Capabilities

- 无。该 change 新增后台和生产 usage 汇总能力，不改变现有用户聊天、Agent tool、模型可见 prompt、训练计划生成或 Trace 诊断合同。

## Impact

- 影响数据库：新增 AI token usage summary 表和必要索引 / 唯一键，新增 Prisma model 和迁移。
- 影响服务端配置：新增集中 admin 配置，集中解析管理员 userId / 未来可扩展邮箱等访问条件。
- 影响服务端权限：新增 admin guard，后台页面和查询服务必须使用该 guard。
- 影响 AI 编排：在生产聊天请求链路中汇总模型 usage，并按聊天请求或助手消息写入 usage summary。
- 影响后台 UI：新增简易只读 admin 页面，展示用户、聊天内容和 token 汇总 / 明细。
- 影响测试：新增 usage summary 单元测试、多模型调用合并统计测试、admin guard 测试、后台查询聚合测试和必要的页面渲染测试。
- 不影响模型可见 prompt、Agent tool manifest、Tool Calling 合同、训练计划生成规则、用户聊天响应协议或 dev Trace 数据结构。
