## Context

项目当前使用 PostgreSQL + Prisma 作为事实数据来源，`prisma/schema.prisma` 中的 `DateTime` 字段覆盖用户、身份、训练编排、训练日历、训练结果、聊天历史、ConversationArtifact、ArtifactIndex、UserMemory 和 UserExerciseFeedback 等核心表。现有 migration SQL 使用 `TIMESTAMP(3)`，测试与 fixture 中也存在 `2026-05-25 10:30`、`new Date("2026-05-25T10:30:00")` 这类不带时区的写法。

这些时间值在 JavaScript、PostgreSQL、Prisma、浏览器和测试运行环境之间传递时，可能被解释为本地时区或数据库 session 时区。统一为 ISO 8601 UTC 和 `timestamptz` 语义，是后续排查聊天历史顺序、训练日历归属、训练执行时长、用户记忆过期和 trace 时间线的基础。

## Goals / Non-Goals

**Goals:**

- 将数据库中所有代表具体时间点的字段统一到 UTC-aware 存储语义，优先使用 PostgreSQL `timestamptz`。
- 将服务端对外输出的数据库时间统一序列化为 ISO 8601 UTC 字符串，例如 `2026-05-31T05:07:20.006Z`。
- 将服务端输入校验、共享 schema、测试 fixture 和硬编码时间样例统一到无歧义格式。
- 为迁移、验证和回归测试建立明确任务，避免后续新增字段再次引入无时区时间。

**Non-Goals:**

- 不改变训练日历、聊天历史、用户记忆、身份认证或 AI 编排的业务含义。
- 不引入用户时区偏好、按用户本地时区展示日历、跨时区训练计划重算等产品能力。
- 不把日期型业务概念改成独立 date-only 类型；如果字段仍用 `DateTime` 表达，必须按 UTC 时间点存储。
- 不批量清洗历史 JSON payload、metadata、trace、memory 中可能存在的旧时间字符串，除非盘点发现有明确业务依赖；本 change 只要求新写入的 JSON 具体时间点使用 ISO 8601 UTC。
- 不改写已经存在的历史 migration 文件；历史 migration 作为项目演进记录保留。
- 不迁移与数据库无关的纯 UI 倒计时、浏览器定时器或临时内存状态。

## Decisions

### Decision: 数据库存储统一使用 `timestamptz`

Prisma `DateTime` 字段应显式映射为 PostgreSQL `@db.Timestamptz(3)`，migration SQL 应生成或调整为 `TIMESTAMPTZ(3)`。相比继续使用 `TIMESTAMP(3)` 并靠应用层约定 UTC，`timestamptz` 能让数据库层也保留“这是一个具体时间点”的语义，减少 session timezone、手写 SQL 和调试查询带来的歧义。

替代方案是只在 API 输出层调用 `toISOString()`。这个方案改动较小，但无法解决数据库列类型本身无时区的问题，也无法防止后续手写 SQL 或迁移继续写入歧义时间。

### Decision: 既有 `TIMESTAMP(3)` 值按 UTC+0 解释并使用 forward migration

当前旧时间数据已经按 UTC+0 语义写入，因此迁移时必须把旧 `TIMESTAMP(3)` 值解释为 UTC 时间点，而不是按数据库 session timezone 或本机时区平移。实现应新增 forward migration，将既有列转换为 `TIMESTAMPTZ(3)`，转换语义使用 `AT TIME ZONE 'UTC'` 或等价 SQL 明确表达：

```sql
ALTER TABLE "ChatMessage"
ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3)
USING "createdAt" AT TIME ZONE 'UTC';
```

历史 migration 文件不批量改写。验证应关注最终 `prisma/schema.prisma`、本 change 新增 migration、以及 `npx prisma migrate diff` 的结果不再为具体时间点生成新的无时区列；静态扫描可以允许旧 migration 文件中保留历史 `TIMESTAMP(3)`。

