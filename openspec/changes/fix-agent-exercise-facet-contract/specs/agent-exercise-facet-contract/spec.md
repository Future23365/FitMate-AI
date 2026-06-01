## ADDED Requirements

### Requirement: Agent 动作检索必须使用受控 facet 合同
Agent 通过 `searchExercises` 检索动作候选时，系统 SHALL 区分动作库真实 facet 和高层身体区域，不得要求模型把高层范围词写入精确肌群字段。

#### Scenario: 用户表达高层身体区域
- **WHEN** 用户请求“上肢”“下肢”“核心”或“全身”训练
- **THEN** Agent MUST 使用 `bodyRegions` 表达高层身体区域
- **AND** Agent MUST NOT 将 `upper body`、`lower body`、`full body` 或等价范围词写入 `targetMuscles`

#### Scenario: 用户表达具体肌群
- **WHEN** 用户明确请求胸部、肩部、背部、肱二头肌、臀部、腿部或腹部等具体训练重点
- **THEN** Agent MAY 使用动作库真实 `targetMuscles` facet
- **AND** `targetMuscles` MUST 使用动作库中存在的肌群字段值

#### Scenario: 用户表达器械
- **WHEN** 用户提供可用器械
- **THEN** Agent MUST 使用动作库真实 `equipment` 或 `equipmentRequired` facet
- **AND** Agent MUST NOT 使用动作库不存在的自由文本器械值作为 hard filter

### Requirement: 服务端必须确定性执行 bodyRegions
服务端 SHALL 只根据结构化 `bodyRegions` 枚举展开动作库真实肌群 facet，不得读取用户自然语言原文做语义重解释。

#### Scenario: bodyRegions 包含 upper_body
- **WHEN** `searchExercises` 输入包含 `bodyRegions = ["upper_body"]`
- **THEN** 服务端 MUST 将其展开为动作库真实上肢肌群 facet
- **AND** 动作检索 MUST 能命中符合器械和 section 条件的上肢动作候选

#### Scenario: bodyRegions 与 targetMuscles 同时存在
- **WHEN** `searchExercises` 输入同时包含 `bodyRegions` 和 `targetMuscles`
- **THEN** 服务端 MUST 合并两者对应的真实肌群 facet 作为候选召回范围
- **AND** 服务端 MUST 保留原始输入和展开结果到 diagnostics 或 trace 摘要中

#### Scenario: 服务端执行区域映射
- **WHEN** 服务端展开 `bodyRegions`
- **THEN** 展开函数 MUST 只接收结构化枚举字段
- **AND** 展开函数 MUST NOT 接收 latest user message、conversationSummary 或其他自然语言文本作为输入

### Requirement: 动作空候选必须返回可恢复诊断
`searchExercises` 无法返回候选时，系统 SHALL 返回结构化诊断，说明是否可以 retry、哪些 facet 未匹配，以及可用于 retry 的候选 facet。

#### Scenario: targetMuscles 使用未知 facet
- **WHEN** `searchExercises` 输入包含动作库不存在的 `targetMuscles`
- **AND** 检索结果为空
- **THEN** 工具失败详情 MUST 包含 `unmatchedTargetMuscles`
- **AND** 工具失败详情 MUST 包含可用于下一次查询的 `suggestedTargetMuscles`
- **AND** 工具失败详情 MUST 标记该失败为可恢复

#### Scenario: equipment 使用未知 facet
- **WHEN** `searchExercises` 输入包含动作库不存在的器械 facet
- **AND** 检索结果为空
- **THEN** 工具失败详情 MUST 包含 `unmatchedEquipment`
- **AND** 工具失败详情 MUST 包含可用于下一次查询的 `suggestedEquipment`
- **AND** 工具失败详情 MUST 标记该失败为可恢复

#### Scenario: retry 后仍无候选
- **WHEN** Agent 已基于可恢复诊断重新调用 `searchExercises`
- **AND** 动作库仍无可用候选
- **THEN** Agent MAY 返回 `blocked`
- **AND** 用户可见回复 MUST 基于结构化失败原因说明当前无法生成

### Requirement: Agent 必须优先恢复可修正的动作检索失败
Agent 在生成 routine、plan 或 patch 所需候选时，系统 SHALL 对可恢复的 `searchExercises` 失败先重查，而不是立即结束为 `blocked`。

#### Scenario: routine 候选首次检索因未知 facet 失败
- **WHEN** 用户请求生成单次 routine
- **AND** 第一次 `searchExercises` 返回可恢复的未知 facet 诊断
- **THEN** Agent MUST 基于诊断重新调用 `searchExercises`
- **AND** Agent MUST NOT 在第一次可恢复失败后直接返回 `blocked`

#### Scenario: 重查获得候选
- **WHEN** Agent 重查 `searchExercises` 后获得候选集合
- **THEN** Agent MUST 继续调用 routine 或 plan 生成工具
- **AND** 后续 draft MUST 引用本轮成功的 `candidateSetId`
