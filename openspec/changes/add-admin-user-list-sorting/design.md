## Context

后台用户列表当前由 `listAdminUsers()` 输出稳定投影，并在页面中直接展示。列表默认按 `User.createdAt desc` 查询，UI 没有排序状态，也没有展示用户最近聊天活动时间。

项目全局 `body` 使用内部滚动容器模式，后台页面已经拥有自己的滚动容器；本次只调整后台用户列表的数据合同和列头交互，不改全局布局、不改 Prisma schema、不新增写操作。

## Goals / Non-Goals

**Goals:**

- 在 admin service 投影中新增 `lastReplyAt`，表示用户最近一次聊天活动时间。
- 支持按 `createdAt`、`lastReplyAt`、`totalTokens` 做服务端排序。
- 支持 `asc` 和 `desc` 两个排序方向。
- 页面和 JSON API 都使用同一套排序参数解析和 service 输入合同。
- 通过测试覆盖排序投影、API 参数传递和页面不会直接依赖 Prisma shape。

**Non-Goals:**

- 不新增数据库字段或迁移。
- 不实现分页 UI、搜索、导出或批量操作。
- 不把 `最后回复时间` 限定为 assistant-only 消息时间；当前口径为该用户最近会话活动时间，来源于 `ChatSession.updatedAt` 或等价最新消息事实。
- 不在前端对当前页数据做最终排序替代服务端排序。

## Decisions

1. **排序合同集中在 admin service。**

   `listAdminUsers(input)` 接收 `sortBy` 和 `sortDirection`，由 service 负责排序输入归一化、候选用户读取、会话统计、token 汇总和最终投影排序。UI 和 Route 只传入稳定 enum，不认识 Prisma aggregate shape。

2. **`lastReplyAt` 使用用户会话统计投影。**

   现有 `ChatSession.updatedAt` 已被聊天历史保存链路用作会话更新时间，后台用户列表可以用每个用户最近的 `updatedAt` 作为最近活动时间。没有会话时返回 `null`，排序时 `null` 在 `desc` 下排最后，在 `asc` 下也排最后，避免“无活动用户”顶到最前。

3. **Prisma reader 先按排序字段选择候选用户。**

   `createdAt` 使用 `User.createdAt` 直接排序；`lastReplyAt` 使用 `ChatSession.groupBy(userId)._max.updatedAt`；`totalTokens` 使用 `AiTokenUsageSummary.groupBy(userId)._sum.totalTokens`。service 仍会在投影后做一次稳定排序，保证测试 reader 和 Prisma reader 输出都符合 UI 合同。

4. **token 排序按投影后的 `totalTokens`。**

   usage 可能存在未知 token。排序时真实 `totalTokens` 使用数值比较；`null` 排最后，避免未知 usage 被当作 0 或最大值。展示仍沿用现有 `TokenInline` 的未知状态。

5. **页面排序用链接维护 query 参数。**

   `/admin?sortBy=...&sortDirection=...` 驱动服务端组件重新渲染。列头点击当前字段时切换方向，点击新字段时默认 `desc`，符合后台排查常用的大到小起点。

## Risks / Trade-offs

- [Risk] `totalTokens` 排序依赖 usage summary 中已知的 `totalTokens`，全未知 usage 用户只能排在已知 token 用户之后。
  → Mitigation: 按合同将未知 token 总量视为 `null` 并固定排最后，展示仍保留“未知”状态，避免把未知值伪装为 0。

- [Risk] `lastReplyAt` 依赖 `ChatSession.updatedAt` 是否准确反映最新聊天活动。
  → Mitigation: 现有聊天历史规范已经把会话更新时间作为列表排序事实；没有活动时明确返回 `null`。

- [Risk] API query 参数非法时可能造成不可预测排序。
  → Mitigation: Route 和页面都使用受控 parser，非法值回退到 `createdAt desc`。
