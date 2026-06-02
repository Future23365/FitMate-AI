## ADDED Requirements

### Requirement: Agent decision JSON 格式失败必须先尝试非语义恢复
系统 SHALL 在 Agent decision 模型输出严格 JSON 解析失败时，先尝试非语义 JSON 格式恢复。恢复逻辑 MUST 只处理 JSON 文本边界问题，并且恢复后的对象 MUST 继续通过 `AgentToolDecision` Schema、registry 工具名和工具输入 Schema 校验。

#### Scenario: 模型输出尾随多余对象结束符
- **WHEN** Agent decision 模型返回一个可闭合 JSON object，但末尾额外多出一个或多个 `}` 导致严格解析失败
- **THEN** 系统 MUST 尝试提取第一个完整 JSON object
- **AND** 提取出的对象 MUST 通过 `JSON.parse`
- **AND** 系统 MUST 使用现有 `AgentToolDecision` 校验恢复后的对象
- **AND** 系统 MUST NOT 基于用户原文、关键词、同义词或规则评分生成替代 action、toolName、intent 或工具输入

#### Scenario: 模型输出包含 fenced JSON 或包裹文本
- **WHEN** Agent decision 模型响应包含 fenced JSON 或 JSON object 前后存在非 JSON 文本
- **THEN** 系统 MAY 提取唯一可解析的 JSON object
- **AND** 恢复后的对象 MUST 通过同一套 Agent decision 合同校验后才能执行工具
- **AND** 系统 MUST NOT 将包裹文本中的自然语言说明作为执行事实源

#### Scenario: 恢复后仍不满足 Agent decision 合同
- **WHEN** JSON 格式恢复成功，但恢复后的对象请求未知工具、非法多工具调用、非法参数或不合法 `AgentExecutionResult`
- **THEN** 系统 MUST 按现有可诊断失败路径处理
- **AND** 系统 MUST NOT 回退到旧 intent-first、旧 `assistant_action`、旧 resolved intent repair 或 summary-only payload reconstruction

#### Scenario: 无法唯一恢复 JSON object
- **WHEN** 模型输出截断、括号不平衡、包含多个候选 JSON object 或无法提取唯一完整对象
- **THEN** 系统 MUST 保持 `invalid_json` 或等价可诊断失败
- **AND** 系统 MUST NOT 猜测模型原本想调用的工具
