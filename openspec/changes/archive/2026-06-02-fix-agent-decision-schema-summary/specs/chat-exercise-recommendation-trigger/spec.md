## ADDED Requirements

### Requirement: Agent 工具名动作必须规范化
系统 SHALL 在不放宽工具输入校验的前提下，将模型输出中 `action` 直接等于已注册工具名的形态规范化为合法 `call_tool` 决策。

#### Scenario: 模型用工具名作为 action
- **WHEN** 模型输出 `{ "action": "askClarification", "input": { ... }, "reason": "..." }`
- **AND** `askClarification` 是当前 Agent registry 中的已注册工具
- **THEN** Agent runtime MUST 将其规范化为 `{ "action": "call_tool", "toolName": "askClarification", "input": { ... }, "reason": "..." }`
- **AND** 规范化后的 input MUST 继续通过该工具原始 Zod schema 校验
- **AND** 系统 MUST NOT 对未注册工具名或缺少 input 的输出执行该规范化
