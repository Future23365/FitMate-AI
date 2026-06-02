## Context

当前 `/api/chat` 已切到 Tool-first `AgentOrchestrator`。工具本身的能力边界、结构化输入、结构化输出、失败语义和执行证据已经由 `harden-search-exercises-structured-query-contract` 负责收紧：LLM 通过 `ToolRequest` 提交明确参数，tool 通过 `ToolResult` 返回 `satisfied`、evidence、diagnostics 或结构化失败。

本 change 只处理 tool 外围的 runtime 问题。真实 trace 中暴露的失败不是“tool 没告诉 LLM 错误”，而是模型可能在 tool 调用前后违反 Agent 决策合同：

- 模型在尚未调用 `saveConversationArtifactRevision` 时提前返回 `final_result.generated`。
- 模型填入没有 producer 的 `revisionId`，例如 `revision_xxx`。
- 模型漏填 `reason`、漏填 generated 所需字段、传入 `null` 可选字段，导致 decision schema 失败。
- 模型重复调用同一个已失败工具和相同输入，造成无意义重试。
- 当前 runtime 已有若干窄口径恢复 helper，分散在解析、保存前、保存后和工具执行分支中。

约束边界仍保持不变：服务端不得用关键词或规则二次解释用户自然语言；LLM 可以基于结构化反馈修正自己的决策，但不能伪造权限、artifact、revision、policy、validation、operation 或持久化事实。

## Goals / Non-Goals

**Goals:**

- 建立薄的 `AgentDecisionFeedback` runtime 协议，把可恢复的模型决策合同失败转换成下一轮 LLM 可见的结构化错误摘要。
- 让 runtime 只转发和整理 tool 已返回的结构化失败、`satisfied=false`、diagnostics 和已登记资源，不重新定义 tool 能力合同。
- 让模型在下一轮看到错误码、已登记资源、缺失资源、推荐下一步工具和推荐输入，从而自行重新调用合适工具。
- 保持 `AgentExecutionResult`、引用校验、权限隔离、Policy、Validator 和持久化边界严格。
- 通过 repair turn 预算、重复失败熔断和模型可见上下文压缩控制成本。
- 让 trace / 黑盒报告能直接说明失败是 recovered、fused、unrecoverable，还是最终由服务端事实 projected。

**Non-Goals:**

- 不重新设计 `AgentToolCapabilityContract`、`ToolRequest`、`ToolResult`、tool input schema、tool output evidence 或 tool failure code；这些属于 `harden-search-exercises-structured-query-contract`。
- 不让 runtime 根据用户自然语言重写模型语义意图。
- 不自动绕过模型调用保存工具；runtime 可以推荐下一步，但写入仍必须经过注册 tool 执行。
- 不放宽 `saveConversationArtifactRevision`、Validator、PolicyEngine 或 `ConversationArtifact` 的硬边界。
- 不新增数据库表、不修改 Prisma Schema、不改变 `/api/chat` 外部 API 契约。
- 不引入 LangGraph、外部工作流引擎或 provider-specific 原生 tool calling 作为本 change 的前置条件。

## Decisions

### 1. `AgentDecisionFeedback` 只描述 runtime 拒绝原因

当模型决策在 JSON 解析、decision schema、tool input schema、已登记资源引用或 final result 引用校验阶段失败时，runtime 先把失败归类为结构化错误。如果错误可恢复，就写入一个合成 tool result，下一轮模型可见。

反馈至少包含：

- `code`: 稳定错误码，例如 `invalid_json_recovered`、`schema_validation_failed`、`missing_required_dependency`、`unregistered_resource_reference`、`premature_final_result_before_save`、`duplicate_tool_failure`。
- `failedAction`: 被拒绝的 action 或 toolName。
- `retryable`: 是否允许模型继续修复。
- `availableResources`: 当前 run 中已登记且可用于下一步的 `candidateSetId`、`draftId`、`validationId`、`policyDecisionId`、`revisionId` 等。
- `missingResources`: 当前成功路径缺失的资源。
- `recommendedNextTool` 和 `recommendedInput`: 在服务端可根据已登记事实确定时提供建议调用形态。
- `hardBoundary`: 权限、Policy、用户数据隔离或不可恢复依赖失败时标记为不可重试。

