## Context

当前生产聊天链路已经有 `User`、`ChatSession`、`ChatMessage` 保存用户和聊天内容，但没有独立的生产 token usage 汇总表。现有 token usage 主要来自模型供应商返回的 usage 字段，并在 Agent 调试 Trace 中被汇总展示；Trace 属于开发 / 排障层，生产环境可以关闭，也可能被截断、清理或脱敏，不能作为后台统计来源。

这次需求的本质不是“给 Trace 加一个页面”，而是新增一个生产后台只读能力：

- 生产者：聊天请求处理链路，负责把 provider usage 累计为请求 / 消息级 token 数量。
- 持久化层：AI token usage summary，负责保存可聚合的输入 / 输出 / 总 token。
- 协调者：AI usage recording service，负责按用户、会话和消息归属写入 token 汇总，并避免重复记账。
- 消费者：admin 查询 service，负责聚合用户、会话和消息 / 请求的输入 / 输出 / 总 token。
- 展示层：简易 admin 页面，只读展示聚合结果和聊天内容。
- 诊断消费者：Trace 可以继续展示 usage 摘要，但不得成为生产后台统计来源。

## Goals / Non-Goals

**Goals:**

- 建立独立于 Trace 的生产 AI token usage summary。
- 按聊天请求或助手消息粒度记录 token 数量；如果内部发生多个 Agent loop / planner call，只累计 token 数量，不保存每一步执行明细。
- 分别记录输入 token、输出 token 和总 token，并只保留后台按用户、会话、消息聚合所需的最小归属字段。
- 后台页面能按全站、用户、会话和消息 / 请求粒度聚合展示 token usage。
- 后台页面能查看生产用户列表、用户会话列表和聊天消息内容。
- 所有后台入口都经过 admin guard，第一版使用集中配置中的管理员身份规则。
- usage summary 写入失败不得影响用户聊天主流程；第一版不新增错误日志或错误明细保存要求。

**Non-Goals:**

- 不把 `/dev/ai-traces`、内存 Trace store 或导出的 `codex_logs` 作为后台统计来源。
- 不把 token usage 写进 `ChatMessage.metadata`，也不从聊天消息正文估算正式 token。
- 不记录 Agent loop、planner index、model call、source、model、runtime step、错误 code 或错误日志明细。
- 不改变模型可见 prompt、Agent tool manifest、Tool Calling 合同、训练计划生成规则或 Response Renderer。
- 不实现复杂运营后台能力，例如用户封禁、删除聊天、编辑用户资料、导出全量数据、计费结算或成本金额换算。
- 不追溯修复历史请求的真实 token usage；上线前历史数据最多只能显示为空或明确标注为无汇总记录。

## Decisions

### 1. 新增 `AiTokenUsageSummary` 作为生产 token usage 汇总表

实现时新增 Prisma model，例如 `AiTokenUsageSummary`，字段只保留后台聚合 token 所需内容，至少包括：

- `id`
- `userId`
- `conversationId`
- `messageId`
- `promptTokens`
- `completionTokens`
- `totalTokens`
- `createdAt`
- `updatedAt`

需要增加面向后台聚合的索引，例如 `userId + createdAt`、`conversationId + createdAt`、`messageId`，并通过 `messageId` 或等价请求级幂等键避免重复记账。

取舍：把 usage 放进 `ChatMessage.metadata` 看似少一张表，但聊天历史会被前端整段保存重写，且消息是用户可见会话事实，不是正式统计表。独立表能稳定聚合 token，又不需要持久化 Agent 内部 loop 或模型调用细节。

### 2. 在聊天请求链路中汇总 token，而不是按内部模型调用落明细

记录点应放在生产聊天请求处理链路中：

- 读取 provider 返回并已归一化的 `ModelTokenUsage`。
- 同一次聊天请求内部如果发生多次 planner / repair / finalizer 模型调用，只累计 `promptTokens`、`completionTokens` 和 `totalTokens`。
- 请求完成并能确定用户、会话和消息归属后，写入或更新一条请求 / 消息级 usage summary。
- provider 没有返回 usage 时，不伪装成真实 0；后台可以显示无 usage 记录或未知 token。

取舍：按每次模型调用落库可以做更细的追踪，但当前需求只需要 token 数量统计。请求 / 消息级汇总能显著降低表结构复杂度和后台信息噪音，也避免把 Agent 内部执行轨迹变成生产持久化数据。

### 3. Trace 只作为诊断消费者，不作为生产统计来源

Trace 仍可展示 token usage 摘要，用于开发排障和单次请求复盘。但后台页面必须只读生产 usage summary。生产关闭 Trace 时，summary 写入和后台汇总仍然工作。

