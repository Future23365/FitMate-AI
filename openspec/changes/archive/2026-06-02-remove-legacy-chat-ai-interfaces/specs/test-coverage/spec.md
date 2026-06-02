## MODIFIED Requirements

### Requirement: Shared Domain Logic Coverage

项目 MUST 为 `lib/shared/*` 中影响聊天、训练计划、训练执行和动作数据语义的确定性逻辑补充自动化测试。测试 MUST 覆盖正常路径、边界值和至少一个失败或降级路径。

#### Scenario: Workout composition is tested

- **WHEN** 测试套件运行
- **THEN** `buildWorkoutTimeline`、`expandWorkoutItems`、`estimateWorkoutMinutes`、`estimateWorkoutCalories` 和 `getTotalWorkoutSets` 的测试 MUST 覆盖计时动作、计次动作、组间休息、动作间休息、循环间隙、热身、训练和拉伸分区

#### Scenario: Chat context is tested

- **WHEN** 测试套件运行
- **THEN** `buildFitnessConversationContext`、`selectMessagesForAiContext` 和 `formatFitnessConversationContextForPrompt` 的测试 MUST 覆盖长对话截取、用户事实提取和缺失字段保留
- **AND** 测试 MUST NOT 要求旧 trigger intent 合并作为新聊天执行事实源

#### Scenario: Legacy trigger parsing is absent from new chat flow

- **WHEN** 测试套件运行
- **THEN** 新聊天流测试 MUST 断言 workout plan、routine、exercise recommendation 和 suggested reply 的卡片触发不依赖旧 trigger JSON parser
- **AND** 测试 MAY 保留历史 trigger 文本作为 fixture，用于断言新流不会把它解析成生产执行结果

### Requirement: API Boundary Coverage

项目 MUST 为核心 `app/api/*` Route Handler 补充轻量边界测试。Route 测试 MUST 只验证 HTTP 入参、状态码、错误响应和服务调用边界，不能重复完整业务规则测试。

#### Scenario: Chat route boundary is tested

- **WHEN** 测试套件运行
- **THEN** `/api/chat` 测试 MUST 覆盖空消息拒绝、缺少模型配置的错误响应、合法请求传入聊天服务、流事件返回和 trace id 输出

#### Scenario: Legacy AI route boundaries are absent

- **WHEN** 测试套件运行
- **THEN** 测试 MUST 断言 `/api/ai/workout-plan` 和 `/api/ai/exercise-recommendations` 不再作为 active Route Handler 暴露给聊天流程
- **AND** 测试 MUST NOT 要求旧 AI route 覆盖请求校验失败、服务失败码映射、成功响应结构或 `parentTraceId` 传递

#### Scenario: Resource route boundaries are tested

- **WHEN** 测试套件运行
- **THEN** exercises、workouts、workout sessions 和 chat conversations API 测试 MUST 覆盖列表、详情、创建或更新、删除、参数非法和资源不存在路径

### Requirement: Frontend Business Logic Coverage

项目 MUST 为 `features/*` 中不依赖真实 DOM 布局的业务状态转换、请求封装和数据转换补充自动化测试。

#### Scenario: Chat client logic is tested

- **WHEN** 测试套件运行
- **THEN** 聊天前端逻辑测试 MUST 覆盖 NDJSON 流事件处理、推荐动作 id 去重、不喜欢动作排除、Agent-first 推荐刷新或 result-level 换一批参数传递
- **AND** 测试 MUST 断言聊天前端不会调用 `/api/ai/workout-plan` 或 `/api/ai/exercise-recommendations`
- **AND** 测试 MUST 断言训练卡片不会由旧 trigger JSON parser 触发

#### Scenario: Workout client logic is tested

- **WHEN** 测试套件运行
- **THEN** workout 前端逻辑测试 MUST 覆盖保存训练、读取训练、训练日程状态更新、客户端请求错误映射和计划草稿转保存结构

#### Scenario: Browser-only behavior is not replaced by unit tests

- **WHEN** change 影响训练执行页、动作预览抽屉、推荐卡片交互或浏览器 API
- **THEN** 验收 MUST 包含 Chrome DevTools MCP 真实 Chrome 验证
- **THEN** 验证 MUST 检查页面渲染、Console 报错、Network 请求失败和关键交互结果

## ADDED Requirements

### Requirement: Legacy chat interface absence coverage
项目 MUST 为旧聊天 AI 接口清理增加架构级防回归测试。测试 MUST 覆盖旧 route 缺席、旧前端调用缺席、旧 trigger parser 缺席和 allowlist 外 legacy 模块不可被生产路径导入。

#### Scenario: Legacy route and client scan passes
- **WHEN** 旧接口清理测试运行
- **THEN** 测试 MUST 扫描 active Route Handler 和聊天前端 client/hook
- **AND** 测试 MUST 证明 `/api/ai/workout-plan`、`/api/ai/exercise-recommendations`、`requestWorkoutPlanDraft` 和 `requestExerciseRecommendations` 不再参与生产聊天流程

#### Scenario: Legacy allowlist scan passes
- **WHEN** 旧接口清理测试运行
- **THEN** 测试 MUST 扫描生产 `/api/chat`、Agent runtime、Response Writer、前端新流解析、领域服务和当前 OpenSpec 主规格
- **AND** 测试 MUST 证明 allowlist 外旧 intent、旧 trigger、旧 route 和旧语义解析模块不可被生产路径导入或要求
