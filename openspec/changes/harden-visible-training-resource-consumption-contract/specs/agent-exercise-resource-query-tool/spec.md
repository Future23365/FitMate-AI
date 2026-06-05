## ADDED Requirements

### Requirement: `searchExerciseResources` 必须区分正向锚点和负向排除
`searchExerciseResources` 的模型可见合同 SHALL 清晰区分 `requiredExerciseIds` 与 `excludeExerciseIds`。`requiredExerciseIds` SHALL 表示受控动作 id 的正向查询锚点；`excludeExerciseIds` SHALL 表示替换、排除或避免重复的负向约束。系统 MUST NOT 将用户已看到或已导入动作默认解释为需要排除。

#### Scenario: requiredExerciseIds 是正向查询锚点
- **WHEN** Planner 已有当前 run 可见且受控的动作 id
- **THEN** Planner MAY 将这些 id 作为 `requiredExerciseIds` 调用 `searchExerciseResources`
- **AND** tool MUST 尝试让这些发布态动作进入对应 `groups.<section>.exercises`
- **AND** model observation MUST 表达这些结果只支撑实际返回的 section

#### Scenario: excludeExerciseIds 是负向约束
- **WHEN** Planner 判断当前目标是替换、排除或避免重复
- **THEN** Planner MAY 将当前 run 可见且用户已看到或明确要求排除的动作 id 作为 `excludeExerciseIds`
- **AND** model-visible schema description MUST 表达 `excludeExerciseIds` 不适用于保留、复用、派生或调整已有动作的目标
- **AND** handler MUST NOT 从历史事实、自然语言摘要或内部候选自动填充 `excludeExerciseIds`

#### Scenario: 已导入动作不默认排除
- **WHEN** 当前 run 已通过 read/import tool 导入上一轮可见训练事实
- **THEN** `searchExerciseResources` manifest MUST NOT 表达导入动作默认应进入 `excludeExerciseIds`
- **AND** observation MUST 表达是否排除由 Planner 基于用户目标和资源操作类型判断
- **AND** `/api/chat` 和 tool handler MUST NOT 根据用户原文替 Planner 填写排除列表

### Requirement: `searchExerciseResources` observation 必须表达 section-scoped 动作事实边界
`searchExerciseResources` 的模型可见 observation SHALL 表达动作事实只覆盖实际返回的 `groups.<section>`。若最终结构需要未返回的 section，Planner MUST 继续获取缺失事实、澄清、失败收口或输出当前事实可支撑的结构。

#### Scenario: training-only 查询只支撑 training
- **WHEN** `searchExerciseResources` 只返回 `groups.training`
- **THEN** model observation MUST 表达 `availableSections = ["training"]` 或等价信息
- **AND** model observation MUST 表达生成 `routine` 或 `plan` 仍缺少 `warmup` 和 `stretch`
- **AND** model observation MUST 表达不得把 `groups.training` 中且 `allowedSections` 不包含 `warmup` 或 `stretch` 的动作写入这些 section

#### Scenario: 补齐 section 不固定调用顺序
- **WHEN** `searchExerciseResources` observation 表达存在缺失 section
- **THEN** observation MUST 表达可恢复方向包括继续查询缺失 section、澄清、失败收口或输出当前事实可支撑结构
- **AND** observation MUST NOT 表达成固定必须调用某个 tool、固定调用次数或固定调用顺序

#### Scenario: Query result 不等于最终训练方案
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** model observation MUST 表达该 tool 只提供动作事实原料
- **AND** model observation MUST 表达 `prescription`、`schedule` 和最终 `payload.kind` 不是该 tool 的输出事实
- **AND** model observation MUST 表达最终训练结构仍必须由 `final_answer.visibleOutputs[]` 承载
