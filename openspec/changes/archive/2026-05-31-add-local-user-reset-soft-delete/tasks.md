## 1. 数据模型与服务端软删除

- [x] 1.1 检查当前 `User`、`UserIdentity` 和匿名 auth 查询路径，确认软删除字段落点和迁移影响。
- [x] 1.2 在 Prisma Schema 中为用户软删除增加持久化字段或等价状态模型，并生成对应迁移。
- [x] 1.3 更新匿名用户查询 helper，确保 `restoreLocalAnonymousSession()` 和 `requireCurrentUser()` 不返回已软删除用户。
- [x] 1.4 更新 `DELETE /api/auth/local-anonymous`，在有效 cookie 场景下软删除当前匿名用户并清除 cookie。
- [x] 1.5 处理缺失、无效、过期或已软删除 cookie 的重置幂等行为，确保不会创建新用户或删除其他用户。

## 2. 设置页确认交互

- [x] 2.1 重构 `app/settings/page.tsx` 的“本地用户”区域，移除重复图标并保持桌面端响应式布局稳定。
- [x] 2.2 使用项目已有 shadcn/ui `Dialog` 为“重置本地用户”增加二次确认弹窗。
- [x] 2.3 在确认弹窗中明确说明软删除语义、当前浏览器退出旧用户和无法用旧 cookie 恢复。
- [x] 2.4 将确认操作接入 `useLocalAuth().resetLocalUser()`，并处理 pending、取消、成功和失败状态。

## 3. 客户端 auth 状态

- [x] 3.1 复核 `LocalAuthProvider` 的 reset 状态切换，确保重置成功后清空运行时用户摘要。
- [x] 3.2 确保软删除用户旧 cookie 收到 `401 unauthenticated` 时，统一请求层触发本地匿名登录需求。
- [x] 3.3 补齐客户端错误处理，避免重置失败后按钮或确认弹窗停留在不可恢复状态。

## 4. 测试与验证

- [x] 4.1 补充服务端测试：有效 cookie 重置会软删除用户并清 cookie。
- [x] 4.2 补充服务端测试：软删除用户不能通过旧 cookie 恢复，私有 API 当前用户解析按未认证处理。
- [x] 4.3 补充服务端测试：缺失或无效 cookie 重置不会创建新用户或影响其他用户。
- [x] 4.4 补充设置页或组件级测试：点击重置先打开确认弹窗，取消不调用接口，确认才调用重置。
- [x] 4.5 运行相关测试，并按改动范围运行 `npm run typecheck` 和 `npm test`。

## 5. 文档与收尾

- [x] 5.1 更新数据库或架构文档，说明本地匿名用户重置是软删除而不是物理删除。
- [x] 5.2 在 `docs/方案变更历史/` 新增本地用户重置软删除方案记录。
- [x] 5.3 如果实现改变核心 auth 恢复或用户生命周期，在 `docs/项目演变历程.md` 末尾追加简要记录。
- [x] 5.4 运行 `openspec validate add-local-user-reset-soft-delete --strict` 并修复发现的问题。
