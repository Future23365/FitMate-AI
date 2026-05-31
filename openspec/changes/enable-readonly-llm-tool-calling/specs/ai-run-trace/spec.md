## ADDED Requirements

### Requirement: Trace 必须记录 LLM 只读工具决策
系统 SHALL 在 AI Trace 中记录 LLM 是否进入只读 tool loop、可用工具版本和模型选择的工具决策。

#### Scenario: LLM 请求只读工具
- **WHEN** LLM 在 tool loop 中选择一个只读工具
- **THEN** trace MUST 记录 `tool_decision` step
- **AND** step MUST 包含 tool name、参数摘要、工具版本、当前 step index 和选择原因摘要
- **AND** step MUST NOT 包含敏感认证信息或完整大 payload

#### Scenario: LLM 未请求工具
- **WHEN** tool loop 可用但 LLM 决定不调用工具
- **THEN** trace MUST 记录 `tool_decision` step，并写入未调用工具的决策摘要
- **AND** trace MUST 能区分“未进入 tool loop”和“进入后未选择工具”

#### Scenario: 只读 tool loop 被配置跳过
- **WHEN** feature flag 关闭或当前路径不满足进入 tool loop 的条件
- **THEN** trace MUST 记录 skipped reason
- **AND** trace MUST 能区分 feature flag 关闭、确定性早返回、引用澄清和预算跳过

### Requirement: Trace 必须记录只读工具执行结果
系统 SHALL 对每次只读工具执行记录标准化 `tool_call` step。

#### Scenario: 只读工具执行成功
- **WHEN** `searchArtifacts`、`getArtifactPayload`、`getExerciseById` 或 `searchExercises` 执行成功
- **THEN** trace MUST 记录工具名称、输入摘要、输出摘要、耗时、状态和候选或资源 id 摘要
- **AND** trace MUST NOT 记录未经摘要的大 payload

#### Scenario: 只读工具执行失败
- **WHEN** 只读工具因 Schema、权限、未找到、数据校验或内部错误失败
- **THEN** trace MUST 记录失败 code、可诊断原因和回退状态
- **AND** trace MUST NOT 暴露其他用户资源是否存在的敏感细节

### Requirement: Trace 必须记录只读 tool loop 回退
系统 SHALL 在只读 tool loop 停止、失败或达到上限时记录回退决策。

#### Scenario: 达到工具步数上限
- **WHEN** tool loop 达到最大步骤数
- **THEN** trace MUST 记录 step limit、已执行工具列表、已消耗 step 数和最终回退策略

#### Scenario: 工具上下文被截断
- **WHEN** tool context bundle 超过预算并发生截断
- **THEN** trace MUST 记录截断前后大小、保留的 tool call id 和 `truncated = true`
- **AND** trace MUST NOT 记录被截断移除的完整大 payload

#### Scenario: 工具上下文进入最终回复
- **WHEN** tool context bundle 被传入最终回复模型请求
- **THEN** trace MUST 记录进入模型上下文的工具结果摘要
- **AND** trace MUST 能关联这些摘要来自哪些 tool call step
