## Why

设置页“本地用户”区域当前存在重复图标和重置操作风险提示不足的问题，同时“重置本地用户”的文案已经表达了删除旧匿名用户数据的语义，但现有服务端实现只清理当前浏览器 cookie。需要把重置入口的可见行为、二次确认和服务端软删除语义统一到一个可验证的用户数据生命周期流程中。

## What Changes

- 修复设置页“本地用户”区域左侧重复图标，只保留一个语义清晰的入口图标。
- 将“重置本地用户”改为需要二次确认的危险操作，确认弹窗必须明确说明旧本地用户数据将被软删除且当前浏览器会进入新的匿名登录流程。
- 扩展 `DELETE /api/auth/local-anonymous` 的服务端语义：清除当前浏览器 auth cookie 的同时，将当前匿名用户标记为软删除，而不是物理删除用户及其关联业务数据。
- 更新本地匿名用户恢复逻辑：已软删除的匿名用户不能再通过旧 cookie 恢复为当前用户，必须按未认证处理并引导创建新的本地匿名用户。
- 增加相关测试和文档，确保重置流程、软删除过滤、权限隔离和 UI 确认行为可回归验证。

## Capabilities

### New Capabilities
- `local-user-reset-soft-delete`: 约束设置页本地用户重置入口、危险操作确认、匿名用户软删除和软删除后的恢复/隔离行为。

### Modified Capabilities
- 无

## Impact

- `app/settings/page.tsx`：本地用户区域布局、重复图标修复、重置确认弹窗和 pending 状态。
- `components/auth/local-auth-provider.tsx`、`lib/client/auth/*`：重置调用后的运行时状态切换和错误处理。
- `app/api/auth/local-anonymous/route.ts`、`lib/server/auth/local-anonymous-auth.ts`：重置接口、匿名用户恢复和软删除判断。
- `prisma/schema.prisma` 及迁移：为匿名用户软删除增加持久化字段或等价状态模型。
- 相关服务端测试、前端组件测试、文档和方案变更记录。