`AgentDecisionFeedback` 不表达用户语义，不替代 tool result，也不新增业务事实。它只是把 runtime 已经拒绝的结构化决策，用下一轮 LLM 能读懂的窄摘要表达出来。

### 2. Tool 失败由 ToolResult 负责，runtime 只登记和转发

tool 内部的参数不足、参数非法、能力不支持、候选不足、result requirement 未满足和结果不可证明，必须由 tool 自己通过 `ToolResult` 或结构化失败返回。runtime 不在本 change 中重新解释这些失败，也不根据用户原文补 filters、补资源或改 action。

runtime 可以做的事情：

- 将失败 tool result 登记到当前 run。
- 将模型可见摘要压缩后提供给下一轮 LLM。
- 根据 `ToolResult.satisfied=false`、稳定 failure code、当前 run 已登记资源和预算判断是否允许下一轮。
- 对重复失败执行熔断。
- 对不可恢复 hard boundary 直接终止。

runtime 不能做的事情：

- 从 query、用户原文、title、summary 或 `conversationSummary` 里推断隐藏 hard constraint。
- 修改 tool 已声明的 `operation`、`candidateUse`、hard constraints 或 result requirements。
- 把 `satisfied=false` 或失败 tool result 当作成功资源继续消费。
- 因 `AgentToolError.retryable=true` 就盲目让模型无限重试。

### 3. 保存前和保存后的 final result 走 runtime 引用修复

`final_result.generated` / `patched` 不属于某个 tool 的输出，它是 Agent runtime 的终止合同，因此必须由 runtime 做引用校验。

当 final result 引用失败时，runtime 判断是否符合统一可恢复条件：

- 当前 run 已有 `draftId + validationId + policyDecisionId`，但没有 `revisionId`：feedback 推荐调用 `saveConversationArtifactRevision`。
- 当前 run 已有唯一成功保存 tool result，但模型漏填 generated 字段：runtime 可以从保存结果投影合法 `AgentExecutionResult`，并继续引用校验。
- 模型引用了没有 producer 的 `revisionId`，但可用资源足以保存：feedback 拒绝该伪引用，并推荐保存工具。
- 模型引用了跨用户、跨 session、不存在或 policy 拒绝的资源：不可恢复，直接 blocked / failed。

这样可以覆盖 `revision_xxx` 这类“结构可解析但引用未登记”的失败，而不把假 ID 当成成功事实。

### 4. 修复循环必须有预算和熔断

runtime 为同一 Agent run 维护修复预算：

- 最大 repair turns。
- 最大同类 feedback 次数。
- 总 step / decision call 上限。
- 同一 `toolName + normalizedInput + failureCode` 的重复失败熔断。
- 不可重试失败码直接终止。

熔断后仍记录 trace，并向模型上下文提供一条压缩摘要，说明该路径已经失败、失败了几次、首次/最新 tool result id 是什么。这个设计避免“把错误告诉 LLM”变成无界循环，也避免重复错误把 prompt token 放大到不可控。

### 5. 模型可见上下文只暴露修复所需摘要

`AgentDecisionFeedback` 的模型摘要应只包含错误码、可用资源 id、缺失资源、推荐工具、推荐输入和简短原因；完整 raw decision、schema detail、trace raw JSON 留在调试 trace 中。

模型不需要看到完整 tool payload，也不能从 feedback 中获得绕过权限的信息。feedback 摘要必须保持可压缩、可去重、可被黑盒报告读取。

### 6. Final result 优先由 runtime 从服务端事实投影

保存成功后，`AgentExecutionResult.generated` / `patched` 的结构化字段优先来自已登记写工具结果。模型可以生成面向用户的解释和 `usedToolResultIds`，但不能成为 `artifactId`、`revisionId`、`validationId` 或 `policyDecisionId` 的事实来源。

`generated`、`patched` 和 `completed_operation` 的收口规则分开处理：

- `generated`: 结构化事实主要来自唯一成功的 `saveConversationArtifactRevision` 或等价 artifact 写工具结果。
- `patched`: 结构化事实必须同时来自 patch 工具结果与保存工具结果，例如 `patchId`、`sourceArtifactId`、`changedExerciseIds`、patch summary、`revisionId`、`validationId` 和 `policyDecisionId`。
- `completed_operation`: `operationResultId`、`policyDecisionId`、`confirmationId` 和可见字段必须来自当前 run 已登记的非 artifact 写工具结果。

