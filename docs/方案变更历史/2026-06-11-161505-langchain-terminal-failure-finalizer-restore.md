# LangChain terminal failure finalizer 恢复

时间：2026-06-11 16:15:05 CST

## 背景

LangChain 主链迁移后，生产 `/api/chat` 在主 Agent 失败时只剩 response adapter 的确定性 fallback。这样虽然安全，但丢失了旧链路里“模型先尝试解释失败并给用户可继续操作建议”的收口体验：当 `submitVisibleTrainingProposal`、结构化终态或运行预算失败时，用户更容易看到服务端固定回复，而不是结合本轮失败摘要的普通助手回复。

## 原方案问题

- 主 Agent 失败后直接进入固定 fallback，无法区分“模型可以解释失败”和“必须固定兜底”的两层边界。
- LangChain 迁移后的失败 trace 已能记录 tool schema issue、tool execution 和 runtime summary，但这些诊断没有进入一个受限的失败解释模型调用。
- 如果直接恢复旧 finalizer，会把旧 `AgentAction`、旧 runtime 语义和当前 LangChain tool calling 混在一起，增加协议回退风险。

## 调整思路

本次把 finalizer 恢复为 LangChain production service 的失败后 adapter，而不是主 Agent 的一部分：

- 主 Agent 仍负责 tool calling、结构化终态、可见训练方案校验和业务事实。
- finalizer 只在主 Agent 失败后运行一次，输入是脱敏失败摘要、`schemaIssues` 和已验证事实摘要。
- finalizer 输出只允许 `{ "content": string, "suggestedQuestions"?: string[] }`，再由 response adapter 投影为普通 NDJSON。
- finalizer 失败、跳过或输出不合法时，仍走现有确定性 fallback。

## 关键改动

- 新增 `lib/server/langchain-agent/terminal-failure-finalizer.ts`，定义 finalizer 输入、输出校验、分类、trace summary 和模型调用。
- 在集中配置中加入 `terminalFailureFinalizer` 的开关、超时、token 和长度预算。
- `/api/chat` LangChain service 在主 Agent 失败后调用 finalizer，并把结果交给 response adapter。
- response adapter 新增 `terminal_failure_finalizer` projection type，确保 finalizer 不输出 `visible_output` 或旧协议事件。
- trace 新增 `LangChain Terminal Failure Finalizer` step，记录成功、跳过或降级原因。

## 验证

- finalizer 单元测试覆盖成功输出、非法 JSON、provider/config 跳过、schema issue 输入脱敏和 prompt 边界。
- response adapter 测试覆盖 finalizer projection 事件白名单。
- `/api/chat` 路由测试覆盖 `budget_exhausted` 后 finalizer 成功接管，并确认确定性 fallback 不被提前触发。

