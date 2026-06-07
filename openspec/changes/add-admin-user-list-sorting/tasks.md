## 1. 后台 service 合同

- [x] 1.1 为 admin 用户列表定义排序字段和排序方向类型，默认值为 `createdAt desc`。
- [x] 1.2 在用户列表投影中新增 `lastReplyAt`，由用户会话统计计算最近聊天活动时间。
- [x] 1.3 在 `listAdminUsers()` 中按 `createdAt`、`lastReplyAt`、`totalTokens` 和方向执行服务端排序。

## 2. 页面和 API 接入

- [x] 2.1 在 `/admin` 页面读取排序 query 参数，并将排序状态传给 `listAdminUsers()`。
- [x] 2.2 在用户列表新增 `最后回复时间` 列，并为 `创建时间`、`最后回复时间`、`Token` 列提供排序链接和当前排序状态。
- [x] 2.3 在 `/api/admin/ai-usage` 支持相同排序 query 参数，并复用同一排序默认规则。

## 3. 验证

- [x] 3.1 更新 admin usage service 测试，覆盖 `lastReplyAt` 投影和三类排序。
- [x] 3.2 更新 admin usage route 测试，覆盖排序参数传递和非法参数回退。
- [x] 3.3 运行 `openspec validate add-admin-user-list-sorting --strict`。
- [x] 3.4 运行 `npm run typecheck`、当前 Admin 页面 lint 和相关后台测试。
