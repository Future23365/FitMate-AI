# test-coverage Specification

## Purpose
TBD - created by archiving change expand-test-coverage. Update Purpose after archive.
## Requirements
### Requirement: Shared Domain Logic Coverage

项目 MUST 为 `lib/shared/*` 中影响聊天、训练计划、训练执行和动作数据语义的确定性逻辑补充自动化测试。测试 MUST 覆盖正常路径、边界值和至少一个失败或降级路径。

#### Scenario: Workout composition is tested

- **WHEN** 测试套件运行
- **THEN** `buildWorkoutTimeline`、`expandWorkoutItems`、`estimateWorkoutMinutes`、`estimateWorkoutCalories` 和 `getTotalWorkoutSets` 的测试 MUST 覆盖计时动作、计次动作、组间休息、动作间休息、循环间隙、热身、训练和拉伸分区

#### Scenario: Chat context is tested

- **WHEN** 测试套件运行
- **THEN** `buildFitnessConversationContext`、`selectMessagesForLegacyContextMigration` 和 `formatFitnessConversationContextForPrompt` 的测试 MUST 覆盖长对话截取、用户事实提取和缺失字段保留
- **AND** 测试 MUST NOT 要求旧 trigger intent 合并作为新聊天执行事实源

#### Scenario: Legacy trigger parsing is absent from new chat flow

- **WHEN** 测试套件运行
- **THEN** 新聊天流测试 MUST 断言 workout plan、routine、exercise recommendation 和 suggested reply 的卡片触发不依赖旧 trigger JSON parser
- **AND** 测试 MAY 保留历史 trigger 文本作为 fixture，用于断言新流不会把它解析成生产执行结果

### Requirement: Server Service Coverage

项目 MUST 为可在 Node 测试环境中稳定运行的 `lib/server/*` 服务补充自动化测试。测试 MUST mock 外部 AI、数据库或网络依赖，不能调用真实第三方模型或真实生产数据库。

#### Scenario: Exercise service is tested

- **WHEN** 测试套件运行
- **THEN** 动作库查询测试 MUST 覆盖搜索、分类筛选、肌群筛选、器械筛选、居家条件筛选、分页、排序和 facets 统计

#### Scenario: Workout plan validation is tested

- **WHEN** 测试套件运行
- **THEN** 训练计划校验测试 MUST 覆盖非法 `exerciseId`、重复动作、时长估算、伤病风险过滤、候选不足和合规草稿通过路径

#### Scenario: AI orchestration boundaries are tested

- **WHEN** 测试套件运行
- **THEN** AI 编排测试 MUST 覆盖请求 Schema、JSON 解析失败、模型输出校验失败、高风险健康词拦截、候选不足降级、`parentTraceId` 传递和 trace metadata 更新

#### Scenario: Persistence mapping is tested

- **WHEN** 测试套件运行
- **THEN** workout persistence 和 chat history 服务测试 MUST 覆盖保存前输入校验、userId 隔离参数、数据库记录到前端结构的映射、状态转换和删除路径

### Requirement: API Boundary Coverage

项目 MUST 为核心 `app/api/*` Route Handler 补充轻量边界测试。Route 测试 MUST 只验证 HTTP 入参、状态码、错误响应和服务调用边界，不能重复完整业务规则测试。

#### Scenario: Chat route boundary is tested

- **WHEN** 测试套件运行
- **THEN** `/api/chat` 测试 MUST 覆盖空消息拒绝、缺少模型配置的错误响应、合法请求传入聊天服务、流事件返回和 trace id 输出

#### Scenario: Legacy AI route boundaries are absent

- **WHEN** 测试套件运行
- **THEN** 测试 MUST 断言旧聊天 AI 独立 route 不再作为 active Route Handler 暴露给聊天流程
- **AND** 测试 MUST NOT 要求旧 AI route 覆盖请求校验失败、服务失败码映射、成功响应结构或 `parentTraceId` 传递

#### Scenario: Resource route boundaries are tested

- **WHEN** 测试套件运行
- **THEN** exercises、workouts、workout sessions 和 chat conversations API 测试 MUST 覆盖列表、详情、创建或更新、删除、参数非法和资源不存在路径

