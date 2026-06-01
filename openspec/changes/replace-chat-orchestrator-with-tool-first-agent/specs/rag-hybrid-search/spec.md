## ADDED Requirements

### Requirement: Agent 检索工具必须使用结构化过滤参数

系统 SHALL 要求 Agent 通过结构化参数调用 artifact 和 exercise 检索工具。用户原始消息 MAY 作为辅助语义 query，但 MUST NOT 成为唯一检索输入。

#### Scenario: 搜索动作
- **WHEN** Agent 调用 `searchExercises` 或等价动作检索工具
- **THEN** 工具输入 MUST 支持 `goal`、`targetMuscles`、`equipmentRequired`、`equipmentAvoided`、`location`、`level`、`sessionMinutes`、`preferences` 和 `avoidances` 等结构化字段
- **AND** 服务端 MUST 先执行结构化硬过滤，再执行全文、向量或语义 rerank
- **AND** 返回给 LLM 的 exerciseId MUST 来自数据库
- **AND** 工具 MUST 返回 `candidateSetId`，供后续 draft、Patch 或保存工具引用

#### Scenario: 搜索 artifact
- **WHEN** Agent 调用 `searchArtifacts`
- **THEN** 工具输入 MUST 支持 `kind`、`sessionScope`、`targetGoal`、`equipmentRequired`、`equipmentAvoided`、`sessionMinutes` 和 `query` 等结构化字段
- **AND** 搜索 MUST 按当前 `userId`、status、scope 和 session 边界过滤
- **AND** LLM MUST NOT 选择候选集合之外的 artifactId
- **AND** 工具 MUST 返回 `candidateSetId` 或等价结果 id，供后续 payload 读取和 edit plan 引用

#### Scenario: 用户表达否定约束
- **WHEN** 用户表达不用某器械、不要某动作类型、避免某偏好或等价否定条件
- **THEN** Agent MUST 将该条件传入结构化 `equipmentAvoided`、`avoidances` 或等价字段
- **AND** 搜索工具 MUST NOT 把被否定词作为正向匹配加分依据

#### Scenario: 只有原始自然语言 query
- **WHEN** Agent 调用检索工具时只提供用户原始消息或裸 query
- **THEN** 工具 MUST 拒绝用于可执行动作推荐、Patch、routine 或 plan 的候选集合
- **AND** Agent MUST 补充结构化字段、读取更多上下文或进入澄清
- **AND** 系统 MUST NOT 用裸 query 检索结果触发写入或训练卡片

#### Scenario: 候选集合过期或不匹配
- **WHEN** 后续工具引用 candidateSetId
- **THEN** 系统 MUST 校验 candidateSetId 属于当前 run、当前 userId、当前目标和未过期状态
- **AND** 系统 MUST 拒绝候选集合外的 exerciseId 或 artifactId
