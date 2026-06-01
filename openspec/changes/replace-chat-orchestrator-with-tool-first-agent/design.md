## Context

当前聊天架构已经具备 `ConversationArtifact`、`ArtifactIndex`、`ReferenceResolver`、`WorkoutPatch`、候选动作选择、Validator、Policy、Confirmation 和只读 tool loop。但这些能力仍被 intent-first 主链驱动：LLM 先输出意图，服务端再通过 normalize、gate、ReferenceResolver、RAG query 和确定性回复分支二次解释用户自然语言。

这种设计在简单单轮推荐上可控，但在多轮调整中会系统性出错。用户说“`不用哑铃了，换一个`”“太难了”“不要跳跃动作”“改成在家练”时，语义需要结合最近 artifact、真实 payload、动作库和用户约束。服务端规则很难正确理解这些自然语言；一旦服务端用关键词或裸 RAG query 参与语义判断，就会和 LLM 理解冲突。

本 change 的目标是把 `/api/chat` 重构为 Tool-first Agent 主链。LLM 成为唯一语义编排者：它通过工具查最近 artifact、读取 payload、搜索动作、提出 patch 或重新生成、请求校验和保存。服务端只负责受控工具执行和硬边界，不再用自然语言规则改写高层语义。

## Goals / Non-Goals

**Goals:**

- 用 `AgentOrchestrator` 替换 `/api/chat` 的 intent-first 主链。
- 提供统一 `AgentToolRegistry`，覆盖读工具、生成草稿工具、Patch 工具、校验工具、保存 revision 工具和澄清工具。
- 让 LLM 基于真实数据库和 artifact payload 决定 `answer`、`clarify`、`patch`、`regenerate` 或 `generate`。
- 让动作查询以结构化工具参数执行，确保器械、肌群、难度、偏好和避免项先经过数据库过滤，再语义排序。
- 让所有写入都通过服务端工具校验：Schema、权限、candidate set、Validator、Policy、Confirmation、Persistence。
- 移除 `/api/chat` 主链对 `conversationSummary` 的必需依赖，Agent 可以使用真实 recent messages 和工具结果获取上下文。
- 删除或废弃旧主链中服务端语义 normalize、关键词 gate 和裸自然语言 RAG 决策。
- 用黑盒测试验证用户可见结果、卡片推送和多轮调整，而不是只验证旧 intent 字段。

**Non-Goals:**

- 首版不引入 LangGraph。LangGraph 只作为未来可替换 runtime，不参与本 change 的领域架构决策。
- 不允许 LLM 直接写数据库、执行任意 SQL 或绕过服务端工具。
- 不让前端参与 Agent 编排；前端只消费服务端流事件、artifact 和 `assistantSuggestions`。
- 不用 token 成本驱动裁剪功能。预算只用于防止无限循环和异常请求，不作为跳过必要工具查询的理由。
- 不把 `conversationSummary` 作为 `/api/chat` 的必要输入、模型唯一历史上下文或任何执行事实源。
- 不保留旧 intent-first 主链作为长期并行路径。旧字段只作为兼容输出、日志或测试迁移期间的诊断信息。

## Decisions

### 1. AgentExecutionState 是主执行状态

新增 `AgentExecutionState`，用于保存本轮 Agent 的全部结构化状态：

```ts
type AgentExecutionState = {
  userId: string;
  sessionId: string;
  latestUserMessage: string;
  recentMessages: ChatMessageSummary[];
  recentArtifacts: ArtifactSummary[];
  optionalSummary?: string;
  toolCalls: AgentToolCallRecord[];
  toolResults: AgentToolResultRecord[];
  pendingConfirmation?: AgentConfirmation;
  candidateSets: Record<string, CandidateSet>;
  draft?: RoutineDraft | PlanDraft;
  patch?: WorkoutPatch;
  finalResult?: AgentExecutionResult;
};
```

旧 resolved intent 不再是主执行状态。它可以由 Agent 的最终 plan 派生出来，用于兼容前端事件或 trace，但不能反过来驱动工具选择。

`optionalSummary` 只用于会话标题、调试摘要或长会话辅助阅读，不参与执行决策。Agent 需要事实时必须读取 `recentMessages`、recent artifacts 或调用工具。

### 2. 统一 AgentToolRegistry 替代只读-only tool loop

`AgentToolRegistry` 注册所有 LLM 可请求的工具。工具分为：

- 读工具：`listRecentArtifacts`、`searchArtifacts`、`getArtifactPayload`、`searchExercises`、`getExerciseById`、`getUserMemory`。
- 规划工具：`proposeRoutineDraft`、`proposePlanDraft`、`proposeWorkoutPatch`、`askClarification`。
- 校验工具：`validateRoutineDraft`、`validatePlanDraft`、`validateWorkoutPatch`、`evaluatePolicy`。
- 写工具：`saveConversationArtifactRevision`、`persistPatchResult`。

LLM 可以选择工具，但工具由服务端执行。每个工具都有 Zod Schema、权限上下文、输出摘要、trace 摘要和可执行边界。写工具必须验证前置 tool result，不能只凭模型参数直接写入。

