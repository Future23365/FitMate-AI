## ADDED Requirements

### Requirement: 动作刷新 read/import 成功后必须表达当前 run 状态迁移
系统 SHALL 确保 `readRecentExerciseRecommendationFact` 或等价动作事实 read/import tool 的模型可见合同表达“由 Planner 判断是否需要读取历史 fact”，并在成功读取后明确该 fact 已导入当前 run，后续应基于既有结果继续查询或收口，而不是再次读取同一 fact。

#### Scenario: read/import 使用条件由 Planner 判断
- **WHEN** 系统构造 `readRecentExerciseRecommendationFact` 的 tool manifest、schema 描述或 examples
- **THEN** 模型可见合同 MUST 说明该 tool 只是在 Planner 判断需要复用当前 run metadata 中真实 recent fact 时才可考虑使用
- **AND** 模型可见合同 MUST NOT 表达成用户说出“换一个”“换一批”“再推荐一批”或类似自然语言时必须调用该 tool
- **AND** `factRef` 或 `messageId` MUST 只能从当前 `run.metadata.recentExerciseRecommendationFacts` 中复制
- **AND** 服务端 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板选择该 tool

#### Scenario: 成功 read/import observation 说明不要重复读取同一 fact
- **WHEN** `readRecentExerciseRecommendationFact` 成功读取某个 `factRef`
- **THEN** Planner 可见 observation MUST 说明该 fact 已经成功导入当前 run
- **AND** observation MUST 说明后续不要再次调用同一 `factRef` 的 read/import tool
- **AND** observation MUST 提供后续决策需要的安全摘要，例如 `displayedExerciseIds` 和必要筛选摘要
- **AND** observation MUST 说明 Planner 可以使用 `displayedExerciseIds` 作为 `searchExerciseResources.excludeExerciseIds` 查询新动作，或基于既有结果输出 `final_answer` / `ask_user`

#### Scenario: read/import observation 不回灌完整事实 payload
- **WHEN** `readRecentExerciseRecommendationFact` 成功读取上一轮动作推荐事实
- **THEN** Planner 可见 observation MUST NOT 暴露完整 `displayedExercises`
- **AND** observation MUST NOT 暴露完整 `query`
- **AND** observation MUST NOT 暴露 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize` 等 output-only 或分页控制字段
- **AND** 原始完整事实 MAY 留在 server-side tool result、trace 或 ResourceStore summary 中，但不得作为可复制 input 片段回灌给 Planner

#### Scenario: 重复读取同一成功 fact 不得导致 resource 重复登记失败
- **WHEN** 当前 run 已经成功读取某个 recent fact
- **AND** Planner 再次请求相同 `readRecentExerciseRecommendationFact` input
- **THEN** runtime MUST 使用通用重复成功 tool call feedback 兜底
- **AND** runtime MUST NOT 再次执行 handler
- **AND** runtime MUST NOT 再次登记该 fact 对应的 consumable resource
- **AND** runtime MUST NOT 返回 `Resource id is already registered in the current run.` 作为 hard failure

### Requirement: 动作刷新 read/import 合同必须具备自动化验证
系统 SHALL 为动作刷新 read/import 的成功状态迁移提供自动化测试，覆盖模型可见合同、observation 投影、重复成功兜底和生产聊天回归。

#### Scenario: 自动化测试覆盖成功 read 后的下一步模型输入
- **WHEN** 实现或修改 `readRecentExerciseRecommendationFact` 的模型可见合同
- **THEN** 测试 MUST 断言 manifest 不把“换一个”“换一批”“再推荐一批”表达成强制调用条件
- **AND** 测试 MUST 断言成功 observation 包含“已导入当前 run，不要重复 read 同一 fact”的状态迁移说明
- **AND** 测试 MUST 断言成功 observation 包含 `displayedExerciseIds`，可供后续 `searchExerciseResources.excludeExerciseIds` 使用
- **AND** 测试 MUST 断言成功 observation 不包含完整 `displayedExercises`、完整 `query` 或 `maxReturned`

#### Scenario: 生产聊天回归覆盖重复 read/import
- **WHEN** 生产聊天回归复现“换一个 + recent fact + 成功 read/import 后重复同参 read/import”
- **THEN** 系统 MUST NOT 触发 `Resource id is already registered in the current run.`
- **AND** 系统 MUST NOT 以 `invalid_action` hard failure 或空内容错误响应收口
- **AND** 系统 MUST 保持 `/api/chat` 中没有基于用户原文的业务关键词分流
