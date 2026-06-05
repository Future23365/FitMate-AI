## ADDED Requirements

### Requirement: PlannerPort 必须以 PlannerStateView 作为模型可见状态合同
系统 SHALL 将 `PlannerStateView` 作为 `PlannerPort` 的状态输入边界。Planner adapter 只能基于该状态视图、当前 tool manifest 和受控 prompt 构造模型请求，不得直接读取或序列化内部 `AgentLoopState`、完整 tool output 或重复 observation 通道。

#### Scenario: LlmPlanner 构造模型请求
- **WHEN** `LlmPlanner` 或等价 Planner adapter 收到 Runtime 调用
- **THEN** 输入 MUST 包含当前 `PlannerStateView`
- **AND** 输入 MUST 包含当前可用 `ToolManifest[]`
- **AND** 输入 MUST NOT 包含完整内部 `AgentLoopState`
- **AND** 输入 MUST NOT 并行包含与 `PlannerStateView.evidence` 表达同一事实的 raw `observations` 或完整 `toolResults.projection.model`
- **AND** adapter 输出 MUST 仍然只是结构化 `AgentAction` candidate

#### Scenario: ReplayPlanner 复现状态驱动 loop
- **WHEN** `ReplayPlanner` 在测试或 replay 中驱动 Runtime
- **THEN** 它 MUST 接收与真实 Planner 相同结构的 `PlannerStateView`
- **AND** replay fixture MUST 能断言每一轮 state view 中的 evidence、pending requirements 和 terminal constraints
- **AND** replay MUST NOT 依赖自由文本 observation 的拼接顺序来判断下一步 action 是否可执行

### Requirement: Runtime loop 必须以状态转移驱动下一轮 Planner 调用
系统 SHALL 把每一轮 action validation、tool execution、evidence projection、repair feedback 和 terminal gate 结果写回 `AgentLoopState`，再派生下一轮 `PlannerStateView`。

#### Scenario: tool_call 后进入下一轮
- **WHEN** Planner 返回合法 `tool_call`
- **AND** Executor 完成 tool execution
- **THEN** Runtime MUST 将 validation result、tool execution result、normalized evidence、resource refs、budget update 和 trace event 写入 `AgentLoopState`
- **AND** 下一轮 Planner 调用 MUST 从更新后的 `AgentLoopState` 派生 `PlannerStateView`
- **AND** Runtime MUST NOT 手写第二轮 prompt 片段来代替状态转移

#### Scenario: invalid action 后进入 repair
- **WHEN** Planner 返回 schema、resource、policy、tool input 或 terminal gate 不合法的 action
- **THEN** Runtime MUST 将确定性失败事实写入 `AgentLoopState`
- **AND** 下一轮 `PlannerStateView` MUST 暴露结构化 repair / diagnostic evidence
- **AND** Runtime MUST NOT 在服务端把该 action 改写成另一个语义 action
