## ADDED Requirements

### Requirement: 训练草稿失败恢复必须接入统一 Repair Orchestrator
系统 SHALL 将训练计划或 routine 草稿的可恢复校验失败交给统一 Repair Orchestrator 处理。

#### Scenario: AI 生成草稿校验失败
- **WHEN** `/api/ai/workout-plan` 生成的草稿出现可恢复校验失败
- **THEN** 系统 MUST 调用 Repair Orchestrator
- **AND** 修复后 MUST 重新执行原 Validator
- **AND** 修复失败时 MUST 返回可继续对话的结构化失败引导

### Requirement: 修复结果必须进入 Trace 和 Eval
系统 SHALL 记录训练草稿修复过程，并为常见失败类型提供 Eval 覆盖。

#### Scenario: session_too_long 被修复
- **WHEN** Repair Orchestrator 压缩训练时长并通过校验
- **THEN** AiRunTrace MUST 记录 repair step、原错误、修复策略和最终 validation result
- **AND** Eval Suite MUST 能断言该用例没有展示未通过校验的训练卡片
