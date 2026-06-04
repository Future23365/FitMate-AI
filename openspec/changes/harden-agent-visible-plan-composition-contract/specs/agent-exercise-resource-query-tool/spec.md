## MODIFIED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界
系统 SHALL 在 tool manifest、schema 描述或 examples 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。模型可见说明 SHALL 表达该 tool 只提供发布态动作事实原料；当模型目标已经需要 `routine` 或 `plan` 时，该说明 MUST 引导模型基于缺失 section 继续查询动作事实，而不是把 tool result 当成最终训练方案或降级成纯动作推荐。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化条件的发布态动作列表
- **AND** 模型可见说明 MUST 表达高层身体区域应使用 `bodyRegions`
- **AND** 模型可见说明 MUST 表达 `muscle` 只用于动作库真实主肌群或辅助肌群 facet
- **AND** 模型可见说明 MUST 表达 `excludeExerciseIds` 只用于排除用户已看到或用户明确要求排除的动作 id
- **AND** 模型可见说明 MUST 表达“再推荐一批 / 换一批”应尽量基于当前 run 已恢复的用户可见动作事实填充排除 id
- **AND** 模型可见说明 MUST 表达未展示给用户的内部候选或未读取完整事实不得被默认排除
- **AND** 模型可见说明 MUST 表达它不适用于生成训练、保存结果、读取单个动作完整详情、解析唯一动作名、统计全库 facet 或构建 routine / plan / patch 候选集合
- **AND** 模型可见说明 MUST 表达成功且 `satisfied=true` 的结果可以通过 `usedToolResultIds` 支撑普通 `final_answer`
- **AND** 模型可见说明 MUST 表达 failed、非法输入或 `satisfied=false` 结果不能支撑成功动作推荐
- **AND** 模型可见说明 MUST 表达 `groups.<section>.exercises[*].exerciseId` 在 `fulfillment.satisfied = true` 时可作为 `visibleTrainingProposal.exerciseItems[*].exerciseId` 的受控事实来源
- **AND** 模型可见说明 MUST 表达最终训练输出只能由 `final_answer.visibleOutputs[]` 承载，`searchExerciseResources` 本身不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、训练卡片、保存结果或用户记忆
- **AND** 模型可见说明 MUST 表达当模型目标已经需要 `routine` 或 `plan`，且当前 run 只有 `training` 动作事实时，应优先使用 `suitabilities = ["warmup", "stretch"]` 或等价缺失 section 查询补齐热身和拉伸候选
- **AND** 模型可见说明 MUST 表达不得把 `groups.training` 中且 `allowedSections` 不包含 `warmup` / `stretch` 的动作写入 `warmup` 或 `stretch`
- **AND** 模型可见说明 MUST 表达不得因为当前只查到 `training` 动作事实就把 `routine` 或 `plan` 目标降级输出为 `payload.kind = "exercise_selection"`
- **AND** 模型可见说明 MUST 表达该继续查询边界只适用于模型已判断目标需要 `routine` 或 `plan` 的场景，不要求所有普通动作查询固定查询 `warmup` / `training` / `stretch`
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 `payload.kind` 选择规则
- **AND** 模型可见说明 MUST NOT 要求固定 tool 调用次数或固定 tool 调用顺序
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

## ADDED Requirements

### Requirement: `searchExerciseResources` 模型观察必须支持 plan 事实补齐决策
系统 SHALL 让 `searchExerciseResources` 的模型可见 observation 表达当前 tool result 已提供哪些 section 的动作事实、哪些 section 仍缺失，以及这些事实如何支撑 `routine` / `plan` 的后续组合。Observation MUST NOT 将 tool result 表达为最终 `visibleTrainingProposal`。

#### Scenario: Observation 表达 plan 组合所需事实缺口
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **AND** 本次结果只包含 `groups.training`
- **THEN** 模型可见 observation MUST 表达当前结果只提供 `training` 动作事实
- **AND** 模型可见 observation MUST 表达如果最终目标是 `routine` 或 `plan`，还需要当前 run 可消费的 `warmup` 和 `stretch` 动作事实
- **AND** 模型可见 observation MUST 表达可用 `suitabilities = ["warmup", "stretch"]` 或等价缺失 section 查询补齐候选
- **AND** 模型可见 observation MUST 表达不得把未返回的 section 伪造成已获得事实
- **AND** 模型可见 observation MUST 表达不得把本次 tool result 直接当作最终 `visibleTrainingProposal`

#### Scenario: Observation 不替模型做服务端语义分流
- **WHEN** `searchExerciseResources` 生成模型可见 observation
- **THEN** observation MUST 只表达事实来源、已返回 section、缺失 section 和可消费边界
- **AND** observation MUST NOT 根据用户原文关键词、正则、同义词表或短句模板替模型选择 `payload.kind`
- **AND** observation MUST NOT 要求所有请求固定调用 `searchExerciseResources`
- **AND** observation MUST NOT 要求普通动作推荐额外查询 `warmup` / `stretch`
