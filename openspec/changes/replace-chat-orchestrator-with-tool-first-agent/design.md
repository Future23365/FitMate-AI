## Context

当前聊天架构已经具备 `ConversationArtifact`、`ArtifactIndex`、`ReferenceResolver`、`WorkoutPatch`、候选动作选择、Validator、Policy、Confirmation 和只读 tool loop。但这些能力仍被 intent-first 主链驱动：LLM 先输出意图，服务端再通过 normalize、gate、ReferenceResolver、RAG query 和确定性回复分支二次解释用户自然语言。

这种设计在简单单轮推荐上可控，但在多轮调整中会系统性出错。用户说“`不用哑铃了，换一个`”“太难了”“不要跳跃动作”“改成在家练”时，语义需要结合最近 artifact、真实 payload、动作库和用户约束。服务端规则很难正确理解这些自然语言；一旦服务端用关键词或裸 RAG query 参与语义判断，就会和 LLM 理解冲突。

本 change 的目标是把 `/api/chat` 重构为 Tool-first Agent 主链。LLM 成为唯一语义编排者：它通过工具查最近 artifact、读取 payload、搜索动作、提出 patch 或重新生成、请求校验和保存。服务端只负责受控工具执行和硬边界，不再用自然语言规则改写高层语义。

## Goals / Non-Goals

**Goals:**

- 用 `AgentOrchestrator` 替换 `/api/chat` 的 intent-first 主链。
- 提供 `AgentContextBuilder` 和 `ContextPackage`，用可测试的上下文合同替代 summary-only 和分散上下文拼装。
- 提供统一 `AgentToolRegistry`，覆盖读工具、编辑计划工具、生成草稿工具、Patch 工具、校验工具、保存 revision 工具和澄清工具。
- 提供工具结果依赖图，所有写工具必须引用已登记的 `toolResultId`、`candidateSetId`、`validationId`、`policyDecisionId` 或 `confirmationId`。
- 提供统一 `WorkoutEditPlan`，让已有训练调整先表达目标、保留项、变更项、影响范围和确认级别，再进入 Patch 或 Regenerate。
- 让 LLM 基于真实数据库和 artifact payload 决定 `answer`、`clarify`、`patch`、`regenerate` 或 `generate`。
- 让动作查询以结构化工具参数执行，确保器械、肌群、难度、偏好和避免项先经过数据库过滤，再语义排序。
- 让所有写入都通过服务端工具校验：Schema、权限、candidate set、Validator、Policy、Confirmation、Persistence。
- 将 Agent tool registry 设计为后续能力扩展点，但每个写工具必须绑定明确领域能力合同，不能变成任意业务函数入口。
- 让 `AgentExecutionResult` 支持通用受控写操作完成结果，避免新增非训练领域工具时改动 Agent runtime。
- 移除 `/api/chat` 主链对 `conversationSummary` 的必需依赖，Agent 可以使用真实 recent messages 和工具结果获取上下文。
- 删除或废弃旧主链中服务端语义 normalize、关键词 gate 和裸自然语言 RAG 决策。
- 让 Response Writer 成为 `AgentExecutionResult` 的投影层，不重新解释用户语义或重新决定执行动作。
- 用黑盒测试验证用户可见结果、卡片推送和多轮调整，而不是只验证旧 intent 字段。

**Non-Goals:**

- 首版不引入 LangGraph。LangGraph 只作为未来可替换 runtime，不参与本 change 的领域架构决策。
- 不允许 LLM 直接写数据库、执行任意 SQL 或绕过服务端工具。
- 不让前端参与 Agent 编排；前端只消费服务端流事件、artifact 和 `assistantSuggestions`。
- 不用 token 成本驱动裁剪功能。预算只用于防止无限循环和异常请求，不作为跳过必要工具查询的理由。
- 不把 `conversationSummary` 作为 `/api/chat` 的必要输入、模型唯一历史上下文、Agent 执行输入或任何执行事实源。
- 不把生成 routine/plan 的 Agent 工具设计成无边界大模型外包；工具必须复用领域服务、候选集合、Validator 和 Policy。
- 不把 Agent tool registry 设计成绕过 OpenSpec、数据模型、权限设计或领域服务边界的通用插件系统。
- 不让 Response Writer 通过自由模型调用重新决定是否生成、修改、保存或澄清。
- 不保留旧 intent-first 主链作为长期并行路径。旧字段只作为单向兼容输出、日志或测试迁移期间的诊断信息，并必须有退出条件。

