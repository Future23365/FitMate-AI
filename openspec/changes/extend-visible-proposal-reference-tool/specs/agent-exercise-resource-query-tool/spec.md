## ADDED Requirements

### Requirement: searchExerciseResources 不得承担可见训练方案事实查询职责
`searchExerciseResources` SHALL remain a read-only structured exercise database query tool. It MUST NOT be used as the tool for discovering whether the current conversation already has a user-visible `visibleTrainingProposal`; that responsibility SHALL belong to `readRecentVisibleTrainingProposal` list/read operations.

#### Scenario: Manifest 表达职责边界
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** 模型可见说明 MUST 表达该 tool 只按结构化筛选条件查询发布态动作库
- **AND** 模型可见说明 MUST 表达当前会话是否存在可引用 `visibleTrainingProposal` 应通过 `readRecentVisibleTrainingProposal(operation = "list")` 查询
- **AND** 模型可见说明 MUST 表达复用具体上一轮可见训练方案应通过 `readRecentVisibleTrainingProposal(operation = "read")` 导入当前 run
- **AND** 模型可见说明 MUST 使用中文描述业务边界，`searchExerciseResources`、`readRecentVisibleTrainingProposal`、`operation`、`list`、`read`、`visibleTrainingProposal` 保持英文原样

#### Scenario: search tool 不替代事实 list/read
- **WHEN** 用户请求需要依赖当前会话中是否存在上一轮可见训练方案事实
- **THEN** 模型可见合同 MUST 将 `readRecentVisibleTrainingProposal` list/read results 表达为该事实状态的来源
- **AND** `searchExerciseResources` MUST NOT infer or return current conversation visible proposal references
- **AND** `searchExerciseResources` output MUST NOT contain `factRef`、`messageId`、完整 `visibleTrainingProposal.payload` 或当前会话事实列表

#### Scenario: 明确新动作查询仍可直接 search
- **WHEN** 用户明确提出新的动作查询目标、结构化筛选条件或普通动作事实问题
- **THEN** 模型可见合同 MUST 允许 Planner 直接调用 `searchExerciseResources`
- **AND** 系统 MUST NOT 强制所有动作查询先经过 `readRecentVisibleTrainingProposal`
- **AND** 服务端 MUST NOT 根据用户原文关键词阻止合法 `searchExerciseResources` 调用

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 处理用户自然语言输入
- **THEN** route、handler、renderer 和 Agent core MUST NOT 根据用户原文选择 `readRecentVisibleTrainingProposal` 或 `searchExerciseResources`
- **AND** Planner MUST remain responsible for choosing tools based on visible manifest, context, observations and tool results
- **AND** tests MUST prove no new keyword, regex, synonym table or fixed phrase routing is introduced for refresh-like expressions
