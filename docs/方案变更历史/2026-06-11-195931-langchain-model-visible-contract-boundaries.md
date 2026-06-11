# 2026-06-11 19:59:31 CST LangChain 模型可见合同边界恢复

## 背景

LangChain 主链迁移后，部分 tool summary 和 description 重新出现了旧 `fulfillment.satisfied`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary` 以及补查 support section 的 workflow 文案。这些内容会把“tool 查询到了什么事实”和“用户业务目标是否已经满足”混在一起，让模型过早把普通建议推向结构化训练卡片，或在已有事实时继续重复同参 tool call。

## 原方案为什么不合适

旧写法看起来能提醒模型补齐 `warmup` / `stretch`，但它把业务下一步选择写进了模型可见 tool result。Tool 应该只提供事实、诊断和 validator 边界；普通文本建议是否直接回答、结构化训练结果是否进入 finalization，应由模型基于当前可见事实和用户目标自主判断，并由服务端 validator 校验确定性边界。

## 调整思路

本次不做局部 prompt 补丁，而是恢复 LangChain tool / prompt / runtime 的职责分层：

- tool summary 只表达查询事实、候选事实、历史事实、section 覆盖和 validator diagnostics。
- tool description 只描述能力、输入来源、输出事实和确定性边界，不写固定补查流程。
- system prompt 明确普通文本建议可以基于成功事实直接通过 `content` 回答；只有需要用户可见、可后续引用且需要 validator 的训练卡片、routine 或 plan 才走 finalization。
- runtime 对同一 run 内同 `toolName + toolVersion + normalizedInputHash` 的重复同参成功调用返回中性 `duplicate_tool_input` 反馈，不重复执行 handler，也不把 duplicate 记成业务成功或失败。
- trace 对 duplicate input 使用中性状态和 `feedbackCode`，避免开发态日志继续反推旧业务满足度语义。

## 关键改动

- 收口 `searchExerciseResources`、`resolveExerciseResourceMentions`、`inspectVisibleTrainingProposals` 和 `submitVisibleTrainingProposal` 的模型可见 summary / description。
- 新增稳定 input hash，作为 runtime duplicate input 检测键的一部分。
- 扩展 LangChain tool execution 状态，新增 `duplicate_input` 和 `feedbackCode = "duplicate_tool_input"`。
- 更新 response projection 与 dev trace viewer，让工具摘要显示重复输入数量。
- 增加 runtime 回归，覆盖同参重复调用 handler 只执行一次，以及 `ok=true` 的 0 条事实可以支撑普通文本回答。

## 验证结果

- `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/resolve-exercise-resource-mentions.test.ts tests/langchain-agent-tools/inspect-visible-training-proposals.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-runtime/runtime.test.ts`
- `npm test -- tests/langchain-agent-runtime/response-adapter.test.ts tests/ai-trace-viewer.test.ts tests/ai-trace-http.test.ts`

以上相关测试均通过。后续仍需要运行全量 typecheck 和 OpenSpec 收尾验证。