## Decisions

### 1. AgentContextBuilder 是唯一上下文入口

新增 `AgentContextBuilder`，负责从请求、保存会话、recent messages、recent artifacts、用户记忆、pending confirmation 和可选压缩快照构造 `ContextPackage`：

```ts
type ContextPackage = {
  latestUserMessage: string;
  recentMessages: ChatMessageSummary[];
  recentArtifacts: ArtifactSummary[];
  memorySnapshot: UserMemorySnapshot;
  pendingConfirmation?: AgentConfirmation;
  optionalContextSnapshot?: ContextSnapshot;
  provenance: ContextProvenance[];
  limits: ContextLimits;
};
```

`ContextPackage` 是 Agent 的唯一上下文入口。它必须记录每段上下文的来源、时间、资源 id、截断策略和可信级别。`conversationSummary` 不得直接进入 Agent 执行输入；如果长会话确实需要压缩，只能先转换为带 provenance 的 `ContextSnapshot`，并标注它不是 artifact payload、exerciseId 或训练参数事实源。

上下文选择策略必须可测试：当前消息优先，其次是真实 recent messages、最近 artifact 摘要、用户记忆、pending confirmation 和按需工具读取结果。任何 artifact payload、exerciseId、Patch target 或保存 payload 都必须通过工具读取结构化事实，不能从 `ContextSnapshot` 或自然语言摘要反推。

### 2. AgentExecutionState 是唯一执行状态

新增 `AgentExecutionState`，用于保存本轮 Agent 的全部结构化状态：

```ts
type AgentExecutionState = {
  runId: string;
  userId: string;
  sessionId: string;
  context: ContextPackage;
  toolCalls: AgentToolCallRecord[];
  toolResults: AgentToolResultRecord[];
  dependencyGraph: AgentDependencyGraph;
  pendingConfirmation?: AgentConfirmation;
  candidateSets: Record<string, CandidateSet>;
  editPlan?: WorkoutEditPlan;
  draft?: RoutineDraft | PlanDraft;
  patch?: WorkoutPatch;
  finalResult?: AgentExecutionResult;
};
```

旧 resolved intent 不再是主执行状态。它只能由 `LegacyChatEventAdapter` 从 `AgentExecutionResult` 派生，用于短期兼容前端事件、旧报告或 trace 展示；它不能反过来驱动工具选择、artifact 生成、Patch、Response Writer 或测试通过条件。

旧 `type`、`workoutIntent`、`canTriggerAction`、`assistant_action` 和 resolved intent 字段必须有删除条件：当前端和黑盒报告都改为消费 `AgentExecutionResult` 后，这些字段应从生产流事件中移除或只保留在调试 trace 中。

### 3. 统一 AgentToolRegistry 替代只读-only tool loop

`AgentToolRegistry` 注册所有 LLM 可请求的工具。工具分为：

- 读工具：`listRecentArtifacts`、`searchArtifacts`、`getArtifactPayload`、`searchExercises`、`getExerciseById`、`getUserMemory`。
- 编辑计划工具：`proposeWorkoutEditPlan`、`askClarification`。
- 生成工具：`generateRoutineDraft`、`generatePlanDraft`。
- Patch 工具：`proposeWorkoutPatch`、`applyWorkoutPatch`。
- 校验工具：`validateRoutineDraft`、`validatePlanDraft`、`validateWorkoutPatch`、`evaluatePolicy`。
- 写工具：`saveConversationArtifactRevision`、`persistPatchResult`。
- 领域扩展工具：例如未来的 `updateUserProfile`、`updateNotificationSettings` 或等价工具，但只有在对应领域服务、Schema、权限、确认和持久化合同存在时才能注册。

