## Why

生产环境需要一个简易后台，能查看用户、用户聊天内容，以及 AI 模型 token 消耗。当前 token usage 主要出现在开发诊断 Trace 中，而 Trace 在生产环境可以关闭、截断和清理，不能作为生产统计或后台审计的数据来源；聊天消息历史也不适合承载请求级模型调用账本。

本 change 需要新增独立的生产 AI 模型调用账本，并提供只读后台页面按用户、会话、请求 run、Agent loop 和单次模型调用聚合展示输入 token、输出 token 和总 token。

## What Changes

- 新增生产级 AI 模型调用 usage ledger，用稳定数据库表记录每次真实模型调用的 `promptTokens`、`completionTokens`、`totalTokens`、模型、来源、状态和关联上下文。
- 在模型调用边界记录 usage event，覆盖 Agent planner 每个 loop / repair 的模型调用，以及 terminal failure finalizer 等独立模型调用；未来 conversation summary、embedding、rerank 等模型调用可通过同一账本扩展。
- 新增后台访问权限边界，第一版通过集中配置声明允许访问后台的管理员身份，后台 API / 页面必须统一经过 admin guard。
- 新增简易只读后台页面，展示全站 token 汇总、用户列表、用户 token 汇总、用户会话、聊天消息和每次 run / loop / model call 的 token 明细。
- 后台页面只读取生产 usage ledger、`User`、`ChatSession`、`ChatMessage` 等业务表；不得依赖 `/dev/ai-traces`、内存 trace store 或 `ChatMessage.metadata` 推断 token。
- 保持 Trace 的诊断职责：Trace 可以继续展示 usage 诊断信息，但 Trace 不是生产 usage 统计来源，生产关闭 Trace 不影响后台 token 账本。

## Capabilities

### New Capabilities

- `admin-ai-usage-dashboard`: 后台只读查看生产用户、聊天内容和 AI 模型调用 token 账本，支持按全站、用户、会话、run、loop 和模型调用粒度聚合输入 / 输出 / 总 token。

### Modified Capabilities

- 无。该 change 新增后台和生产 usage 账本能力，不改变现有用户聊天、Agent tool、模型可见 prompt、训练计划生成或 Trace 诊断合同。

## Impact

- 影响数据库：新增 AI 模型调用 usage ledger 表和必要索引 / 唯一键，新增 Prisma model 和迁移。
- 影响服务端配置：新增集中 admin 配置，集中解析管理员 userId / 未来可扩展邮箱等访问条件。
- 影响服务端权限：新增 admin guard，后台页面和查询服务必须使用该 guard。
- 影响 AI 编排：在生产模型调用结果归一化后写入 usage ledger，覆盖 Agent planner 每次模型调用和 terminal failure finalizer。
- 影响后台 UI：新增简易只读 admin 页面，展示用户、聊天内容和 token 汇总 / 明细。
- 影响测试：新增 usage ledger 单元测试、Agent loop 多模型调用统计测试、admin guard 测试、后台查询聚合测试和必要的页面渲染测试。
- 不影响模型可见 prompt、Agent tool manifest、Tool Calling 合同、训练计划生成规则、用户聊天响应协议或 dev Trace 数据结构。
