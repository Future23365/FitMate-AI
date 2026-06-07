## Context

当前生产聊天链路已经有 `User`、`ChatSession`、`ChatMessage` 保存用户和聊天内容，但没有独立的生产 token usage 账本。现有 token usage 主要来自模型供应商返回的 usage 字段，并在 Agent 调试 Trace 中被汇总展示；Trace 属于开发 / 排障层，生产环境可以关闭，也可能被截断、清理或脱敏，不能作为后台统计来源。

这次需求的本质不是“给 Trace 加一个页面”，而是新增一个生产后台只读能力：

- 生产者：真实模型调用边界，负责把 provider usage 归一化为稳定 usage event。
- 持久化层：AI 模型调用 usage ledger，负责保存可审计、可聚合的 token 事实。
- 协调者：AI usage recording service，负责去重、失败隔离和上下文关联。
- 消费者：admin 查询 service，负责聚合用户、会话、run、loop、model call 的输入 / 输出 / 总 token。
- 展示层：简易 admin 页面，只读展示聚合结果和聊天内容。
- 诊断消费者：Trace 可以继续展示 usage 摘要，但不得成为生产后台统计来源。

## Goals / Non-Goals

**Goals:**

- 建立独立于 Trace 的生产 AI 模型调用 usage ledger。
- 覆盖 Agent Loop 中每一次 planner 模型调用，而不是只统计用户可见的一问一答。
- 分别记录输入 token、输出 token 和总 token，并保留 model、source、loop / planner index、run、conversation、message、user 等关联事实。
- 后台页面能按全站、用户、会话、run、loop 和 model call 粒度聚合展示 token usage。
- 后台页面能查看生产用户列表、用户会话列表和聊天消息内容。
- 所有后台入口都经过 admin guard，第一版使用集中配置中的管理员身份规则。
- usage 账本写入失败不得影响用户聊天主流程，但必须留下服务端错误日志。

**Non-Goals:**

- 不把 `/dev/ai-traces`、内存 Trace store 或导出的 `codex_logs` 作为后台统计来源。
- 不把 token usage 写进 `ChatMessage.metadata`，也不从聊天消息正文估算正式 token。
- 不改变模型可见 prompt、Agent tool manifest、Tool Calling 合同、训练计划生成规则或 Response Renderer。
- 不实现复杂运营后台能力，例如用户封禁、删除聊天、编辑用户资料、导出全量数据、计费结算或成本金额换算。
- 不追溯修复历史请求的真实 token usage；上线前历史数据最多只能显示为空或明确标注为无账本记录。

## Decisions

### 1. 新增 `AiTokenUsageEvent` 作为生产 usage ledger

实现时新增 Prisma model，例如 `AiTokenUsageEvent`，字段至少包括：

- `id`
- `userId`
- `conversationId`
- `messageId`
- `runId`
- `modelCallId`
- `source`，例如 `agent_planner`、`terminal_failure_finalizer`、未来的 `conversation_summary`
- `loopTurn`
- `plannerCallIndex`
- `runtimeStep`
- `provider`
- `model`
- `status`，例如 `succeeded`、`failed`、`usage_unavailable`
- `promptTokens`
- `completionTokens`
- `totalTokens`
- `errorCode`
- `createdAt`

需要增加面向后台聚合的索引，例如 `userId + createdAt`、`conversationId + createdAt`、`runId + source + plannerCallIndex`，并通过 `modelCallId` 或 `runId + source + plannerCallIndex + loopTurn` 建立幂等边界，避免异常路径重复记账。

取舍：把 usage 放进 `ChatMessage.metadata` 看似少一张表，但聊天历史会被前端整段保存重写，且消息是用户可见会话事实，不是模型调用账本。独立表能表达一个用户请求中多次模型调用，也能覆盖 finalizer / summary 等非消息形态调用。

### 2. 在模型调用边界后写 usage event，而不是在后台读取时反推

记录点应放在模型调用返回并完成 provider usage 归一化之后：

- `LlmPlanner` 或其上层聊天 orchestration 读取每次 planner call 的 `ModelTokenUsage`，按 planner call 写入 usage event。
- 如果 provider 返回了 usage，但后续 JSON parse、AgentAction validation 或 terminal validation 失败，token 已经消耗，仍记录为一次模型调用。
- 如果请求超时、网络失败或 provider 没有返回 usage，可以记录 `status = "failed"` 或 `usage_unavailable`，token 字段为空或 0；聚合时必须能区分“0 token”和“没有 usage”。
- terminal failure finalizer 等独立模型调用也通过同一 service 写入，只使用不同 `source`。

