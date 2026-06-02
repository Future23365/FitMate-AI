## ADDED Requirements

### Requirement: Validation recovery 不得补写训练语义

训练生成校验恢复 SHALL 只提出 LLM repair、重新查询候选、澄清或阻断建议。服务端 recovery MUST NOT 自动补写 routine section、plan day、exercise item、sets、target、rest 或训练语义字段并把结果当成成功 draft。

#### Scenario: Routine draft 校验失败
- **WHEN** LLM-authored routine draft 因缺少 section、动作候选越界或结构字段缺失而校验失败
- **THEN** recovery MUST 返回可执行的 repair guidance
- **AND** Agent MAY 让 LLM 修复 draft 或重新调用候选工具
- **AND** 服务端 MUST NOT 自动生成缺失 section 或替换动作后返回成功

#### Scenario: Plan draft 校验失败
- **WHEN** LLM-authored plan draft 因 schedule、训练日、候选边界或结构字段缺失而校验失败
- **THEN** recovery MUST 返回可执行的 repair guidance
- **AND** Agent MAY 让 LLM 修复 draft 或重新调用候选工具
- **AND** 服务端 MUST NOT 自动展开新 plan draft 后返回成功

### Requirement: 失败恢复必须保留资源合同

当 LLM-authored draft 未通过校验时，系统 SHALL 保留失败诊断和候选 evidence，但不得登记为可保存资源。

#### Scenario: Draft 不可保存
- **WHEN** 生成工具或 validation 工具返回失败
- **THEN** runtime MUST NOT 将该 draft 登记为可保存资源
- **AND** 后续 `evaluatePolicy` 或 `saveConversationArtifactRevision` MUST 拒绝消费该资源
- **AND** trace MUST 记录失败原因和可恢复路径
