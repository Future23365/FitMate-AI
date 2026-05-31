# ai-model-payload-budget Specification

## Purpose
TBD - created by archiving change trim-rag-model-payload. Update Purpose after archive.
## Requirements
### Requirement: Model exercise payload minimization
系统 SHALL 在向模型发送动作候选上下文时只包含当前模型任务所需的最小安全字段。

#### Scenario: Exercise recommendation model receives compact candidates
- **WHEN** 系统为动作推荐卡片请求模型选择候选动作
- **THEN** `candidateExercises` MUST NOT 包含 `imageUrl`、`imageUrls`、`images`、`nameEn`、`levelZh` 或完整 `candidateReasons`
- **AND** 每个候选 MUST 保留可用于选择动作的 `exerciseId`、`nameZh`、`categoryZh`、`level`、`equipmentZh`、`primaryMusclesZh`、`riskTags`、`goalTags` 和排序信号

#### Scenario: Chat model receives compact exercise context
- **WHEN** 聊天模型需要引用动作库候选上下文
- **THEN** `providedExercises` MUST NOT 包含图片、完整动作说明、原始 embedding、完整候选对象或 trace 诊断字段
- **AND** `providedExercises` MUST 保留模型判断是否可回复具体动作名所需的动作 ID、中文名、器械、肌群、风险和标签字段

#### Scenario: Workout draft model receives bounded candidates
- **WHEN** 系统请求模型生成或修复训练计划草稿
- **THEN** 训练候选 payload MUST 使用精简动作摘要
- **AND** 每类候选传入数量 MUST 有明确上限，避免把完整 RAG 候选池传给模型

#### Scenario: Full exercise data remains server-side
- **WHEN** 模型返回动作 ID 并生成动作推荐卡片或训练草稿
- **THEN** 系统 MUST 使用服务端完整动作对象补齐图片、英文名、展示字段、校验字段和持久化字段
- **AND** 模型 payload 精简 MUST NOT 改变 API 响应结构或用户可见卡片展示

