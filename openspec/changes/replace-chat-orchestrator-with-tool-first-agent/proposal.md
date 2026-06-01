## Why

当前聊天主链在多轮调整、否定约束、引用解析和动作查询上反复出现同类问题：LLM 已理解用户语义，但服务端又用 `normalize`、ReferenceResolver、RAG query 和确定性回复二次解释自然语言，导致“用户说不用哑铃却返回哑铃候选”这类回归。

根本问题不是某个 prompt 或某个检索规则，而是架构仍是 intent-first + server semantic gating。需要把 `/api/chat` 主链替换为 Tool-first `AgentOrchestrator`：LLM 通过受控工具查库、读取 artifact、选择动作、提出 patch / regenerate / clarify，服务端只执行权限、Schema、候选集合、Validator、Policy、Revision 等硬边界。

## What Changes

- **BREAKING**：`/api/chat` 的生产主链从 intent-first orchestrator 切换为 Tool-first `AgentOrchestrator`；旧 `normalizeChatIntentForBlackboxFlows`、关键词 gating、服务端自然语言语义纠偏和只读-only tool loop 不再作为主决策路径。
- 新增 `tool-first-agent-orchestrator` 能力，定义 Agent 状态、工具协议、执行循环、最终 `ExecutionResult`、失败恢复和 Response Writer 边界。
- 将现有只读工具升级为统一 Agent Tool Registry，允许 LLM 在受控边界内调用读工具和写前置工具；写入仍由服务端工具执行并经过 Validator / Policy / Confirmation / Persistence。
- 让 LLM 通过工具主动读取 `ConversationArtifact`、`ArtifactIndex`、动作库、用户记忆和历史 payload，而不是让服务端从 `conversationSummary` 或用户原句反推事实。
- 将训练调整统一为 Agent 决策：LLM 基于工具结果选择 `patch`、`regenerate`、`clarify` 或 `answer`，服务端不再用关键词判断“换一个”“不用哑铃”“简单点”等语义。
- 动作查询必须通过结构化工具参数表达 `equipmentRequired`、`equipmentAvoided`、`muscles`、`level`、`duration`、`preferences` 和 `avoidances`，避免 RAG 裸搜用户原句。
- Patch、routine/plan 生成、校验、保存 artifact revision 和最终回复都必须基于工具执行结果，不能由自然语言正文承诺替代真实执行。
- 更新 trace、黑盒测试和文档，覆盖多轮工具调用、真实动作库查询、否定约束、artifact 调整、失败恢复和用户可见回复一致性。

## Capabilities

### New Capabilities

- `tool-first-agent-orchestrator`: 定义 Tool-first Agent 主链、工具注册、Agent 状态、执行循环、写入边界、最终结果和回复生成规则。

### Modified Capabilities

- `readonly-llm-tool-calling`: 从只读补查工具循环升级为统一 Agent Tool Registry；读工具和受控写工具都必须通过 Schema、权限和预算边界。
- `chat-intent-decision-flow`: 将旧 resolved intent 从主执行合同降级为兼容/诊断字段；主决策改由 Agent tool loop 和 `ExecutionResult` 驱动。
- `rag-hybrid-search`: 约束 LLM 工具检索必须使用结构化过滤参数，不允许裸搜用户原句决定动作或 artifact。
- `conversation-artifact`: 明确 Agent 读取、修订和保存 artifact revision 的工具边界，`conversationSummary` 仍不得作为事实源。
- `workout-patch`: 明确 Patch 必须由 Agent 基于真实 artifact payload 和工具候选提出，服务端只校验和应用。
- `workout-generation-validation-recovery`: 明确 routine/plan draft 由 Agent 工具生成并经过统一校验、修复和失败恢复。
- `ai-run-trace`: 增加 Agent tool loop、tool decision、tool result、validator gate、persistence 和 response writer 的 trace 合同。
- `manual-llm-consistency-tests`: 将真实黑盒测试升级为验证 Tool-first 主链的多轮用户可见结果，而不是只验证 prompt 或旧 intent 字段。

## Impact

- 影响 `/api/chat`、`lib/server/chat/chat-service.ts`、`lib/server/ai/tools/*`、动作查询服务、ConversationArtifact 服务、WorkoutPatch 服务、routine/plan 生成服务、Validator、Policy、Trace 和 Response Writer。
- 可能新增 `lib/server/agent-orchestrator/*`、统一 `AgentToolRegistry`、`AgentExecutionState`、`AgentExecutionResult`、Agent tool schema 和对应测试夹具。
- 需要调整或废弃旧的 intent normalize、ReferenceResolver-first 触发矩阵、只读-only tool loop 和基于自然语言关键词的服务端语义分流。
- 不要求首版引入 LangGraph；如未来接入 LangGraph，只能作为可替换 runtime，不能改变本 change 定义的工具 schema、权限、Validator、Policy 和 Persistence 边界。
