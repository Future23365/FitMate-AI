## Why

当前 Agent Loop 在多轮之间把 tool result facts 同时通过 `observations` 和 `toolResults.projection.model` 传给 Planner，且终态只校验结构和引用，缺少统一的状态视图、证据权威层级和完成度门禁。真实 trace 已证明模型即使看到缺口提示，也可能把仍可继续补证据的请求直接 `final_answer` 收口，因此需要把 Loop 内部合同从“文本提示叠加”收敛为可验证的状态转移合同。

本 change 目标是让当前项目的轻量 Agent Loop 对齐主流 Agent 框架的核心设计原则：显式 state、tool event / evidence、termination condition、guardrail / trace，而不引入 LangGraph、AutoGen、OpenAI Agents SDK 或 Semantic Kernel 这类重框架。

## What Changes

- 新增 `AgentLoopState -> PlannerStateView -> AgentAction -> ToolResult -> Evidence -> TerminalGate` 的核心 Loop 合同。
- Planner 每轮只接收一个权威 `PlannerStateView`，不再同时消费重复且权威层级不清的 `observations` 与完整 `toolResults.projection.model`。
- Tool execution 结果在进入下一轮 Planner 前先归一化为 `Evidence`，保留 facts、supports、missing、blockedOutputs、refs、recoverableActions 和安全摘要。
- `ToolResult` 内部仍保留完整 output、projection、fulfillment 和 trace summary；模型可见输入只消费经压缩、去重、脱敏且可验证的 `Evidence`。
- terminal action 必须声明结构化完成度 outcome，例如 `complete`、`partial`、`needs_input`、`blocked`，并通过通用 `TerminalGate` 校验 evidence 支持、缺口状态、usedRefs/resource refs 和 visibleOutputs 自洽。
- trace / replay 必须记录每轮状态转移：上一轮 action、tool result 产生的 evidence、pending requirements、terminal gate 判定和最终 outcome。
- 回归测试对齐根目录 `llm基础测试.md` 与 `LLM完整测试.md` 的用户可见合同，重点区分直接完成、建议可恢复通过、追问、阻断和失败。
- 不新增服务端关键词、正则、同义词表、用户 phrasing 特判、固定 `toolName` 调用顺序或业务 toolName 语义分支。
- 不要求重写现有业务 tool handler、tool schema、ToolRegistry 注册模式或前端卡片组件；现有 tool 通过 adapter 逐步提供更丰富 Evidence。

## Capabilities

### New Capabilities

- `agent-loop-state-view-contract`: 定义 Agent Loop 的权威状态视图、Evidence 投影、终态完成度门禁、trace/replay 记录和与业务 tool 的兼容边界。

### Modified Capabilities

- `agent-tool-contract-kernel`: `PlannerPort` 和 Runtime loop 必须以 `PlannerStateView` 作为模型可见输入边界，避免把内部 runtime state、重复 observations 或完整 tool projection 直接传给 Planner。
- `agent-tool-production-hardening`: production terminal completion 必须经过通用 `TerminalGate` 完成度校验，不能把仍有 pending requirements 的 `final_answer` 当成功。
- `ai-run-trace`: trace / replay 必须记录 state view、evidence、pending requirements 和 terminal gate 判定，支持诊断“模型看到了什么、为什么还收口”。
- `manual-llm-consistency-tests`: 黑盒报告必须区分直接完成、建议可恢复通过、追问、阻断和失败，并覆盖 routine / plan / recommendation 卡片类型稳定性与上下文继承边界。

## Impact

- 影响 Agent core runtime 和模型输入构造：
  - `lib/server/agent-core/**`
  - `PlannerPort` / `LlmPlanner` adapter
  - `Action Validator` / terminal validation
  - `ToolResult` observation / projection pipeline
- 影响 trace / replay / diagnostics：
  - Agent run trace events
  - `/dev/ai-traces` 导出摘要
  - ReplayPlanner / replay fixture
- 影响测试：
  - agent-core contract tests
  - runtime loop / terminal gate tests
  - trace / replay tests
  - manual LLM basic / detailed runner report contract
- 不影响：
  - Prisma schema、数据库迁移和用户数据模型
  - 业务 tool handler 查询语义
  - ToolRegistry 的基本注册模式
  - `/api/chat` 请求/响应外部 schema
  - 前端训练卡片组件结构
