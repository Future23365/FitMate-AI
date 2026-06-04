## ADDED Requirements

### Requirement: visibleTrainingProposal 渲染为训练富卡片
聊天气泡 SHALL 将已校验的 `visibleTrainingProposal` 渲染为现有训练富卡片，而不是继续只渲染轻量列表面板。

#### Scenario: 动作推荐渲染为 ExerciseRecommendationCard
- **WHEN** assistant message 包含 `outputType = "visibleTrainingProposal"`、`schemaVersion = "1"` 且 `payload.kind = "exercise_selection"` 的 `visible_output`
- **THEN** 聊天气泡 MUST 渲染 `ExerciseRecommendationCard`
- **AND** 卡片动作项 MUST 来自 `visibleTrainingProposal.payload.exerciseItems`
- **AND** 卡片底部 MUST 继续使用本轮 `assistantSuggestions`，不得恢复固定“换一批”或“编成训练”按钮

#### Scenario: 训练编排渲染为 WorkoutRoutineDraftCard
- **WHEN** assistant message 包含 `outputType = "visibleTrainingProposal"`、`schemaVersion = "1"` 且 `payload.kind = "routine"` 的 `visible_output`
- **THEN** 聊天气泡 MUST 渲染 `WorkoutRoutineDraftCard`
- **AND** 生成的 draft MUST 包含 `warmup`、`training`、`stretch` 三个 section
- **AND** 每个动作项的 `exerciseId`、`section` 和处方字段 MUST 来自 `visibleTrainingProposal.payload.exerciseItems`

#### Scenario: 训练计划渲染为 WorkoutPlanDraftCard
- **WHEN** assistant message 包含 `outputType = "visibleTrainingProposal"`、`schemaVersion = "1"` 且 `payload.kind = "plan"` 的 `visible_output`
- **THEN** 聊天气泡 MUST 渲染 `WorkoutPlanDraftCard`
- **AND** 训练日 MUST 复用同一套 `warmup`、`training`、`stretch` 编排
- **AND** 休息日 MUST 来自 `schedule.assignments` 中 `type = "rest"` 的日期，不得要求模型输出每天不同的完整动作编排

### Requirement: visibleOutputs 保持唯一新消息事实源
新 Agent 消息的训练富卡片 SHALL 从 `message.visibleOutputs` 派生；旧 `bubblePlans`、`bubbleRoutines` 和 `exerciseRecommendations` 不得重新成为新消息事实源。

#### Scenario: 新消息不写回旧 bubble state
- **WHEN** 前端收到 `visible_output` 事件
- **THEN** 消息 MUST 追加到 `message.visibleOutputs`
- **AND** 前端 MUST NOT 同步写入 `bubblePlans`、`bubbleRoutines` 或 `bubbleExerciseRecommendations` 作为新消息事实

#### Scenario: 新旧卡片不重复渲染
- **WHEN** 同一 assistant message 同时存在可渲染的 `visibleTrainingProposal` 和旧 `bubble*` 卡片数据
- **THEN** 聊天气泡 MUST 优先渲染 `visibleTrainingProposal` 派生的富卡片
- **AND** 对应旧 `bubble*` 卡片 MUST NOT 在同一消息中重复显示

#### Scenario: 旧历史消息继续兼容
- **WHEN** assistant message 不包含可渲染的 `visibleTrainingProposal`
- **AND** 历史会话仍包含 `bubblePlans`、`bubbleRoutines` 或 `exerciseRecommendations`
- **THEN** 聊天气泡 MUST 继续按旧卡片数据展示历史卡片

### Requirement: 富卡片 adapter 不改变 AI 输出合同
富卡片 adapter SHALL 只在前端派生展示数据，不得改变 `AgentAction`、`visibleTrainingProposal`、Agent tool 或跨轮事实桥合同。

#### Scenario: AI payload 不增加旧卡片字段
- **WHEN** 实现训练富卡片适配
- **THEN** `visibleTrainingProposal.payload` MUST 继续只承载训练事实字段，例如 `kind`、`exerciseItems`、`prescription` 和 `schedule`
- **AND** 系统 MUST NOT 要求模型输出 `WorkoutRoutineDraft`、`WorkoutPlanDraft`、`ExerciseRecommendationCard`、`title`、`goal`、`categoryZh` 或 `levelZh` 才能渲染卡片

#### Scenario: tool registry 不为 UI 适配新增能力
- **WHEN** 实现训练富卡片适配
- **THEN** 生产 Agent tool registry MUST NOT 因前端卡片适配新增、重命名或扩展业务 tool
- **AND** `searchExerciseResources` 和 `inspectVisibleTrainingProposals` 的职责边界 MUST 保持不变

#### Scenario: 展示详情不反写训练事实
- **WHEN** adapter 使用 `visible_output.content` 或 `/api/exercises/:id` 补齐动作名称、图片、器械、肌群等展示详情
- **THEN** 这些展示详情 MUST NOT 反向改写 `visibleTrainingProposal.payload.exerciseItems`
- **AND** 缺失展示详情时 MUST 使用稳定兜底，不得丢弃已校验的动作事实

### Requirement: 自动化验证覆盖富卡片适配
实现 SHALL 使用自动化测试覆盖 adapter、聊天事件消费和富卡片渲染边界。

#### Scenario: adapter 单测覆盖三种 kind
- **WHEN** 运行 adapter 相关单测
- **THEN** 测试 MUST 覆盖 `exercise_selection`、`routine` 和 `plan` 三种 `visibleTrainingProposal.kind`
- **AND** 测试 MUST 断言输出使用旧三张卡片需要的数据结构

#### Scenario: 聊天渲染回归覆盖事实源边界
- **WHEN** 运行聊天页或聊天 controller 相关测试
- **THEN** 测试 MUST 覆盖 `visible_output` 只写入 `message.visibleOutputs`
- **AND** 测试 MUST 覆盖有 `visibleTrainingProposal` 时不重复渲染旧 `bubble*` 卡片

#### Scenario: 类型检查覆盖共享结构
- **WHEN** 修改前端 adapter、聊天类型、卡片 props 或训练 draft 结构
- **THEN** 必须运行 `npm run typecheck` 或说明无法运行的原因
