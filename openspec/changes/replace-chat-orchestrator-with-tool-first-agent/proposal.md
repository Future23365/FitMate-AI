## Why

当前聊天主链在多轮调整、否定约束、引用解析和动作查询上反复出现同类问题：LLM 已理解用户语义，但服务端又用 `normalize`、ReferenceResolver、RAG query 和确定性回复二次解释自然语言，导致“用户说不用哑铃却返回哑铃候选”这类回归。

根本问题不是某个 prompt 或某个检索规则，而是架构仍是 intent-first + server semantic gating。需要把 `/api/chat` 主链替换为 Tool-first `AgentOrchestrator`：LLM 通过受控工具查库、读取 artifact、选择动作、提出 patch / regenerate / clarify，服务端只执行权限、Schema、候选集合、Validator、Policy、Revision 等硬边界。

## What Changes

- **BREAKING**：`/api/chat` 的生产主链从 intent-first orchestrator 切换为 Tool-first `AgentOrchestrator`；旧 `normalizeChatIntentForBlackboxFlows`、关键词 gating、服务端自然语言语义纠偏和只读-only tool loop 不再作为主决策路径。
- 新增 `tool-first-agent-orchestrator` 能力，定义 `AgentContextBuilder`、`ContextPackage`、Agent 状态、工具协议、执行循环、最终 `AgentExecutionResult`、失败恢复和 Response Writer 边界。
- 将 `AgentExecutionResult` 设为 `/api/chat` 唯一执行合同；旧 `type`、`workoutIntent`、resolved intent 和 `assistant_action` 只能由兼容适配器从 Agent 结果派生，并必须有删除条件。
- 将现有只读工具升级为统一 Agent Tool Registry，允许 LLM 在受控边界内调用读工具和写前置工具；写入仍由服务端工具执行并经过 Validator / Policy / Confirmation / Persistence。
- Agent 工具结果必须通过 `toolResultId`、`candidateSetId`、`validationId`、`policyDecisionId` 和 `revisionId` 等结构化引用串联，写工具不得消费模型自由文本伪造的前置结果。
- 明确 Agent tool 是后续流程能力扩展点，但每个写工具必须绑定一个已定义的领域能力合同；不得把 registry 当成任意业务函数、任意数据库写入或绕过 OpenSpec 的插件入口。
- 将 `AgentExecutionResult` 扩展为可表达通用受控写操作结果，避免后续新增“修改用户资料”“保存通知设置”等非训练 artifact 工具时反复改动 Agent 主链结构。
- 移除 `/api/chat` 主链对 `conversationSummary` 的必需依赖；Agent 执行输入优先使用真实 recent messages、recent artifacts、用户记忆和 tool results，功能正确性优先于 token 成本。
- 如需长会话压缩，只能通过带 provenance 的 `ContextSnapshot` 进入 Agent；旧 `conversationSummary` 不得直接进入执行决策或作为事实源。
- 让 LLM 通过工具主动读取 `ConversationArtifact`、`ArtifactIndex`、动作库、用户记忆和历史 payload，而不是让服务端从 summary 或用户原句反推事实。
- 将训练调整统一为 Agent 决策：LLM 基于工具结果选择 `patch`、`regenerate`、`clarify` 或 `answer`，服务端不再用关键词判断“换一个”“不用哑铃”“简单点”等语义。
- 新增统一 `WorkoutEditPlan` / `WorkoutEditIntent` 边界，先表达编辑目标、保留项、变更项、影响范围和确认级别，再进入 Patch、Regenerate 或 Clarify。
- 动作查询必须通过结构化工具参数表达 `equipmentRequired`、`equipmentAvoided`、`muscles`、`level`、`duration`、`preferences` 和 `avoidances`，避免 RAG 裸搜用户原句。
- Routine/plan 生成工具必须复用领域服务、Validator、Policy 和候选集合，不得退化成“LLM 自由生成整份训练再让服务端兜底修补”的大工具。
- Patch、routine/plan 生成、校验、保存 artifact revision 和最终回复都必须基于工具执行结果，不能由自然语言正文承诺替代真实执行。
- Response Writer 必须是 `AgentExecutionResult` 的投影层，不能重新解释用户语义、不能重新决定是否生成/保存、不能承诺未发生的写操作。
- 更新 trace、黑盒测试、架构级断言和文档，覆盖多轮工具调用、真实动作库查询、否定约束、artifact 调整、失败恢复、旧路径未被调用和用户可见回复一致性。

