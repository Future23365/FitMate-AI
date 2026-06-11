## Context

生产 `/api/chat` 当前使用 `LangChain Agent Runtime + @langchain/deepseek + DeepSeek native tool_calls`。最新 trace 显示，模型完成 5 次 provider model call 和 5 次 tool execution 后，底层 LangChain graph runner 抛出：

```text
Recursion limit of 10 reached without hitting a stop condition.
```

当前配置问题不在单个业务 tool，而在 runtime 预算合同：`maxIterations = 8` 被换算为 `recursionLimit = 10`，但 LangChain 底层按 graph step 计数，一轮“模型请求 tool_call + tool 执行”通常会消耗两个 graph step。`maxModelCalls` 当前没有硬门禁，`structuredOutputValidationTimeoutMs` 也没有真实消费点，配置看起来完整但没有与 LangChain 执行参数同步。

本 change 属于 LangChain runtime / wrapper 通用合同变更。允许触碰 `lib/server/config/agent-runtime-config.ts`、`lib/server/langchain-agent/runtime.ts`、`lib/server/langchain-agent/prompt.ts` 和相关测试 / OpenSpec 文档。禁止触碰 `/api/chat` 主链路、业务 tool handler、provider payload 合同、response adapter 主流程，禁止新增服务端关键词或业务 `toolName` 特判。

## Goals / Non-Goals

**Goals:**

- 删除或替换不表达真实 LangChain 执行语义的预算字段。
- 让 `maxModelCalls` 成为真实硬门禁，而不是只存在于集中配置。
- 让传给 LangChain 的 `recursionLimit` 与模型调用预算同步，保证配置允许的业务 tool 链路有最终结构化回答空间。
- 将业务 tool 预算、activity report 预算和 graph step 预算分层表达，避免 activity report 挤占业务 tool 预算却仍悄悄耗尽 graph step。
- 更新模型可见 system prompt 的预算说明，使其符合 `docs/llm-prompt-guidance.md` 的分层原则：只表达稳定运行边界，不写业务 tool 流程。

**Non-Goals:**

- 不扩大业务 tool catalog，不新增或重命名业务 tool。
- 不修改 DeepSeek provider 请求 payload、tool schema 或业务 tool description。
- 不根据用户原文、trace 标题、具体 phrasing 或业务字段组合调整预算。
- 不把 `budget_exhausted` 变成成功回答，也不绕过 terminal failure finalizer。

## Decisions

### 1. 删除 `maxIterations`，用模型调用预算推导 LangChain graph step 限制

`maxIterations` 名称来自旧自研 Agent loop，迁移到 LangChain 后容易被误读成“模型调用次数”或“业务迭代次数”。实现上改为通过 helper 从 `maxModelCalls` 推导 `recursionLimit`：

```txt
recursionLimit = max(2, maxModelCalls * 2 + 1)
```

理由：在当前 LangChain agent harness 下，常见路径是“模型节点 -> 工具节点 -> 模型节点”。`maxModelCalls * 2 + 1` 给每次模型调用预留一个相邻 graph step，并额外保留一次进入 middleware 的机会，让 runtime 自己的 `maxModelCalls` 硬门禁能先于底层 recursion error 给出稳定 `budget_exhausted`。

备选方案：新增显式 `graphRecursionLimit` 配置。暂不采用，因为它会与 `maxModelCalls` 再次产生同步风险；除非未来要针对不同 LangChain graph 拓扑做独立调参，否则推导更可维护。

### 2. 让 `maxModelCalls` 成为 runtime 硬门禁

在 LangChain model call middleware 入口处检查下一次模型调用是否超过 `maxModelCalls`。如果超过，直接抛出稳定预算错误并归一为 `budget_exhausted`，避免多余 provider 调用。

理由：只调整 `recursionLimit` 仍可能让 `maxModelCalls` 继续成为无效配置。硬门禁让配置、trace 和真实执行保持一致。

### 3. 收紧 activity report 预算并在 prompt 中区分预算类型

`reportAgentActivity` 不消耗业务 tool 预算，但仍消耗模型调用和 graph step。配置将保留独立 `maxActivityReports`，但默认值必须能被 `maxModelCalls` 覆盖；system prompt 只说明“业务工具调用”和“活动汇报”分别有预算，不把 activity report 算作业务 tool。

理由：activity report 是 UI 状态，不应该挤占业务 tool handler 次数；但它不是零成本，必须受模型调用预算和 graph step 预算约束。

### 4. 删除无真实消费点的 `structuredOutputValidationTimeoutMs`

当前结构化终态解析和校验在 `runLangChainAgentRuntime()` 内同步完成，没有异步 timeout 消费点。保留该配置会造成“以为有保护但实际没有”的错觉。本 change 删除该字段，并更新相关 OpenSpec 描述。

理由：集中配置只保留真实生效字段。未来如果结构化终态校验变成异步或外部服务，再按新的执行点重新引入明确预算。

## Risks / Trade-offs

- [Risk] `maxModelCalls` 硬门禁可能暴露之前被 `recursionLimit` 掩盖的长链路失败。  
  Mitigation：默认值设置为覆盖 `activity report + 多次业务 tool + final response` 的常规路径，并补回归测试验证合法路径。
- [Risk] 降低 `maxActivityReports` 可能减少前端活动条更新频率。  
  Mitigation：activity report 仍可与业务 tool 在同一轮 provider `tool_calls` 中发送；默认保留少量活动汇报，避免刷屏和预算空转。
- [Risk] 删除 `structuredOutputValidationTimeoutMs` 会让旧文档或测试引用失效。  
  Mitigation：用 `rg` 检查旧字段残留，并更新 OpenSpec delta 与 config tests。
- [Risk] `recursionLimit = maxModelCalls * 2 + 1` 依赖当前 LangChain agent graph 形态。  
  Mitigation：通过 helper 集中推导并加单测；如果未来 LangChain graph 拓扑变化，只改 helper 和测试，不让业务模块重复推导。
