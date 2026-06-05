## Why

根目录 `llm基础测试.md` 已经沉淀了首页聊天基础黑盒用例，但当前手动 LLM 测试合同没有明确把这份文档作为基础用例来源，也没有把断言边界收敛到“模拟用户聊天框输入后，判断最终 AI 用户可见输出”。这会让后续实现继续验证内部事件、卡片中间态或旧 fixture，而不是验证用户真正看到的聊天结果。

首版实现完成后，进一步审查发现基础 runner 仍有几处“请求层半黑盒”风险：它可能向 `/api/chat` 传入首页客户端没有发送的完整 `messages` 历史，未覆盖真实会话保存后的 hydration 边界，NDJSON 解析和生产客户端解析存在漂移风险，并且 token 汇总读取开发态 trace store。需要在同一个 change 中补齐这些边界，确保该套件长期只依赖首页聊天公开请求/响应合同。

## What Changes

- 新增一组手动运行的首页聊天基础 LLM 黑盒测试，测试用例来源为根目录 `llm基础测试.md` 的三轮流程表。
- 测试默认不被 `npm run test`、常规自动化测试或 CI 运行；只能通过专用手动命令显式触发。
- runner 按真实用户在首页聊天框逐轮输入的方式执行同一会话流程，每个 flow 从新会话开始，同一 flow 内串行继承上轮上下文。
- 断言层只读取每轮请求完成后的最终 assistant 用户可见输出，并与 `llm基础测试.md` 中该轮期望做语义匹配；不把 stream 中间 chunk、Agent loop、tool execution、trace event、内部 action、调试事件或旧卡片触发字段作为通过条件。
- 报告保留足够人工复核的信息：flow id、轮次、用户输入、文档期望、最终 AI 回复摘要、判定结果、失败原因、运行时间和 token 汇总。
- 不改变 `/api/chat` 业务行为、不新增服务端自然语言分流、不新增 mock 模型兜底、不把该黑盒测试纳入默认自动测试。
- 收紧 runner 请求体，禁止传入首页客户端没有发送的完整历史 `messages` 或其他测试专用绕过字段。
- 在多轮 flow 中补齐会话保存/读取边界，让第 2、3 轮尽量通过 `conversationId + current user` 的服务端 hydration 继续，而不是只靠 runner 内存历史。
- 复用生产 NDJSON parser 或共享解析合同，确保页面会失败的未知/非法事件不会被黑盒 runner 静默忽略。
- 将 `assistant_suggestions`、`confirmation_request` 和安全错误文案纳入最终用户可见输出摘要；仍然排除 `agent_progress`、`tool_result`、trace、planner action 和 raw provider response。
- 将 token usage 明确降级为可选诊断，不能依赖开发态 trace store 作为通过条件或必需输入。
- 放松非真实模型单测对 `llm基础测试.md` 当前 flow 数量和固定 ID 列表的硬编码，避免用例文档正常增删时误伤测试基建。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-blackbox-llm-flow-tests`: 补充基础黑盒套件必须以 `llm基础测试.md` 为用例来源，并且断言对象必须是最终 assistant 用户可见输出。
- `manual-llm-consistency-tests`: 补充手动运行隔离、专用命令、报告和失败输出要求，明确基础黑盒套件不会被默认测试自动运行。

## Impact

- 预计影响文件：
  - `llm基础测试.md`
  - `manual-tests/llm/**`
  - `scripts/run-manual-llm-tests.mjs`
  - `package.json`
  - `docs/manual-llm-blackbox-flow-latest-report.md` 或等价手动报告路径
  - `features/chat/api/chat-client.ts` 或等价共享 NDJSON 解析模块
  - `features/chat/lib/chat-history.ts` 或等价会话保存测试适配入口
  - `openspec/specs/chat-blackbox-llm-flow-tests/spec.md`
  - `openspec/specs/manual-llm-consistency-tests/spec.md`
- 不要求真实浏览器、截图或页面打开验证；实现应通过请求层模拟首页聊天输入，并解析最终用户可见 AI 输出。
- 不新增生产 API、数据库模型、权限模型或 AI tool 能力。
