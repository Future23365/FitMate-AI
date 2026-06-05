## ADDED Requirements

### Requirement: 同义旧字段失败必须生成字段级 repair feedback
系统 SHALL 在模型输出使用旧同义字段或缺少统一主字段时，生成结构化字段级 repair feedback。Feedback MUST 直接说明旧字段和新字段的替换关系，而不是只返回泛化的非法 action 消息。

#### Scenario: ask_user 使用 question 旧字段
- **WHEN** 模型返回 `ask_user.question`
- **AND** 当前合同要求 terminal 用户可见文本写入 `content`
- **THEN** runtime MUST 将该输出判定为非法 action
- **AND** repair feedback MUST 包含字段路径 `question`
- **AND** repair feedback MUST 说明 `ask_user` 的用户可见文本必须写入 `content`
- **AND** repair feedback MUST NOT 要求服务端替模型把 `question` 转换成 `content`

#### Scenario: ask_user 使用 content 但 schema 仍有其他旧字段
- **WHEN** 模型返回 `ask_user.content`
- **AND** 同一 action 还包含 `question`、`message` 或等价旧同义字段
- **THEN** runtime MUST 拒绝该 action 或删除旧字段前先进入结构化 repair 边界
- **AND** feedback MUST 指出只允许一个用户可见文本字段
- **AND** feedback MUST 说明语义差异由 `type` 表达

#### Scenario: terminal 使用旧 grounding 字段
- **WHEN** 模型返回 `usedToolResultIds`
- **OR** 模型返回 `usedResourceRefs`
- **AND** 当前合同要求使用统一 `usedRefs`
- **THEN** repair feedback MUST 指出旧字段不可用
- **AND** repair feedback MUST 给出 `usedRefs` 的合法结构
- **AND** runtime MUST NOT 静默转换旧字段

#### Scenario: tool input 使用旧同义字段
- **WHEN** 模型调用 tool 时使用已收敛的旧同义字段
- **THEN** runtime MUST 返回 `invalid_tool_input`
- **AND** feedback MUST 包含脱敏字段路径和新字段名
- **AND** feedback MUST 使用中文说明业务含义，保留字段名、枚举值和 `toolName` 英文原样
- **AND** feedback MUST NOT 基于用户原文替模型补齐 tool input
