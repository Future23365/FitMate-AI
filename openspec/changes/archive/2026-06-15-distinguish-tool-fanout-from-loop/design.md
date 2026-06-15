## Context

生产 `/api/chat` 当前使用 `LangChain Agent Runtime + DeepSeek native tool_calls`。Runtime 已经提供两层安全边界：整轮业务 tool 总预算 `maxToolCalls`，以及同一业务 tool 的连续调用上限 `maxToolCallsPerTool`。后者的目标是阻断模型在看到 tool observation 后仍反复请求同一业务能力的无进展循环。

当前实现把连续计数放在 tool execution coordinator 内，按每次业务 tool 执行递增。这会把同一 `AIMessage.tool_calls` 里多个同名、不同输入的并列查询也算作连续循环。该行为和门禁目标不一致，因为同一批 provider tool calls 仍属于一次模型决策，模型尚未看到任何 tool result，不能证明进入了 observation-driven loop。

## Goals / Non-Goals

**Goals:**

- 保留 `maxToolCallsPerTool = 2` 的防循环能力。
- 区分同一模型响应中的并列 fan-out 和跨模型响应的连续同 tool loop。
- 允许同一批次内同名业务 tool 的不同输入正常执行。
- 保留 duplicate input、全局 `maxToolCalls`、schema、权限、projection、trace 和 terminal failure 边界。
- 同步模型可见运行预算说明，避免 prompt 和 runtime 合同再次漂移。

**Non-Goals:**

- 不新增或重命名业务 tool。
- 不修改 `/api/chat` route、production tool catalog 或 response adapter 主流程。
- 不根据用户原文、关键词、短句模板、字段组合或具体业务 `toolName` 改写 provider tool calls。
- 不把某个训练场景的 `warmup` / `training` / `stretch` 组合写成通用 runtime 规则。
- 不取消整轮业务 tool 总预算或 duplicate input 防护。

## Decisions

### 1. 连续限制按 provider model response 批次计数

选择：连续同 tool 限制的计数单位从单次 tool execution 改为 provider model response 批次。一次模型响应内，同一业务 tool 出现多次只对连续序列贡献一次。跨模型响应连续出现同一主业务 tool 时，才递增连续批次计数。

理由：防循环门禁的业务含义是“模型已经拿到 observation 后仍继续请求同一能力”。同一 `AIMessage.tool_calls` 里的多个请求发生在同一次模型决策内，不属于 observation 后的循环。

替代方案：把 `maxToolCallsPerTool` 调大。拒绝原因是它只是扩大误伤窗口，仍没有表达真实 loop 边界，也会放宽真正无进展循环的安全限制。

### 2. 同批不同输入 fan-out 允许执行，重复同参仍由 duplicate input 处理

选择：同一批次内同名业务 tool 的不同 business input 允许执行，并继续消耗全局 `maxToolCalls`。同一批次内同名同参请求不新增专门分支，继续交给现有 duplicate input coordinator，确保 handler 不重复执行等价请求。

理由：多分面查询、并行候选读取、不同 filter 的事实探索都可能合理使用同一业务 tool。重复同参不是 fan-out，而是无新事实请求，应由通用 duplicate input 合同处理。

替代方案：要求模型必须合并所有同资源查询。拒绝原因是有些合法查询需要不同数量、排序或过滤条件；强制合并会降低 tool contract 表达力，并把业务策略写进 runtime。

### 3. 超限后仍终止主 Agent loop

选择：当跨模型响应的连续同 tool 批次超过配置上限时，runtime 仍创建 `tool_consecutive_call_limit_exceeded` 失败 execution，并终止主 Agent run。失败摘要和 terminal failure finalizer 输入保持稳定。

理由：本次修复只收窄误判范围，不降低真正 tool loop 的终止强度。

替代方案：把超限改回模型可恢复 observation。拒绝原因是已经归档的 loop 终止合同要求超限直接收口，避免模型通过切换工具或改变输入继续空转。

### 4. 模型可见说明同步表达 batch-aware 语义

选择：默认 system prompt 的运行预算说明改为“同一业务工具最多连续 2 个模型决策批次作为主要业务能力使用；同一模型响应内的并列 tool_calls 不按循环计数，但重复同参输入会被去重或拒绝”。

理由：模型可见合同要和 runtime 实际边界一致。该说明仍然是通用 tool calling 预算规则，不包含具体业务 tool、用户短句或业务字段组合。

替代方案：只改 runtime，不改 prompt。拒绝原因是 prompt 仍会表达旧的“连续调用 2 次”语义，后续 trace 排查会再次产生合同歧义。

## Risks / Trade-offs

- [Risk] 同一批次大量 fan-out 可能增加数据库压力。→ Mitigation: 全局 `maxToolCalls` 仍逐次消耗，tool wrapper 仍有 timeout、schema、projection 和 handler hard cap。
- [Risk] 连续序列改为批次计数后，真实 loop 会比旧实现多执行同批内不同输入。→ Mitigation: 这是符合语义的探索；跨模型响应持续同 tool 才会触发 terminal failure，duplicate input 继续阻断同参重复。
- [Risk] LangChain tool execution 顺序可能与 provider tool_calls 顺序不同。→ Mitigation: 使用 `toolCallId -> modelCallIndex` 的已记录 linkage 判断批次，而不是依赖执行完成顺序。
- [Risk] prompt 文案过度解释 runtime 内部细节。→ Mitigation: 只在运行预算段落说明模型可见的行为边界，不暴露实现结构、内部 trace id 或业务恢复流程。

## Migration Plan

1. 在 OpenSpec delta 中更新 runtime、prompt 和配置语义合同。
2. 修改 runtime 连续限制 coordinator，使其基于 `toolCallId` 的 `modelCallIndex` 批次计数。
3. 同步可用工具过滤逻辑，使后续 provider request 的 tool 隐藏也按批次连续序列判断。
4. 更新默认 system prompt 的运行预算文案。
5. 更新 runtime 测试：同批不同输入 fan-out 成功、同批同参 duplicate、不同行为轮次连续超限、全局预算仍生效。
6. 运行 OpenSpec strict validate、最窄 runtime 测试和 typecheck。

## Open Questions

无。
