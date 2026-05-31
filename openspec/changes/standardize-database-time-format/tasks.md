## 1. 时间字段盘点

- [ ] 1.1 盘点 `prisma/schema.prisma` 中所有 `DateTime` 字段，标注具体时间点字段、日期型业务字段和无需迁移的临时字段。
- [ ] 1.2 搜索 `prisma/migrations`、`prisma/seed*`、`tests`、`manual-tests`、`lib` 和 `app` 中的无时区时间写法，整理需要替换的字段和 fixture 清单。
- [ ] 1.3 明确本地开发数据库数据处理策略：可 reset 的开发数据直接重建，需要保留的数据必须记录迁移解释时区和样例验证方式。

## 2. 数据库 schema 与迁移

- [ ] 2.1 将所有代表具体时间点的 Prisma `DateTime` 字段显式映射为 `@db.Timestamptz(3)` 或等价 UTC-aware PostgreSQL 类型。
- [ ] 2.2 生成或调整 Prisma migration，确保新增或调整后的时间列使用 `TIMESTAMPTZ(3)`，不再生成无时区 `TIMESTAMP(3)`。
- [ ] 2.3 对 `scheduledFor` 这类日期型流程使用 UTC 零点持久化策略，并在迁移或服务层说明其日期派生规则。
- [ ] 2.4 运行 schema/migration diff 或等价检查，确认数据库时间字段和 migration SQL 满足 UTC-aware 存储要求。

## 3. 服务端时间边界

- [ ] 3.1 收敛数据库时间序列化 helper 或 mapper 约定，确保服务层 DTO、API 响应和 trace payload 中的数据库时间统一输出 ISO 8601 UTC 字符串。
- [ ] 3.2 更新聊天历史、训练持久化、ConversationArtifact、ArtifactIndex、用户记忆、用户反馈、认证身份等读取路径中的时间字段映射。
- [ ] 3.3 更新共享 Zod schema 和 API 输入校验，拒绝无 offset 的具体时间点字符串，并保留必要的 UTC `Z` 校验。
- [ ] 3.4 确认排序、过期判断、训练时长计算和日历日期派生逻辑都基于 UTC 时间点，不依赖运行环境本地时区解析。

## 4. Fixture 与测试

- [ ] 4.1 将测试 fixture、mock 数据和硬编码样例中的 `YYYY-MM-DD HH:mm`、无 offset `YYYY-MM-DDTHH:mm:ss`、`new Date("...")` 本地时间写法替换为 ISO 8601 UTC。
- [ ] 4.2 为聊天历史服务增加或更新测试，断言 `createdAt`、`updatedAt` 和消息时间输出为 ISO 8601 UTC。
- [ ] 4.3 为训练持久化服务增加或更新测试，覆盖 `scheduledFor`、`startedAt`、`endedAt` 和 `updatedAt` 的 UTC 序列化与日期派生。
- [ ] 4.4 增加 schema/migration 或静态扫描测试，防止未来具体时间点字段重新引入无时区 `TIMESTAMP(3)` 或无 offset fixture。

## 5. 验证与文档

- [ ] 5.1 运行 `npm test` 或与时间持久化相关的自动化测试，并记录失败排查结果。
- [ ] 5.2 运行 `npm run typecheck`，确认时间 schema、服务 DTO 和共享类型一致。
- [ ] 5.3 按需运行 `npx prisma migrate status`、`npx prisma migrate diff` 或等价 Prisma 验证命令，确认本地 schema 与迁移状态可解释。
- [ ] 5.4 如果本次实现改变数据库表结构、迁移策略或启动协作方式，同步更新 README 或相关文档。
- [ ] 5.5 如果实现阶段涉及核心持久化链路调整，在 `docs/方案变更历史` 新增变更记录，并在 `docs/项目演变历程.md` 追加简要记录。
