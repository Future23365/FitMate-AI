## ADDED Requirements

### Requirement: 手动 LLM 黑盒必须覆盖 prompt contract 回归
系统 SHALL 在手动 LLM 黑盒测试中覆盖默认值泄漏、意图漂移、流程文案泄漏和 token 回归等 prompt contract 风险。

#### Scenario: 默认值不得作为用户事实展示
- **WHEN** 用户只提供训练目标或部位，没有提供时长、频率或经验
- **THEN** 黑盒断言 MUST 检查 assistant 用户可见回复没有把默认时长、默认频率或默认经验描述为用户确认条件
- **AND** 如果回复需要提及默认处理，MUST 以“先按简单方案”或等价非确认口吻表达

#### Scenario: 多轮短指令不得漂移动作类型
- **WHEN** 用户先补齐 routine 条件，再通过短句补充器械、场地、难度或时长
- **THEN** 黑盒断言 MUST 检查后续轮次延续 routine，而不是退回纯动作推荐
- **AND** 报告 MUST 记录期望卡片类型、实际卡片类型、assistant 摘要和 traceId

#### Scenario: 执行型回复不得泄漏流程文案
- **WHEN** 本轮成功触发动作推荐、routine、plan 或 patch artifact
- **THEN** 黑盒断言 MUST 检查 assistant 用户可见回复不包含 raw JSON、内部 trigger、prompt、后台流程、马上生成、稍后生成或等价流程承诺
- **AND** 如果出现禁用文案，报告 MUST 标记失败并记录对应用户输入

### Requirement: prompt contract 变更必须有自动化单测覆盖
系统 SHALL 为 prompt contract hardening 的关键规则提供单测，避免只依赖真实模型黑盒测试发现回归。

#### Scenario: resolved intent 兼容字段派生
- **WHEN** 单测构造 resolved intent 与旧字段冲突的模型输出
- **THEN** 服务端 MUST 以 resolved intent 或一致性 repair 结果为准
- **AND** 单测 MUST 证明旧字段不会独立触发冲突卡片

#### Scenario: token budget 裁剪 schema
- **WHEN** 单测构造 routine 或 plan 草稿请求
- **THEN** 模型请求中的 prompt modules MUST 只包含当前 kind 的 schema
- **AND** 单测 MUST 证明 repair prompt 不重复注入基础修复规则

#### Scenario: summary 不固化默认值
- **WHEN** 单测构造 assistant 回复包含默认时长或默认频率但用户未明确提供这些字段
- **THEN** summary 更新结果 MUST NOT 把这些默认值记录成用户事实
- **AND** Trace 或返回诊断 MUST 能说明采用了服务端事实边界
