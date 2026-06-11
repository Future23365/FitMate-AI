## Why

当前 LangChain Agent Runtime 使用“同一业务 tool 在整轮 run 中最多调用 2 次”的硬上限。这个边界会误伤合法的多步 Agent 流程：模型可能先查询动作事实，再调用其他业务 tool 解析或校验事实，之后需要回到同一个查询 tool 做更精确的补充查询。

系统已经有整轮业务 tool 总调用预算和模型调用预算兜底成本与无限循环风险。因此单 tool 上限应只负责阻止模型连续卡在同一个业务 tool 上，而不应禁止被其他业务 tool 打断后的合法回访。

## What Changes

- 将业务 tool 的单 tool 限制语义从“整轮 run 内最多 N 次”调整为“连续调用同一业务 tool 最多 N 次”。
- 保留整轮业务 tool 总调用预算和模型调用预算，继续作为安全熔断。
- 让 `reportAgentActivity` 这类 activity tool 不打断业务 tool 连续计数，避免模型通过活动汇报绕过连续限制。
- 同步默认 LangChain system prompt 中的运行预算说明，使模型看到的预算合同与 runtime 行为一致。
- 更新 LangChain runtime 单测，覆盖连续限制、被其他业务 tool 打断后的合法回访、activity tool 不打断连续计数和全局预算仍生效。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `langchain-agent-runtime`: 调整业务 tool 单 tool 限制语义，从整轮 per-tool run limit 改为连续同业务 tool 限制，同时保留全局预算安全熔断。
- `agent-runtime-configuration`: 同步集中配置中 `maxToolCallsPerTool` 的业务含义，使其表示连续同业务 tool 上限，而不是整轮累计上限。

## Impact

- 影响代码：
  - `lib/server/langchain-agent/runtime.ts`
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/config/agent-runtime-config.ts`
  - `tests/langchain-agent-runtime/runtime.test.ts`
- 不新增业务 tool，不修改 production tool catalog，不修改 `/api/chat` route，不新增服务端关键词、正则、同义词或用户 phrasing 分流。
- 不修改数据库、Prisma schema、前端事件合同或用户可见 API 契约。
