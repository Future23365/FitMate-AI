## ADDED Requirements

### Requirement: 基础黑盒测试必须覆盖 thinkingEnabled 到 provider 请求的链路
系统 SHALL 在基础首页聊天黑盒或等价 adapter 测试中验证 `thinkingEnabled` 不只是请求字段或 metadata，而是会进入 DeepSeek provider 请求体。

#### Scenario: 黑盒请求保持首页公开字段
- **WHEN** 基础黑盒 runner 发送 `/api/chat` 请求
- **THEN** 请求体 MUST 继续只包含首页公开字段
- **AND** 请求体 MUST 包含 `thinkingEnabled`
- **AND** 请求体 MUST NOT 新增 provider 专有 `thinking`、`reasoning_effort`、planner override、tool override 或 runtime state

#### Scenario: adapter 测试验证开启路径
- **WHEN** 测试以 `thinkingEnabled = true` 或默认开启构造生产模型请求
- **THEN** 测试 MUST 断言 DeepSeek 请求体包含 `thinking.type = "enabled"`
- **AND** 测试 MUST 断言 `reasoning_effort = "high"` 或来自集中配置的等价值
- **AND** 测试 MUST 断言默认 model 为 `deepseek-v4-flash`，除非显式测试 env override

#### Scenario: adapter 测试验证关闭路径
- **WHEN** 测试以 `thinkingEnabled = false` 构造生产模型请求
- **THEN** 测试 MUST 断言 DeepSeek 请求体包含 `thinking.type = "disabled"`
- **AND** 测试 MUST 防止 adapter 省略 disabled 参数导致 provider 默认开启 Thinking Mode

#### Scenario: 用户可见黑盒结果不依赖 reasoning 原文
- **WHEN** 基础黑盒测试判断某一轮是否通过
- **THEN** judge 输入 MUST NOT 包含原始 `reasoning_content`
- **AND** 最终通过条件 MUST 继续只基于用户可见 assistant 文本、visible output、suggestedQuestions、confirmation 或安全错误文案