替代方案是改写所有旧 migration，使从空库重放时直接创建 `TIMESTAMPTZ(3)`。这个方案会让 migration history 与已有开发库状态更容易不一致，也会掩盖本次 change 的真实迁移边界。

### Decision: 服务端边界统一序列化为 ISO 8601 UTC

所有从数据库 `DateTime` 读出后进入 API 响应、服务层 DTO、AI trace payload、测试断言或客户端状态的字段，必须通过集中 helper 或 `Date.prototype.toISOString()` 输出 UTC 字符串。实现应收敛共享工具，例如 `toUtcISOString(date: Date): string`、`utcDateTimeStringSchema` 和 `parseUtcDateTimeInput`，避免各模块重复编写不一致的时间校验。

替代方案是允许 `Date` 对象直接穿过服务边界，由调用方自行格式化。这个方案会让同一字段在不同模块出现不同格式，不利于测试和跨模块协作。

### Decision: 输入侧拒绝无时区日期时间

API、服务函数和测试 fixture 中凡是表达具体时间点的字符串，必须使用 ISO 8601 UTC；解析逻辑不得默默接受 `YYYY-MM-DD HH:mm`、`YYYY-MM-DDTHH:mm:ss` 这类没有 offset 的格式。外部输入优先要求 `Z` 结尾；如果接受 `+00:00` 这类等价 UTC offset，服务端必须立即归一化为 `.toISOString()` 产出的 `Z` 格式。非 UTC offset（例如 `+08:00`）不在本 change 的输入能力内，必须拒绝，除非未来单独引入用户时区能力。

对于训练日历这类以日期为主的流程，如果内部仍持久化为 `DateTime`，应使用 UTC 零点，例如 `2026-05-31T00:00:00.000Z`，并明确哪些 UI 层 date key 是派生展示值。

替代方案是继续在服务端用 `new Date(value)` 容忍多种输入。这个方案会把歧义留给运行环境，不适合作为数据库事实边界。

### Decision: 持久化 JSON 只约束新写入格式，不批量清洗历史数据

`ConversationArtifact.payload`、`ChatMessage.metadata`、`UserMemory.value`、`WorkoutSessionResult.feedback`、AI trace payload 等 JSON 结构中，如果新写入具体时间点字符串，也必须使用 ISO 8601 UTC `Z` 格式。历史 JSON 不做批量迁移，除非字段盘点发现某个 JSON 时间会被服务端作为排序、过期、日期归属或训练执行事实继续读取。

替代方案是对所有 JSON 历史数据做递归扫描与重写。这个方案范围过大，容易误改自由文本或模型输出内容，不适合作为数据库列类型规范化的第一步。

### Decision: 迁移验证覆盖 schema、SQL、fixture 和服务序列化

实现时需要同时检查 `prisma/schema.prisma`、本 change 新增 migration SQL、seed/fixture、服务层 mapper、共享 schema 和相关测试。验证不应只依赖类型检查，还要增加能捕获无时区字符串、新增无映射 `DateTime` 和新 migration `TIMESTAMP(3)` 回归的自动化检查或测试断言。扫描规则应允许纯 date key（例如 `2026-05-25`）继续用于日期标签，但不得把它当具体时间点写入数据库。

替代方案是人工 review。人工 review 容易漏掉测试 fixture、旧 migration 或局部 helper，后续新增字段也缺少防线。

## Field Inventory

