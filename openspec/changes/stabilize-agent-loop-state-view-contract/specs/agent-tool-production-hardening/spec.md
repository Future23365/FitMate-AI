## ADDED Requirements

### Requirement: Production terminal completion 必须通过 TerminalGate 完成度校验
生产 Agent runtime SHALL 在输出用户可见终态前运行通用 `TerminalGate`。`TerminalGate` MUST 校验 terminal action 的 outcome、evidence 支持、pending requirements、resource refs、visibleOutputs 和 grounding 自洽，不能只因为 `final_answer` schema 合法就成功收口。

#### Scenario: 可继续补证据时拒绝 complete final_answer
- **WHEN** production Agent run 中存在 `pendingRequirements` 表示当前可见 tool、resource 或澄清可以恢复的缺口
- **AND** Planner 返回 `outcome = "complete"` 的 `final_answer`
- **THEN** `TerminalGate` MUST 拒绝该 terminal action
- **AND** Runtime MUST 进入有限 repair、合法 tool_call、ask_user、partial 或 blocked 收口路径
- **AND** Runtime MUST NOT 把正文承诺、动作列表或不完整 visible output 当作成功完成

#### Scenario: visibleOutputs 必须由 evidence 支持
- **WHEN** Planner 返回包含 `visibleOutputs[]` 的 terminal action
- **THEN** `TerminalGate` MUST 校验每个 visible output 的 outputType、schemaVersion、resource refs、usedRefs 和 validator facts
- **AND** failed、diagnostic、unsatisfied 或未登记 evidence MUST NOT 支撑成功 visible output
- **AND** core terminal validation MUST NOT 依赖具体业务 `toolName` 白名单

#### Scenario: 非完成终态进入安全 renderer
- **WHEN** terminal action 声明 `outcome = "partial"`、`outcome = "needs_input"` 或 `outcome = "blocked"`
- **THEN** production renderer MUST 输出用户可见、可恢复且不泄漏内部字段的内容
- **AND** run summary MUST 区分直接完成、建议可恢复通过、需要用户输入、阻断和失败
- **AND** 系统 MUST NOT 将非完成 outcome 统计为成功完成

### Requirement: Production adapter 必须保持核心替换边界
系统 SHALL 允许在不重写业务 tool handler、ToolRegistry 注册方式或 `/api/chat` 外部请求响应 schema 的前提下替换 Agent Loop 核心状态传递和 terminal gate。

#### Scenario: 替换核心 loop 后业务 tool 保持接入
- **WHEN** implementation 切换到 `PlannerStateView`、Evidence pipeline 和 `TerminalGate`
- **THEN** 已注册业务 tool MUST 继续通过现有 ToolRegistry 暴露 manifest 和执行合同
- **AND** 业务 tool handler 查询语义 MUST 不因本 change 被重写
- **AND** `/api/chat` 外部 stream event schema MUST 保持兼容
- **AND** 如果某 tool 需要更丰富 evidence，改动 MUST 局限在该 tool 的 projection / resource contract / tests
