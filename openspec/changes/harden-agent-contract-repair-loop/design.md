## Context

当前 `/api/chat` 已切到 Tool-first `AgentOrchestrator`，主要执行链路由 `ContextPackage`、`AgentToolRegistry`、工具结果 dependency graph、`AgentExecutionResult` 和 Response Writer 组成。近期真实 trace 暴露的问题不再集中在某一个工具，而是集中在模型决策与服务端执行合同之间的边界：

- 模型会在尚未调用 `saveConversationArtifactRevision` 时提前返回 `final_result.generated`。
- 模型可能填入看似合理但没有 producer 的 `revisionId`，例如 `revision_xxx`。
- 模型会漏填 `reason`、漏填 generated 所需字段、传入 `null` 可选字段或重复调用同一个失败工具。
- 当前 runtime 已有若干窄口径恢复逻辑，但它们分散在解析、保存前、保存后和工具执行分支中，后续再遇到新形态错误仍会继续追加补丁。

约束边界仍保持不变：服务端不得用关键词或规则二次解释用户自然语言；LLM 可以修正自己的结构化决策，但不能伪造权限、artifact、revision、policy、validation 或持久化事实。

## Goals / Non-Goals

**Goals:**

- 建立统一的 Agent 决策修复协议，把可恢复的合同失败转换成结构化 `AgentDecisionFeedback`。
- 让模型在下一轮看到明确错误、已登记资源、缺失资源和推荐下一步工具，从而自行修正工具调用。
- 将工具依赖、产出资源和失败可恢复性声明化，减少 runtime 按 trace 形态写特例。
- 保持 `AgentExecutionResult`、引用校验、权限隔离、Policy 和持久化边界严格。
- 通过重试预算、重复失败熔断和模型可见上下文压缩控制成本。
- 让 trace / 黑盒报告能直接说明失败是已恢复、已熔断、不可恢复，还是最终成功收口。

**Non-Goals:**

- 不让 runtime 根据用户自然语言重写模型语义意图。
- 不自动绕过模型调用保存工具；runtime 可以推荐下一步，但写入仍必须经过注册工具执行。
- 不放宽 `saveConversationArtifactRevision`、Validator、PolicyEngine 或 `ConversationArtifact` 的硬边界。
- 不新增数据库表、不修改 Prisma Schema、不改变 `/api/chat` 外部 API 契约。
- 不引入 LangGraph、外部工作流引擎或 provider-specific 原生 tool calling 作为本 change 的前置条件。

## Decisions

### 1. 用 `AgentDecisionFeedback` 统一可恢复错误协议

当模型决策在 JSON 解析、decision schema、工具 input schema、dependency graph、资源引用或 final result 引用校验阶段失败时，runtime 先把失败归类为结构化错误。如果错误可恢复，就写入一个合成 tool result，下一轮模型可见。

反馈至少包含：

- `code`: 稳定错误码，例如 `invalid_json_recovered`、`schema_validation_failed`、`missing_required_dependency`、`unregistered_resource_reference`、`premature_final_result_before_save`、`duplicate_tool_failure`。
- `failedAction`: 被拒绝的 action 或 toolName。
- `retryable`: 是否允许模型继续修复。
- `availableResources`: 当前 run 中已登记且可用于下一步的 `candidateSetId`、`draftId`、`validationId`、`policyDecisionId`、`revisionId` 等。
- `missingResources`: 当前成功路径缺失的资源。
- `recommendedNextTool` 和 `recommendedInput`: 在服务端可确定时提供建议调用形态。
- `hardBoundary`: 权限、Policy、用户数据隔离或不可恢复依赖失败时标记为不可重试。

这个方案优于继续追加分支，因为模型只需要学习一种错误反馈输入；runtime 也可以按错误分类和依赖图生成建议，而不是为每个 trace 的 JSON 形态写补丁。

### 2. 工具定义声明依赖、产出和修复建议

