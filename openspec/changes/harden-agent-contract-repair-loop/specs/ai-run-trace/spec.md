## ADDED Requirements

### Requirement: Trace 必须记录 Agent 合同修复循环
系统 SHALL 在 AiRunTrace 中记录 Agent 决策合同失败、结构化反馈、修复尝试、熔断和最终收口来源，使开发者能复盘模型如何基于错误修正。

#### Scenario: 生成 AgentDecisionFeedback
- **WHEN** runtime 将模型决策拒绝为可恢复合同失败
- **THEN** trace MUST 记录 feedback 的稳定 code、retryable 状态、失败边界、推荐下一步工具和关键资源 id
- **AND** trace MUST 记录原始被拒绝决策的摘要
- **AND** trace MUST 记录 `repairTurnCount`、剩余 repair 预算和当前 `repairFeedbackCodes`
- **AND** trace MUST NOT 暴露未授权 payload 或其他用户数据

#### Scenario: 修复后成功
- **WHEN** 模型基于 feedback 重新调用工具并最终成功
- **THEN** trace MUST 能关联原始失败 feedback、修复工具调用、写工具结果和最终 `AgentExecutionResult`
- **AND** trace MUST 记录最终结构化字段来自哪一个 tool result
- **AND** trace MUST 记录 `finalProjectionSourceToolResultId` 或等价来源字段

#### Scenario: 修复循环被熔断
- **WHEN** runtime 因修复预算耗尽或重复失败停止继续修复
- **THEN** trace MUST 记录熔断原因、预算类型、repeat count、firstToolResultId 和 latestToolResultId
- **AND** trace MUST 记录 `fusedFailureCount` 和 `repairBudgetExhaustedReason`
- **AND** 最终失败摘要 MUST 能被黑盒报告读取

### Requirement: Trace 必须区分模型错误、合同拒绝和服务端事实收口
系统 SHALL 在 trace phase 与 step metadata 中区分模型原始输出、runtime 合同校验、结构化反馈和服务端 final result 投影。

#### Scenario: final result 被服务端投影补齐
- **WHEN** runtime 从已登记写工具结果投影 `AgentExecutionResult.generated` 或 `patched`
- **THEN** trace MUST 记录投影来源 tool result id
- **AND** trace MUST 记录模型原始 final result 缺失或错误的字段
- **AND** trace MUST 记录投影后引用校验结果

#### Scenario: final result 引用未登记资源
- **WHEN** 模型 final result 引用没有 producer 的资源 id
- **THEN** trace MUST 记录资源 kind、资源 id、缺失 producer 的原因和是否进入可恢复 feedback

#### Scenario: 黑盒报告读取修复证据
- **WHEN** 手动 LLM 黑盒 runner 消费 Agent stream 或 trace 摘要
- **THEN** 报告 MUST 能读取 `repairFeedbackCodes`、`repairTurnCount`、`finalProjectionSourceToolResultId`、`unregisteredResourceReferences`、`fusedFailureCount` 和 `repairBudgetExhaustedReason`
- **AND** 报告 MUST 区分 recovered、fused、unrecoverable 和 projected 四类结果
- **AND** 报告 MUST NOT 依赖旧 `assistant_action` 或自由文本关键字判断修复是否发生
