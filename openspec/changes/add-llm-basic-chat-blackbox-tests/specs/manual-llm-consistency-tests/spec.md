## ADDED Requirements

### Requirement: 基础 LLM 黑盒测试必须保持手动隔离
系统 SHALL 提供专用手动命令运行首页聊天基础 LLM 黑盒测试，并确保该套件不会被默认自动化测试发现或运行。

#### Scenario: 默认测试不运行基础 LLM 黑盒测试
- **WHEN** 开发者在项目根目录执行 `npm test` 或 `npm run test`
- **THEN** 系统 MUST NOT 运行 `llm基础测试.md` 驱动的真实 LLM 黑盒测试
- **AND** 系统 MUST NOT 因缺少模型配置、judge 配置或外部模型网络不可用而导致默认测试失败
- **AND** 默认 Vitest include 或测试 runner 配置 MUST 不包含手动 LLM 黑盒测试目录

#### Scenario: 专用命令运行基础黑盒套件
- **WHEN** 开发者执行基础 LLM 黑盒测试专用命令
- **THEN** 系统 MUST 运行从 `llm基础测试.md` 解析出的首页聊天基础 flow
- **AND** 命令输出 MUST 明确显示本次运行的 flow 数、turn 数、模型、judge 模型和报告路径
- **AND** 命令 MUST 在真实模型调用前输出预计 token 消耗

#### Scenario: 缺少真实模型配置时不使用 mock
- **WHEN** 开发者执行基础 LLM 黑盒测试专用命令但缺少必需模型配置
- **THEN** 系统 MUST 输出缺失配置名称
- **AND** 系统 MUST NOT 静默改用 mock、旧快照、固定答案或非真实模型结果
- **AND** 系统 MUST 生成失败或跳过摘要，说明真实基础黑盒测试未运行

#### Scenario: 基础套件失败时命令失败
- **WHEN** 基础 LLM 黑盒测试中任一已执行 turn 判定失败
- **THEN** 专用命令 MUST 以非零退出码结束
- **AND** 命令输出 MUST 指向报告中的失败 flow 和轮次
- **AND** 命令 MUST 保留已完成 turn 的最终输出摘要，便于人工复核

### Requirement: 基础 LLM 黑盒测试必须模拟聊天框输入边界
系统 SHALL 通过首页聊天请求合同模拟用户在聊天框逐轮输入，而不是调用 Agent 内部 planner、tool handler 或 response renderer 作为测试入口。

#### Scenario: 请求体匹配首页聊天输入
- **WHEN** 基础 LLM 黑盒 runner 发送某一轮用户输入
- **THEN** 请求 MUST 使用与首页聊天客户端等价的 `latestUserMessage`
- **AND** 请求 MUST 携带当前 flow 的 `conversationId`
- **AND** 请求 MUST 使用同一 flow 内已完成轮次形成的聊天上下文继续请求
- **AND** 请求 MUST NOT 通过测试专用字段绕过生产聊天输入校验

#### Scenario: 响应解析匹配用户可见事件
- **WHEN** 基础 LLM 黑盒 runner 消费聊天响应
- **THEN** 系统 MUST 按生产 NDJSON 事件合同解析响应
- **AND** 系统 MUST 只从用户可见事件构造最终 assistant 输出
- **AND** 系统 MUST NOT 读取开发态 trace store、数据库内部 fact 表或 Agent runtime 内存状态来补齐判定输入

#### Scenario: 不要求浏览器验证
- **WHEN** 开发者运行基础 LLM 黑盒测试
- **THEN** 系统 MUST NOT 要求启动 dev server
- **AND** 系统 MUST NOT 要求打开真实浏览器、Browser、Chrome DevTools、Playwright 或截图工具
- **AND** 测试 MUST 通过请求层模拟聊天框输入并验证最终输出
