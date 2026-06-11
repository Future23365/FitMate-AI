## ADDED Requirements

### Requirement: LangChain AI trace 必须区分 tool 事实、duplicate feedback 和最终 validator
系统 SHALL 在 LangChain AI trace / trace summary 中记录可复盘的分层事实，使开发者能够区分 provider tool call、tool execution、tool result fact summary、duplicate input feedback、finalization / terminal validator 和 response projection。Trace MUST NOT 把中间 tool result 的候选数量、空结果、section 覆盖或 diagnostics 投影成业务成功 / 失败判定。

#### Scenario: trace 记录分层边界
- **WHEN** LangChain Agent run 执行 tool 并进入最终回答、finalization、repair 或 failure finalizer
- **THEN** trace MUST 区分 provider tool call 尝试、tool wrapper execution status、model-visible fact summary、duplicate input feedback、finalization / terminal validator result 和 response adapter projection
- **AND** trace MUST NOT 使用 `fulfillment.satisfied`、`satisfied=true`、`satisfied=false` 或等价字段表达用户目标是否完成
- **AND** trace MUST NOT 将 `totalMatches`、候选数量、空结果、`availableSections`、`missingSections` 或 diagnostics 汇总成业务成功 / 失败

#### Scenario: 0 条成功结果可复盘
- **WHEN** tool 成功执行并返回 0 条结果、空候选或空 `facts[]`
- **THEN** trace MUST 保留安全摘要说明该 tool 成功执行、结果为空和对应 query / filters / diagnostics 摘要
- **AND** 如果模型用该结果输出普通文本回答，trace MUST 将该 run 记录为合法 final response 或等价成功终态，而不是 repair failure
- **AND** 如果模型用该结果伪造结构化训练输出，trace MUST 将失败归因到 finalization tool、terminal output validator 或业务 validator，而不是 tool result 业务满足度

#### Scenario: duplicate input 命名不表达业务成功
- **WHEN** runtime 检测到相同 `toolName + toolVersion + normalizedInputHash` 重复调用
- **THEN** trace MUST 记录 `duplicate_tool_input`、`duplicate_input` 或等价中性事件
- **AND** trace MAY 包含重复次数、安全 input hash 和有限既有事实摘要
- **AND** trace MUST NOT 使用 `duplicate_tool_success`、`duplicate-success`、`success`、`satisfied` 或等价命名表达业务目标已经成功
