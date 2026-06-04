## ADDED Requirements

### Requirement: 业务 tool 模型可见说明必须区分事实查询和候选消费
系统 SHALL 要求修改业务 Agent tool 模型可见说明时，明确区分只读事实查询结果、失败或 diagnostic 结果，以及下游候选消费资源。

#### Scenario: 0 条事实查询说明
- **WHEN** 后续 change 修改 `searchExerciseResources` 或等价只读查询 tool 的 manifest、schema description、examples、observation 或 compressed tool result
- **THEN** 模型可见说明 MUST 明确合法查询返回 `totalMatches = 0` 是事实结果，不是数据库失败
- **AND** 模型可见说明 MUST 明确 `ok = true && fulfillment.satisfied = true` 的 0 条事实查询可以通过 `final_answer.usedToolResultIds` 支撑“没有找到”类普通文本回答
- **AND** 模型可见说明 MUST 明确该结果不等于 routine、plan、训练卡片或候选消费资源

#### Scenario: 不把业务语义分流写入服务端规则
- **WHEN** 业务 tool 的模型可见说明需要解释存在性查询、可用性查询、推荐请求或空结果处理
- **THEN** 实现 MUST NOT 新增服务端关键词、正则、同义词表、短句模板或基于用户原文的语义改写
- **AND** 实现 MUST 将自然语言解释交给 Planner，并通过结构化 output、observation、repair feedback 或澄清边界提供事实依据
- **AND** 通用 Agent prompt MUST NOT 新增单个业务 tool 的自然语言路由特例

### Requirement: 0 条事实查询 observation 必须可用于 repair
系统 SHALL 要求 0 条事实查询相关 observation 和 repair feedback 保留足够结构化信息，使模型能够从非法引用、重复调用或错误理解中恢复。

#### Scenario: Repair 轮可见合法收口方式
- **WHEN** Planner 因引用不可用 tool result、非法 input 或其他可恢复错误进入 repair
- **AND** 当前 run 存在 `ok = true && fulfillment.satisfied = true && totalMatches = 0` 的事实查询结果
- **THEN** repair / observation 内容 MUST 保留该 `toolResultId`、`totalMatches`、`returnedCount`、`appliedFilters` 和 grounding 说明
- **AND** 模型可见内容 MUST 说明可以基于该事实输出合法 `final_answer`，但不能将空 `exercises` 当作候选消费资源