### Requirement: Frontend Business Logic Coverage

项目 MUST 为 `features/*` 中不依赖真实 DOM 布局的业务状态转换、请求封装和数据转换补充自动化测试。

#### Scenario: Chat client logic is tested

- **WHEN** 测试套件运行
- **THEN** 聊天前端逻辑测试 MUST 覆盖 NDJSON 流事件处理、推荐动作 id 去重、不喜欢动作排除、Agent-first 推荐刷新或 result-level 换一批参数传递
- **AND** 测试 MUST 断言聊天前端不会调用旧聊天 AI 独立 route
- **AND** 测试 MUST 断言训练卡片不会由旧 trigger JSON parser 触发

### Requirement: Legacy Chat Interface Absence Coverage

项目 MUST 为旧聊天 AI 接口清理增加架构级防回归测试。测试 MUST 覆盖旧 route 缺席、旧前端调用缺席、旧 trigger parser 缺席和 allowlist 外 legacy 模块不可被生产路径导入。

#### Scenario: Legacy route and client scan passes

- **WHEN** 旧接口清理测试运行
- **THEN** 测试 MUST 扫描 active Route Handler 和聊天前端 client / hook
- **AND** 测试 MUST 证明旧聊天 AI 独立 route 和旧 route client helper 不再参与生产聊天流程

#### Scenario: Legacy allowlist scan passes

- **WHEN** 旧接口清理测试运行
- **THEN** 测试 MUST 扫描生产 `/api/chat`、Agent runtime、Response Writer、前端新流解析、领域服务和当前 OpenSpec 主规格
- **AND** 测试 MUST 证明 allowlist 外旧 intent、旧 trigger、旧 route 和旧语义解析模块不可被生产路径导入或要求

#### Scenario: Workout client logic is tested

- **WHEN** 测试套件运行
- **THEN** workout 前端逻辑测试 MUST 覆盖保存训练、读取训练、训练日程状态更新、客户端请求错误映射和计划草稿转保存结构

#### Scenario: Browser-only behavior is not replaced by unit tests

- **WHEN** change 影响训练执行页、动作预览抽屉、推荐卡片交互或浏览器 API
- **THEN** 验收 MUST 包含 Chrome DevTools MCP 真实 Chrome 验证
- **THEN** 验证 MUST 检查页面渲染、Console 报错、Network 请求失败和关键交互结果

### Requirement: Test Data Strategy

项目 MUST 使用可维护的测试 fixture 和工厂函数组织测试数据。测试数据 MUST 足够小且表达意图明确。

#### Scenario: Fixture factories exist

- **WHEN** 新增多个测试文件需要构造相同领域对象
- **THEN** 测试代码 MUST 提供共享 fixture 或工厂函数来创建 `Exercise`、`WorkoutItem`、`WorkoutPlanIntent`、`WorkoutPlanDraft`、聊天消息和 API request

#### Scenario: Real exercise data is limited to integration checks

- **WHEN** 测试目标是验证具体业务规则
- **THEN** 测试 MUST 使用最小 fixture 表达规则
- **THEN** 只有验证真实动作数据兼容性时才使用 `data/exercises.zh.json`

### Requirement: Verification Commands

完成测试补充后，验收 MUST 运行当前可用的项目测试和相关静态检查，并记录执行结果。若 `npm test` 尚未由 `formalize-testing-workflow` 接入，验收 MUST 记录新增测试等待后续 runner 和脚本承接。

#### Scenario: Automated tests pass

- **WHEN** 本 change 实现完成
- **THEN** 如果 `npm test` 已可用，验收 MUST 运行 `npm test`
- **THEN** 如果 `npm test` 尚未可用，验收 MUST 记录新增测试等待 `formalize-testing-workflow` 统一接入执行

#### Scenario: Static checks pass

- **WHEN** 本 change 修改 TypeScript、React、测试配置或模块导出
- **THEN** 验收 MUST 运行 `npm run typecheck`
- **THEN** 验收 MUST 运行 `npm run lint`

#### Scenario: Build is verified when boundaries change

- **WHEN** 本 change 修改 Route Handler、Next.js 配置、依赖配置或服务端/客户端导入边界
- **THEN** 验收 MUST 运行 `npm run build` 或说明无法运行的原因

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

