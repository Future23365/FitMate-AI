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
- 不迁移与数据库无关的纯 UI 倒计时、浏览器定时器或临时内存状态。

## Decisions

### Decision: 数据库存储统一使用 `timestamptz`

Prisma `DateTime` 字段应显式映射为 PostgreSQL `@db.Timestamptz(3)`，migration SQL 应生成或调整为 `TIMESTAMPTZ(3)`。相比继续使用 `TIMESTAMP(3)` 并靠应用层约定 UTC，`timestamptz` 能让数据库层也保留“这是一个具体时间点”的语义，减少 session timezone、手写 SQL 和调试查询带来的歧义。

替代方案是只在 API 输出层调用 `toISOString()`。这个方案改动较小，但无法解决数据库列类型本身无时区的问题，也无法防止后续手写 SQL 或迁移继续写入歧义时间。

### Decision: 服务端边界统一序列化为 ISO 8601 UTC

所有从数据库 `DateTime` 读出后进入 API 响应、服务层 DTO、AI trace payload、测试断言或客户端状态的字段，必须通过 `Date.prototype.toISOString()` 或集中 helper 输出 UTC 字符串。共享 Zod schema 对可见时间字符串使用 `z.string().datetime()` 并要求 offset 存在，必要时再用精化规则要求以 `Z` 结尾。

替代方案是允许 `Date` 对象直接穿过服务边界，由调用方自行格式化。这个方案会让同一字段在不同模块出现不同格式，不利于测试和跨模块协作。

### Decision: 输入侧拒绝无时区日期时间

API、服务函数和测试 fixture 中凡是表达具体时间点的字符串，必须使用 ISO 8601 UTC；解析逻辑不得默默接受 `YYYY-MM-DD HH:mm`、`YYYY-MM-DDTHH:mm:ss` 这类没有 offset 的格式。对于训练日历这类以日期为主的流程，如果内部仍持久化为 `DateTime`，应使用 UTC 零点，例如 `2026-05-31T00:00:00.000Z`，并明确哪些 UI 层 date key 是派生展示值。

替代方案是继续在服务端用 `new Date(value)` 容忍多种输入。这个方案会把歧义留给运行环境，不适合作为数据库事实边界。

### Decision: 迁移验证覆盖 schema、SQL、fixture 和服务序列化

实现时需要同时检查 `prisma/schema.prisma`、已有 migration SQL、seed/fixture、服务层 mapper、共享 schema 和相关测试。验证不应只依赖类型检查，还要增加能捕获无时区字符串和 `TIMESTAMP(3)` 回归的自动化检查或测试断言。

替代方案是人工 review。人工 review 容易漏掉测试 fixture、旧 migration 或局部 helper，后续新增字段也缺少防线。

## Risks / Trade-offs

- [Risk] PostgreSQL 从 `TIMESTAMP(3)` 迁移到 `TIMESTAMPTZ(3)` 时，如果现有值曾按本地时区解释，可能出现历史数据偏移。→ Mitigation: 实现前明确本地开发库数据可重置还是需要保留；如果需要保留，migration 必须说明 `USING` 转换语义并用样例验证。
- [Risk] `scheduledFor` 既承担日历日期又是 `DateTime` 字段，统一 UTC 后可能暴露“日期”和“时间点”的概念差异。→ Mitigation: 持久化层使用 UTC 零点，API 同时保持业务日期派生逻辑可预测，并用测试覆盖跨时区解析不漂移。
- [Risk] 旧测试或 fixture 中的不带时区时间会被新校验拒绝，短期修改面较大。→ Mitigation: 先集中替换 fixture 和 helper，再收紧 schema，避免零散修补。
- [Risk] 手写 migration 或未来新增 DateTime 字段可能再次生成 `TIMESTAMP(3)`。→ Mitigation: 在任务中加入 schema/migration 扫描测试或文档化检查命令。

## Migration Plan

1. 盘点 `prisma/schema.prisma` 中所有 `DateTime` 字段，并为代表具体时间点的字段补充 `@db.Timestamptz(3)`。
2. 生成新的 Prisma migration，或在当前开发阶段按项目策略重置并重新生成迁移，确保 SQL 中不再新增无时区 `TIMESTAMP(3)`。
3. 统一服务层 mapper 和共享 schema，把数据库时间输出收敛为 ISO 8601 UTC 字符串。
4. 替换测试 fixture 和硬编码样例中的无时区时间。
5. 运行 Prisma schema/migration diff、自动化测试和类型检查，确认时间格式契约可持续验证。

## Open Questions

- 当前本地数据库中的历史开发数据是否允许 reset，还是需要保留并按固定时区解释后迁移？
- 旧 migration 文件是否需要全部改写，还是只要求从本 change 之后的 schema 与 migration 不再产生无时区列？
