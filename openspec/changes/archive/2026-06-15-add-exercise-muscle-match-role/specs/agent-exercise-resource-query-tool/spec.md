## ADDED Requirements

### Requirement: `searchExerciseResources` 必须支持肌群匹配角色
系统 SHALL 为 `searchExerciseResources` 提供结构化输入字段 `muscleMatchRole`，用于区分目标肌群主练匹配和主/辅任意参与匹配。`muscleMatchRole` MUST 支持 `primary` 和 `any` 两个值。未显式指定 `muscleMatchRole` 时，系统 MUST 使用 `primary` 作为默认值。

#### Scenario: 默认肌群匹配只使用主肌群字段
- **WHEN** 模型调用 `searchExerciseResources` 并传入 `muscles` 但没有传入 `muscleMatchRole`
- **THEN** 系统 MUST 按 `muscleMatchRole = "primary"` 执行查询
- **AND** 查询 MUST 只匹配 `primaryMuscles` 和 `primaryMusclesZh`
- **AND** 查询 MUST NOT 因 `secondaryMuscles` 或 `secondaryMusclesZh` 命中而返回候选
- **AND** tool result 的模型可见 summary、用户投影和 trace summary MUST 表达当前 `muscleMatchRole` 为 `primary`

#### Scenario: 显式 any 匹配主肌群和辅助肌群
- **WHEN** 模型调用 `searchExerciseResources` 并传入 `muscleMatchRole = "any"`
- **THEN** 查询 MUST 匹配 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles` 和 `secondaryMusclesZh`
- **AND** tool result 的模型可见 summary、用户投影和 trace summary MUST 表达当前 `muscleMatchRole` 为 `any`
- **AND** 该结果 MUST 仍然被标记为候选事实，不得被描述为最终推荐清单

#### Scenario: 非法肌群匹配角色被 schema 拒绝
- **WHEN** 模型调用 `searchExerciseResources` 并传入非 `primary` 或 `any` 的 `muscleMatchRole`
- **THEN** LangChain tool wrapper MUST 在执行 repository 查询前拒绝该输入
- **AND** 失败反馈 MUST 描述 schema 枚举错误
- **AND** 系统 MUST NOT 回退到辅助肌群匹配或其它隐式匹配口径

### Requirement: `muscleMatchRole` 模型可见说明必须表达输入来源和用途边界
系统 SHALL 在 `searchExerciseResources` 的 tool description 和 schema description 中说明 `muscleMatchRole` 的语义、默认值、输入来源和下游使用边界。说明 MUST 使用中文解释业务含义，并保留字段名和枚举值英文原样。

#### Scenario: description 说明目标肌群推荐默认 primary
- **WHEN** production registry 序列化 `searchExerciseResources` description 或 schema description
- **THEN** 模型可见说明 MUST 表达目标肌群动作推荐、训练动作筛选和结构化训练结果候选默认使用 `muscleMatchRole = "primary"`
- **AND** 模型可见说明 MUST 表达 `primary` 表示请求肌群是动作主练目标
- **AND** 模型可见说明 MUST NOT 要求模型通过用户短句、关键词、正则、同义词或具体 phrasing 判断该字段

#### Scenario: description 说明宽泛参与查询使用 any
- **WHEN** production registry 序列化 `searchExerciseResources` description 或 schema description
- **THEN** 模型可见说明 MUST 表达 `muscleMatchRole = "any"` 用于查询肌群是否参与、动作会带到哪些肌群、辅助刺激、稳定参与或宽泛相关动作
- **AND** 模型可见说明 MUST 表达 `any` 不代表候选动作都同等适合作为目标肌群主练推荐
- **AND** 模型可见说明 MUST NOT 把 `any` 作为目标肌群推荐的默认值

#### Scenario: summary 回填匹配角色以支撑停止查询
- **WHEN** `searchExerciseResources` 返回成功 candidate result
- **THEN** 模型可见 summary MUST 包含当前查询口径中的 `muscleMatchRole`
- **AND** 模型可见 summary MUST 继续表达 candidate result 是候选事实，不是最终推荐清单
- **AND** 模型可见 summary MUST NOT 表达模型必须扩大 `candidateCountPerSection` 或重复调用同一查询 tool 才能移除未选候选

### Requirement: 辅助肌群能力不得被删除
系统 SHALL 保留辅助肌群查询能力，使模型在需要查询肌群参与、动作辅助刺激或宽泛相关动作时可以显式使用 `muscleMatchRole = "any"`。系统 MUST NOT 删除 `secondaryMuscles` 或 `secondaryMusclesZh` 数据，也 MUST NOT 将主练肌群压缩为单值字段来替代现有数组字段。

#### Scenario: 主练推荐不返回辅助命中候选
- **WHEN** 数据库中存在一个动作的 `primaryMusclesZh` 为 `["胸部"]` 且 `secondaryMusclesZh` 包含 `"腹肌"`
- **AND** 模型调用 `searchExerciseResources` 并传入 `muscles = ["腹肌"]` 且未传入 `muscleMatchRole`
- **THEN** 该动作 MUST NOT 因辅助肌群命中进入候选结果

#### Scenario: 宽泛参与查询可以返回辅助命中候选
- **WHEN** 数据库中存在一个动作的 `primaryMusclesZh` 为 `["胸部"]` 且 `secondaryMusclesZh` 包含 `"腹肌"`
- **AND** 模型调用 `searchExerciseResources` 并传入 `muscles = ["腹肌"]` 和 `muscleMatchRole = "any"`
- **THEN** 该动作 MAY 因辅助肌群命中进入候选结果
- **AND** 输出 MUST 保留该动作的 `primaryMusclesZh` 和 `secondaryMusclesZh`，让模型可见它不是腹肌主练动作
