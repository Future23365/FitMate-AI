## ADDED Requirements

### Requirement: `fitmate_final_response.content` 必须承载最终正文 Markdown 规则

生产文本聊天 SHALL 将最终正文格式规则优先放在 `fitmate_final_response.content` schema description 或等价 structured final response 合同中。默认 system prompt 只需要声明最终用户可见正文必须通过 `fitmate_final_response.content` 提交，不应承载完整 Markdown 细则。

#### Scenario: Markdown 规则靠近 content 字段

- **WHEN** LangChain runtime 构造 `fitmate_final_response` 的模型可见 schema 或 tool definition
- **THEN** `content` 字段的 schema description 或等价 structured final response 合同 MUST 说明最终正文可使用的 Markdown 边界
- **AND** 该说明 MUST 覆盖项目要求的用户可见正文格式限制，例如不要输出未校验 JSON、不要输出 NDJSON event、不要把正文当作结构化训练 payload
- **AND** 默认 system prompt MAY 简短说明最终正文通过 `fitmate_final_response.content` 提交
- **AND** 默认 system prompt MUST NOT 重复完整 Markdown 细则、长格式清单或业务正文模板

#### Scenario: content 不承载结构化训练事实

- **WHEN** 模型需要输出结构化训练卡片、routine 或 plan
- **THEN** `fitmate_final_response.content` schema description MUST 表达正文只用于解释、提醒或总结已校验结构
- **AND** 结构化训练事实 MUST 先通过 `submitVisibleTrainingProposal` 或等价业务 finalization tool 校验
- **AND** response adapter MUST NOT 从 `content` 反向提取动作、处方、schedule 或保存事实
