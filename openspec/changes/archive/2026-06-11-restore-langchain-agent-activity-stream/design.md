## Context

当前生产 `/api/chat` 已切换到 `LangChain Agent Runtime + @langchain/deepseek + DeepSeek native tool_calls`。前端活动条仍支持 `agent_loop` 和 `agent_progress.activitySummary`，但服务端只发出 `preparing_context`、`analyzing_request`、`writing_reply` 等粗粒度状态，无法表达模型每一步真实准备做什么。

用户明确要求活动文案来自大模型总结，而不是服务端基于 tool 的固定文案。因此本次改动必须同时处理模型可见合同、LangChain tool catalog、runtime 观测事件和 NDJSON 安全投影。

## Goals / Non-Goals

**Goals:**

- 让模型通过受控 LangChain tool 主动报告当前步骤摘要。
- 将模型活动摘要实时投影到现有 `agent_progress.activitySummary`。
- 服务端对活动摘要采用宽松校验：只做结构、空值、长度裁剪和明显不可显示内容防护，不做严格中文、内部词或语义拦截。
- 保持活动摘要为当前请求内临时 UI 状态，不进入聊天历史、业务事实、模型上下文总结或最终回答 grounding。
- 保留 `agent_loop` 与 `agent_progress` 的独立状态模型。

**Non-Goals:**

- 不恢复旧 `AgentAction` / `PlannerPort` / `ToolRegistry` 生产主链。
- 不让服务端根据用户原文、关键词、业务 `toolName` 或 tool input 生成活动文案。
- 不让活动摘要影响 tool 选择、权限、validator、结构化终态输出或最终回答事实来源。
- 不新增真实业务 tool 或写入能力。
- 不启动浏览器或 dev server 验证。

## Decisions

### 1. 使用 `reportAgentActivity` 作为模型活动汇报 tool

新增 `reportAgentActivity` LangChain tool，输入包含：

```json
{
  "summary": "我先确认你的训练目标和可用条件",
  "stepType": "understand_request"
}
```

该 tool 是控制 / UI 观察类 tool，不查库、不读写业务数据、不产生业务 resource，不作为最终回答 grounding。模型可以在调用业务 tool 前先调用它，或在同一轮 provider `tool_calls` 中把它放在业务 tool 前面。

选择 tool 而不是正文内嵌状态，是因为 native tool calling 下结构化 tool input 可以被服务端校验、单独投影和丢弃，不污染 assistant 正文、聊天历史或 structured final response。

### 2. 服务端只宽松校验与投影，不生成固定文案

`reportAgentActivity` 的 handler 只返回经过宽松归一化的摘要：

- trim 空白；
- 空字符串拒绝或转成不输出；
- 允许自然中文、少量英文和普通标点；
- 超过上限时裁剪，而不是严格拒绝；
- 去掉控制字符、换行和明显会破坏 UI 的代码块包裹；
- 不检查具体业务语义，不根据 `toolName` 改写文案。

这样符合“文案由模型总结”的产品目标，也避免严格 sanitizer 误伤模型自然语言。

### 3. runtime observer 负责实时写出活动事件

`runLangChainAgentRuntime` 增加可选 observer，例如：

```ts
onRuntimeEvent?: (event: LangChainAgentRuntimeObserverEvent) => void | Promise<void>
```

当 `reportAgentActivity` wrapper 执行成功时，runtime 触发：

```ts
{
  type: "model_activity_reported",
  summary,
  stepType,
  modelCallIndex,
  runtimeStep,
  toolCallId
}
```

`/api/chat` streaming response 监听该事件，并立即写出：

```json
{
  "type": "agent_progress",
  "stage": "model_activity",
  "status": "active",
  "messageKey": "model_activity",
  "activitySummary": "我先确认你的训练目标和可用条件",
  "sequence": 4
}
```

### 4. `reportAgentActivity` 不占业务 tool 预算

活动汇报是 UI 状态，不应挤占动作检索、引用读取、结构化收口等业务 tool 预算。实现上可以在 tool wrapper metadata 或 wrapper 名称边界中标记为 activity tool，让业务 `maxToolCalls` 预算只统计真实业务 tool；同时为 activity tool 设置单独上限，避免模型无限刷状态。

### 5. Prompt 只写通用活动汇报规则

system prompt 新增短规则：

- 新推理、查询、校验、整理步骤开始前，可以调用 `reportAgentActivity` 报告当前步骤；
- `summary` 必须是模型对当前步骤的自然语言总结；
- 不要输出 toolName、内部字段、trace id、数据库 id、错误堆栈；
- 不要声称未完成的事情已经完成；
- 活动汇报不替代业务 tool、结构化终态工具或最终回答。

业务 tool 的具体能力仍留在各自 tool description / schema description，不把某个业务 tool 的流程写进通用 prompt。

## Risks / Trade-offs

- [Risk] 模型可能不调用 `reportAgentActivity`，活动条仍只显示初始加载态。  
  Mitigation: 在 system prompt 和 tool description 中明确建议每个新步骤前调用；测试覆盖模型返回该 tool call 时的投影，不强制服务端替模型补文案。

- [Risk] 模型活动摘要可能偏长或夹带内部词。  
  Mitigation: 服务端宽松裁剪和去控制字符；前端继续把摘要当临时 UI 文案，不进入消息、历史或业务事实。

- [Risk] 活动 tool 增加 provider tool call 数量，可能增加少量延迟和 token。  
  Mitigation: 摘要短文本、单独 activity 上限、不要把 activity output 长期回灌上下文。

- [Risk] LangChain tool execution 顺序与 provider tool_calls 顺序存在并行或内部调度差异。  
  Mitigation: 本阶段只要求 activity tool 成功执行后尽快投影；不把它作为业务 tool 严格前置条件。

- [Risk] 过严 sanitizer 会违背用户“宽松一些”的要求。  
  Mitigation: 服务端仅做结构和 UI 破坏性内容防护，不做严格中文和内部术语黑名单。