取舍：复用 Trace 可以减少实现量，但会把生产统计绑定到一个可关闭、可截断、内存态的诊断系统，和后台稳定统计需求冲突。

### 4. 后台权限使用集中配置和服务端 admin guard

实现时新增 `lib/server/config/admin-config.ts`，集中解析管理员身份配置，例如 `FITMATE_ADMIN_USER_IDS`。新增 `requireAdminUser(request)` 或等价 guard：

- 先复用现有 `requireCurrentUser(request)` 恢复请求用户。
- 再通过集中配置判断当前用户是否有后台访问权。
- 未登录返回 401，已登录但非管理员返回 403。
- 后台页面、Route Handler 和后台 service 不得自行解析环境变量或复制权限判断。

取舍：第一版不引入完整 RBAC，避免扩散权限模型；但所有后台入口必须有统一 guard，后续正式账号 / 邮箱 / role 表可以替换 guard 内部实现。

### 5. 后台查询通过 admin service 投影，UI 不直接消费 Prisma shape

新增后台查询 service，例如 `lib/server/admin/admin-ai-usage-service.ts`：

- `getAdminUsageOverview()`：全站用户、会话、消息、prompt / completion / total token 汇总。
- `listAdminUsers()`：用户列表和每个用户的会话数、消息数、token 汇总。
- `getAdminUserDetail(userId)`：用户会话、聊天消息摘要、会话 token 汇总。
- `getAdminConversationDetail(conversationId)`：聊天消息和消息 / 请求级 token 汇总。

UI 只消费这些投影对象，不直接拼接 Prisma include shape。这样未来 usage summary 字段或聊天持久化结构调整时，只改 admin service。

取舍：直接在 Server Component 里写 Prisma 查询更快，但会让后台 UI 认识 DB shape、usage summary shape 和聊天消息 shape，后续扩展第二个后台视图时会重复耦合。

### 6. 第一版后台保持简易只读，不做高风险写操作

页面可以粗糙，但必须清楚展示：

- 全站输入 token、输出 token、总 token。
- 每个用户输入 / 输出 / 总 token。
- 每个会话输入 / 输出 / 总 token。
- 每条已记账消息或请求的输入 / 输出 / 总 token。
- 用户聊天消息正文和时间。

不提供删除用户、删除聊天、编辑数据、封禁用户或导出敏感内容。

## Risks / Trade-offs

- [Risk] usage summary 写入失败导致后台少记 token。→ Mitigation：写入失败不得影响聊天响应；测试覆盖失败隔离，后台不从 Trace 或聊天正文临时反推正式 token。
- [Risk] 重试、异常路径或 stream 中断导致重复记账。→ Mitigation：使用消息级或请求级唯一键，写入使用幂等 upsert / create with conflict handling。
- [Risk] provider 不返回 usage 或字段名不同。→ Mitigation：复用现有 `normalizeModelTokenUsage` 归一化；无法获取时不把未知当成真实 0。
- [Risk] 后台泄露所有用户聊天内容。→ Mitigation：所有入口使用 admin guard；页面只读；不暴露给普通路由导航；错误响应区分 401 / 403。
- [Risk] 后台聚合查询影响生产数据库性能。→ Mitigation：为 `userId`、`conversationId`、`messageId`、`createdAt` 建索引；第一版限制分页和时间范围默认值，避免一次性扫全量消息。
- [Risk] 把 Trace 和 ledger 写入混在一起导致职责反转。→ Mitigation：usage recording service 是 token 汇总写入入口；Trace 只能读取或接收摘要用于诊断展示。

## Migration Plan

1. 新增 Prisma model、迁移和索引；历史请求没有汇总记录，后台明确显示为空或无 usage。
2. 新增 admin config 和 admin guard，并补鉴权测试。
3. 新增 usage recording service，在生产聊天请求中累计可获取的模型 usage，并按消息 / 请求级写入汇总。
4. 新增 admin 查询 service，按 overview、user list、user detail、conversation detail 输出稳定投影。
5. 新增 `/admin` 只读页面和必要的子页面 / 查询参数，展示用户、聊天内容和 token 汇总。
6. 运行 Prisma、TypeScript、相关单元测试、admin 页面测试和 OpenSpec 校验。
7. 部署时配置管理员 userId；若未配置管理员，后台入口必须拒绝访问而不是默认开放。

## Open Questions

- 第一版是否需要后台时间范围筛选默认为最近 7 天，还是默认全量汇总。建议实现时采用默认最近 7 天 + 可选全量，降低生产查询压力。
- 第一版是否需要显示金额成本。当前 change 不包含金额换算；如果后续要做，需要新增 model pricing 配置和独立成本计算合同。