扩展 Agent tool definition 的非模型执行元数据，描述：

- `requires`: 工具执行前必须存在的资源类型，例如 `draftId`、`validationId`、`policyDecisionId`。
- `produces`: 成功执行后会登记的资源类型，例如 `candidateSetId`、`validationId`、`revisionId`。
- `recoverableFailures`: 哪些失败码可以反馈给模型修复。
- `nextOnSuccess`: 常见成功路径的下一步工具建议，仅用于生成 feedback 和 trace，不强迫模型按固定流程。

现有 `dependencies` 字段只作为过渡期输入来源；实现时应收敛为规范化后的 `resourceContract` 或等价结构，runtime、模型可见工具摘要、dependency graph 和 trace 都读取同一份规范化合同。规范化合同至少包含 `requires`、`produces`、`recoverableFailures`、`nextOnSuccess` 和 `finalResultRequirements`。如果某个核心工具缺少合同，runtime 必须按严格失败处理，不能从 prompt 文案或工具名隐式推断依赖关系。

例如 routine 生成链可以声明为：

```text
searchExercises -> candidateSetId
generateRoutineDraft requires candidateSetId -> draftId
validateRoutineDraft requires draftId -> validationId
evaluatePolicy requires draftId -> policyDecisionId
saveConversationArtifactRevision requires draftId + validationId + policyDecisionId -> revisionId
final_result.generated requires revisionId
```

这个选择把确定性执行合同留在服务端，避免在 prompt 中反复复制流程说明却无法保证模型遵守。

`AgentToolError.retryable` 不能单独决定是否进入修复循环。它只能作为工具执行结果的一个信号；最终可恢复性必须同时满足 runtime 错误分类、工具 `recoverableFailures` 声明、未触碰 hard boundary、仍有修复预算，以及当前 run 中存在可验证的下一步资源。`schema_validation_failed`、`invalid_dependency` 这类错误需要按上下文区分：字段缺失或引用可补齐时可恢复，跨用户、跨 session、Policy 拒绝、不可访问资源或资源事实不唯一时不可恢复。

### 3. 保存前和保存后的 final result 都走统一引用修复

`final_result.generated` / `patched` 仍必须通过 `validateFinalResultReferences`。当引用失败时，runtime 不应立即只返回 `model_output_invalid`；它应先判断是否符合统一可恢复条件：

- 当前 run 已有 `draftId + validationId + policyDecisionId`，但没有 `revisionId`：反馈推荐调用 `saveConversationArtifactRevision`。
- 当前 run 已有成功保存 tool result，但模型漏填 generated 字段：runtime 可以从保存结果投影合法 `AgentExecutionResult`，并继续引用校验。
- 模型引用了没有 producer 的 `revisionId`，但可用资源足以保存：反馈拒绝该伪引用，并推荐保存工具。
- 模型引用了跨用户、跨 session、不存在或 policy 拒绝的资源：不可恢复，直接 blocked / failed。

这样可以覆盖 `revision_xxx` 这类“结构可解析但引用未登记”的失败，而不把假 ID 当成成功事实。

### 4. 修复循环必须有预算和熔断

runtime 为同一 Agent run 维护修复预算：

- 最大 repair turns。
- 最大同类 feedback 次数。
- 同一 `toolName + normalizedInput + failureCode` 的重复失败熔断。
- 不可重试失败码直接终止，不继续喂给模型猜。

熔断后仍记录 trace，并向模型上下文提供一条压缩摘要，说明该路径已经失败、失败了几次、首次/最新 tool result id 是什么。

这个设计避免“把错误告诉 LLM”变成无界循环，也避免重复错误把 prompt token 放大到不可控。

### 5. 模型可见上下文只暴露修复所需摘要

`AgentDecisionFeedback` 的模型摘要应只包含错误码、可用资源 id、缺失资源、推荐工具、推荐输入和简短原因；完整 raw decision、schema detail、trace raw JSON 留在调试 trace 中。模型不需要看到大 payload 或未授权字段，也不能从反馈中获得绕过权限的信息。

