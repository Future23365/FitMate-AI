## ADDED Requirements

### Requirement: Database datetime columns use UTC-aware storage

系统 SHALL 将数据库中表示具体时间点的字段保存为无歧义 UTC 时间点，并使用 PostgreSQL `timestamptz` 语义承载 Prisma `DateTime` 字段。

#### Scenario: Prisma schema defines datetime fields

- **WHEN** 开发者在 `prisma/schema.prisma` 中新增或修改表示具体时间点的 `DateTime` 字段
- **THEN** 字段 MUST 显式映射到 UTC-aware PostgreSQL 类型，例如 `@db.Timestamptz(3)`
- **AND** 字段 MUST NOT 依赖无时区 `TIMESTAMP(3)` 作为数据库事实存储格式

#### Scenario: Migration SQL is generated

- **WHEN** 本 change 生成或调整 Prisma migration
- **THEN** migration SQL MUST 使用 `TIMESTAMPTZ(3)` 或等价的 UTC-aware PostgreSQL 类型保存具体时间点
- **AND** migration SQL MUST NOT 为新增或调整后的数据库时间字段继续生成无时区 `TIMESTAMP(3)`

#### Scenario: Existing timestamp columns are migrated

- **WHEN** 本 change 将既有 `TIMESTAMP(3)` 列迁移到 `TIMESTAMPTZ(3)`
- **THEN** 旧值 MUST 按 UTC+0 语义解释
- **AND** migration MUST 使用 `AT TIME ZONE 'UTC'` 或等价 SQL 明确转换语义
- **AND** 实现 MUST NOT 改写历史 migration 文件来隐藏本次 forward migration

#### Scenario: Existing datetime fields are audited

- **WHEN** 实现者盘点当前 schema 中的 `createdAt`、`updatedAt`、`deletedAt`、`expiresAt`、`scheduledFor`、`startedAt`、`endedAt`、`emailVerifiedAt` 和其他 `DateTime` 字段
- **THEN** 每个字段 MUST 被分类为具体时间点或明确的非时间点业务值
- **AND** 代表具体时间点的字段 MUST 迁移到 UTC-aware 存储语义

### Requirement: Database-backed API times use ISO 8601 UTC strings

系统 SHALL 在数据库时间离开服务端持久化层时统一输出 ISO 8601 UTC 字符串。

#### Scenario: Service maps database rows to DTOs

- **WHEN** 服务端从 Prisma 读取包含 `DateTime` 字段的数据库记录并返回给 API、客户端、AI 编排、trace payload 或测试断言
- **THEN** 每个对外可见的时间字段 MUST 序列化为 ISO 8601 UTC 字符串
- **AND** 输出值 MUST 包含 UTC 标记 `Z`
- **AND** 输出值 MUST NOT 使用 `YYYY-MM-DD HH:mm`、无 offset 的 `YYYY-MM-DDTHH:mm:ss` 或运行环境本地时间格式

#### Scenario: Chat history times are returned

- **WHEN** 系统返回聊天会话列表或聊天消息历史
- **THEN** `createdAt`、`updatedAt` 和消息时间 MUST 使用 ISO 8601 UTC 字符串
- **AND** 排序逻辑 MUST 基于同一个 UTC 时间点语义比较，不得依赖本地时区解析结果

#### Scenario: Workout persistence times are returned

- **WHEN** 系统返回训练编排、训练日历安排或训练执行结果
- **THEN** `createdAt`、`updatedAt`、`scheduledFor`、`startedAt` 和 `endedAt` 等数据库时间字段 MUST 使用 ISO 8601 UTC 字符串
- **AND** 训练日历需要展示日期时，日期 key MUST 从 UTC 规范值派生，而不是从无时区字符串重新解析

### Requirement: Time inputs reject ambiguous datetime formats

系统 SHALL 在写入数据库前拒绝或归一化所有有歧义的具体时间点输入。

#### Scenario: API receives a datetime string

