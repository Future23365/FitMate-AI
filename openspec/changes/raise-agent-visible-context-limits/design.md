## Context

当前主链把业务 tool 的 `toModelVisibleSummary()` 序列化成 LangChain `ToolMessage content`。如果摘要超过 `modelVisibleSummaryMaxLength`，会被包装成 `status: "truncated"`，模型只能看到 preview。即使字符串长度预算调大，模型可见摘要链路中的 `toLangChainJsonValue()` 仍会先把数组裁到 20 项、对象裁到 30 个字段，因此候选事实可能在序列化前被结构裁剪。

本次目标只覆盖主 Agent 模型可见 tool result summary 的截断问题。业务 tool 返回数量、trace/user projection、聊天历史窗口、timeout 和调用次数仍按原业务配置处理；token 成本和更精细的压缩策略后续单独处理。

## Goals / Non-Goals

**Goals:**

- 提高主 Agent 可见 tool result summary 的长度预算，避免正常动作候选和历史训练事实被包装成 `status: "truncated"`。
- 提高 `ToolMessage content` 模型可见摘要链路的 JSON 数组项数和对象字段数预算，避免结构层面提前丢候选。
- 保持模型调用次数、整轮业务 tool 调用次数、单 tool 重复调用次数、timeout、业务候选数量、业务 hard cap、trace/user projection、terminal failure finalizer 和聊天 raw message 上限不变。
- 保持模型可见摘要预算来自集中配置，方便后续 token 优化时统一回收。

**Non-Goals:**

- 不新增或改名业务 tool。
- 不修改 `/api/chat` 主链路、LangChain runtime 主循环或 provider payload 合同。
- 不增加服务端关键词、正则、同义词或用户 phrasing 分流。
- 不移除所有确定性上限；provider 上下文、请求延迟和浏览器响应仍需要有限边界。
- 不调大 `maxModelCalls`、`maxToolCalls` 或 `maxToolCallsPerTool`。
- 不调大 `searchExerciseResources.defaultCandidateCountPerSection`、`maxCandidateCountPerSection`、repository hard cap、`inspectVisibleTrainingProposals.recentFactListLimit` 或 fact store hard cap。

## Decisions

1. **只把模型可见摘要结构裁剪预算配置化。**
   只改 `modelVisibleSummaryMaxLength` 会留下数组 20 项、对象 30 字段的隐性裁剪。新增集中配置后，只允许 `ToolMessage content` 相关的 `toModelVisibleSummary()` 序列化链路使用放大的结构预算；userProjection、traceSummary、NDJSON projection 和 finalizer 输入继续使用原投影预算。

2. **不把业务返回数量当作摘要截断配置。**
   `searchExerciseResources.maxCandidateCountPerSection`、repository hard cap、`inspectVisibleTrainingProposals.recentFactListLimit` 和 fact store hard cap 是业务检索数量边界，不是 `status: "truncated"` 类型的模型可见摘要截断设置。本次保持原值。

3. **保留确定性上限。**  
   当前目标不是无限上下文，而是避免已知正常 tool result summary 被过早截断。所有值仍保留明确上限，后续可以基于 trace token usage 再做压缩和成本控制。

4. **不改模型语义策略。**  
   本次只扩大模型可见事实预算，不改变 `searchExerciseResources` 何时应停止查询、候选池如何消费、或结构化训练方案如何提交。

## Risks / Trade-offs

- [Risk] 单次 `ToolMessage content` 变大，token 成本、延迟和 provider 失败概率上升。
  Mitigation：只扩大模型可见 tool result summary，不扩大业务检索数量或 trace/user projection；后续可用 trace token usage 定量回收。

- [Risk] 更完整的摘要可能让模型看到更多同一次查询内的候选事实。
  Mitigation：不改变 tool result 的事实等级和 grounding 说明，不改变候选查询数量。

- [Risk] 后续维护者可能再次把模型可见预算误用于 projection。
  Mitigation：helper 命名限定为 `createLangChainModelVisibleJsonProjectionBudget()`，只在 `ToolMessage content` 相关调用点使用。
