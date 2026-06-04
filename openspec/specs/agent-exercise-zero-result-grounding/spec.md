# agent-exercise-zero-result-grounding Specification

## Purpose
TBD - created by archiving change fix-search-exercise-zero-result-grounding. Update Purpose after archive.
## Requirements
### Requirement: `searchExerciseResources` 0 条结果必须是可引用事实查询结果
系统 SHALL 将 `searchExerciseResources` 的合法 0 条查询结果视为已完成的只读事实查询，而不是数据库失败、工具失败或服务端语义失败。

#### Scenario: 发布态动作库未命中
- **WHEN** `searchExerciseResources` 使用合法 input 完成查询
- **AND** output 包含 `status = "succeeded"`、`query.totalMatches = 0`、`query.returnedCount = 0` 和 `exercises = []`
- **THEN** tool result MUST 保持 `ok = true`
- **AND** fulfillment MUST 表示 `satisfied = true`
- **AND** fulfillment summary MUST 表达查询已完成但当前发布态动作库没有匹配结果
- **AND** 模型 MAY 使用该 tool result 的 `toolResultId` 支撑说明“没有找到符合条件动作”的普通 `final_answer`

#### Scenario: 排除已展示动作后没有更多结果
- **WHEN** `searchExerciseResources` 使用合法 input 完成查询
- **AND** input 包含 `excludeExerciseIds`
- **AND** output 包含 `query.totalMatches = 0` 和 `query.excludedCount > 0`
- **THEN** fulfillment MUST 表示 `satisfied = true`
- **AND** fulfillment summary MUST 表达查询已完成但排除用户已看到动作后没有更多匹配结果
- **AND** 模型 MAY 基于该事实回答没有更多未重复动作，或询问是否放宽条件

### Requirement: `searchExerciseResources` 不得替模型判断用户语义
系统 SHALL 保持 `searchExerciseResources` 为结构化事实查询 tool，不得根据用户原文、关键词、短句模板或同义词表判断用户是在做存在性查询、可用性查询或推荐请求。

#### Scenario: 不新增语义目的字段
- **WHEN** 本 change 修改 `searchExerciseResources` input schema 或 handler
- **THEN** input schema MUST NOT 新增 `purpose`、`queryIntent`、`candidateUse`、`existenceCheck`、`recommendationMode` 或等价语义目的字段
- **AND** handler MUST NOT 根据用户原文判断“有没有”“推荐”“可用”或等价自然语言意图
- **AND** 服务端 MUST 只根据模型提供的结构化筛选字段执行确定性动作库查询

#### Scenario: 模型负责解释 0 条事实
- **WHEN** Planner 看到 `searchExerciseResources` 的 0 条成功查询 observation
- **THEN** 模型 MUST 负责决定输出 `final_answer`、`ask_user` 或合法的后续 `tool_call`
- **AND** 服务端 MUST NOT 根据 `totalMatches = 0` 直接改写为固定用户回复
- **AND** 服务端 MUST NOT 根据用户原文将该 action 改写成其他语义 action

### Requirement: 下游候选消费必须独立校验空候选
系统 SHALL 将动作库事实查询与候选消费校验分离。`searchExerciseResources` 的空结果可以支撑事实回答，但不能自动满足 routine、plan、训练卡片或候选消费需求。

#### Scenario: 查询 tool 不产出候选消费资源
- **WHEN** `searchExerciseResources` 执行成功且 `exercises = []`
- **THEN** tool result MUST NOT 产出 `candidate_set`、routine draft、plan draft、训练卡片、保存事件或等价候选消费资源
- **AND** Response Renderer MUST NOT 将该结果投影为训练生成成功事件
- **AND** 后续生成类工具 MUST NOT 把空 `exercises` 当作已满足的动作候选集合

#### Scenario: 需要候选的下游工具拒绝空候选
- **WHEN** routine、plan、recommendation 或等价下游消费方需要至少一个动作候选
- **AND** 当前可消费候选为空
- **THEN** 下游消费方 MUST 返回候选不足、需要澄清或失败的结构化结果
- **AND** 下游消费方 MUST NOT 因为上游 `searchExerciseResources` 查询成功而跳过候选数量和适用性校验

### Requirement: 0 条查询 observation 必须给模型清晰 grounding 说明
系统 SHALL 在 `searchExerciseResources` 的模型可见 observation 中清晰表达 `totalMatches`、`returnedCount`、`exercises` 和 final grounding 语义，避免模型把 0 条事实误解成不可引用失败。

#### Scenario: 0 条 observation 可读
- **WHEN** `searchExerciseResources` 返回 0 条成功查询结果
- **THEN** 模型可见 observation MUST 包含 `totalMatches = 0`、`returnedCount = 0`、`exercises = []` 和 `appliedFilters`
- **AND** 模型可见 observation MUST 说明本次查询事实可以通过 `final_answer.usedToolResultIds` 引用
- **AND** 模型可见 observation MUST 说明该结果不是 routine、plan、训练卡片或候选消费资源
- **AND** 模型可见 observation MUST NOT 暴露完整 handler output、数据库对象或未返回候选

