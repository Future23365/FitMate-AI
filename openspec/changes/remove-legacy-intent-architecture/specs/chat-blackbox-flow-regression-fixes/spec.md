## ADDED Requirements

### Requirement: 黑盒回归必须覆盖旧 intent 架构不可触发
系统 SHALL 为旧 intent-first 架构清理增加确定性回归覆盖，证明旧 normalize、`workoutIntent` 修补、只读-only tool loop、旧 trigger JSON 和 `assistant_action` 不会触发生产执行。

#### Scenario: 旧字段缺失但 Agent 结果完整
- **WHEN** `/api/chat` 返回合法 `AgentExecutionResult`、artifact / patch / suggestion 事件和 done metadata
- **THEN** 基础黑盒回归 MUST 判定执行证据完整
- **AND** 测试 MUST NOT 要求存在旧 `assistant_action`、resolved intent 或 `workoutIntent`

#### Scenario: 旧路径被调用
- **WHEN** 测试 trace、mock、日志或 coverage 发现旧 intent resolution、旧 normalize、`runReadonlyToolLoop` 或旧 trigger parser 参与生产执行
- **THEN** 回归测试 MUST 失败
- **AND** 报告 MUST 标出被调用的旧路径名称

## REMOVED Requirements

### Requirement: 黑盒失败样例必须被自动化回归覆盖

**Reason**: 该 requirement 中的 `workoutIntent=null`、兜底意图和旧意图模型失败样例属于旧架构补丁。

**Migration**: 将失败样例迁移为 Agent 多轮工具执行、用户可见闭环、候选集合、validation / policy / revision 和旧路径缺席断言。

### Requirement: AI 建议回复必须有自动化回归覆盖

**Reason**: 建议回复仍需测试，但不应绑定旧意图恢复和 `workoutIntent` 校验。

**Migration**: 建议回复从 `AgentExecutionResult` 和 `assistantSuggestions` 验证。

### Requirement: 最新基础黑盒失败必须有确定性回归覆盖

**Reason**: 该 requirement 的失败分类绑定旧黑盒补丁和 intent normalize。

**Migration**: 以 Agent 状态、工具证据、artifact 事件和用户可见输出重新表达基础黑盒回归。

### Requirement: 回归测试必须贴近真实 `/api/chat` 请求事实来源

**Reason**: 旧表述仍围绕 conversationSummary、intent 和客户端上下文补丁。

**Migration**: 回归测试使用真实 `/api/chat`、会话保存、Agent context、tool dependency graph 和 artifact 回读。

### Requirement: 长期计划补齐必须识别每周 N 练

**Reason**: 该要求绑定旧长期计划短指令 intent 补齐。

**Migration**: 长期计划补齐由 Agent 基于 recent messages、artifact、用户记忆和工具结果判断，并以计划 tool input 验证每周 N 练。