### Requirement: Chat history message time coverage
项目 MUST 为聊天历史消息时间语义补充自动化测试，覆盖服务端映射、保存保留和前端保存 payload 行为。

#### Scenario: Chat history service preserves message time
- **WHEN** 测试套件运行
- **THEN** chat history 服务测试 MUST 覆盖从数据库消息 `createdAt` 映射到前端消息
- **AND** 测试 MUST 覆盖保存历史会话时保留已有消息 `createdAt`
- **AND** 测试 MUST 覆盖缺失消息时间时为新消息生成稳定顺序的时间

#### Scenario: Chat history list uses latest message time
- **WHEN** 测试套件运行
- **THEN** chat history 服务测试 MUST 覆盖列表返回和排序使用最后一条用户或 AI 消息时间
- **AND** 测试 MUST 覆盖没有可用消息时间时 fallback 到 `ChatSession.updatedAt`

#### Scenario: Chat client saves message time
- **WHEN** 测试套件运行
- **THEN** 前端聊天历史工具测试 MUST 覆盖保存 payload 会保留已有消息 `createdAt`
- **AND** 测试 MUST 覆盖保存后仍派发 `fitmate:chat-history-updated`

### Requirement: 长期计划三段式推送必须有自动化测试
项目 MUST 为长期计划推送的三段式草稿、计划层编排、保存转换和排期生成补充自动化测试。

#### Scenario: 测试长期计划草稿结构
- **WHEN** 测试 `WorkoutPlanDraft` schema 和 AI 草稿解析
- **THEN** 测试 MUST 覆盖合法三段式长期计划草稿
- **AND** 测试 MUST 覆盖缺少 `cycleLengthDays`、缺少 `trainingDayCount`、缺少 `warmup`、缺少 `training`、缺少 `stretch`、动作项 section 与父 section 不一致、`days.length` 与 `cycleLengthDays` 不一致的失败场景

#### Scenario: 测试长期计划服务端校验
- **WHEN** 测试 workout plan validation
- **THEN** 测试 MUST 覆盖动作 ID 不存在、动作 ID 不在候选集合、训练日缺少差异、周期天数与训练日数量不一致、训练日时长超出用户单次时长、新手训练量偏高和伤病限制缺少安全提示

#### Scenario: 测试计划转换和保存
- **WHEN** 测试长期计划草稿转换为持久化 routine
- **THEN** 测试 MUST 验证每个训练日会转换为独立 `WorkoutRoutine`
- **AND** 测试 MUST 验证转换后的 `WorkoutRoutine.items` 保留 `warmup`、`training`、`stretch` section
- **AND** 测试 MUST 验证主训练循环配置只影响 training section

#### Scenario: 测试计划排期
- **WHEN** 测试长期计划导入日历
- **THEN** 测试 MUST 覆盖导入本周期、重复 2 个周期和重复 4 个周期
- **AND** 测试 MUST 覆盖 `cycleLengthDays` 不同取值下的训练日与休息日生成
- **AND** 测试 MUST 覆盖“6 天计划”“每周 6 练”“未来 6 天每天练”的语义区分
- **AND** 测试 MUST 验证重复导入只替换同一计划来源、同一导入区间内的 schedule

#### Scenario: 测试长期计划卡片渲染
- **WHEN** 测试聊天长期计划卡片
- **THEN** 测试 MUST 覆盖计划周期摘要、周期日切换、休息日展示、三段式 section 展示、动作详情入口和按周期导入按钮状态
- **AND** 测试 MUST 覆盖缺少动作详情快照时的兜底展示

#### Scenario: 测试手工 LLM 一致性用例
- **WHEN** 运行 manual LLM consistency tests
- **THEN** 长期计划用例 MUST 校验输出 `kind = "plan"`
- **AND** 长期计划用例 MUST 校验每个训练日包含 `warmup`、`training`、`stretch`
- **AND** 长期计划用例 MUST 校验“6 天计划”输出 `cycleLengthDays = 6`
- **AND** 单次训练用例 MUST 继续校验输出 `kind = "routine"`，不得被误生成为长期计划
