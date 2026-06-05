## ADDED Requirements

### Requirement: Trace 必须记录 Agent Loop 状态视图和 Evidence 转移
系统 SHALL 在 Agent run trace 中记录每一轮 `AgentLoopState` 到 `PlannerStateView` 的安全摘要、Planner action、tool result、Evidence projection、pending requirements 和 terminal gate 判定。

#### Scenario: Planner 调用前记录 state view 摘要
- **WHEN** Runtime 准备调用 Planner
- **THEN** trace MUST 记录 `PlannerStateView` 的安全摘要
- **AND** trace MUST 记录 `evidenceIds`、`pendingRequirementIds`、`terminalConstraints` 摘要、remaining steps 和 budget 摘要
- **AND** trace MUST NOT 记录完整 handler output、secret、authorization、cookie、跨用户 payload 或未脱敏大 payload

#### Scenario: ToolResult 转换为 Evidence
- **WHEN** tool execution 完成并生成 evidence
- **THEN** trace MUST 记录 toolResultId、evidenceId、source action id、projection status、fulfillment status、resource refs 和 redaction status
- **AND** trace MUST 能从该 evidence 反查产生它的 tool result 摘要
- **AND** trace MUST 能展示该 evidence 是否进入下一轮 `PlannerStateView`

#### Scenario: TerminalGate 判定可复盘
- **WHEN** terminal action 被 `TerminalGate` 接受或拒绝
- **THEN** trace MUST 记录 outcome、gate status、usedRefs 校验结果、visibleOutputs 校验摘要、pending requirements 摘要和失败 code
- **AND** trace MUST 能区分 schema failure、resource failure、unsatisfied evidence、pending requirement 和 policy / budget boundary
- **AND** trace MUST NOT 通过用户可见正文或 step title 推断成功原因

### Requirement: Replay fixture 必须能复现状态视图驱动的 loop
系统 SHALL 让 replay fixture 保存足以复现状态视图、Planner action、Evidence 和 terminal gate 的脱敏数据，不依赖真实模型或未脱敏 payload。

#### Scenario: Replay 复现 terminal gate 拒绝
- **WHEN** 某次 run 因 pending requirements 或 unsatisfied evidence 拒绝 `complete` final answer
- **THEN** replay fixture MUST 包含触发拒绝所需的 `PlannerStateView` 摘要、evidence 摘要、terminal action 摘要和 gate result
- **AND** ReplayPlanner MUST 能复现该拒绝路径
- **AND** fixture MUST NOT 依赖用户原文关键词或业务 phrasing 判断拒绝原因
