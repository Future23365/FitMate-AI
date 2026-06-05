## ADDED Requirements

### Requirement: Runtime PlannerInput 必须区分成功事实通道和修复诊断通道
系统 SHALL 在不改变 `PlannerPort.decideNext(input)` 方法签名、不新增 `PlannerInput` 字段的前提下，收敛当前 `PlannerInput` 中 `observations` 与 `toolResults` 的职责。`toolResults` SHALL 是成功 tool facts 的详细权威通道，`observations` SHALL 主要承载 repair、diagnostic、runtime boundary 和轻量索引。

#### Scenario: Runtime 构造下一轮 PlannerInput
- **WHEN** `runAgentRuntime` 为下一轮 Planner 调用构造 `PlannerInput`
- **THEN** Runtime MUST 继续传入 `run`、`step`、`manifests`、`observations` 和 `toolResults`
- **AND** Runtime MUST NOT 新增 `PlannerInput` 字段
- **AND** Runtime MUST 保持 `PlannerPort.decideNext(input)` 方法签名兼容
- **AND** Runtime MUST 确保成功 tool result 的详细模型可见事实不在 `observations` 和 `toolResults` 中重复出现
- **AND** Runtime MUST 保持 invalid action、duplicate success、failed tool、runtime error 等 repair / diagnostic observation 的可见性

#### Scenario: 新增业务 tool 不需要修改核心去重逻辑
- **WHEN** 后续新增或注册业务 tool
- **THEN** 该 tool 只要通过现有 `projection.model`、fulfillment、observation helper 和结构化 validator / resource facts 输出安全投影
- **AND** Runtime PlannerInput 去重 MUST 对该 tool 自动生效
- **AND** Runtime MUST NOT 新增基于具体业务 `toolName` 的分支来决定是否去重

#### Scenario: ReplayPlanner 测试可断言输入边界
- **WHEN** `ReplayPlanner` 或等价测试 Planner 记录每轮 Planner input
- **THEN** 测试 MUST 能断言成功 tool result 的详细 facts 只出现在权威通道
- **AND** 测试 MUST 能断言 repair / diagnostic observation 仍进入下一轮 input
- **AND** 测试 MUST NOT 依赖用户原文关键词或具体业务 phrasing 判断去重是否生效
