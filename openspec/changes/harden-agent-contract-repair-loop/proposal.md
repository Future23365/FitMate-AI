## Why

最近多条真实 trace 显示，Agent 前置工具链已经拿到 `draftId`、`validationId`、`policyDecisionId` 等结构化资源，但模型在后续决策中仍可能提前 `final_result`、漏字段、重复调用失败工具或引用不存在的 `revisionId`。继续按每种失败形态追加补丁，会让 Agent runtime 变成一组脆弱特例，无法覆盖未来的新型模型输出抖动。

本 change 不再承担 tool 能力合同设计。tool 的输入、输出、失败、证据和 `satisfied` 履约状态由 `harden-search-exercises-structured-query-contract` 中的 `AgentToolCapabilityContract`、`ToolRequest` 和 `ToolResult` 负责。本 change 只处理 tool 外围的 Agent runtime 问题：模型决策被拒绝后如何把错误反馈给下一轮 LLM、如何限制重试、如何熔断重复失败，以及 final result 如何只从服务端已登记事实收口。

## What Changes

- 新增统一的 `AgentDecisionFeedback` 合同，用于描述 runtime 为什么拒绝模型决策、当前有哪些已登记资源、缺少哪些资源、是否可重试，以及推荐的下一步工具与输入。
- Agent runtime 在 JSON 解析、decision schema、工具调用输入、已登记资源引用和终止结果校验失败时，先判断错误是否可恢复；可恢复错误写入本轮 tool result 上下文并继续下一轮，而不是直接 `model_output_invalid`。
- runtime 消费工具已返回的结构化失败、`ToolResult.satisfied` 状态、dependency graph 和已登记资源，不在本 change 中重新定义 tool 的能力、输入合同、输出证据或失败语义。
- `final_result.generated` / `patched` 的服务端收口更加严格：没有真实 `saveConversationArtifactRevision` 或等价写工具产出的 `revisionId` 时，模型不能声明成功；保存成功后，最终结构化结果优先由 runtime 从已登记 tool result 投影。
- 调整 Agent prompt modules，使 `agent_tool_decision`、`agent_tool_execution` 和 `agent_final_result` 能识别并优先消费 `AgentDecisionFeedback`；提示词只指导模型下一轮结构化决策，不能替代 runtime 的合同校验、权限隔离、Policy、熔断或事实投影。
- 增加修复循环的重试预算、重复失败熔断和模型可见错误摘要压缩，避免“把错误告诉 LLM”变成无限循环或 token 膨胀。
- Trace 记录每次合同拒绝、结构化反馈、修复尝试、熔断和最终收口来源，便于黑盒报告直接定位失败边界。

## Capabilities

### New Capabilities

- `agent-contract-repair-loop`: 定义 Agent runtime 决策合同失败后的结构化反馈、有限修复循环、可恢复错误分类、不可恢复边界和最终结果服务端事实收口规则。

### Modified Capabilities

- `conversation-artifact`: routine / plan 的生成和修改成功状态必须由真实 artifact revision 写入结果收口，不能依赖模型复制或伪造 `revisionId`。
- `ai-run-trace`: trace 需要记录合同校验失败、`AgentDecisionFeedback`、修复循环、重复失败熔断和最终结果事实来源。
- `ai-token-budgeting`: 模型可见上下文需要压缩重复错误反馈，并为修复循环设置明确预算，避免错误重试持续放大 token。

## Impact

- 影响 `lib/server/agent-orchestrator/runtime.ts` 的决策解析、引用校验、工具失败登记、feedback 注入、重复失败熔断和 finalization 流程。
- 影响 `lib/server/agent-orchestrator/contracts.ts` 中 feedback、repair budget 和 final projection 相关结构；不在本 change 中重新设计各 tool 的输入输出合同。
- 影响 `lib/server/ai/prompt-config.ts` 和 Agent decision model input 组装，使模型能理解 feedback 摘要、避免重复失败工具调用、并按当前 run 已登记资源返回 final result。
- 影响 Response Writer 对 `AgentExecutionResult` 的消费边界，但不改变 `/api/chat` 外部 API 契约。
- 影响 `/dev/ai-traces` 与手动 LLM 黑盒报告的诊断字段。
- 不新增数据库表，不修改 Prisma Schema，不放宽用户隔离、Policy、Validator 或持久化权限边界。
