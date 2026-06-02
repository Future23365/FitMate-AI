## Context

当前 `/api/chat` 已固定进入 Tool-first `AgentOrchestrator`。最近一次 trace 中，Agent 对“今天想练上肢，30 分钟，有哑铃，帮我安排一套”的处理已经完成了关键步骤：`searchExercises` 找到上肢哑铃训练动作，发现热身和拉伸覆盖不足，随后成功调用 `askClarification`。但最终结果仍被 runtime 判定为 `model_output_invalid`，因为模型在 `final_result.answered` 中引用了一个失败的 `searchExercises` tool result，而 runtime 的引用校验只承认成功且 `satisfied !== false` 的 tool result。

这说明现有资源合同把三类不同对象混成了一个概念：

- 模型可见的 tool result。
- 后续工具可消费的成功资源。
- 用户可见解释、澄清或阻断可以引用的诊断证据。

本 change 需要修复这个合同错位，并同时处理 routine 流程里的两个产品/领域问题：`askClarification` 缺少稳定终止形态，以及“哑铃训练”被错误施加到热身和拉伸候选，导致有训练候选却无法继续编排。

## Goals / Non-Goals

**Goals:**

- 明确区分 `consumable` 成功资源、`diagnostic` 诊断资源和 `partial` 部分满足候选结果。
- 让 final result 引用校验按终止状态执行不同规则，避免澄清/阻断说明被误判为伪造成功资源。
- 让 `askClarification` 成为稳定的 `needs_clarification` 终止路径。
- 让 `searchExercises` 在候选非空但 `resultRequirements` 未满足时保留可诊断 partial 结果，而不是只返回不可解释失败。
- 修正 routine 主训练器械约束和热身/拉伸补齐边界。
- 防止 routine / plan 工具链已经启动后退化为自由文本 `answered`。
- 补齐单测、trace、黑盒和 OpenSpec 验证，确保基础 routine 流程可复盘。

**Non-Goals:**

- 不做 token 输入压缩或 registry schema 瘦身优化。
- 不新增数据库表，不修改 Prisma Schema。
- 不改变 `/api/chat` 外部请求契约。
- 不新增服务端关键词分流、同义词匹配、基于用户原文的语义纠偏或意图重写。
- 不绕过 Validator、Policy、权限隔离、artifact 持久化或用户数据归属校验。
- 不让失败或 partial candidate set 进入 draft / validation / save 成功链路。

## Decisions

### 1. 将资源可见性拆成三个集合

runtime 内部继续记录所有 tool result，但模型输入、trace 和 final result 校验必须显式区分：

- `visibleToolResultIds`: 本轮模型可以看到的全部 tool result 摘要，包含成功、失败、partial 和 feedback。
- `consumableToolResultIds`: 成功、`satisfied !== false`、非 feedback 的 tool result，可作为后续工具依赖和成功终止结果 producer。
- `diagnosticToolResultIds`: 失败、`satisfied=false`、partial 或反馈型 tool result，可作为澄清、blocked、failed、answered 的解释证据，但不能作为生成、保存或写入依赖。

选择这个方案，而不是简单放宽 `stateHasDependencyId("tool_result")`，是因为 generated / patched / completed_operation 必须继续证明真实写入和校验来源。只放宽校验会把失败搜索结果误当成可生成候选，破坏工具链硬边界。

### 2. Final result 引用校验按终止状态分层

`validateFinalResultReferences()` 需要根据 `AgentExecutionResult.status` 执行不同规则：

- `generated`、`patched`、`completed_operation`: `usedToolResultIds`、`revisionId`、`validationId`、`policyDecisionId`、`operationResultId` 必须来自当前 run 的 consumable producer。
- `needs_clarification`: 可以引用 `askClarification` 成功结果和触发澄清的 diagnostic tool result。
- `blocked`、`failed`: 可以引用 diagnostic tool result，并保留 blocking / recovery 信息。
- `answered`: 只允许引用 consumable read result 或 diagnostic result 作为说明证据；如果本轮已经启动 routine / plan 生成链，不允许用 `answered` 宣称已生成训练。

这样可以支持“我找到了训练动作，但缺少可证明的热身/拉伸候选，需要你确认是否省略或补充”的回复，同时仍禁止“失败候选也能生成 routine”。

### 3. `askClarification` 由 runtime 稳定投影

`askClarification` 是交互终止，而不是普通读工具。工具成功后有两种可实现路径：

- 首选：runtime 直接把最新成功的 `askClarification` 输出投影为 `AgentExecutionResult.status = "needs_clarification"`，并带上 `question`、`assistantSuggestions`、`blockingReasons` 和相关诊断引用。
- 备选：prompt 强制模型最终返回 `needs_clarification`，runtime 仍保留投影兜底。

采用 runtime 投影兜底是因为澄清工具的输出已经由服务端 Schema 校验，继续要求模型把同一结构再包一次会增加出错面。

