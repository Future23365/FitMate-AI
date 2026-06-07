## Why

当前后台用户列表只能按创建时间倒序展示，管理员无法按最近聊天活动或 token 消耗快速定位需要排查的用户。新增最后回复时间和服务端排序能力后，后台可以按运营排查常用维度稳定查看用户。

## What Changes

- 用户列表新增 `最后回复时间` 列，展示该用户最近一次聊天活动时间；无会话活动时显示空状态。
- 用户列表支持按 `createdAt`、`lastReplyAt` 和 `totalTokens` 排序。
- 每个排序字段支持 `asc` 和 `desc` 两个方向。
- 排序必须在后台查询 service 中完成，不能只对当前页面已返回的用户数组做前端排序。
- 后台页面通过 query 参数保留当前排序状态，并在列头提供可点击排序入口。

## Capabilities

### New Capabilities

- `admin-user-list-sorting`: 后台用户列表的最后回复时间展示和服务端排序能力。

### Modified Capabilities

无。

## Impact

- 影响 `lib/server/admin/admin-ai-usage-service.ts` 的用户列表投影、排序输入和聚合逻辑。
- 影响 `app/admin/page.tsx` 的用户列表列展示、排序链接和 query 参数读取。
- 影响 `app/api/admin/ai-usage/route.ts` 的后台 JSON API 查询参数。
- 需要更新 `tests/admin-ai-usage-service.test.ts` 和 `tests/admin-ai-usage-route.test.ts`。