如果当前 run 中存在多个可能匹配的 draft、patch、save 或 operation 写结果，而模型 final result 没有足够引用来唯一确定使用哪一个结果，runtime 必须生成可恢复 feedback 或返回 failed，不能替模型选择业务事实。

### 7. Prompt 只指导模型消费 feedback

本 change 需要同步调整 Agent prompt modules，但 prompt 的职责仅限于让模型理解和响应 `AgentDecisionFeedback`。runtime 仍是唯一的合同判定、权限隔离、Policy、预算熔断和事实投影执行者。

需要调整的 prompt modules：

- `agent_tool_decision`: 告诉模型如果 `toolResults` 中存在 `AgentDecisionFeedback` 或 `agentDecisionFeedback` 工具结果，应优先读取 `code`、`availableResources`、`missingResources`、`recommendedNextTool`、`recommendedInput`、`hardBoundary` 和重复失败摘要。
- `agent_tool_execution`: 告诉模型工具失败只能基于结构化 tool result、feedback、dependency graph 和已登记资源修复；`retryable: true` 不是继续重试的充分条件。
- `agent_final_result`: 强化 generated、patched、completed_operation 的终止条件：所有结构化资源必须来自当前 run 已登记 tool result；多候选事实无法唯一确定时不得猜测。

不应做的 prompt 调整：

- 不把完整工具流程硬编码成长 prompt。
- 不让提示词承担权限、Policy、资源归属或跨用户数据判断。
- 不新增自然语言关键词分流、同义词匹配或基于用户原文的服务端语义纠偏。
- 不允许模型根据自由文本推断某个资源 id 应该存在。

## Risks / Trade-offs

- [Risk] feedback 协议过宽可能掩盖真实 hard failure。→ Mitigation: 只有 runtime 分类、已登记资源、tool result 状态和预算同时允许时才进入下一轮；权限、Policy、跨用户数据和不可访问资源必须终止。
- [Risk] 模型看到 recommended input 后仍可能输出别的动作。→ Mitigation: runtime 继续校验每个下一步决策；同类错误超过预算后熔断。
- [Risk] repair 逻辑与 tool capability contract 重叠。→ Mitigation: 本 change 不定义 tool 输入输出和证据，只消费 search contract 提供的 `ToolResult` / diagnostics。
- [Risk] runtime 投影 final result 可能被误解为服务端替模型做语义决策。→ Mitigation: 只从已成功执行的写工具结果复制结构化事实，不改变模型选择的任务状态和用户语义。
- [Risk] 修复循环增加 token。→ Mitigation: repair turn 有预算，重复失败上下文压缩，trace 记录 token 增量，黑盒报告统计恢复前后成本。
- [Risk] prompt 调整被误当成可靠性来源。→ Mitigation: prompt 只描述如何消费 feedback；所有可恢复性、资源引用、熔断和 final projection 仍由 runtime 强制校验。

## Migration Plan

1. 定义 `AgentDecisionFeedback` 类型、错误码集合和模型可见摘要格式。
2. 将现有分散恢复逻辑迁移到统一 feedback 分支，保留现有测试作为回归。
3. 实现 final result 引用失败的可恢复分类，覆盖未登记 `revisionId`、保存前提前 final、保存后缺字段。
4. 确保失败 tool result、`satisfied=false` 结果和不可恢复 hard boundary 被 runtime 正确登记、转发或终止。
5. 调整 `agent_tool_decision`、`agent_tool_execution` 和 `agent_final_result` prompt modules，使模型能基于 feedback 进行下一轮结构化决策。
6. 增加修复预算、重复失败熔断和上下文压缩。
7. 更新 trace、黑盒 runner 和相关单测，验证错误反馈、有限修复、熔断和最终投影；诊断字段至少覆盖 `repairFeedbackCodes`、`repairTurnCount`、`finalProjectionSourceToolResultId`、`unregisteredResourceReferences`、`fusedFailureCount` 和 `repairBudgetExhaustedReason`。
8. 若新机制导致异常恢复率升高但 token 成本不可控，可通过配置降低 repair turn 上限并回退到严格失败。

## Open Questions

无。当前目标是收窄 runtime 反馈与服务端事实收口，不涉及新的产品语义，也不重复定义 tool 能力合同。
