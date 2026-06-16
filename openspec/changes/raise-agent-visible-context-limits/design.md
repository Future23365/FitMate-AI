## Context

当前主链把业务 tool 的 `toModelVisibleSummary()` 序列化成 LangChain `ToolMessage content`。如果摘要超过 `modelVisibleSummaryMaxLength`，会被包装成 `status: "truncated"`，模型只能看到 preview。即使字符串长度预算调大，`toLangChainJsonValue()` 仍会先把数组裁到 20 项、对象裁到 30 个字段，因此候选事实可能在序列化前被结构裁剪。

本次目标是准确度优先。token 成本和更精细的压缩策略后续单独处理。

## Goals / Non-Goals

**Goals:**

- 提高主 Agent 可见 tool result summary 的长度预算，避免正常动作候选和历史训练事实被包装成 `status: "truncated"`。
- 提高 JSON 投影的数组项数和对象字段数预算，避免结构层面提前丢候选。
- 提高动作候选、历史 visibleTrainingProposal 事实、失败收口输入和相关 trace / NDJSON 投影预算。
- 保持所有预算来自集中配置或明确 hard cap，方便后续 token 优化时统一回收。
- 保持模型调用次数、整轮业务 tool 调用次数和单 tool 重复调用次数的原预算不变。

**Non-Goals:**

- 不新增或改名业务 tool。
- 不修改 `/api/chat` 主链路、LangChain runtime 主循环或 provider payload 合同。
- 不增加服务端关键词、正则、同义词或用户 phrasing 分流。
- 不移除所有确定性上限；provider 上下文、请求延迟和浏览器响应仍需要有限边界。
- 不调大 `maxModelCalls`、`maxToolCalls` 或 `maxToolCallsPerTool`。

## Decisions

1. **把结构裁剪预算配置化，而不是只调大字符串长度。**  
   只改 `modelVisibleSummaryMaxLength` 会留下数组 20 项、对象 30 字段的隐性裁剪。新增集中配置后，模型可见摘要、projection、trace 和 finalizer 可以统一使用同一结构预算。

2. **同步调大业务 hard cap。**  
   `searchExerciseResources.maxCandidateCountPerSection` 如果超过 repository hard cap，实际仍只能返回旧上限；`inspectVisibleTrainingProposals.recentFactListLimit` 也受 fact store hard cap 限制。本次同时调大配置和 hard cap，避免配置看似生效但事实仍被底层截断。

3. **保留确定性上限。**  
   当前目标不是无限上下文，而是避免已知正常业务输出被过早截断。所有值仍保留明确上限，后续可以基于 trace token usage 再做压缩和成本控制。

4. **不改模型语义策略。**  
   本次只扩大模型可见事实预算，不改变 `searchExerciseResources` 何时应停止查询、候选池如何消费、或结构化训练方案如何提交。

## Risks / Trade-offs

- [Risk] token 成本、延迟和 provider 失败概率上升。  
  Mitigation：保留集中配置和 hard cap，后续可用 trace token usage 定量回收。

- [Risk] 更大的候选池可能让模型选择空间变大。  
  Mitigation：不改变 tool result 的事实等级和 grounding 说明，只扩大候选事实可见量。

- [Risk] visible output / trace payload 变大。  
  Mitigation：仍保留明确长度和结构上限，不把完整内部 handler output 暴露给模型。