### 6. Final result 优先由 runtime 从服务端事实投影

保存成功后，`AgentExecutionResult.generated` / `patched` 的结构化字段优先来自已登记写工具结果。模型可以生成面向用户的解释和 `usedToolResultIds`，但不能成为 `artifactId`、`revisionId`、`validationId` 或 `policyDecisionId` 的事实来源。

长期看，这能减少“最后一步复制字段又错”的概率；即使模型最终输出不完整，只要保存结果唯一且引用可验证，runtime 也能产生合法最终结果。

`generated`、`patched` 和 `completed_operation` 的收口规则需要分开处理：

- `generated`: 结构化事实主要来自唯一成功的 `saveConversationArtifactRevision` 或等价 artifact 写工具结果。
- `patched`: 结构化事实必须同时来自 patch 工具结果与保存工具结果，例如 `patchId`、`sourceArtifactId`、`changedExerciseIds`、patch summary、`revisionId`、`validationId` 和 `policyDecisionId`，runtime 不得只凭保存结果猜测 patch 摘要。
- `completed_operation`: `operationResultId`、`policyDecisionId`、`confirmationId` 和可见字段必须来自当前 run 已登记的非 artifact 写工具结果；模型不能自行声明用户资料、偏好或其他写操作成功。

如果当前 run 中存在多个可能匹配的 draft、patch、save 或 operation 写结果，而模型 final result 没有足够引用来唯一确定使用哪一个结果，runtime 必须生成可恢复 feedback 或返回 failed，不能替模型选择业务事实。

## Risks / Trade-offs

- [Risk] 反馈协议过宽可能掩盖真实 hard failure。→ Mitigation: 只有工具元数据和 runtime 分类明确标记为 `retryable` 的错误才能继续；权限、Policy、跨用户数据和不可访问资源必须终止。
- [Risk] 模型看到 recommended input 后仍可能输出别的动作。→ Mitigation: runtime 继续校验每个下一步决策；同类错误超过预算后熔断。
- [Risk] 工具元数据维护成本增加。→ Mitigation: 先覆盖核心 Agent 工具和 artifact 写链路，元数据缺失时按当前严格失败处理，不隐式推断。
- [Risk] runtime 投影 final result 可能被误解为服务端替模型做语义决策。→ Mitigation: 只从已成功执行的写工具结果复制结构化事实，不改变模型选择的任务状态和用户语义。
- [Risk] 修复循环增加 token。→ Mitigation: repair turn 有预算，重复失败上下文压缩，trace 记录 token 增量，黑盒报告统计恢复前后成本。

## Migration Plan

1. 定义 `AgentDecisionFeedback` 类型、错误码集合和模型可见摘要格式。
2. 扩展核心 Agent tool definition 元数据，先覆盖 artifact/routine/plan 生成、validation、policy、保存和常见读工具。
3. 将现有分散恢复逻辑迁移到统一 feedback 分支，保留现有测试作为回归。
4. 实现 final result 引用失败的可恢复分类，覆盖未登记 `revisionId`、保存前提前 final、保存后缺字段。
5. 增加修复预算、重复失败熔断和上下文压缩。
6. 更新 trace、黑盒 runner 和相关单测，验证错误反馈、自修复、熔断和最终投影；诊断字段至少覆盖 `repairFeedbackCodes`、`repairTurnCount`、`finalProjectionSourceToolResultId`、`unregisteredResourceReferences`、`fusedFailureCount` 和 `repairBudgetExhaustedReason`。
7. 若新机制导致异常恢复率升高但 token 成本不可控，可通过配置降低 repair turn 上限并回退到严格失败。

## Open Questions

无。当前目标是收敛确定性执行合同与修复循环，不涉及新的产品语义和用户可见流程。
