## ADDED Requirements

### Requirement: Shared Domain Logic Coverage

项目 MUST 为 `lib/shared/*` 中影响聊天、训练计划、训练执行和动作数据语义的确定性逻辑补充自动化测试。测试 MUST 覆盖正常路径、边界值和至少一个失败或降级路径。

#### Scenario: Workout composition is tested

- **WHEN** 测试套件运行
- **THEN** `buildWorkoutTimeline`、`expandWorkoutItems`、`estimateWorkoutMinutes`、`estimateWorkoutCalories` 和 `getTotalWorkoutSets` 的测试 MUST 覆盖计时动作、计次动作、组间休息、动作间休息、循环间隙、热身、训练和拉伸分区

#### Scenario: Chat context is tested

- **WHEN** 测试套件运行
- **THEN** `buildFitnessConversationContext`、`selectMessagesForAiContext` 和 `formatFitnessConversationContextForPrompt` 的测试 MUST 覆盖长对话截取、trigger intent 合并、用户事实提取和缺失字段保留

#### Scenario: Trigger parsing is tested

- **WHEN** 测试套件运行
- **THEN** workout plan、routine、exercise recommendation 和 suggested reply trigger 解析测试 MUST 覆盖 fenced JSON、普通文本中嵌入 JSON、无效 JSON 和非 trigger 文本

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

#### Scenario: AI route boundaries are tested

- **WHEN** 测试套件运行
- **THEN** `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 测试 MUST 覆盖请求校验失败、服务失败码映射、成功响应结构和 `parentTraceId` 传递

#### Scenario: Resource route boundaries are tested

- **WHEN** 测试套件运行
- **THEN** exercises、workouts、workout sessions 和 chat conversations API 测试 MUST 覆盖列表、详情、创建或更新、删除、参数非法和资源不存在路径

### Requirement: Frontend Business Logic Coverage

项目 MUST 为 `features/*` 中不依赖真实 DOM 布局的业务状态转换、请求封装和数据转换补充自动化测试。

#### Scenario: Chat client logic is tested

- **WHEN** 测试套件运行
- **THEN** 聊天前端逻辑测试 MUST 覆盖 NDJSON 流事件处理、推荐动作 id 去重、不喜欢动作排除、换一批参数传递和训练卡片 trigger 调用

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

完成测试补充后，验收 MUST 运行项目测试和相关静态检查，并记录执行结果。

#### Scenario: Automated tests pass

- **WHEN** 本 change 实现完成
- **THEN** 验收 MUST 运行 `npm test`
- **THEN** 所有新增和迁移后的测试 MUST 通过

#### Scenario: Static checks pass

- **WHEN** 本 change 修改 TypeScript、React、测试配置或模块导出
- **THEN** 验收 MUST 运行 `npm run typecheck`
- **THEN** 验收 MUST 运行 `npm run lint`

#### Scenario: Build is verified when boundaries change

- **WHEN** 本 change 修改 Route Handler、Next.js 配置、依赖配置或服务端/客户端导入边界
- **THEN** 验收 MUST 运行 `npm run build` 或说明无法运行的原因
