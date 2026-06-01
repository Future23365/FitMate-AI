## MODIFIED Requirements

### Requirement: Manual LLM consistency tests are isolated

项目 MUST 提供一套只在开发者手动执行时运行的真实 LLM 测试。该测试 MUST NOT 被 `npm run test` 自动发现、自动运行或作为常规 CI 风险门禁的一部分。专用手动命令的主验收目标 MUST 是首页聊天黑盒流程，而不是直接验证内部 LLM 调用点。

#### Scenario: Default test command excludes LLM consistency tests

- **WHEN** 开发者在项目根目录执行 `npm run test`
- **THEN** 系统 MUST NOT 运行任何真实 LLM 输入输出一致性测试或首页聊天黑盒 LLM 流程测试
- **AND** 系统 MUST NOT 因缺少 `DEEPSEEK_API_KEY` 或外部模型网络不可用而导致 `npm run test` 失败

#### Scenario: Manual command runs LLM blackbox flow tests

- **WHEN** 开发者执行专用手动 LLM 测试命令
- **THEN** 系统 MUST 运行首页聊天黑盒 LLM 流程测试
- **AND** 测试输出 MUST 明确显示被运行的流程用例、轮次名称和通过或失败结果
- **AND** 测试开始前 MUST 输出本次运行的粗略 token 消耗预估

#### Scenario: Missing model configuration is explicit

- **WHEN** 开发者执行专用手动 LLM 测试命令但缺少必需模型配置
- **THEN** 系统 MUST 输出缺失配置名称
- **AND** 系统 MUST NOT 静默改用 mock、旧快照或非真实模型结果
- **AND** 系统 MUST 生成或保留清晰的跳过摘要，说明真实模型测试未运行

### Requirement: Manual tests report actionable failures

手动 LLM 测试失败时 MUST 输出足够定位问题的信息，帮助开发者判断是聊天链路错误、模型输出漂移、stream 解析失败、卡片推送缺失还是用例预期过期。

#### Scenario: Visible reply assertion fails

- **WHEN** assistant 用户可见回复为空、不可展示或泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字样
- **THEN** 测试失败报告 MUST 包含流程用例名称、轮次名称、用户输入、期望结果、实际回复摘要和失败原因

#### Scenario: Card expectation fails

- **WHEN** 预期卡片没有推送、推送了错误卡片类型或在不应推送时出现训练卡片
- **THEN** 测试失败报告 MUST 包含流程用例名称、轮次名称、期望卡片类型、实际卡片类型、conversationId 和 responseMessageId
- **AND** 测试失败报告 MUST 保留 assistant 用户可见回复摘要

#### Scenario: Manual run summary is emitted

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 输出流程用例总数、轮次总数、通过数、失败数和被跳过数
- **AND** 系统 MUST 输出模型返回的 `prompt_tokens`、`completion_tokens` 和 `total_tokens` 汇总
- **AND** 任一非跳过测试失败时命令 MUST 以非零退出码结束

#### Scenario: Acceptance report is written

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 生成一份测试后验收文档
- **AND** 验收文档 MUST 包含用例通过/失败数量、预计 token 消耗、真实 token 汇总和简要人工验收结果
- **AND** 简要人工验收结果 MUST 能展示用户输入、assistant 用户可见回复摘要、期望卡片类型、实际卡片类型和本轮验证结果

## REMOVED Requirements

### Requirement: Manual tests cover all current LLM call sites

**Reason**: 用户当前要求验证真实黑盒流程，不再把内部 LLM 调用点作为第一版验收目标。继续强制覆盖每个 prompt 分支会让测试偏离“用户最终看到什么”的目标，并增加真实模型测试的维护成本。

**Migration**: 将调用点覆盖迁移为首页聊天流程覆盖。内部 prompt、Schema 和候选动作约束可由普通单测、服务端集成测试或后续专门 eval 覆盖，不作为本次手动黑盒 LLM 测试的通过条件。

### Requirement: Manual tests cover current LLM branches

**Reason**: 当前第一版目标是验证首页聊天流程能回答、卡片推送是否正常，不验证所有 prompt 分支和中间结构化决策。

**Migration**: 将分支覆盖迁移为流程冒烟集覆盖，包括动作推荐、routine、plan、追问、非健身切回健身、上下文覆盖和最近卡片引用。更细的 prompt 分支和领域准确性后续可在黑盒执行器稳定后扩展。
