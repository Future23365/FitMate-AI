## ADDED Requirements

### Requirement: Trace 必须展示 Planner 输入去重证据
系统 SHALL 在 model request trace、runtime trace 或 replay summary 中记录足够诊断 Planner input 去重的安全摘要。trace MUST 能说明成功 tool facts 的详细权威通道、observation 轻量化结果和 repair / diagnostic observation 保留情况。

#### Scenario: model request trace 记录去重摘要
- **WHEN** model adapter 记录 Planner model request trace
- **THEN** trace MUST 记录 observationCount 和 toolResultCount
- **AND** trace MUST 记录或可派生成功 tool observation lightweight count、repair / diagnostic observation count 和 toolResults projection presence 摘要
- **AND** trace MUST NOT 记录完整 handler output、secret、authorization、cookie、跨用户 payload 或未脱敏大 payload

#### Scenario: trace 可诊断双通道回归
- **WHEN** 某次回归导致成功 tool result 的完整 `projection.model` 同时进入 `observations` 和 `toolResults`
- **THEN** 相关 trace / replay 测试 MUST 能失败或报告该重复事实通道
- **AND** 失败报告 MUST 指向 Planner input builder 或 observation projection，而不是要求新增服务端语义分流
