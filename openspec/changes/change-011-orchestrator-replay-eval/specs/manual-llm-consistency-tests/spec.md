## ADDED Requirements

### Requirement: 手动 LLM 一致性测试必须覆盖 011 多步链路
系统 SHALL 为 `change-011` 增加手动 LLM 一致性用例，覆盖多步编排、确认续跑、future schedule 写入、Replay/Eval 和健康边界。

#### Scenario: 运行 011 手动 LLM 用例
- **WHEN** 开发者运行手动 LLM 一致性测试
- **THEN** 测试 MUST 覆盖“改成一周四练但别太累”、“明天休息”、“后面都别安排俯卧撑”和高风险健康信号
- **AND** 测试 MUST 断言结构化 finalDecision、Policy、Confirmation、Validator 和 Response Writer 类型
- **AND** 测试 MUST 与默认 `npm test` 隔离

### Requirement: 手动 LLM 报告必须包含 token 与结构化验收摘要
系统 SHALL 在 011 手动 LLM 报告中记录 token usage、关键结构化决策和失败原因。

#### Scenario: 手动 LLM 测试完成
- **WHEN** 手动 LLM 测试运行结束
- **THEN** 报告 MUST 汇总 token usage
- **AND** 报告 MUST 列出通过、失败、需要人工确认和候选不足的用例
- **AND** 报告 MUST 不包含大段原始模型 payload