取舍：把写入逻辑放在 adapter 内可以覆盖更底层，但 adapter 不应该知道业务 `userId`、`conversationId`、`messageId` 和 admin 账本语义。把写入放在 orchestration / recording service 层，可以保留 model adapter 的 provider 归一化职责，同时拿到业务上下文。

### 3. Trace 只作为诊断消费者，不作为生产统计来源

Trace 仍可展示 token usage 摘要，用于开发排障和单次请求复盘。但后台页面必须只读生产 usage ledger。生产关闭 Trace 时，账本写入和后台汇总仍然工作。

取舍：复用 Trace 可以减少实现量，但会把生产统计绑定到一个可关闭、可截断、内存态的诊断系统，和后台审计需求冲突。

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
- `getAdminConversationDetail(conversationId)`：聊天消息和 run / loop / model call 明细。

UI 只消费这些投影对象，不直接拼接 Prisma include shape。这样未来 usage ledger 字段或聊天持久化结构调整时，只改 admin service。

取舍：直接在 Server Component 里写 Prisma 查询更快，但会让后台 UI 认识 DB shape、usage 账本 shape 和聊天消息 shape，后续扩展第二个后台视图时会重复耦合。

### 6. 第一版后台保持简易只读，不做高风险写操作

页面可以粗糙，但必须清楚展示：

- 全站输入 token、输出 token、总 token。
- 每个用户输入 / 输出 / 总 token。
- 每个会话输入 / 输出 / 总 token。
- 每个 run 和 loop 的输入 / 输出 / 总 token。
- 每次 model call 的 source、loop、plannerCallIndex、model、status 和 token。
- 用户聊天消息正文和时间。

不提供删除用户、删除聊天、编辑数据、封禁用户或导出敏感内容。

## Risks / Trade-offs

- [Risk] usage ledger 写入失败导致后台少记 token。→ Mitigation：写入失败不得影响聊天响应，但必须记录服务端错误；测试覆盖失败隔离，并在后台提供“无 usage / usage unavailable”的可见状态。
- [Risk] 重试、异常路径或 stream 中断导致重复记账。→ Mitigation：为每次模型调用生成稳定 `modelCallId` 或唯一键，写入使用幂等 upsert / create with conflict handling。
- [Risk] provider 不返回 usage 或字段名不同。→ Mitigation：复用现有 `normalizeModelTokenUsage` 归一化；无法获取时记录 `usage_unavailable`，聚合时不把未知当成真实 0。
- [Risk] 后台泄露所有用户聊天内容。→ Mitigation：所有入口使用 admin guard；页面只读；不暴露给普通路由导航；错误响应区分 401 / 403。
- [Risk] 后台聚合查询影响生产数据库性能。→ Mitigation：为 `userId`、`conversationId`、`runId`、`createdAt` 建索引；第一版限制分页和时间范围默认值，避免一次性扫全量消息。
- [Risk] 把 Trace 和 ledger 写入混在一起导致职责反转。→ Mitigation：usage recording service 是账本写入入口；Trace 只能读取或接收摘要用于诊断展示。

## Migration Plan

1. 新增 Prisma model、迁移和索引；历史请求没有账本记录，后台明确显示为空或无 usage。
2. 新增 admin config 和 admin guard，并补鉴权测试。
3. 新增 usage recording service，先覆盖 Agent planner 每次模型调用，再覆盖 terminal failure finalizer。
4. 新增 admin 查询 service，按 overview、user list、user detail、conversation detail 输出稳定投影。
5. 新增 `/admin` 只读页面和必要的子页面 / 查询参数，展示用户、聊天内容和 token 汇总 / 明细。
6. 运行 Prisma、TypeScript、相关单元测试、admin 页面测试和 OpenSpec 校验。
7. 部署时配置管理员 userId；若未配置管理员，后台入口必须拒绝访问而不是默认开放。

## Open Questions

- 第一版是否需要后台时间范围筛选默认为最近 7 天，还是默认全量汇总。建议实现时采用默认最近 7 天 + 可选全量，降低生产查询压力。
- 第一版是否需要显示金额成本。当前 change 不包含金额换算；如果后续要做，需要新增 model pricing 配置和独立成本计算合同。
