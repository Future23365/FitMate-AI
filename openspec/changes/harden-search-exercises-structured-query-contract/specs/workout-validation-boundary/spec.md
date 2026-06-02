## ADDED Requirements

### Requirement: Candidate set 查询边界属于确定性校验事实
服务端 SHALL 将已登记 candidate set 的结构化查询边界视为确定性事实来源。训练草稿或 patch 必须满足该边界，服务端不得重新读取用户自然语言判断该边界是否正确。

#### Scenario: 查询边界来自工具输入
- **WHEN** `searchExercises` 成功生成执行型 candidate set
- **THEN** candidate set 的结构化 filters 和 result requirements MUST 成为后续校验可读取的事实
- **AND** 服务端 MUST NOT 从用户原文、query 文本或标题重新推断额外 hard filter

#### Scenario: 草稿满足查询边界
- **WHEN** routine 或 plan 草稿中的所有动作都存在于动作库
- **AND** 所有动作都属于本轮候选集合
- **AND** 所有动作都满足 candidate set 查询边界
- **AND** 草稿满足 candidate set result requirements 或带有可恢复失败诊断
- **THEN** 服务端 MUST 继续执行其它结构、时长、训练量、禁忌和权限校验
- **AND** 查询边界本身 MUST NOT 阻止该草稿展示或保存

#### Scenario: 草稿违反查询边界
- **WHEN** routine 或 plan 草稿中的任一动作不满足 candidate set 查询边界
- **THEN** 服务端 MUST 将该问题作为 hard fail
- **AND** validation issue MUST 记录违反的 filter、exerciseId 和动作库对应元数据摘要
- **AND** 系统 MUST NOT 将该问题降级为训练合理性 warning

#### Scenario: 草稿未满足结果要求
- **WHEN** routine 或 plan 草稿使用的 candidate set 声明了 section 覆盖、最少候选数、唯一性、可用于 plan / routine / patch 或 proof 完整性等 result requirements
- **AND** 最终 draft 无法证明这些 result requirements 已满足
- **THEN** 服务端 MUST 将该问题作为 hard fail 或返回可恢复失败
- **AND** validation issue MUST 记录未满足的 result requirement 和相关 candidateSetId
- **AND** 系统 MUST NOT 只通过文案声称结果满足该要求

#### Scenario: Patch 违反查询边界
- **WHEN** workout patch 的 replacement 动作不满足 candidate set 查询边界
- **THEN** 服务端 MUST 将该问题作为 hard fail
- **AND** 系统 MUST NOT 保存该 patch

#### Scenario: 不从自然语言补充查询边界
- **WHEN** LLM 没有在 `searchExercises` 工具输入中传入某个结构化 hard filter
- **THEN** 服务端 MUST NOT 通过关键词、同义词、短句模板或 query 文本补出该 hard filter
- **AND** 如果执行型候选集合缺少必要结构化边界，系统 MUST 返回可恢复结构化失败或要求澄清

#### Scenario: 只消费已满足的上游资源
- **WHEN** validator 接收到 draftId、patchId、candidateSetId、policyDecisionId 或 artifactPayloadId
- **THEN** 服务端 MUST 验证这些资源来自当前 Agent run 或当前用户可访问范围
- **AND** 服务端 MUST 验证上游 tool result 已满足其 ToolRequest
- **AND** 服务端 MUST NOT 消费 `satisfied=false`、不可证明或失败 tool result 作为成功事实