LLM 可以选择工具，但工具由服务端执行。每个工具都有 Zod Schema、权限上下文、输出摘要、trace 摘要、幂等 key、前置依赖声明和可执行边界。工具输出必须登记为结构化结果，例如 `toolResultId`、`candidateSetId`、`artifactPayloadId`、`validationId`、`policyDecisionId`、`confirmationId` 和 `revisionId`。

写工具必须验证前置 tool result，不能只凭模型参数直接写入。比如保存 routine revision 必须引用通过校验的 `draftId`、`validationId`、`policyDecisionId` 和可写 scope；Patch 写入必须引用 `artifactPayloadId`、`candidateSetId`、`patchId`、`validationId` 和必要的 `confirmationId`。

新增工具的扩展边界是 registry，而不是 Agent runtime。后续增加一个新的 Agent tool 时，理想路径应是：新增领域能力合同和服务端执行函数，声明输入/输出 Schema、读写级别、权限上下文、前置依赖、确认策略、幂等 key、trace 摘要和 Response Writer 可见摘要，然后注册到 `AgentToolRegistry`。如果新能力需要新增数据库字段、API 契约、权限模型或用户可见流程，应先通过独立 OpenSpec change 定义领域边界，再接入 Agent registry。

### 4. 工具循环使用显式完成条件

Agent loop 的停止条件不是“模型回答了文本”，而是产生一个结构化 `AgentExecutionResult`：

```ts
type AgentExecutionResult =
  | { status: "answered"; replyContext: ToolContextBundle; usedToolResultIds: string[] }
  | { status: "needs_clarification"; question: string; assistantSuggestions: AssistantSuggestion[]; blockingReasons: string[] }
  | { status: "generated"; artifact: ConversationArtifactSummary; revisionId: string; validationId: string }
  | { status: "patched"; patchResult: WorkoutPatchResult; artifact: ConversationArtifactSummary; revisionId: string; validationId: string }
  | { status: "completed_operation"; operation: AgentOperationSummary; operationResultId: string; usedToolResultIds: string[]; policyDecisionId?: string; confirmationId?: string }
  | { status: "blocked"; blockReason: string; policyDecisionId?: string; recoverySuggestions: AssistantSuggestion[] }
  | { status: "failed"; failureCode: string; recoverySuggestions: AssistantSuggestion[] };
```

`generated` 和 `patched` 继续覆盖训练 artifact 的高频结果。`completed_operation` 用于表达非训练 artifact 的受控写操作，例如未来修改用户资料、保存偏好设置或记录确认后的长期用户记忆。它必须引用真实写工具结果，且 `operation` 只能包含 Response Writer 可安全展示的摘要，不能暴露敏感字段或数据库内部结构。

最终用户回复只消费 `AgentExecutionResult` 和 tool results，不再凭 prompt 承诺“已生成/已更新”。

### 5. Agent tool 扩展必须先有领域能力合同

Agent runtime 只负责循环、工具调用、依赖图、预算、trace 和最终结果投影，不负责定义任意业务写入的语义。每个可写 Agent tool 都必须先属于一个领域能力合同：

- 数据边界：可读写哪些资源、字段和 scope。
- 输入边界：Zod / JSON Schema、字段白名单、默认值和拒绝条件。
- 权限边界：当前 `userId`、`sessionId`、资源归属和软删除状态。
- 执行边界：调用哪个领域服务，不直接拼 SQL 或绕过 Prisma/service 层。
- 确认边界：哪些操作需要 `ConfirmationGate` 或 `PolicyEngine`。
- 依赖边界：需要哪些 `toolResultId`、`validationId`、`policyDecisionId` 或 `confirmationId`。
- 输出边界：返回给 Agent 和 Response Writer 的摘要必须可审计、可 trace、可脱敏。

例如未来新增“修改用户信息”的能力，如果只是在现有用户资料模型中更新允许字段，且已有权限、确认和持久化服务，那么只需要新增 `updateUserProfile` tool、schema、policy 和测试，不需要修改 AgentOrchestrator 主架构。反过来，如果该能力需要新增 `UserProfile` 字段、改变 onboarding 流程或新增用户可见状态，就必须先通过对应 OpenSpec change 定义领域模型和用户流程，再把它注册为 Agent tool。

