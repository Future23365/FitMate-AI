## MODIFIED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界
系统 SHALL 在 tool manifest、schema 描述、examples 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 提供发布态动作事实原料，而不是最终训练方案生成器。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化条件的发布态动作列表
- **AND** 模型可见说明 MUST 表达高层身体区域应使用 `bodyRegions`
- **AND** 模型可见说明 MUST 表达 `muscle` 只用于动作库真实主肌群或辅助肌群 facet
- **AND** 模型可见说明 MUST 表达 `excludeExerciseIds` 只用于排除用户已看到或用户明确要求排除的动作 id
- **AND** 模型可见说明 MUST 表达“再推荐一批 / 换一批”应尽量基于当前 run 已恢复的用户可见动作事实填充排除 id
- **AND** 模型可见说明 MUST 表达未展示给用户的内部候选或未读取完整事实不得被默认排除
- **AND** 模型可见说明 MUST 表达该 tool 返回的 `groups.<section>.exercises[*].exerciseId` 在 `fulfillment.satisfied = true` 时可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的受控动作事实来源
- **AND** 模型可见说明 MUST 表达该 tool 本身不生成最终 `visibleTrainingProposal`、`routine`、`plan`、`patch`、`prescription`、`schedule`、训练卡片、保存结果或用户记忆
- **AND** 模型可见说明 MUST 表达最终训练输出只能由 `final_answer.visibleOutputs[]` 承载
- **AND** 模型可见说明 MUST 表达 failed、非法输入或 `satisfied=false` 结果不能支撑成功动作推荐或训练方案
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 `payload.kind` 选择规则
- **AND** 模型可见说明 MUST NOT 要求固定 tool 调用次数或固定 tool 调用顺序
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

## ADDED Requirements

### Requirement: `searchExerciseResources` 模型观察必须表达动作事实可组合边界
系统 SHALL 让 `searchExerciseResources` 的模型可见 observation 表达当前 tool result 提供了哪些动作事实、这些事实可如何被最终输出引用，以及哪些字段不是 tool result 自带的最终训练结构。

#### Scenario: Observation 表达可用动作事实
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 表达当前结果提供动作事实原料
- **AND** 模型可见 observation MUST 表达 `groups.<section>.exercises[*].exerciseId` 可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的事实来源
- **AND** 模型可见 observation MUST 表达当前结果只覆盖实际返回的 section
- **AND** 模型可见 observation MUST NOT 将 tool result 表达为已经生成的最终 `visibleTrainingProposal`

#### Scenario: Observation 表达结构缺口
- **WHEN** 模型可见 observation 描述 `searchExerciseResources` 的结果边界
- **THEN** observation MUST 表达 `prescription`、`schedule` 和最终 `payload.kind` 不是该 tool 的输出事实
- **AND** observation MUST 表达如果模型选择输出的最终结构需要当前 observation 未提供的 section 或字段，模型应基于可见事实自主决定继续调用 tool、澄清或输出当前事实可支撑的结构
- **AND** observation MUST NOT 要求模型按照固定调用顺序继续调用 tool

### Requirement: `searchExerciseResources` examples 必须展示查询能力而非意图分类
系统 SHALL 将 `searchExerciseResources` examples 限定为合法结构化查询输入示例，避免把 examples 变成自然语言意图到输出结构的固定映射。

#### Scenario: Examples 只描述 tool 输入
- **WHEN** Agent 序列化 `searchExerciseResources` examples 给 Planner
- **THEN** examples MUST 展示如何填写结构化查询字段，例如 `suitabilities`、`equipment`、`homeRequirement`、`level`、`bodyRegions`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **AND** examples MUST 使用符合当前 schema 的 input
- **AND** examples MUST NOT 说明用户出现某个固定短语时必须选择某个 `visibleTrainingProposal.payload.kind`
- **AND** examples MUST NOT 承诺 tool 自己会生成最终训练方案、处方、日程或保存结果
