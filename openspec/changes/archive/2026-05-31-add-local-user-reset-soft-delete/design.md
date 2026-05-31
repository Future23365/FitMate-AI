## Context

当前本地匿名用户链路使用 `fitmate_local_anonymous` HttpOnly cookie 绑定 `UserIdentity(provider = "anonymous")`，`POST /api/auth/local-anonymous` 负责创建或恢复匿名用户，`DELETE /api/auth/local-anonymous` 只清除 cookie。设置页已经提供“重置本地用户”入口，但入口缺少二次确认，而且页面文案与服务端行为不一致：文案表达“删除服务器上旧匿名用户的数据”，实际实现没有对旧用户做任何服务端状态变更。

这次改动同时影响 UI、auth provider、匿名会话 API、Prisma 数据模型和用户私有数据隔离。核心约束是不能物理删除旧用户及关联训练/聊天数据，避免破坏审计、调试和未来恢复能力；但旧 cookie 也不能继续恢复到已重置的匿名身份。

## Goals / Non-Goals

**Goals:**
- 修复设置页“本地用户”区域重复图标，使重置入口视觉只保留一个明确图标。
- 用 shadcn/ui `Dialog` 为“重置本地用户”增加二次确认，确认前不触发重置 API。
- 将匿名用户重置定义为软删除：旧用户保留在数据库中，但被标记为不可恢复、不可作为当前用户继续访问。
- 保证软删除后的旧 cookie、旧匿名 identity 和旧用户私有数据不会被新的本地匿名用户混用。
- 为服务端 auth、API route、客户端状态和 UI 行为增加测试，并同步记录数据模型和方案演进文档。

**Non-Goals:**
- 不实现正式账号体系、账号合并、恢复软删除用户或用户数据导出。
- 不物理删除聊天记录、训练计划、训练结果、artifact、memory 等关联业务表。
- 不改变除本地匿名用户重置以外的 OAuth、正式登录或未来账号迁移设计。

## Decisions

1. 使用用户级软删除字段表达重置后的匿名用户状态。

   在 `User` 上增加 `deletedAt DateTime?` 或等价字段，并在匿名身份恢复和当前用户解析时过滤 `deletedAt != null` 的用户。相比只给 `UserIdentity` 增加状态，用户级字段更容易统一约束所有私有数据查询、后续审计和未来账号生命周期；相比物理删除，软删除不会级联破坏历史训练、聊天和 trace 排查能力。

2. `DELETE /api/auth/local-anonymous` 必须先解析当前 cookie，再执行软删除和清 cookie。

   如果请求存在有效且未软删除的匿名 cookie，服务端在事务内标记当前 `User.deletedAt`，随后返回清 cookie 响应。如果缺少 cookie 或 cookie 已无效，接口仍应清 cookie 并返回稳定结果，避免用户卡在无法重置的状态；但不能创建新用户，也不能根据客户端输入指定要删除的 userId。

3. 已软删除用户在恢复链路中视为未认证。

   `restoreLocalAnonymousSession()` 和 `requireCurrentUser()` 查询匿名 identity 时必须过滤软删除用户。旧 cookie 命中软删除用户时返回 `401 unauthenticated`，客户端统一请求层按现有 auth-required 事件打开本地匿名登录 Dialog，由用户创建新的匿名身份。

4. 设置页确认弹窗由页面组件管理，但实际重置继续走 `useLocalAuth().resetLocalUser()`。

   页面只负责打开确认 Dialog、展示风险文案、禁用重复提交和调用 provider 暴露的重置函数。`LocalAuthProvider` 继续作为 auth 状态唯一协调点，避免设置页绕过运行时状态切换或重复实现 cookie 清理逻辑。

5. 重置后的历史数据保留但不再出现在新用户上下文中。

   旧用户关联数据不做物理删除；新匿名用户通过新的 `userId` 写入和读取数据。现有所有私有数据查询必须依赖当前 `userId` 隔离，因此只要 auth helper 不再返回软删除用户，旧数据就不会被新身份读取。

## Risks / Trade-offs

- [Risk] 增加 `User.deletedAt` 会影响所有用户查询的语义，遗漏过滤可能让软删除用户继续访问私有 API。→ Mitigation：把过滤集中在 `findAnonymousUserBySubject()` / `requireCurrentUser()` 等 auth helper，并补服务端测试覆盖旧 cookie 恢复、私有 API 当前用户解析和缺失 cookie 重置。
- [Risk] 软删除保留旧数据，用户可能误以为数据库已物理清空。→ Mitigation：确认弹窗和文档使用“软删除/不再可用/不会恢复到当前浏览器”这类准确表达，不承诺物理删除。
- [Risk] 如果 `DELETE` 请求在软删除后清 cookie 失败，浏览器可能暂时保留旧 cookie。→ Mitigation：恢复链路也过滤软删除用户，即使旧 cookie 仍在，后续请求也只会得到未认证并触发重新登录。
- [Risk] 设置页当前已有未提交改动，实施时可能与本 change 冲突。→ Mitigation：实现前先复核 `app/settings/page.tsx` 的最新 diff，只在本地用户区域做范围可控的合并。