| Prisma model | 字段 | 语义分类 | 目标存储/输出策略 |
| --- | --- | --- | --- |
| `User` | `deletedAt`, `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；服务端输出 ISO UTC `Z` |
| `UserIdentity` | `emailVerifiedAt`, `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；服务端输出 ISO UTC `Z` |
| `UserProfile` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；服务端输出 ISO UTC `Z` |
| `Exercise` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；服务端输出 ISO UTC `Z` |
| `UserMemory` | `expiresAt`, `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；过期判断基于 UTC 时间点 |
| `UserExerciseFeedback` | `expiresAt`, `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；过期判断基于 UTC 时间点 |
| `WorkoutRoutine` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；服务端输出 ISO UTC `Z` |
| `WorkoutRoutineItem` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；服务端输出 ISO UTC `Z` |
| `WorkoutSchedule` | `scheduledFor` | 日期型业务字段，以 UTC 零点承载 | `@db.Timestamptz(3)`；写入 `YYYY-MM-DDT00:00:00.000Z`，日期 key 从 UTC 值派生 |
| `WorkoutSchedule` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；服务端输出 ISO UTC `Z` |
| `WorkoutSessionResult` | `startedAt`, `endedAt`, `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；训练时长基于 UTC 时间点差值 |
| `ChatSession` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；历史排序 fallback 基于 UTC 时间点 |
| `ChatMessage` | `createdAt` | 具体时间点 | `@db.Timestamptz(3)`；消息排序与展示时间使用 ISO UTC `Z` |
| `ConversationArtifact` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；索引与引用排序使用 UTC 时间点 |
| `ArtifactIndex` | `createdAt`, `updatedAt` | 具体时间点 | `@db.Timestamptz(3)`；检索排序和 DTO 输出使用 ISO UTC `Z` |

## Risks / Trade-offs

- [Risk] PostgreSQL 从 `TIMESTAMP(3)` 迁移到 `TIMESTAMPTZ(3)` 时，如果转换语义没有写清楚，可能被数据库 session timezone 影响。→ Mitigation: 既有旧时间按 UTC+0 解释，forward migration 使用 `AT TIME ZONE 'UTC'` 或等价 SQL，并用样例验证转换前后同一事实时间点不漂移。
- [Risk] `scheduledFor` 既承担日历日期又是 `DateTime` 字段，统一 UTC 后可能暴露“日期”和“时间点”的概念差异。→ Mitigation: 持久化层使用 UTC 零点，API 同时保持业务日期派生逻辑可预测，并用测试覆盖跨时区解析不漂移。
- [Risk] 旧测试或 fixture 中的不带时区时间会被新校验拒绝，短期修改面较大。→ Mitigation: 先集中替换 fixture 和 helper，再收紧 schema，避免零散修补。
- [Risk] 手写 migration 或未来新增 DateTime 字段可能再次生成 `TIMESTAMP(3)`。→ Mitigation: 在任务中加入 schema/migration 扫描测试或文档化检查命令，并只允许历史 migration 保留旧类型。
- [Risk] JSON payload 中的时间可能被误当作自由文本或模型内容重写。→ Mitigation: 仅约束新写入的结构化 JSON 具体时间点；历史 JSON 需要业务依赖证明后再定向迁移。

## Migration Plan

1. 按 Field Inventory 更新 `prisma/schema.prisma`，为所有目标 `DateTime` 字段补充 `@db.Timestamptz(3)`。
2. 新增 forward migration，不改写旧 migration；每个既有 `TIMESTAMP(3)` 列使用 `AT TIME ZONE 'UTC'` 或等价 SQL 迁移到 `TIMESTAMPTZ(3)`。
3. 统一服务层 mapper、共享 schema 和时间 helper，把数据库时间输出收敛为 ISO 8601 UTC `Z` 字符串，并把允许的 `+00:00` 输入归一化为 `Z`。
4. 替换测试 fixture 和硬编码样例中的无时区时间；新增扫描测试时允许纯 date key，但禁止无 offset 具体时间点。
5. 运行 Prisma schema/migration diff、自动化测试和类型检查，确认最终 schema、本 change migration 和服务 DTO 均满足时间格式契约。

## Resolved Questions

- 既有旧时间按 UTC+0 解释，迁移时不按本地时区或数据库 session timezone 平移。
- 历史 migration 文件保留不改写；本 change 使用新增 forward migration 表达真实迁移过程。
- 历史 JSON 不批量清洗；新写入的结构化 JSON 具体时间点必须使用 ISO 8601 UTC `Z`。
