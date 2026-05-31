## ADDED Requirements

### Requirement: 目标时长不足必须进入恢复流程

当用户明确提供单次训练目标时长，而 AI 生成或修复后的训练草稿实际估算明显低于该目标时长时，系统 SHALL 将该结果视为可恢复校验失败，而不是直接展示可保存训练卡片。

#### Scenario: Routine 实际时长明显不足

- **WHEN** 用户目标单次训练时长为 40 分钟
- **AND** AI 生成的 routine 草稿通过结构解析
- **AND** 服务端按动作参数、休息和主训练循环估算实际时长为 25 分钟
- **THEN** 系统 MUST 产生 `session_too_short` 或等价的可恢复校验问题
- **AND** 系统 MUST NOT 展示该未补足的 routine 草稿卡片

#### Scenario: 时长不足后的自动修复

- **WHEN** 训练草稿校验结果包含 `session_too_short`
- **THEN** 系统 MUST 将该失败标记为可恢复
- **AND** 系统 MUST 尝试自动修复一次或返回可继续对话的引导
- **AND** 修复请求 MUST 明确要求模型补足到用户目标时长附近
- **AND** 修复请求 MUST 要求优先增加主训练容量，而不是只修改 `estimatedSessionMinutes`

#### Scenario: 时长不足修复仍失败

- **WHEN** 自动修复后的 routine 实际估算仍明显低于用户目标时长
- **THEN** 接口 MUST 返回结构化失败结果
- **AND** 结果 MUST 包含用户可理解的 `guidanceMessage`
- **AND** 结果 MUST 包含可继续对话的 `suggestedReplies`
