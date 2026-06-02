# chat-blackbox-flow-regression-fixes Specification

## Purpose
TBD - created by archiving change fix-chat-blackbox-flow-regressions. Update Purpose after archive.
## Requirements
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

#### Scenario: 旧架构路径被调用
- **WHEN** routine、长期计划、动作推荐、Patch、动作讲解或短指令流程发生失败或阻断
- **AND** 测试发现系统调用旧 intent-first 架构、resolved intent repair、旧 action gate、旧只读 tool loop 或 summary-only payload reconstruction
- **THEN** 回归测试 MUST 失败
- **AND** 报告 MUST 标出旧架构路径名称和触发流程

#### Scenario: 新 stream 合同覆盖用户可见结果
- **WHEN** `/api/chat` 返回卡片、Patch、建议、澄清、阻断、失败或保存完成状态
- **THEN** 回归测试 MUST 从 `agent_execution_result`、artifact / patch / suggestion 事件、tool evidence metadata 和 done metadata 验证结果
- **AND** 回归测试 MUST NOT 依赖 `assistant_action`、`intent_resolved`、旧 trigger JSON 或 `workoutIntent`

