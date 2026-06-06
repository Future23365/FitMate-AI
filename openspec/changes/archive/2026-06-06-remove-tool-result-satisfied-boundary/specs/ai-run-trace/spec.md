## ADDED Requirements

### Requirement: AI trace 必须记录 Agent loop 的可诊断事实链
系统 SHALL 在 AI trace 中记录 Agent loop 的关键诊断事实，使开发者可以复盘模型请求、tool execution、repair feedback、terminal validation 和 response rendering 的边界。

#### Scenario: 记录 tool result 与最终输出校验的分层
- **WHEN** Agent run 执行 tool 并进入 terminal action 或 repair
- **THEN** trace MUST 区分 tool execution status、tool result fact summary、duplicate input feedback、terminal output validation 和 response rendering
- **AND** trace MUST NOT 把中间 tool result 的候选数量或业务诊断投影成 core 业务成功 / 失败判定
- **AND** trace SHOULD 显示普通 `final_answer` 引用的是哪个 current-run `toolResultId` 或 resource
- **AND** trace SHOULD 显示结构化 `visibleOutputs` 是否通过最终 validator，以及失败 code / path / outputType / schemaVersion

#### Scenario: 0 条结果可复盘
- **WHEN** tool 成功执行并返回 0 条结果
- **THEN** trace MUST 保留安全摘要说明该 tool `ok = true`、结果为空和对应 filters / diagnostics 摘要
- **AND** 如果 Planner 用该结果输出普通 `final_answer`，trace MUST 将该 run 记录为合法 terminal answer，而不是 repair failure
- **AND** 如果 Planner 用该结果伪造结构化输出，trace MUST 将失败归因到 final output validator，而不是 tool result 业务满足度

#### Scenario: duplicate input 命名不表达业务成功
- **WHEN** runtime 检测到相同 `toolName + toolVersion + normalizedInputHash` 重复调用
- **THEN** trace MUST 记录 duplicate input 或等价中性事件
- **AND** trace MUST 包含既有 `toolResultId`、重复次数和安全 input hash
- **AND** trace MUST NOT 使用 `duplicate_tool_success` 或等价命名表达业务目标已成功
