## ADDED Requirements

### Requirement: Workout data model refactor coverage
项目 MUST 为 `refactor-workout-data-model` 完成后的新训练数据模型补充覆盖 routine、schedule、session result 的自动化测试。

#### Scenario: Shared schema coverage exists
- **WHEN** 测试套件运行
- **THEN** routine、routine item、schedule 和 session result 的 Zod schema 测试 MUST 覆盖合法输入、缺少必填字段、非法状态、非法数字和非法日期

#### Scenario: Persistence service coverage exists
- **WHEN** 测试套件运行
- **THEN** workout 持久化服务测试 MUST 覆盖 routine CRUD、routine item 排序、非法 `exerciseId` 拒绝、schedule CRUD、休息日、状态更新和 session result 写入
- **AND** 测试 MUST 覆盖 userId 隔离参数，避免跨用户读取、更新或完成训练

#### Scenario: API route coverage exists
- **WHEN** 测试套件运行
- **THEN** workout routine route 测试 MUST 覆盖列表、详情、创建、更新、删除或归档、请求校验失败和资源不存在
- **AND** workout schedule route 测试 MUST 覆盖列表、详情、创建、状态更新、删除或取消、休息日和资源不存在
- **AND** session result route 测试 MUST 覆盖完成结果提交、非法数值、非法 schedule 和服务失败映射

#### Scenario: Client API coverage exists
- **WHEN** 测试套件运行
- **THEN** workout client 测试 MUST 覆盖新 API 路径、请求体、响应映射、错误映射和训练数据更新事件
- **AND** 测试 MUST NOT 继续依赖旧 `/api/workouts` 或 `/api/workout-sessions`

### Requirement: Refactor workflow regression coverage
项目 MUST 为大重构后的关键用户流程提供自动化回归覆盖，不能只验证底层 service。

#### Scenario: AI draft conversion coverage exists
- **WHEN** 测试套件运行
- **THEN** AI 草稿转保存结构测试 MUST 验证多日草稿会生成多个 routine
- **AND** 排期逻辑测试 MUST 验证训练日生成 schedule、休息日生成 rest schedule
- **AND** 测试 MUST 验证不会创建计划外壳或 `WorkoutPlanDay`

#### Scenario: Training execution result coverage exists
- **WHEN** 测试套件运行
- **THEN** 训练执行相关测试 MUST 覆盖 `scheduleId` 加载、时间线构建、完成结果 payload、result 写入失败和本地完成态不回滚

#### Scenario: Legacy residue coverage exists
- **WHEN** 测试或静态扫描运行
- **THEN** 当前源码和当前测试 MUST NOT 继续引用旧持久化语义 `SavedWorkout`、`ScheduledWorkout`、`planId`、`/api/workouts` 或 `/api/workout-sessions`
- **AND** 如果扫描允许历史文件例外，例外路径 MUST 被明确列出