### 6. 结构化查询先于 RAG

动作和 artifact 搜索工具必须让 LLM 传入结构化字段，例如 `equipmentAvoided: ["哑铃"]`、`targetMuscles: ["肩", "背"]`、`sessionMinutes: 30`。服务端工具先做结构化硬过滤，再做全文/向量召回和 rerank。用户原始消息可以作为辅助 query，但不能作为唯一检索输入。

这解决“不要哑铃”被当成“哑铃正向匹配”的架构问题。

### 7. WorkoutEditPlan 先于 Patch / Regenerate

LLM 通过工具读取 artifact payload 后，必须先提出 `WorkoutEditPlan`：

```ts
type WorkoutEditPlan = {
  targetArtifactId: string;
  sourceArtifactPayloadId: string;
  requestedChangeSummary: string;
  preserve: WorkoutPreserveConstraint[];
  changes: WorkoutChangeConstraint[];
  scope: "single_item" | "section" | "whole_routine" | "whole_plan";
  strategy: "patch" | "regenerate" | "clarify";
  requiredCandidateSetIds: string[];
  confirmationLevel: "none" | "low" | "high";
};
```

局部 Patch 和整套 Regenerate 都是 `WorkoutEditPlan` 的执行策略：

- Patch：替换某个动作、改组数、改休息、删除一项。
- Regenerate：器械变化、场地变化、整体难度变化、时长大幅变化、目标变化。
- Clarify：目标 artifact、目标动作、训练条件或保留项不足。

服务端不通过关键词选择策略；服务端只校验 LLM 提出的 Patch 或 draft 是否符合 schema、candidate set、Validator、Policy 和 artifact revision 规则。

### 8. 生成工具必须是领域服务工具，不是无边界大模型外包

`generateRoutineDraft` 和 `generatePlanDraft` 不应只是把自然语言、候选动作和历史摘要转交给 LLM 生成整份训练。它们必须以结构化 intent / edit plan、候选集合、用户记忆和领域默认值为输入，复用现有 DomainPlanEngine、Validator、validation recovery、Policy 和 artifact revision 规则。

LLM 可参与非确定性选择、排序、说明、局部草稿提案和修复建议；确定性的训练结构展开、候选集合边界、时长估算、保存权限和高影响写入策略必须留在领域服务和服务端工具中。

### 9. Response Writer 是投影层

Response Writer 只消费 `AgentExecutionResult`、已登记 tool results、artifact summary、policy/validation 结果和 assistant suggestions。它可以生成自然语言表达，但不得重新解释用户意图、不得重新决定是否生成/修改/保存、不得引用未登记工具结果、不得承诺未执行的写操作。

如果使用 LLM 生成最终措辞，输入必须是 `AgentExecutionResult` 的只读投影，并且输出必须经过事实引用校验：回复中的具体动作、器械、训练结构、artifact 状态和保存结果必须能映射到 `usedToolResultIds`、`revisionId` 或服务端校验结果。

### 10. 模型调用与提示词协议必须随主链迁移

本 change 不是在旧 prompt 上增加几条规则，而是替换 `/api/chat` 的模型调用协议。旧 `chat_intent_resolution`、`chat_final_response`、`conversation_summary_context`、`reference_resolution_boundary` 只能作为迁移期间的兼容诊断或后台辅助，不得继续驱动生产执行决策。

Agent 至少需要三类新的模型输入边界：

- Agent tool decision：输入是 `ContextPackage` 摘要、工具 registry 定义、已登记 tool results、dependency graph 和本轮预算；输出只能是合法工具调用请求或终止结果。
- Agent final result：输入是当前 `AgentExecutionState`、关键 tool results、validator/policy/persistence 结果；输出只能是 `AgentExecutionResult`。
- Response Writer：输入是 `AgentExecutionResult` 的只读投影和必要 tool result 摘要；输出只负责用户可见措辞，不得再做语义决策、候选搜索、Patch、生成或写入。

