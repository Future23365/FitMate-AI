## MODIFIED Requirements

### Requirement: Manual tests report actionable failures

手动 LLM 一致性测试失败时 MUST 输出足够定位问题的信息，帮助开发者判断是 prompt 变化、模型输出漂移、输入 fixture 过期还是服务端结构校验失败。

#### Scenario: Structural assertion fails

- **WHEN** 模型输出没有通过 JSON 解析、Schema 校验或关键字段断言
- **THEN** 测试失败报告 MUST 包含调用点名称、用例名称、期望断言、实际输出和失败原因

#### Scenario: Natural language guardrail fails

- **WHEN** 可见回复包含内部 Trigger、JSON fenced block、候选外动作名或禁止的 UI 流程字样
- **THEN** 测试失败报告 MUST 标出命中的禁止项
- **AND** 测试失败报告 MUST 保留模型原始正文

#### Scenario: Flow failure records downstream skipped turns

- **WHEN** 多轮黑盒流程中的任意一轮失败
- **AND** 同一 fixture 中仍有后续轮次
- **THEN** 验收报告 MUST 将后续轮次记录为 skipped
- **AND** skipped 记录 MUST 包含导致跳过的失败摘要
- **AND** 本次运行的报告轮次数 MUST 等于 fixture 中定义的总轮次数

#### Scenario: Manual run summary is emitted

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 输出测试总数、通过数、失败数和被跳过数
- **AND** 系统 MUST 输出模型返回的 `prompt_tokens`、`completion_tokens` 和 `total_tokens` 汇总
- **AND** 任一非跳过测试失败时命令 MUST 以非零退出码结束

#### Scenario: Acceptance report is written

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 生成一份测试后验收文档
- **AND** 验收文档 MUST 包含用例通过/失败数量、真实 token 汇总和简要人工验收结果
- **AND** 简要人工验收结果 MUST 能展示用户提问、大模型回答摘要和本地解析或断言结果
