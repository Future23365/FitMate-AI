## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见成功摘要必须表达候选事实覆盖边界
系统 SHALL 在 `searchExerciseResources` 成功执行后，为模型可见 observation 提供候选事实覆盖摘要。该摘要 MUST 表达当前查询实际返回了哪些 section 的动作候选、哪些请求 section 没有候选、当前结果是否包含可供模型自主组合的动作候选，以及同一 run 内等价 input 重复查询不会产生新增候选事实。该摘要 MUST NOT 表达用户业务目标已经满足，也 MUST NOT 指挥模型调用某个下一步 tool 或按固定 workflow 收口。

#### Scenario: 成功结果表达可用 section 覆盖
- **WHEN** `searchExerciseResources` 成功执行并返回 `candidateGroups[]`
- **THEN** Planner-visible observation MUST 表达 `candidateGroups[]` 是当前查询口径下的数据库动作候选事实
- **AND** Planner-visible observation MUST 表达实际存在候选动作的 section 列表
- **AND** Planner-visible observation MUST 表达请求了但没有返回候选动作的 section 列表
- **AND** Planner-visible observation MUST 表达该结果不是 `visibleTrainingProposal`、routine、plan、处方、日程或保存结果

#### Scenario: 覆盖摘要不承担业务目标满足度
- **WHEN** `searchExerciseResources` 的 Planner-visible observation 表达候选覆盖
- **THEN** observation MUST NOT 包含 `satisfied`、`fulfillment`、`supportsOutputKinds`、`finalAnswerSupport`、`nextActionHints` 或等价业务目标满足度 / 下一步指令字段
- **AND** observation MUST NOT 声称当前候选已经完成用户训练计划、已经生成训练卡片或已经通过最终结构化 validator
- **AND** observation MUST NOT 要求模型必须继续调用 `searchExerciseResources`
- **AND** observation MUST NOT 要求模型必须继续调用 `submitVisibleTrainingProposal`

#### Scenario: 重复查询边界表达为事实而非编排
- **WHEN** `searchExerciseResources` 成功执行并进入下一轮 Planner 输入
- **THEN** Planner-visible observation MAY 表达同一 run 内等价 input 重复查询不会产生新增候选事实
- **AND** 该表达 MUST 允许模型基于当前可见候选事实自主继续推理、澄清或合法失败收口
- **AND** 该表达 MUST NOT 根据用户原文、具体业务目标、具体 toolName 组合或固定 section 指导模型调用某个下一步 tool

### Requirement: `searchExerciseResources` 模型可见说明必须解释候选覆盖摘要
系统 SHALL 在 `searchExerciseResources` 的 tool description 或 schema description 中解释候选覆盖摘要的含义。说明 MUST 表达该 tool 只查询动作库候选事实；覆盖摘要只说明本次查询事实覆盖，不是最终训练方案、训练卡片或用户目标满足度。

#### Scenario: Description 解释覆盖摘要边界
- **WHEN** production registry 序列化 `searchExerciseResources` tool description
- **THEN** description MUST 使用中文表达 `candidateGroups[]` 是查询结果候选事实
- **AND** description MUST 表达覆盖摘要只说明当前查询返回了哪些 section 候选和缺少哪些 section 候选
- **AND** description MUST 表达重复等价 input 查询不会补充新事实
- **AND** description MUST NOT 把覆盖摘要描述为固定训练生成 workflow、最终结构化收口指令或用户目标满足度判断
