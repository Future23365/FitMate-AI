## Why

当前数据库时间字段在 schema、migration、服务端序列化和测试 fixture 中存在无时区或本地时间写法，例如 PostgreSQL `TIMESTAMP(3)`、`2026-05-25 10:30`、`new Date("2026-05-25T10:30:00")`。这些值在跨时区解析、排序、日历归属、训练执行结果和聊天历史展示中会产生歧义，必须统一为无歧义的 ISO 8601 UTC 表达，例如 `2026-05-31T05:07:20.006Z`。

## What Changes

- 新增数据库时间格式规范，要求数据库时间字段使用 PostgreSQL `timestamptz` 语义，并在 Prisma schema、migration 和服务端读写边界中保持 UTC 语义。
- 采用 forward migration，不改写历史 migration；既有 `TIMESTAMP(3)` 值按 UTC+0 解释后迁移到 `TIMESTAMPTZ(3)`。
- 统一服务端 API、领域服务、AI trace、聊天历史、训练计划、训练执行结果和用户记忆等对外输出的时间字符串为 ISO 8601 UTC 格式。
- 收紧输入校验、JSON payload 写入约定和测试 fixture，禁止继续引入无时区日期时间字符串、本地时间构造和不明确的时间格式。
- 增加迁移与验证任务，确保现有 `DateTime` 字段、迁移 SQL、手写种子数据和自动化测试都能覆盖时间规范。
- 不改变业务含义：训练日期、聊天消息顺序、trace 时间和过期时间仍表达原有事实，只消除存储与传输格式歧义。

## Capabilities

### New Capabilities

- `database-time-format`: 定义数据库时间字段、服务端时间序列化、API 时间契约、fixture 和验证流程的统一 UTC 时间格式要求。

### Modified Capabilities

- 无。

## Impact

- 影响 `prisma/schema.prisma` 中所有 `DateTime` 字段及相关 migration SQL。
- 影响 `lib/server/*` 中从数据库读取时间并序列化给 API、前端、AI trace 或测试的服务代码。
- 影响 `lib/shared/*` 中接收或校验时间字符串的 Zod schema、共享类型和时间 helper。
- 影响新写入的持久化 JSON payload、metadata、trace、memory 中表达具体时间点的字符串格式；历史 JSON 不做批量清洗，除非实现盘点发现明确业务依赖。
- 影响 `tests/*`、`manual-tests/*` 和 fixture 中硬编码的时间字符串或 `Date` 构造方式。
- 可能需要生成新的 Prisma migration，并通过 `npm test`、`npm run typecheck`、`npx prisma migrate diff` 或等价命令验证 schema 与迁移结果。
