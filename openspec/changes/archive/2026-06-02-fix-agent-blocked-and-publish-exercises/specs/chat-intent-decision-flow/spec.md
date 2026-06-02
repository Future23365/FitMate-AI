## ADDED Requirements

### Requirement: Agent 阻塞终止结果必须符合结构化合同
系统 SHALL 将候选为空、工具不可恢复失败或策略阻断等可解释停止状态表达为合法 `AgentExecutionResult`。

#### Scenario: 候选为空后返回 blocked
- **WHEN** Agent 已调用必要工具但没有得到可执行候选集合
- **THEN** Agent 终止结果 MUST 使用 `status: "blocked"`
- **AND** 终止结果 MUST 包含非空 `blockReason`
- **AND** 终止结果 MUST 保留相关 `usedToolResultIds`
- **AND** 系统 MUST NOT 将该场景投影为 `model_output_invalid`

#### Scenario: 模型返回旧形态 blocked
- **WHEN** 模型返回 `status: "blocked"` 且阻塞说明位于 `replyContext.reply`
- **THEN** 服务端 MAY 将该说明规范化为 `blockReason`
- **AND** 该规范化 MUST NOT 改写 `status`、工具结果引用、策略结果或用户语义
- **AND** 其他缺少必要字段的非法终止结果 MUST 继续被拒绝

#### Scenario: 阻塞结果写入用户回复
- **WHEN** Response Writer 接收到合法 `blocked` Agent 终止结果
- **THEN** 用户可见回复 MUST 基于 `blockReason`
- **AND** 回复 MUST NOT 承诺已经生成或修改训练结果
