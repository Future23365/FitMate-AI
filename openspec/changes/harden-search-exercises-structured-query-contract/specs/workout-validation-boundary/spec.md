## ADDED Requirements

### Requirement: Candidate set 查询边界属于确定性校验事实
服务端 SHALL 将已登记 candidate set 的结构化查询边界视为确定性事实来源。训练草稿或 patch 必须满足该边界，服务端不得重新读取用户自然语言判断该边界是否正确。

#### Scenario: 查询边界来自工具输入
- **WHEN** `searchExercises` 成功生成执行型 candidate set
- **THEN** candidate set 的结构化 filters MUST 成为后续校验可读取的事实
- **AND** 服务端 MUST NOT 从用户原文、query 文本或标题重新推断额外 hard filter

#### Scenario: 草稿满足查询边界
- **WHEN** routine 或 plan 草稿中的所有动作都存在于动作库
- **AND** 所有动作都属于本轮候选集合
- **AND** 所有动作都满足 candidate set 查询边界
- **THEN** 服务端 MUST 继续执行其它结构、时长、训练量、禁忌和权限校验
- **AND** 查询边界本身 MUST NOT 阻止该草稿展示或保存

#### Scenario: 草稿违反查询边界
- **WHEN** routine 或 plan 草稿中的任一动作不满足 candidate set 查询边界
- **THEN** 服务端 MUST 将该问题作为 hard fail
- **AND** validation issue MUST 记录违反的 filter、exerciseId 和动作库对应元数据摘要
- **AND** 系统 MUST NOT 将该问题降级为训练合理性 warning

#### Scenario: Patch 违反查询边界
- **WHEN** workout patch 的 replacement 动作不满足 candidate set 查询边界
- **THEN** 服务端 MUST 将该问题作为 hard fail
- **AND** 系统 MUST NOT 保存该 patch

#### Scenario: 不从自然语言补充查询边界
- **WHEN** LLM 没有在 `searchExercises` 工具输入中传入某个结构化 hard filter
- **THEN** 服务端 MUST NOT 通过关键词、同义词、短句模板或 query 文本补出该 hard filter
- **AND** 如果执行型候选集合缺少必要结构化边界，系统 MUST 返回可恢复结构化失败或要求澄清
