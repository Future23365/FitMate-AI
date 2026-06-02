## ADDED Requirements

### Requirement: Routine 候选搜索不得被泛化 query 硬清零

聊天 routine / plan 编排链路 SHALL 以结构化动作候选边界作为可执行候选集事实来源。当 `searchExercises` 请求用于 routine 或 plan 生成，并且已经提供结构化候选边界时，系统不得因为泛化 `query` 的 hybrid 召回未命中而丢弃全部结构化候选。

#### Scenario: Routine 搜索带泛化 query 和结构化边界
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse` 为 `routine`
- **AND** 输入包含 `bodyRegions`、`equipmentRequired` 或 `allowedSections` 等结构化边界
- **AND** 输入同时包含类似 `上肢训练` 的泛化 `query`
- **THEN** 服务端 MUST 先按结构化边界执行 hard filters
- **AND** 服务端 MUST NOT 要求该泛化 `query` 在单个动作文本或向量召回中命中后才保留候选
- **AND** 若 hard filters 后存在可用候选，系统 MUST 返回候选集合并允许 Agent 继续调用 `generateRoutineDraft`

#### Scenario: Recommendation 搜索仍保留 query 召回约束
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse` 为 `recommendation`
- **AND** 输入包含自然语言 `query`
- **THEN** 服务端 MAY 继续使用 query hybrid match 约束候选召回
- **AND** 系统 MUST NOT 因 routine / plan 的放宽规则改变 recommendation 搜索语义