### 3. 工具循环使用显式完成条件

Agent loop 的停止条件不是“模型回答了文本”，而是产生一个结构化 `AgentExecutionResult`：

```ts
type AgentExecutionResult =
  | { status: "answered"; replyContext: ToolContextBundle }
  | { status: "needs_clarification"; question: string; assistantSuggestions: AssistantSuggestion[] }
  | { status: "generated"; artifact: ConversationArtifactSummary }
  | { status: "patched"; patchResult: WorkoutPatchResult; artifact: ConversationArtifactSummary }
  | { status: "failed"; failureCode: string; recoverySuggestions: AssistantSuggestion[] };
```

最终用户回复只消费 `AgentExecutionResult` 和 tool results，不再凭 prompt 承诺“已生成/已更新”。

### 4. 结构化查询先于 RAG

动作和 artifact 搜索工具必须让 LLM 传入结构化字段，例如 `equipmentAvoided: ["哑铃"]`、`targetMuscles: ["肩", "背"]`、`sessionMinutes: 30`。服务端工具先做结构化硬过滤，再做全文/向量召回和 rerank。用户原始消息可以作为辅助 query，但不能作为唯一检索输入。

这解决“不要哑铃”被当成“哑铃正向匹配”的架构问题。

### 5. Patch 与 Regenerate 都由 Agent 选择，但服务端校验执行

LLM 通过工具读取 artifact payload 后，决定用户请求是局部 Patch 还是整套重新生成：

- 局部 Patch：替换某个动作、改组数、改休息、删除一项。
- Regenerate：器械变化、场地变化、整体难度变化、时长大幅变化、目标变化。

服务端不通过关键词选择策略；服务端只校验 LLM 提出的 Patch 或 draft 是否符合 schema、candidate set、Validator、Policy 和 artifact revision 规则。

### 6. 不引入 LangGraph 作为首版依赖

首版使用自定义 orchestrator，因为当前主要复杂度在领域工具边界，而不是通用图运行时。LangGraph 的 checkpoint、human-in-the-loop 和 durable graph 适合未来更长任务，但不应成为本次替换聊天主链的必要依赖。

### 7. 旧主链必须显式废弃

实现完成后，以下旧路径应删除或降级为仅测试/诊断：

- 服务端基于关键词改写高层 intent。
- `normalizeChatIntentForBlackboxFlows` 这类黑盒补丁型语义归一。
- ReferenceResolver-first 的自然语言搜索主路径。
- 只读 tool loop 只能补查、不能决定写动作的限制。
- RAG 裸搜最新用户原句后由服务端选择候选。
- `conversationSummary` 作为模型唯一历史上下文或短指令事实来源的限制。

### 8. conversationSummary 从主链移除

主聊天 Agent 的模型输入应包含当前最新用户消息、必要的真实 recent messages、recent artifact 摘要和工具结果。系统可以保留可选 summary 生成，用于会话列表标题、后台摘要、调试显示或长会话辅助阅读，但 summary 不再是 `/api/chat` 必需输入，也不作为任何执行路径的事实来源。

替代方案是继续保留 summary 作为历史上下文入口，同时强调“不要当事实源”。这个边界容易被后续实现误用，且 summary 的最初目的主要是节省 token；当前架构明确功能正确性优先，因此不采用。

## Risks / Trade-offs

- [Risk] 一次替换 `/api/chat` 主链范围大。→ Mitigation: 在同一个 change 内完成新主链、测试和旧路径删除；实现任务可顺序推进，但不能长期保留双主链。
- [Risk] LLM 工具循环可能越界请求写入。→ Mitigation: 写工具必须校验前置读/候选/validator/policy result；未知工具和非法参数一律拒绝。
- [Risk] Agent 可能循环过多。→ Mitigation: 保留最大 step、超时和硬失败回退；这些限制只防异常，不用于跳过必要工具查询。
- [Risk] 新工具协议不稳定会影响前端。→ Mitigation: 前端仍消费稳定流事件和 artifact 结果；Agent 内部 tool detail 只进入 trace。
- [Risk] 删除旧 normalize 和 summary 依赖后短期回归。→ Mitigation: 用真实黑盒多轮 flow 覆盖主要用户场景，断言用户可见输出、recent message 使用、tool result 和 artifact 事件，而不是旧 intent 字段或 summary 内容。

## Migration Plan

1. 新增 AgentOrchestrator、AgentExecutionState、AgentExecutionResult 和 AgentToolRegistry 类型。
2. 将现有只读工具迁入统一 registry，并新增受控写前置工具和写工具。
3. 实现 Agent loop：模型 tool decision、工具执行、结果摘要、下一步决策和最终 result。
4. 将 routine / plan / patch / clarification 路径接入 Agent tools。
5. 将 `/api/chat` 主链切换到 AgentOrchestrator，并使用真实 recent messages 替代 summary-only 历史上下文。
6. 删除或废弃旧语义 normalize、关键词 gate、ReferenceResolver-first 主路径和 summary 必需输入。
7. 更新 trace、黑盒测试、单元测试和架构文档。

## Open Questions

无。
