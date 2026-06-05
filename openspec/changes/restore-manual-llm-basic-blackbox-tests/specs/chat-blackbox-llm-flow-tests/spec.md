## ADDED Requirements

### Requirement: 基础首页黑盒套件必须从 llm基础测试.md 读取流程

系统 SHALL 将 `llm基础测试.md` 作为基础首页聊天黑盒套件的用例来源，按文档中的三轮流程表动态生成 flow。

#### Scenario: 解析三轮流程表

- **WHEN** 基础黑盒 runner 启动
- **THEN** 系统 MUST 读取 `llm基础测试.md` 中 `## 三轮流程用例` 下的 Markdown 表格
- **AND** 系统 MUST 校验必需列、flow id 唯一性、每轮用户输入和期望非空
- **AND** 表格结构不合法时系统 MUST 在真实模型调用前失败

#### Scenario: 每个 flow 保持三轮结构

- **WHEN** 系统从 `llm基础测试.md` 生成基础黑盒 fixture
- **THEN** 每个 flow MUST 包含 3 轮用户输入和 3 轮期望
- **AND** 报告中的完整 flow 数和 turn 数 MUST 从实际解析结果动态计算

### Requirement: 基础首页黑盒 runner 必须贴近首页聊天请求

系统 SHALL 通过当前 `/api/chat` 请求合同执行基础首页聊天黑盒测试，不得向 runner 提供首页客户端没有的额外执行能力。

#### Scenario: 请求体只包含首页公开字段

- **WHEN** 基础黑盒 runner 发送聊天请求
- **THEN** 请求体 MUST 只包含 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary`、`conversationContext` 和 `thinkingEnabled`
- **AND** 请求体 MUST NOT 包含完整历史 `messages`、planner override、tool override、trace override 或 runtime state

#### Scenario: 同一 flow 内延续会话

- **WHEN** 同一个 flow 执行第 2 轮或第 3 轮
- **THEN** 系统 MUST 使用同一个 `conversationId` 继续请求
- **AND** 系统 MUST 在前一轮成功后通过聊天保存边界保存用户消息、assistant 回复和用户可见训练输出
- **AND** 不同 flow MUST 使用互相隔离的新 `conversationId`

### Requirement: 基础黑盒报告必须记录用户可见验收结果

系统 SHALL 在基础首页聊天黑盒测试结束后生成 Markdown 报告，记录用户可见输出、token 使用和失败排错摘要。

#### Scenario: 报告记录运行范围和 token

- **WHEN** 基础黑盒测试结束
- **THEN** 报告 MUST 包含运行时间、模型、judge 模型、完整 flow/turn 数、实际执行 flow/turn 数、通过数、失败数、跳过数和筛选条件
- **AND** 报告 MUST 包含预计 token 消耗和聊天/judge 的真实 token 汇总或未获取原因

#### Scenario: 报告记录每轮用户可见输出

- **WHEN** 基础黑盒测试完成任一轮
- **THEN** 报告 MUST 记录 flow id、轮次、用户输入、文档期望、assistant 用户可见回复摘要、可见输出类型、建议回复、确认请求和验证状态
- **AND** 报告 MUST NOT 保存完整 prompt、完整动作候选池、大段 raw provider response 或内部 tool payload

#### Scenario: 首轮失败后跳过后续轮次

- **WHEN** 一个 flow 的第 1 轮失败
- **THEN** 系统 MUST 将该 flow 后续轮次标记为 skipped
- **AND** 报告 MUST 记录跳过原因