下游模型调用也必须迁移输入协议。动作推荐、routine/plan draft、修复和 summary 更新不得继续声明“只会收到 `conversationSummary + latestUserMessage`”。它们应接收 Agent 已确定的结构化 intent/edit plan、candidateSetId、ContextPackage 摘要、tool result 或 `AgentExecutionResult`，并继续遵守候选集合、Validator 和 Policy 边界。

Structured Outputs 的核心要求是“模型输出必须先被结构校验，再被工具执行或投影”。无论底层供应商是否支持原生 tool calling，运行时都必须做到：

- 工具选择只能引用 registry 中的工具名和对应输入 Schema。
- `AgentExecutionResult` 必须通过 Zod / JSON Schema 校验。
- 解析失败、空响应、未知工具、非法参数、非法多工具请求和 repair 失败必须进入可诊断失败路径。
- Response Writer 的事实引用必须能映射到 `usedToolResultIds`、`revisionId`、`validationId`、`policyDecisionId` 或明确 blocking reason。

### 11. Token Budget 从 summary-only 观测迁移为 Agent stage 观测

现有 token budget 和 prompt module registry 是可观测边界，不能在 Agent 主链中继续描述为 summary-only。`/api/chat` 的观测阶段应改为 Agent 语义，例如 `agent_context_build`、`agent_tool_decision`、`agent_tool_execution`、`agent_response_writer`、`agent_summary_update` 或等价阶段。

`ModelVisibleContextSummary` 或等价调试摘要必须记录模型实际可见的 `ContextPackage` 组成：recent messages、recent artifacts、用户记忆、ContextSnapshot、tool result 摘要、截断策略和限制原因。预算可以限制 step 数、超时、单步输入大小和结果摘要大小，但不得作为跳过必要 artifact payload 读取、动作查询、validator、policy 或 persistence 的理由。

### 12. 不引入 LangGraph 作为首版依赖，但补足 runtime 合同

首版使用自定义 orchestrator，因为当前主要复杂度在领域工具边界，而不是通用图运行时。LangGraph 的 checkpoint、human-in-the-loop 和 durable graph 适合未来更长任务，但不应成为本次替换聊天主链的必要依赖。

自定义 orchestrator 仍必须具备基础 runtime 合同：step id、step replay 数据、dependency graph、checkpoint/resume、confirmation resume、幂等写入、trace correlation 和 deterministic replay fixture。否则只是把旧 `chat-service.ts` 大分支换成新的大循环函数，后续仍会重构。

### 13. 旧主链必须显式废弃

实现完成后，以下旧路径应删除或降级为仅测试/诊断：

- 服务端基于关键词改写高层 intent。
- `normalizeChatIntentForBlackboxFlows` 这类黑盒补丁型语义归一。
- ReferenceResolver-first 的自然语言搜索主路径。
- 只读 tool loop 只能补查、不能决定写动作的限制。
- RAG 裸搜最新用户原句后由服务端选择候选。
- `conversationSummary` 作为模型唯一历史上下文或短指令事实来源的限制。
- `createFallbackWorkoutIntent`、pending replacement 字符串匹配、`hasExplicitReferenceMarker`、`shouldUseReferenceResolutionForChat` 等服务端语义分流只能被删除、迁入工具硬边界或改为 Agent 可读状态，不能继续在 Agent 前改写执行路径。
- `chat_intent_resolution`、`chat_final_response` 和依赖 `conversation_summary_context` 的旧 prompt module 只能作为兼容诊断或已降级后台任务存在，不能继续参与生产执行决策。

### 14. conversationSummary 从主链移除

主聊天 Agent 的模型输入应来自 `ContextPackage`、工具结果和 explicit snapshots。系统可以保留可选 summary 生成，用于会话列表标题、后台摘要、调试显示或长会话辅助阅读，但 summary 不再是 `/api/chat` 必需输入，也不作为任何执行路径的事实来源。

替代方案是继续保留 summary 作为历史上下文入口，同时强调“不要当事实源”。这个边界容易被后续实现误用，且 summary 的最初目的主要是节省 token；当前架构明确功能正确性优先，因此不采用。

### 15. Token 成本策略从裁剪事实改为按需读取和缓存

