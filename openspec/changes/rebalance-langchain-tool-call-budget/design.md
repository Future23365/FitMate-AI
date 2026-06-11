## Context

当前生产 `/api/chat` 使用 `LangChain Agent Runtime + @langchain/deepseek + DeepSeek native tool_calls`。Runtime 已经用集中配置控制 `maxModelCalls`、`maxToolCalls`、`maxActivityReports` 和整体 timeout，但 `maxToolCalls = 5` 是所有业务 tool 共用的总预算。

这个共享预算会把“全局安全熔断”和“单个 tool 的修正空间”混在一起：如果模型连续调用第一个业务 tool 5 次，后续业务 tool 就没有任何调用机会。用户希望每个单独 tool 都有最多一次重试 / 修正空间，同时整轮仍保留更高的安全上限。

LangChain JS 已支持 `toolCallLimitMiddleware`，可以按 `toolName` 设置单轮 `runLimit`。本次 change 应优先复用这个原生 middleware，而不是自己在业务 tool handler 或 `/api/chat` route 中补计数。

## Goals / Non-Goals

**Goals:**

- 将整轮业务 tool 总预算调为 20，作为全局安全熔断。
- 为每个业务 tool 配置独立单轮调用上限，默认 `runLimit = 2`。
- 使用 LangChain 原生 `toolCallLimitMiddleware` 表达 per-tool 限制。
- 让 per-tool 限制自动来自 production tool catalog，不手写具体业务 toolName 分支。
- 更新模型可见运行预算说明和测试，避免模型只看到旧的共享 5 次预算。

**Non-Goals:**

- 不新增业务 tool。
- 不修改业务 tool handler、input schema、output schema 或数据库查询语义。
- 不基于用户原文、关键词、短句模板或具体 phrasing 判断是否允许重试。
- 不改变 provider payload 合同、`/api/chat` 主链路或用户可见 API 契约。
- 不把 `reportAgentActivity` 纳入业务 tool per-tool 限制。

## Decisions

### 1. 使用 LangChain `toolCallLimitMiddleware` 做 per-tool 限制

选择：Runtime 在创建 `createAgent` 时，为每个 `executionKind !== "activity"` 的 production tool wrapper 生成：

```ts
toolCallLimitMiddleware({
  toolName: wrapper.name,
  runLimit: config.runBudget.maxBusinessToolCallsPerTool,
  exitBehavior: "continue",
})
```

理由：这是 LangChain 原生支持的 tool 调用限制能力，能让模型在超过单个 tool 上限时收到 ToolMessage 错误并继续收口。相比在业务 handler 内加计数，它不会污染业务 tool；相比手写 runtime 分支，它更贴近 LangChain agent loop。

备选方案：完全自定义 `reserveToolCall`，按 toolName 维护计数。缺点是会重复 LangChain 已有能力，也需要维护 limit exceeded ToolMessage 语义。

### 2. 保留项目全局业务 tool 总预算，但从 5 调到 20

选择：`maxToolCalls` 继续作为整轮业务 tool 安全上限，默认值改为 20。

理由：per-tool 限制解决公平性问题，但仍需要整轮硬上限防止模型在多个 tool 之间循环。20 能覆盖当前 4 个业务 tool 每个最多 2 次、activity report、最终结构化收口和一定未来 tool 增量，同时不会无界放大成本。

备选方案：删除项目全局预算，只依赖 LangChain per-tool limit。缺点是 tool catalog 扩大后总调用次数会随 tool 数线性增长，缺少独立的全局安全熔断。

### 3. activity tool 继续使用独立预算

选择：`reportAgentActivity` 仍由 `maxActivityReports` 控制，不加入 per-tool business limit。

理由：activity report 是 request-local UI 状态，不支撑最终回答 grounding；它已有独立上限，混入业务 tool 限制会让模型可见预算语义变乱。

### 4. 模型可见说明只描述稳定预算，不写业务流程

选择：system prompt 的运行预算说明更新为：

- 本轮最多 20 次业务工具调用。
- 每个业务工具最多 2 次调用。
- `reportAgentActivity` 最多 2 次且不计入业务工具预算。

理由：这是稳定 runtime 约束，属于通用 prompt 合同。说明中不出现具体用户 phrasing，不要求模型按固定业务流程调用某个 tool。

## Risks / Trade-offs

- [Risk] `toolCallLimitMiddleware` 和项目自定义 `reserveToolCall` 都会参与限制，可能出现两个错误来源。→ Mitigation: 明确分层：LangChain middleware 管 per-tool `runLimit`，项目预算管总业务 tool 安全上限；测试分别覆盖 per-tool 超限和总预算超限。
- [Risk] 总预算从 5 调到 20 会增加最坏路径模型成本和延迟。→ Mitigation: 保留 `maxModelCalls`、`overallTimeoutMs`、per-tool `runLimit = 2` 和 tool timeout；测试更新 `maxModelCalls` 与新预算的关系。
- [Risk] production catalog 新增业务 tool 时忘记应用 per-tool 限制。→ Mitigation: Runtime 从 `toolWrappers` 自动生成 middleware，不需要新增 tool 时手动注册 limit。
- [Risk] LangChain middleware 超限错误文案与项目结构化失败格式不同。→ Mitigation: Runtime tests 只依赖稳定行为和预算结果，不把 LangChain 内部英文文案当作业务合同；后续如需统一投影，可单独 change 处理。
