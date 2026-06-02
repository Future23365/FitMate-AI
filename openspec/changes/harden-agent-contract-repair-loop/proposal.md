## Why

最近多条真实 trace 显示，Agent 前置工具链已经拿到 `draftId`、`validationId`、`policyDecisionId` 等结构化资源，但模型在后续决策中仍可能提前 `final_result`、漏字段、重复调用失败工具或引用不存在的 `revisionId`。继续按每种失败形态追加补丁，会让 Agent runtime 变成一组脆弱特例，无法覆盖未来的新型模型输出抖动。

本 change 要把这些问题收敛为通用的“合同校验 -> 结构化错误反馈 -> LLM 自修复 -> 服务端事实收口”机制：模型可以基于明确错误继续修正，但所有 `artifactId`、`revisionId`、权限、Policy 和持久化事实仍只能来自服务端工具结果。

## What Changes

- 新增统一的 `AgentDecisionFeedback` 合同，用于描述模型决策为什么被拒绝、当前有哪些已登记资源、缺少哪些资源、是否可重试，以及推荐的下一步工具与输入。
- Agent runtime 在解析、Schema、工具输入、依赖图、资源引用和终止结果校验失败时，先判断错误是否可恢复；可恢复错误写入本轮 tool result 上下文并继续下一轮，而不是直接 `model_output_invalid`。
- 工具注册表和 dependency graph 声明每个工具的必需依赖、产出资源、失败可恢复性和推荐修复路径，避免按单个 trace 手写分支。
- `final_result.generated` / `patched` 的服务端收口更加严格：没有真实 `saveConversationArtifactRevision` 或等价写工具产出的 `revisionId` 时，模型不能声明成功；保存成功后，最终结构化结果优先由 runtime 从已登记 tool result 投影。
- 增加修复循环的重试预算、重复失败熔断和模型可见错误摘要压缩，避免自修复变成无限循环或 token 膨胀。
- Trace 记录每次合同拒绝、结构化反馈、修复尝试、熔断和最终收口来源，便于黑盒报告直接定位失败边界。

## Capabilities

### New Capabilities

- `agent-contract-repair-loop`: 定义 Agent 决策合同失败后的结构化反馈、自修复循环、可恢复错误分类、不可恢复边界和最终结果服务端收口规则。

### Modified Capabilities

- `readonly-llm-tool-calling`: Agent 工具定义需要暴露依赖、产出、失败分类和可推荐的修复路径；runtime 必须基于这些结构化元数据驱动下一步反馈。
- `conversation-artifact`: routine / plan 的生成和修改成功状态必须由真实 artifact revision 写入结果收口，不能依赖模型复制或伪造 `revisionId`。
- `ai-run-trace`: trace 需要记录合同校验失败、`AgentDecisionFeedback`、修复循环、重复失败熔断和最终结果事实来源。
- `ai-token-budgeting`: 模型可见上下文需要压缩重复错误反馈，并为修复循环设置明确预算，避免错误重试持续放大 token。

## Impact

- 影响 `lib/server/agent-orchestrator/runtime.ts` 的决策解析、引用校验、工具执行失败处理和 finalization 流程。
- 影响 `lib/server/agent-orchestrator/tool-registry.ts`、`contracts.ts` 以及各 Agent tool definition 的元数据模型。
- 影响 Response Writer 对 `AgentExecutionResult` 的消费边界，但不改变 `/api/chat` 外部 API 契约。
- 影响 `/dev/ai-traces` 与手动 LLM 黑盒报告的诊断字段。
- 不新增数据库表，不修改 Prisma Schema，不放宽用户隔离、Policy、Validator 或持久化权限边界。
