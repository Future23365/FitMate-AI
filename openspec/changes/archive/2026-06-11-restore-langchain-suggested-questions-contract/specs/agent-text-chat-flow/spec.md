## ADDED Requirements

### Requirement: LangChain 成功终态必须使用结构化 final response 合同
生产 `/api/chat` 的 LangChain 文本聊天主链 SHALL 使用服务端可校验的结构化 final response 合同表达成功终态。该合同 MUST 至少包含用户可见 `content`，并 MAY 包含 `suggestedQuestions`。LLM MUST NOT 直接生成 NDJSON event。

#### Scenario: 成功终态包含正文和建议提问
- **WHEN** LangChain agent 以成功终态结束
- **THEN** runtime MUST 从结构化 final response 中读取非空 `content`
- **AND** runtime MUST 校验可选 `suggestedQuestions`
- **AND** response adapter MUST 将 `content` 投影为 `content` 事件
- **AND** 如存在建议提问，response adapter MUST 将其投影为 `suggested_questions` 事件
- **AND** 响应 MUST 以 `done` 事件结束

#### Scenario: 成功终态结构非法
- **WHEN** LangChain agent 未返回合法结构化 final response
- **THEN** runtime MUST 将该结果归一为结构化输出校验失败或等价安全失败
- **AND** production response adapter MUST 使用安全 fallback 响应
- **AND** 服务端 MUST NOT 把未校验的 assistant 正文当成成功终态直接返回

#### Scenario: 终态合同不引入业务语义分流
- **WHEN** 系统校验或投影结构化 final response
- **THEN** 服务端 MUST 只校验结构、数量、空值和安全投影边界
- **AND** 服务端 MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板、具体 `toolName` 或业务字段组合生成、过滤或改写 `suggestedQuestions`

#### Scenario: 用户可见正文不使用 Markdown 分隔线
- **WHEN** LangChain 默认 system prompt 说明结构化 final response 合同
- **THEN** prompt MUST 要求 `content` 不使用独立 `---` 或等价 Markdown horizontal rule 分隔线
- **AND** 该要求 MUST 作为通用输出格式约束表达
- **AND** 系统 MUST NOT 通过前端正文解析或服务端语义正则把分隔线改造成建议按钮