## Capabilities

### New Capabilities

- `tool-first-agent-orchestrator`: 定义 Tool-first Agent 主链、工具注册、Agent 状态、执行循环、写入边界、最终结果和回复生成规则。

### Modified Capabilities

- `readonly-llm-tool-calling`: 从只读补查工具循环升级为统一 Agent Tool Registry；读工具和受控写工具都必须通过 Schema、权限和预算边界。
- `chat-intent-decision-flow`: 将旧 resolved intent 从主执行合同降级为兼容/诊断字段；主决策改由 Agent tool loop 和 `ExecutionResult` 驱动。
- `chat-context-summarization`: 将 `conversationSummary` 从 `/api/chat` 必需历史上下文降级为可选后台摘要、会话标题或调试材料；主链不得依赖它恢复上下文。
- `rag-hybrid-search`: 约束 LLM 工具检索必须使用结构化过滤参数，不允许裸搜用户原句决定动作或 artifact。
- `conversation-artifact`: 明确 Agent 读取、修订和保存 artifact revision 的工具边界，summary 仍不得作为事实源。
- `workout-patch`: 明确 Patch 必须由 Agent 基于真实 artifact payload 和工具候选提出，服务端只校验和应用。
- `workout-generation-validation-recovery`: 明确 routine/plan draft 由 Agent 工具生成并经过统一校验、修复和失败恢复。
- `ai-run-trace`: 增加 Agent tool loop、tool decision、tool result、validator gate、persistence 和 response writer 的 trace 合同。
- `manual-llm-consistency-tests`: 将真实黑盒测试升级为验证 Tool-first 主链的多轮用户可见结果，而不是只验证 prompt 或旧 intent 字段。

## Impact

- 影响 `/api/chat`、`lib/server/chat/chat-service.ts`、`lib/server/ai/tools/*`、动作查询服务、ConversationArtifact 服务、WorkoutPatch 服务、routine/plan 生成服务、Validator、Policy、Trace 和 Response Writer。
- 可能新增 `lib/server/agent-orchestrator/*`、`AgentContextBuilder`、`ContextPackage`、统一 `AgentToolRegistry`、`AgentExecutionState`、`AgentExecutionResult`、`WorkoutEditPlan`、Agent tool schema 和对应测试夹具。
- 后续新增非训练领域工具时，原则上应复用 Agent runtime、tool registry、dependency graph、Policy/Confirmation 和 Response Writer 投影合同；若新增数据模型、API 契约、权限边界或用户可见流程，仍必须走对应 OpenSpec change。
- 需要调整或废弃旧的 intent normalize、ReferenceResolver-first 触发矩阵、只读-only tool loop 和基于自然语言关键词的服务端语义分流。
- 需要调整或废弃 `conversationSummary` 作为模型唯一历史上下文的旧契约；如果保留 summary 生成，只能作为可选后台任务或生成带 provenance 的 `ContextSnapshot`。
- 需要为旧兼容事件建立单向 `LegacyChatEventAdapter`，并在测试中断言旧 intent-first 分支不会反向触发卡片、工具或写入。
- 不要求首版引入 LangGraph；如未来接入 LangGraph，只能作为可替换 runtime，不能改变本 change 定义的 Context、工具 schema、权限、Validator、Policy、Persistence 和 replay 边界。