本 change 不忽略成本，但成本策略必须服务于正确性。新的成本模型是：

- 初始 `ContextPackage` 保持小而真实，只包含必要 recent messages、artifact 摘要和用户记忆摘要。
- 需要完整事实时通过工具读取 payload，并把结果登记为可复用 tool result。
- 同一 run 内相同读工具参数应复用缓存结果；跨 run 可以复用安全的 artifact summary 或 embedding index，但不得复用过期权限或过期 confirmation。
- payload 摘要必须分层：列表摘要、候选摘要、payload 摘要和完整结构化 payload 分开，模型只看当前步骤必要层级。
- step limit、timeout 和最大 token 只防异常循环；不得作为跳过必要 artifact 读取、动作查询或校验的理由。

## Risks / Trade-offs

- [Risk] 一次替换 `/api/chat` 主链范围大。→ Mitigation: 在同一个 change 内完成新主链、测试和旧路径删除；实现任务可顺序推进，但不能长期保留双主链。
- [Risk] LLM 工具循环可能越界请求写入。→ Mitigation: 写工具必须校验前置读/候选/validator/policy result；未知工具和非法参数一律拒绝。
- [Risk] 后续把任意业务写入包装成 Agent tool，导致 Agent registry 绕过领域设计。→ Mitigation: 每个写工具必须声明领域能力合同、OpenSpec 归属、权限/确认/持久化边界和架构级测试；缺失任一边界不得注册。
- [Risk] Agent 可能循环过多。→ Mitigation: 保留最大 step、超时和硬失败回退；这些限制只防异常，不用于跳过必要工具查询。
- [Risk] 新工具协议不稳定会影响前端。→ Mitigation: 前端仍消费稳定流事件和 artifact 结果；Agent 内部 tool detail 只进入 trace。
- [Risk] 删除旧 normalize 和 summary 依赖后短期回归。→ Mitigation: 用真实黑盒多轮 flow 覆盖主要用户场景，断言用户可见输出、recent message 使用、tool result 和 artifact 事件，而不是旧 intent 字段或 summary 内容。
- [Risk] 兼容字段被再次当成事实源。→ Mitigation: 兼容字段只能由 `LegacyChatEventAdapter` 单向派生，架构测试断言旧字段不触发工具、卡片或写入。
- [Risk] 自定义 orchestrator 退化成新的大函数。→ Mitigation: 强制 step、dependency graph、checkpoint、replay fixture 和 trace correlation 合同。

## Migration Plan

1. 新增 `AgentContextBuilder`、`ContextPackage`、Context provenance 和上下文选择测试。
2. 新增 AgentOrchestrator、AgentExecutionState、AgentExecutionResult、AgentDependencyGraph 和 AgentToolRegistry 类型，并让 `AgentExecutionResult` 支持通用 `completed_operation`。
3. 将现有只读工具迁入统一 registry，并新增编辑计划、生成、校验、Policy、确认和写工具。
4. 为 Agent tool registry 增加领域能力合同检查，覆盖 tool 归属、Schema、权限、确认、持久化、trace 和 Response Writer 摘要边界。
5. 实现 Agent loop：模型 tool decision、工具执行、工具结果登记、依赖图、下一步决策、checkpoint 和最终 result。
6. 将 routine / plan / patch / regenerate / clarification 路径接入 Agent tools，并引入 `WorkoutEditPlan`。
7. 新增 Agent tool decision、Agent final result 和 Response Writer prompt modules，并迁移 token budget stage 与模型可见上下文摘要。
8. 将 Response Writer 改为基于 `AgentExecutionResult` 的投影层，旧流事件由兼容适配器单向派生。
9. 将 `/api/chat` 主链切换到 AgentOrchestrator，并使用 `ContextPackage` 替代 summary-only 历史上下文。
10. 删除或废弃旧语义 normalize、关键词 gate、ReferenceResolver-first 主路径、只读 tool loop 触发矩阵、旧 prompt module 主链依赖和 summary 必需输入。
11. 更新 trace、黑盒测试、架构级防回归测试、单元测试和架构文档。

## Open Questions

无。
