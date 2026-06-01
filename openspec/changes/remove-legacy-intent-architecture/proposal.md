## Why

Tool-first `AgentOrchestrator` 已经成为 `/api/chat` 的生产主链，但当前代码、测试和 OpenSpec 主规格仍保留旧 intent-first 架构的合同与命名，例如 `ResolvedChatIntent`、`workoutIntent`、`assistant_action`、只读-only tool loop、`conversationSummary + latestUserMessage` 协议和 resolved intent 驱动的 plan/routine 生成要求。

这些遗留内容会让后续开发继续误以为系统存在“双主链”：一套 Agent 工具闭环，一套旧意图解析/门控/生成闭环。本 change 是后续实现旧架构移除的架构清理 change；当前阶段只先写 OpenSpec 文档，明确要删除哪些旧代码路径、旧测试口径、旧流事件和旧规格合同，后续 apply 时必须以删除旧执行链路为目标，而不是继续增加兼容层。

## What Changes

- **BREAKING**：删除旧 intent-first 聊天主链合同；`ResolvedChatIntent`、`ChatIntent`、`workoutIntent`、`action.shouldTrigger` 和 `responseMode` 不再允许作为 `/api/chat` 生产执行、卡片生成、Patch、计划生成或最终回复的事实源。
- **BREAKING**：删除旧 `assistant_action` / `intent_resolved` 生产流事件合同；前端、黑盒 runner 和报告必须从 `AgentExecutionResult`、artifact / patch / suggestion 事件和 done metadata 推导用户可见结果。
- **BREAKING**：废弃 `LegacyChatEventAdapter` 及旧字段单向派生兼容期；后续如保留，只能作为离线迁移脚本、历史报告解析或测试夹具，不能在生产 `/api/chat` 流中输出。
- **BREAKING**：删除旧只读-only LLM tool loop 规格；`ENABLE_READONLY_LLM_TOOLS`、`runReadonlyToolLoop`、`ReadonlyToolDecision` 和旧只读触发矩阵不得继续作为生产编排能力。读工具必须迁入统一 `AgentToolRegistry`。
- **BREAKING**：删除 `conversationSummary + latestUserMessage` 作为模型历史上下文协议的残留要求；`conversationSummary` 只能作为后台摘要、标题、历史迁移或调试材料，不能进入 Agent 执行事实源。
- 将长期计划、routine、动作推荐、Patch、动作讲解和普通回复的执行合同统一收敛到 `AgentExecutionResult`，下游领域服务只能消费 Agent 已登记的结构化输入、tool result、candidateSetId、validationId、policyDecisionId、revisionId 或明确 blocking reason。
- 增加 legacy allowlist：旧架构代码、类型、事件解析和报告兼容默认不得保留；确需保留时必须位于离线迁移、历史展示兼容或测试 fixture 边界，并且不能被生产 `/api/chat`、Agent runtime、Response Writer、前端新流解析或领域服务导入。
- 明确 Agent-only 失败处理：新架构遇到失败、信息不足或策略阻断时，只能使用 Agent repair、`needs_clarification`、`blocked`、`failed`、tool retry、validation / policy failure handling 或用户确认；旧 intent resolution、旧 action gate、旧只读 tool loop、旧 trigger parser 和 `conversationSummary` 重建必须删除，不能作为第二执行路径。
- 明确新 stream 合同：新运行只能用 `agent_execution_result`、artifact / patch / suggestion 事件、tool evidence metadata 和 done metadata 表达用户可见结果；旧 `assistant_action`、`intent_resolved`、trigger JSON 和 `workoutIntent` 不得作为新生产流事件输出。
- 更新 AI Trace 规格，删除旧 intent resolution、ReferenceResolver-first、只读 tool loop 失败处理等阶段作为主链 trace 的要求，改为强制记录 Agent context、tool decision、tool result、dependency graph、Response Writer 和 legacy path absence。
- 更新手动 LLM 黑盒规格，禁止继续把旧 `assistant_action`、resolved intent、`workoutIntent` 或 trigger JSON 作为核心断言或失败依据。
- 增加清理验收：实现时必须删除或隔离旧源码、旧 prompt module、旧测试 helper、旧文档段落和旧诊断字段，并用架构级测试证明旧路径无法触发生产执行。

## Capabilities

### New Capabilities

- 无。本 change 不引入新的运行时架构能力；它定义 Tool-first AgentOrchestrator 迁移完成后，后续实现必须移除的旧 intent-first 架构代码路径和验收边界。

### Modified Capabilities

- `chat-intent-decision-flow`: 删除 resolved intent 主链、旧字段兼容和 intent-first 门控要求，替换为旧架构移除要求。
- `readonly-llm-tool-calling`: 删除只读-only tool loop 能力规格，要求读工具迁入统一 Agent registry。
- `ai-run-trace`: 删除旧 intent / readonly tool loop trace 合同，改为 Agent 执行证据和旧路径缺席证据。
- `manual-llm-consistency-tests`: 移除旧 `assistant_action` / resolved intent 断言，要求黑盒报告以 Agent 结果和用户可见闭环为准。
- `chat-context-summarization`: 强化 `conversationSummary` 的非执行边界，删除 summary-only 历史上下文协议。
- `plan-push-composition`: 删除长期计划推送服从 resolved intent 的要求，改为服从 Agent plan/draft 工具和 `AgentExecutionResult`。
- `domain-plan-engine`: 删除 `PlanStrategy` 从 resolved intent 派生的要求，改为从 Agent tool result、edit plan 或结构化计划输入派生。
- `chat-blackbox-flow-regression-fixes`: 清理围绕 `workoutIntent`、intent normalize 和旧黑盒补丁的回归要求，迁移为 Agent 防回归要求。
- `chat-default-beginner-action-trigger`、`chat-exercise-recommendation-trigger`、`chat-routine-composition`: 删除以旧 intent 字段作为触发事实源的要求，迁移到 Agent 执行结果和工具证据。

## Impact

- 影响 OpenSpec 主规格和后续实现范围：`/api/chat`、`lib/server/chat/chat-service.ts`、`lib/shared/chat/*intent*`、`lib/server/ai/tools/*`、`lib/server/agent-orchestrator/*`、`lib/server/workout-plans/*`、`manual-tests/llm/*`、`tests/*chat*`、`tests/readonly-tools.test.ts`、`docs/chat-push-flow.md`、`docs/architecture.md` 和相关方案历史文档。
- 后续实现应删除旧 intent-first 源码、测试、流事件和诊断字段，而不是把它们继续保留为生产兼容路径。
- 当前阶段只写 OpenSpec change 文档，不修改业务代码、不迁移测试、不修改或删除 `docs/`、不运行真实模型黑盒；后续进入 apply 时应按 `tasks.md` 执行代码、测试和文档同步。历史方案文档默认保留为演进记录，除非用户另行确认，不以删除历史文档作为清理手段。
