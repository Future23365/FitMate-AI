## ADDED Requirements

### Requirement: Routine 校验失败必须可恢复

聊天推送单次 routine 时，系统 SHALL 将可调整的服务端校验失败转成自动修复或继续对话引导。

#### Scenario: Routine 时长超出

- **WHEN** AI 生成的 routine 草稿通过结构解析但服务端估算时长超过用户目标时长
- **THEN** 系统 MUST 先尝试自动压缩并重新校验
- **AND** 系统 MUST NOT 直接把该失败作为终止型错误展示给用户

#### Scenario: Routine 修复失败

- **WHEN** routine 自动修复后仍未通过服务端校验
- **THEN** 系统 MUST 展示“计划生成失败”
- **AND** 系统 MUST 引导用户选择压缩时长、保留完整训练量、减少动作数量或降低组数
- **AND** 系统 MUST NOT 展示未通过校验的 routine 卡片
