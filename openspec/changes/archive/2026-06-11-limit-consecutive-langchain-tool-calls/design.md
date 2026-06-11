## Context

生产 `/api/chat` 当前使用 `langchain-agent-runtime-v1` 和 DeepSeek native `tool_calls`。Runtime 同时存在三类预算：

- `maxModelCalls`：限制 provider model call 总数。
- `maxToolCalls`：限制业务 tool handler 整轮总执行次数。
- `maxToolCallsPerTool`：当前实现用 LangChain `toolCallLimitMiddleware` 作为同一业务 tool 的整轮累计上限。

日志暴露的问题不是 provider 调用失败，也不是结构化输出失败，而是模型在合法多步规划中可能需要“查询 tool -> 其他业务 tool -> 查询 tool”的回访能力。整轮累计 per-tool 上限会误杀这种流程。

## Goals / Non-Goals

**Goals:**

- 将 `maxToolCallsPerTool` 的语义调整为“连续同业务 tool 调用上限”。
- 保留 `maxToolCalls` 和 `maxModelCalls` 作为整轮安全熔断。
- 让 activity tool 不打断业务 tool 连续计数，避免模型通过 `reportAgentActivity` 绕过连续限制。
- 同步模型可见 system prompt 的运行预算说明。
- 通过 runtime 单测覆盖连续限制、合法回访、activity 不打断和全局预算。

**Non-Goals:**

- 不新增业务 tool，不修改 production tool catalog。
- 不在 runtime 中新增具体业务 `toolName` 语义分支。
- 不基于用户原文、关键词、正则、同义词表或 phrasing 改写 provider `tool_calls`。
- 不实现“重复输入”“是否有新事实”“是否有进展”等语义判断；这类判断应继续由模型基于可见事实自主完成，全局预算负责成本熔断。
- 不修改 `/api/chat` route、response adapter、数据库 schema 或前端事件合同。

## Decisions

### 1. 用连续同业务 tool 计数替代整轮 per-tool run limit

Runtime SHALL 基于当前 run 的消息历史计算连续业务 tool 调用序列：只统计 `executionKind != "activity"` 的业务 tool，遇到另一个业务 tool 时重置当前业务 tool 的连续计数。

活动汇报 tool 不参与业务 tool 连续序列，也不打断序列。例如：

- `search -> search -> search`：第三次 MUST 被拒绝。
- `search -> search -> resolve -> search`：后一次 `search` MUST 允许。
- `search -> search -> reportAgentActivity -> search`：后一次 `search` MUST 仍被拒绝。

替代方案：只调大 `maxToolCallsPerTool`。拒绝原因是它没有表达真实边界，只是扩大误杀窗口，同时仍会在复杂合法流程中触顶。

### 2. 保留整轮总预算作为安全熔断

`maxToolCalls` 继续限制整轮业务 tool 总执行次数，`maxModelCalls` 继续限制 provider 调用次数。连续限制只解决“模型连续卡在同一个业务 tool 上”的局部循环，不承担整轮成本控制。

替代方案：增加重复输入或新事实判断。拒绝原因是这会让服务端 runtime 成为语义裁判，并可能引入和具体业务 tool 输入结构耦合的规则。当前需求不需要这类判断。

### 3. 不依赖具体业务 toolName

连续计数由 tool wrapper 的 `executionKind` 和 tool call 历史驱动，不写 `searchExerciseResources`、`resolveExerciseResourceMentions` 或其他业务 tool 专属分支。具体业务名只允许出现在测试样例和 trace 证据说明中。

### 4. Prompt 只同步预算合同

默认 system prompt 中的运行预算文案 SHALL 从“每个业务工具本轮最多 N 次调用”调整为“同一个业务工具最多连续 N 次调用”。Prompt 不新增业务流程、不要求固定 tool 调用顺序、不把某个失败 trace 写成生产规则。

## Risks / Trade-offs

- [Risk] 模型可能通过不同业务 tool 交替调用消耗更多预算。
  - Mitigation: `maxToolCalls` 和 `maxModelCalls` 继续作为整轮熔断；本 change 不放宽总预算。
- [Risk] 连续计数实现如果只看 handler 成功记录，可能漏掉同一 provider response 内的多次同 tool 调用。
  - Mitigation: 单测覆盖同一响应内连续超限和跨响应连续超限；超限调用不得执行 handler。
- [Risk] activity tool 如果被当作打断，会让模型绕过连续限制。
  - Mitigation: 明确 activity 不参与也不打断业务 tool 连续序列，并补回归测试。
- [Risk] prompt 文案与 runtime 行为不同步。
  - Mitigation: 同步 `buildLangChainAgentSystemPrompt()`，并运行 runtime 相关测试和 typecheck。

## Migration Plan

1. 更新 OpenSpec delta specs 和任务清单。
2. 在 LangChain runtime 中替换 per-tool run limit middleware 的整轮累计语义。
3. 更新集中配置注释和 prompt 运行预算文案。
4. 更新 runtime 单测。
5. 运行 `openspec validate limit-consecutive-langchain-tool-calls --strict`、相关 runtime 测试和 `npm run typecheck`。

回滚方式：恢复原 `toolCallLimitMiddleware` per-tool run limit 和原 prompt 文案；全局预算不受影响。

## Open Questions

无。