- **WHEN** API 或服务函数接收表示具体时间点的字符串字段
- **THEN** 输入 MUST 通过明确的 ISO 8601 UTC 校验
- **AND** 输入 MUST 包含 `Z` 或等价 UTC offset，例如 `+00:00`
- **AND** 服务端 MUST 将等价 UTC offset 归一化为 ISO 8601 UTC `Z` 字符串
- **AND** 服务端 MUST 拒绝非 UTC offset，除非未来单独引入用户时区能力
- **AND** 服务端 MUST NOT 默默接受 `2026-05-25 10:30` 或 `2026-05-25T10:30:00` 这类无 offset 时间

#### Scenario: Training schedule receives a date-backed datetime

- **WHEN** 训练日历流程需要把某个日期保存到 `DateTime` 字段
- **THEN** 服务端 MUST 使用明确 UTC 值表示该日期的持久化时间点，例如 `2026-05-31T00:00:00.000Z`
- **AND** 服务端 MUST 保持日期派生逻辑可预测，避免数据库值在不同时区下漂移到相邻日期

#### Scenario: Existing ambiguous values are encountered

- **WHEN** 迁移、seed 或测试 fixture 中发现无时区时间字符串
- **THEN** 实现 MUST 将其替换为 ISO 8601 UTC 字符串或明确记录迁移解释时区
- **AND** 实现 MUST NOT 继续保留会被运行环境本地时区解释的时间样例

### Requirement: Persisted JSON times use the same UTC contract

系统 SHALL 约束新写入的持久化 JSON 具体时间点，避免数据库列已规范但 JSON payload 继续引入歧义时间。

#### Scenario: Structured JSON stores a concrete instant

- **WHEN** 服务端向 `ConversationArtifact.payload`、`ChatMessage.metadata`、`UserMemory.value`、`WorkoutSessionResult.feedback`、AI trace payload 或其他持久化 JSON 写入具体时间点
- **THEN** 该时间 MUST 使用 ISO 8601 UTC `Z` 字符串
- **AND** 写入逻辑 MUST NOT 保存无 offset 的日期时间字符串

#### Scenario: Existing JSON data is encountered

- **WHEN** 实现盘点发现历史 JSON 中存在时间字符串
- **THEN** 实现 MUST NOT 批量递归重写历史 JSON
- **AND** 只有当该 JSON 时间被服务端作为排序、过期、日期归属或训练执行事实读取时，才 SHOULD 做定向迁移或兼容处理

### Requirement: Time format regressions are automatically verified

系统 SHALL 为数据库时间格式提供可重复的验证手段，防止新字段、fixture 或 migration 重新引入歧义时间。

#### Scenario: Automated tests inspect serialized times

- **WHEN** 自动化测试覆盖聊天历史、训练持久化、用户记忆、ConversationArtifact 或其他包含数据库时间的服务
- **THEN** 测试 MUST 断言对外时间字段符合 ISO 8601 UTC 格式
- **AND** 测试 MUST 覆盖至少一个从数据库 `Date` 到 API 字符串的映射路径

#### Scenario: Schema and migration are checked

- **WHEN** 实现者运行本 change 的验证步骤
- **THEN** 验证 MUST 检查 `prisma/schema.prisma` 和本 change 新增 migration SQL 中不再为具体时间点字段生成无时区 `TIMESTAMP(3)`
- **AND** 验证 MUST 能暴露未来新增 `DateTime` 字段缺少 UTC-aware 映射的问题
- **AND** 验证 MAY 允许历史 migration 文件保留旧 `TIMESTAMP(3)` 记录

#### Scenario: Fixture data is reviewed

- **WHEN** 测试 fixture、seed 数据或手写 mock 数据包含时间字段
- **THEN** 时间样例 MUST 使用 ISO 8601 UTC 字符串或 `new Date("...Z")`
- **AND** fixture MUST NOT 使用无 offset 的日期时间字符串构造具体时间点
- **AND** 纯 date key MAY 继续用于日期标签，但 MUST NOT 被当作具体时间点写入数据库