### 4. Partial candidate set 只作为诊断资源

`searchExercises` 在候选非空但 `resultRequirements` 未满足时，不应丢弃候选证据。新的输出应表达：

- `candidateSetId`
- `candidateUse`
- `status` 或等价字段表示 `partial` / `unsatisfied`
- `candidates`
- `candidateSetEvidence`
- `unmetResultRequirements`
- `resultRequirementProof`
- `recoveryOptions` 或等价恢复建议

runtime 应登记该结果为 diagnostic / partial，不加入 consumable candidate set registry。后续 `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch`、Validator 和 save 工具引用该 `candidateSetId` 时必须拒绝，并返回结构化依赖失败。

这样保留了模型和用户解释所需证据，又不会让不满足三段式候选要求的集合进入生成链。

### 5. Routine 器械约束按 section 语义收敛

用户说“有哑铃”时，默认含义是主训练可以使用哑铃。除非用户明确要求“热身和拉伸也都用哑铃”，系统不应把哑铃作为 warmup / stretch 的硬过滤条件。

实现上可以选择其中一种方式：

- 在 `searchExercises` 输入中支持 section-aware filters，例如 `sectionFilters.training.equipment.in = ["dumbbell"]`，warmup / stretch 不继承该器械硬约束。
- 或在 routine 生成工具补齐缺失 section 时，从后端动作库中按无器械/通用动作进行受控补充，并把补充动作纳入候选边界。

如果现有工具改动成本较高，第一阶段可以先把 warmup / stretch 的补齐放在 routine draft 工具内完成，但必须在 evidence 中记录补充动作来源和约束继承方式。

### 6. Routine / plan 链路增加防逃逸状态机

runtime 需要根据本轮工具结果判断是否已经进入执行型生成链：

- `searchExercises(candidateUse="routine"|"plan"|"patch")`
- `generateRoutineDraft`
- `generatePlanDraft`
- `proposeWorkoutPatch`
- 对应 validation / policy / save 工具

一旦进入该链路，模型不能用普通 `answered` 自由文本表达“已经生成”。合法终止只包括：

- `generated` / `patched` / `completed_operation`
- `needs_clarification`
- `blocked`
- `failed`

如果模型返回 `answered` 且内容或状态暗示生成、修改、保存、稍后展示，则 runtime 应转成可恢复 feedback 或结构化失败，而不是让 Response Writer 输出自由文本。

### 7. Trace 和测试先证明合同，而不是只证明文案

本 change 的验收不依赖真实浏览器。需要通过单测和不触发真实模型费用的 fixture 证明：

- partial candidate 被登记为 diagnostic，不能用于 draft。
- failed / partial tool result 可以被 `needs_clarification`、`blocked`、`failed` 引用。
- `askClarification` 成功后可稳定投影用户可见澄清。
- “上肢 + 30 分钟 + 哑铃”不再因为热身/拉伸缺哑铃动作退化为 `model_output_invalid`。
- 已启动 routine 链路不能以自由文本 `answered` 逃逸。

## Risks / Trade-offs

- [Risk] 放宽诊断引用可能被误用为成功依赖。→ Mitigation: final result 校验和 tool dependency 校验分开处理，只有 consumable 资源能进入生成、保存和写入。
- [Risk] partial candidate 输出变大。→ Mitigation: 模型可见 summary 只保留候选摘要、缺失要求和恢复建议，完整 diagnostics 留在 trace。
- [Risk] section-aware 器械约束会扩大工具输入合同。→ Mitigation: 若第一阶段不改完整工具 schema，可以在 routine draft 补齐边界内处理，并在 tasks 中保留测试防止无证据补动作。
- [Risk] runtime 投影 `needs_clarification` 被误解为服务端替模型做语义决策。→ Mitigation: 投影只复制已成功执行的 `askClarification` 工具输出，不从用户原文推断澄清内容。
- [Risk] 防逃逸规则可能拦截合法解释性回答。→ Mitigation: 只在本轮已经进入执行型 routine / plan / patch 工具链且回答承诺生成或替代生成结果时拦截；普通动作讲解仍可 answered。

## Migration Plan

1. 新增或调整 resource availability 结构，拆分 consumable / diagnostic / partial。
2. 调整 `searchExercises` partial 输出和 runtime 登记逻辑。
3. 调整 final result 引用校验和 Response Writer 引用投影。
4. 实现 `askClarification` 到 `needs_clarification` 的 runtime 投影或强制终止。
5. 修正 routine 器械/section 补齐边界。
6. 增加 routine / plan 防逃逸校验。
7. 更新 prompt、trace view model、黑盒 runner 字段和测试。
8. 运行相关单测、`npm run typecheck`、OpenSpec strict validate；不启动 dev server，不主动打开浏览器。

## Open Questions

无。token 输入压缩明确排除在本 change 之外，后续可单独建立成本优化 change。
