## ADDED Requirements

### Requirement: visibleTrainingProposal 渲染为训练富卡片
聊天气泡 SHALL 将已校验的 `visibleTrainingProposal` 渲染为现有训练富卡片，而不是继续只渲染轻量列表面板。`VisibleTrainingProposalPanel` 是临时极简展示，不属于目标产品样式。

#### Scenario: 动作推荐渲染为 ExerciseRecommendationCard
- **WHEN** assistant message 包含 `outputType = "visibleTrainingProposal"`、`schemaVersion = "1"` 且 `payload.kind = "exercise_selection"` 的 `visible_output`
- **THEN** 聊天气泡 MUST 渲染 `ExerciseRecommendationCard`
- **AND** 卡片动作项 MUST 来自 `visibleTrainingProposal.payload.exerciseItems`
- **AND** 本 change MUST NOT 给该卡片绑定或渲染推荐按钮

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

### Requirement: visibleOutputs 保持唯一训练卡片事实源
Agent 消息的训练富卡片 SHALL 从 `message.visibleOutputs` 派生；旧 `bubblePlans`、`bubbleRoutines` 和 `exerciseRecommendations` 不得重新成为消息事实源或历史 fallback。

#### Scenario: 新消息不写回旧 bubble state
- **WHEN** 前端收到 `visible_output` 事件
- **THEN** 消息 MUST 追加到 `message.visibleOutputs`
- **AND** 前端 MUST NOT 同步写入 `bubblePlans`、`bubbleRoutines` 或 `bubbleExerciseRecommendations` 作为新消息事实

#### Scenario: 旧 bubble 卡片不再作为 fallback 渲染
- **WHEN** assistant message 不包含可渲染的 `visibleTrainingProposal`
- **AND** 历史会话仍包含 `bubblePlans`、`bubbleRoutines` 或 `exerciseRecommendations`
- **THEN** 聊天气泡 MUST NOT 回退展示旧 `bubble*` 卡片
- **AND** 实现 MUST 删除或停用旧 `bubble*` 渲染路径

#### Scenario: 不做旧数据迁移或双写
- **WHEN** 实现训练富卡片适配
- **THEN** 系统 MUST NOT 为 `bubblePlans`、`bubbleRoutines` 或 `exerciseRecommendations` 增加迁移、双写或运行时兼容分支
- **AND** 开发环境旧聊天历史如影响验证，MUST 在验证前清理，而不是通过前端 fallback 保留

### Requirement: 轻量面板不得作为用户可见训练 UI 保留
Agent 消息 SHALL 只使用旧三张富卡片样式展示训练内容；系统 MUST 删除或停用 `VisibleTrainingProposalPanel` 的用户可见渲染路径。

#### Scenario: 不显示轻量面板信息
- **WHEN** assistant message 包含可渲染的 `visibleTrainingProposal`
- **THEN** 聊天气泡 MUST NOT 显示 `VisibleTrainingProposalPanel` 的标题、分段 mini list、处方 chip 或面板容器
- **AND** 聊天气泡 MUST NOT 显示 `exercise_selection`、`routine`、`plan`、`visibleTrainingProposal`、`exerciseItems` 或 `schemaVersion` 等技术字段作为卡片 UI

#### Scenario: 不新增第四种训练卡片样式
- **WHEN** 实现训练富卡片适配
- **THEN** 用户可见训练内容 MUST 只落到 `ExerciseRecommendationCard`、`WorkoutRoutineDraftCard` 或 `WorkoutPlanDraftCard`
- **AND** 系统 MUST NOT 新增独立于这三张卡片之外的轻量训练卡片 fallback

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

### Requirement: 推荐按钮能力仅预留
推荐按钮和 AI 建议回复生成能力 SHALL 保留为后续独立能力；本 change 只接旧三张卡片样式，不实现推荐按钮生成、绑定或展示。

#### Scenario: 新富卡片路径不绑定 assistantSuggestions
- **WHEN** assistant message 同时包含可渲染的 `visibleTrainingProposal` 和 `assistant_suggestions`
- **THEN** 本 change 的富卡片 adapter MUST NOT 将 `assistant_suggestions` 绑定到新渲染的训练富卡片
- **AND** 聊天气泡 MUST NOT 因本 change 在训练富卡片底部新增推荐按钮

#### Scenario: 不恢复固定推荐按钮
- **WHEN** 渲染 `ExerciseRecommendationCard`、`WorkoutRoutineDraftCard` 或 `WorkoutPlanDraftCard`
- **THEN** 系统 MUST NOT 恢复固定“换一批”、“编成训练”或等价硬编码推荐按钮
- **AND** 后续如需推荐按钮 MUST 通过独立 change 定义 AI 层建议来源、前端绑定位置和 targetOperation 语义

### Requirement: 自动化验证覆盖富卡片适配
实现 SHALL 使用自动化测试覆盖 adapter、聊天事件消费和富卡片渲染边界。

#### Scenario: adapter 单测覆盖三种 kind
- **WHEN** 运行 adapter 相关单测
- **THEN** 测试 MUST 覆盖 `exercise_selection`、`routine` 和 `plan` 三种 `visibleTrainingProposal.kind`
- **AND** 测试 MUST 断言输出使用旧三张卡片需要的数据结构

#### Scenario: 聊天渲染回归覆盖事实源边界
- **WHEN** 运行聊天页或聊天 controller 相关测试
- **THEN** 测试 MUST 覆盖 `visible_output` 只写入 `message.visibleOutputs`
- **AND** 测试 MUST 覆盖旧 `bubble*` 卡片不再作为 fallback 渲染
- **AND** 测试 MUST 覆盖有 `visibleTrainingProposal` 时不显示轻量面板或技术枚举字段
- **AND** 测试 MUST 覆盖本 change 不在新训练富卡片底部渲染推荐按钮

#### Scenario: 类型检查覆盖共享结构
- **WHEN** 修改前端 adapter、聊天类型、卡片 props 或训练 draft 结构
- **THEN** 必须运行 `npm run typecheck` 或说明无法运行的原因
