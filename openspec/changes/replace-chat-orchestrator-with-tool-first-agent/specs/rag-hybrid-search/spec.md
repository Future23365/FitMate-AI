## ADDED Requirements

### Requirement: Agent 检索工具必须使用结构化过滤参数

系统 SHALL 要求 Agent 通过结构化参数调用 artifact 和 exercise 检索工具。用户原始消息 MAY 作为辅助语义 query，但 MUST NOT 成为唯一检索输入。

#### Scenario: 搜索动作
- **WHEN** Agent 调用 `searchExercises` 或等价动作检索工具
- **THEN** 工具输入 MUST 支持 `goal`、`targetMuscles`、`equipmentRequired`、`equipmentAvoided`、`location`、`level`、`sessionMinutes`、`preferences` 和 `avoidances` 等结构化字段
- **AND** 服务端 MUST 先执行结构化硬过滤，再执行全文、向量或语义 rerank
- **AND** 返回给 LLM 的 exerciseId MUST 来自数据库

#### Scenario: 搜索 artifact
- **WHEN** Agent 调用 `searchArtifacts`
- **THEN** 工具输入 MUST 支持 `kind`、`sessionScope`、`targetGoal`、`equipmentRequired`、`equipmentAvoided`、`sessionMinutes` 和 `query` 等结构化字段
- **AND** 搜索 MUST 按当前 `userId`、status、scope 和 session 边界过滤
- **AND** LLM MUST NOT 选择候选集合之外的 artifactId

#### Scenario: 用户表达否定约束
- **WHEN** 用户表达不用某器械、不要某动作类型、避免某偏好或等价否定条件
- **THEN** Agent MUST 将该条件传入结构化 `equipmentAvoided`、`avoidances` 或等价字段
- **AND** 搜索工具 MUST NOT 把被否定词作为正向匹配加分依据

