# 其他 open changes 的旧 Agent core 引用审计

本文件记录 `remove-current-agent-core-layer` 实施时仍引用旧 Agent core、旧 Response Writer、旧 `AgentExecutionResult`、旧 `AgentToolRegistry` 或 `lib/server/agent-orchestrator/**` 的非 archive OpenSpec changes。这些引用不阻塞本 change 删除运行时代码；后续是否继续、删除或重写，由人工分别决定。

## 扫描范围

- 命令：`rg -n "AgentOrchestrator|AgentExecutionResult|AgentToolRegistry|runAgentOrchestrator|agent_execution_result|agent_tool_decision|ContextPackage|Response Writer|response writer|lib/server/agent-orchestrator" openspec/changes --glob '!openspec/changes/archive/**' --glob '!openspec/changes/remove-current-agent-core-layer/**'`
- 时间：`2026-06-03 10:43:06 +0800`

## 仍有旧引用的 open changes

- `add-exercise-library-readonly-query-tools`
  - 引用旧 `AgentToolRegistry`、旧 `Response Writer`、旧 `AgentExecutionResult`、旧 `lib/server/agent-orchestrator/**` 和旧 `lib/server/ai/prompt-config.ts`。
  - 本 change 不为它保留运行时代码。

- `fix-agent-plan-scope-routing`
  - 引用旧 `/api/chat` Tool-first `AgentOrchestrator`、旧 `agent_tool_decision` prompt 和旧 `lib/server/agent-orchestrator/**`。
  - 本 change 不为它保留运行时代码。

- `default-unspecified-equipment-to-no-equipment`
  - 引用旧 `lib/server/agent-orchestrator/**`、旧 `ContextPackage` 和旧 Agent 结构化输入边界。
  - 本 change 不为它保留运行时代码。

- `optimize-exercise-search-ranking-runtime`
  - 引用旧 `lib/server/agent-orchestrator/*` 中 `searchExercises` 工具执行和 trace 摘要。
  - 本 change 不为它保留运行时代码。

- `build-agent-tool-orchestrator-phase-one-loop`
  - 明确声明不继承旧 `AgentOrchestrator`、旧 `AgentExecutionResult`、旧 response writer 或旧 `lib/server/agent-orchestrator/**`。
  - 该 change 与本 change 的删除边界一致，但仍需后续独立实现和验证。

- `realign-agent-tools-with-llm-authored-drafts`
  - 引用旧 `lib/server/agent-orchestrator/workout-tools.ts`、`readonly-tools.ts` 和旧 `AgentToolRegistry` 合同。
  - 本 change 不为它保留运行时代码。
