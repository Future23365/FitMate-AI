## ADDED Requirements

### Requirement: LangChain tool schema 失败必须返回字段级 repair payload
系统 SHALL 在 LangChain tool wrapper 的 input schema 校验失败时，向模型可见 tool message 返回脱敏字段级 repair payload，而不是只返回泛化 `tool_schema_invalid` 文案。

#### Scenario: Tool input schema 失败返回可修正字段事实
- **WHEN** DeepSeek native `tool_calls.arguments` 未通过某个已注册 LangChain tool wrapper 的 input schema 校验
- **THEN** wrapper MUST 拒绝执行 handler
- **AND** 模型可见 tool message MUST 包含 `status = "failed"`
- **AND** 模型可见 tool message MUST 包含 `code = "tool_schema_invalid"`
- **AND** 模型可见 tool message MUST 包含 `issues[]`
- **AND** 每个 issue MUST 至少包含脱敏字段路径 `path` 和稳定 `code`
- **AND** issue SHOULD 包含可安全暴露的 `message`、`expected` 或 `actual`
- **AND** 模型可见 tool message MUST NOT 包含 stack trace、完整 Zod schema、内部文件路径、完整 handler payload、数据库对象、secret 或跨用户数据

#### Scenario: 字段级 repair payload 不依赖业务 tool 特判
- **WHEN** 任意业务 LangChain tool 的 input schema 校验失败
- **THEN** 字段级 repair payload MUST 由通用 wrapper / schema issue projector 生成
- **AND** 实现 MUST NOT 为 `searchExerciseResources` 或其他具体业务 `toolName` 增加专属 runtime 分支
- **AND** 实现 MUST NOT 根据用户原文、关键词、正则、同义词表或具体 phrasing 改写 tool input
