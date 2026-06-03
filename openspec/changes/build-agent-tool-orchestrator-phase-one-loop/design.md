## Context

`remove-current-agent-core-layer` 已经完成当前旧 Agent core 的 delete-only 清理。新 core 不能继续沿用旧 `AgentOrchestrator` 的实现细节，也不能为了兼容旧 tool name、旧 final result、旧 response writer 或旧 trace event 增加适配层。

本 change 的目标是按 `docs/agent-tool-orchestrator-design.md` 重建第一阶段完整闭环。这里的闭环是通用 Agent Tool Orchestrator 闭环，不是业务 tool 闭环。第一阶段必须能真实接入 `/api/chat`，完整实现 core、tool bundle、registry、Planner、runtime、resource contract、Policy Guard、Response Adapter、trace/replay 和 NDJSON 输出；但不提前实现任何具体业务 tool。生产 registry 没有业务 tool 时，用户仍应能正常和 LLM 对话，Planner 以 `final_answer` 或 `ask_user` 收口；模型不能调用尚未注册的动作查询、训练生成、保存或其他功能。

## Goals / Non-Goals

**Goals:**

- 建立全新的 `agent-core`，只负责通用循环、合同校验和运行状态，不包含具体业务 tool 分支。
- 建立 `defineTool` 和 `ToolRegistry`，让工具以完整 bundle 注册。
- 让 tool bundle 同时声明 manifest、input/output schema、resource contract、policy metadata、handler、trace projection 和 response adapter。
- 让 Planner 只看到序列化后的安全 tool manifest，并输出结构化 `AgentAction`。
- 定义新的 Planner Provider、`AgentRunInput` 和 `ContextPackage` 合同，覆盖模型调用、structured output、repair feedback、replay planner 和模型可见上下文摘要。
- 让 runtime 支持多轮 tool call、observation、`maxSteps`、timeout、防重复失败和结构化终止。
- 让 Response Adapter 只根据真实 tool results 和 final action 生成 `/api/chat` NDJSON 事件。
- 让 `/api/chat` 在没有业务 tool 或本轮不需要 tool 时仍能返回普通聊天内容和 `done` 事件。
- 完整实现通用编排闭环，不把 `/api/chat`、Response Adapter、trace/replay 或 confirmation 推迟到后续阶段。
- 使用无业务 fixture tools 验证注册、调用、资源生产/消费、确认、失败收口、response projection 和 replay。
- 增加架构级测试，证明新增 tool 不需要改 orchestrator、executor、policy guard、resource validator、response adapter 主流程或 `/api/chat` 主链。

**Non-Goals:**

- 不提前实现任何具体业务 tool。
- 不创建具体业务 tool 目录。
- 不接入具体业务服务。
- 不把无业务 fixture tools 注册进生产 `/api/chat` 默认 registry。
- 不把无业务聊天视为训练生成、动作查询、保存或其他功能恢复。
- 不实现多 Agent 协作、自动反思、任务队列或后台长任务。
- 不新增独立向量库、任意 SQL tool 或任意函数调用。
- 不保留旧 Agent core 兼容层。
- 不让服务端关键词、正则、同义词表或规则评分重新解释用户自然语言。

## 完整闭环交付清单

第一阶段交付必须逐项覆盖以下 15 项，任何一项缺失都不算完成：

```txt
1. defineTool
2. ToolRegistry
3. Tool manifest 序列化
4. inputSchema / outputSchema 校验
5. resourceContract 校验
6. Planner 输出 AgentAction
7. 多轮 tool call
8. maxSteps / timeout 防死循环
9. consumable / diagnostic 资源角色
10. Policy Guard
11. confirmation action hash
12. Response Adapter
13. Trace / replay fixture
14. `/api/chat` NDJSON 接入
15. 无业务 fixture tools 验证端到端闭环
```

第 15 项只验证通用机制，不代表提前实现业务 tool。

## Decisions

### 1. 新 core 从 `lib/server/agent-core/**` 开始，不复用旧 core 文件

新实现应优先创建清晰的新目录：

```txt
lib/server/agent-core/
  contracts.ts
  define-tool.ts
  tool-registry.ts
  manifest.ts
  planner.ts
  action-validator.ts
  executor.ts
  resource-contract.ts
  policy-guard.ts
  runtime.ts
  response-adapter.ts
  trace-replay.ts

lib/server/agent-tools/
  index.ts

tests/agent-core/
  fixture-tools.ts
```

旧 `lib/server/agent-orchestrator/**` 如果仍残留，只能作为删除对象或历史参考，不得被新 core 导入。

备选方案是直接在旧目录重构，但旧目录已经绑定旧 runtime、旧 tool wrapper 和旧 response projection。继续使用会让“无旧兼容层”的边界不可验证。

新 runtime 对外导出应使用新命名，例如 `runAgentToolOrchestrator`，不得复用旧 `runAgentOrchestrator` 名称，避免新旧运行时在测试、trace 和架构扫描中混淆。

### 2. Tool 是完整 bundle，不只是 handler

每个 tool 必须通过 `defineTool()` 声明完整合同：

- `name`、`description`、`whenToUse`、`whenNotToUse`
- `inputSchema`、`outputSchema`
- `sideEffect`、`riskLevel`、`permissions`、`requiresConfirmation`
- `resourceContract`
- `handler`
- `responseAdapter`
- `traceProjection`
- `examples`

后续新增业务能力时，只新增并注册 tool bundle。Orchestrator 不需要新增 `if (toolName === "...")`。如果一个新能力必须修改 runtime 主循环才能工作，说明 tool bundle 合同或通用 core 合同不完整，本阶段必须补 core 合同，而不是为该 tool 写特殊分支。

### 3. 第一阶段只使用无业务 fixture tools 验证闭环

第一阶段 fixture tools 只用于测试通用机制，不能表达任何真实业务，也不能进入生产 `/api/chat` 默认 registry。它们只能通过测试、replay 或显式 test harness 注入。建议覆盖：

```txt
read fixture
resource producer fixture
resource consumer fixture
confirmation write fixture
diagnostic failure fixture
```

这些 fixture 必须证明：

- registry 能注册并序列化 manifest。
- Planner 能看到 tool manifest。
- runtime 能执行 tool call。
- input/output schema 会被校验。
- resourceContract 会被校验。
- consumable resource 能被后续 tool 消费。
- diagnostic resource 不能被当作成功资源消费。
- Policy Guard 能阻止未确认写操作。
- confirmation action hash 可生成和校验。
- Response Adapter 能输出 NDJSON events。
- replay fixture 能复现完整链路。

### 4. Registry 只负责注册、筛选和 manifest 序列化

`ToolRegistry` 应提供：

- `register(tool)`
- `get(toolName)`
- `listAvailable(context)`
- `serializeForPlanner(tools)`
- 注册重复、权限不可用、manifest 非法的结构化错误

Planner 只能看到安全 manifest，不得看到 handler、数据库对象、用户敏感 payload 或无法序列化的函数。

manifest 摘要必须保留执行所需的嵌套结构、required fields、enum、array item 和 union 分支。第一阶段不以 token 成本优化为主目标，但仍必须提供基础长度上限、字段数量上限和脱敏规则，避免完整 payload 或无限 trace 进入模型上下文。

### 5. Planner Provider 输出 `AgentAction`

Planner Provider 是新 core 内的唯一模型调用入口，负责把 `AgentRunInput`、`ContextPackage`、manifest 和 observations 转成模型输入，并用 structured output 解析为 `AgentAction`。它必须同时提供 replay planner，使测试可以在不调用真实模型的情况下输入固定 action 序列。

Planner Provider 必须记录模型调用 trace 摘要、structured output 解析结果、repair feedback 和 usage 信息。它不得导入旧 AI provider、旧 Prompt module 或旧 response writer。

Planner structured output 使用统一 action union：

```txt
tool_call
final_answer
ask_user
request_confirmation
```

`tool_call` 必须包含 `toolName`、`input`、`reason` 和可选 `consumes`。`final_answer` 必须引用当前 run 中可证明的 tool results，或明确说明本轮不需要 tool。服务端只校验结构和资源边界，不基于用户原文改写 action 语义。

当 production registry 为空，或 Planner 判断当前问题不需要 tool 时，`final_answer` / `ask_user` 是合法终止结果。此时 Response Adapter 只能输出普通 `content`、`assistant_suggestions`、`error` 和 `done` 事件，不得编造任何 tool-backed 事件。

### 6. Runtime 是通用循环，不知道具体工具名

Runtime 的循环固定为：

```txt
build AgentRunInput / ContextPackage
retrieve available tools
serialize manifest
call Planner
validate AgentAction
policy check
execute tool
validate output/resourceContract
append observation
repeat until terminal action
adapt response
```

Runtime 必须支持 `maxSteps`、overall timeout、per-tool timeout、重复失败熔断和结构化错误终止。重复失败熔断基于 toolName + normalized input + failure code，不做自然语言判断。

`AgentRunInput` / `ContextPackage` 必须定义模型可见消息、服务端 hydration 摘要、用户身份边界、conversationId、可选历史摘要、tool manifest 和 observation 摘要。用户原始消息可以进入 Planner，但数据库对象、完整 tool output、未脱敏 trace 和未经授权的历史 payload 不得进入模型输入。

### 7. Resource contract 是跨 tool 的唯一可消费证明

Tool result 必须声明 `role`：

```txt
consumable
diagnostic
```

下游 tool 或 final answer 只能消费当前 run 中 `consumable` 且满足 `resourceContract` 的资源。`diagnostic` 只能作为解释、澄清或失败证据。服务端不得从 tool raw output 或用户文本中猜测资源是否可用。

### 8. Policy Guard 独立于 Planner 和 Tool handler

Policy Guard 负责权限、风险、确认状态和 action hash。需要确认的操作必须返回 `request_confirmation` 或等价 NDJSON 事件，确认 hash 必须由服务端根据稳定 action payload、userId、conversationId、toolName、resource refs 和过期时间生成。

LLM 不能直接绕过确认写入，也不能输出可被信任的 `actionHash`。Planner 最多输出待确认的 action draft；真实 hash 只能由 Policy Guard / runtime 生成和校验。tool handler 也不能自己决定确认已经满足。

### 9. Response Adapter 是注册式投影，不是旧 Response Writer

Response Adapter 接收 `AgentRunResult`、terminal action 和当前 run 的 tool results。用户可见 `content`、`tool_result`、`assistant_suggestions`、`confirmation_request`、`error` 和 `done` 事件只能来自真实执行结果。

具体用户可见投影由 tool bundle 的 `responseAdapter` 或注册式 adapter 提供。新增 tool 需要随 tool bundle 提供自己的 adapter，但不得修改通用 response adapter 主流程。fixture tools 必须通过注册式 adapter 证明该机制可运行。

通用 Response Adapter 必须在收集 tool adapter 输出后统一校验 `AgentStreamEvent` schema、resource provenance、当前 run 归属和 `consumable` / `diagnostic` 角色。tool adapter 不得直接绕过 resource contract 输出成功卡片、保存结果或功能执行事件。

### 10. `/api/chat` 只接入新 core

`/api/chat` 保留认证、请求校验、服务端 hydration、NDJSON stream 和 trace id 输出；聊天服务调用新 runtime。实现阶段不得把旧 Agent core 作为 fallback，也不得在新 core 失败时切回旧 intent-first 或旧 readonly loop。

第一阶段完成时，生产 `/api/chat` 必须在没有业务 tool 的情况下仍能正常聊天，并以普通 `content` / `done` 或 `ask_user` 收口。无业务 fixture tool 的端到端链路只能通过测试、replay 或显式 test harness 验证，证明后续注册真实业务 tool 后不需要改 `/api/chat`。

### 11. Trace / replay fixture 是第一阶段验收的一部分

每次 run 必须记录可审计 trace，包括 context 摘要、manifest 摘要、planner action、policy decision、tool input/output 摘要、resource refs、response events、usage 和错误。Replay fixture 必须能在不调用真实模型的情况下重放 planner actions，验证 runtime、resource contract、policy 和 response adapter。

## Risks / Trade-offs

- [Risk] 第一阶段不做业务 tool，容易被误解为没有完整闭环。→ Mitigation：用无业务 fixture tools 逐项证明 15 项通用能力完整运行，并把“无业务实现”写成明确边界。
- [Risk] 没有业务 tool 时的普通聊天容易被误解为功能已恢复。→ Mitigation：生产 `/api/chat` 可以正常回答和追问，但不得输出任何未注册 tool 支撑的功能事件、训练卡片、artifact 或保存结果。
- [Risk] 新 tool 的 response adapter 仍可能变成隐性业务分支。→ Mitigation：adapter 随 tool 注册，通用 adapter 只按注册结果调度，不按 tool name 写分支。
- [Risk] LLM structured action 不稳定。→ Mitigation：Action Validator、repair feedback、`maxSteps` 和 replay fixture 同步覆盖；服务端只修结构问题，不改写语义。

## Migration Plan

1. 以 `remove-current-agent-core-layer` 已完成为前置事实，不再为旧 core 做兼容扫描或回退适配。
2. 新建 `agent-core` contracts、registry、manifest、planner provider、runtime、policy、response adapter 和 trace/replay 模块。
3. 将 `/api/chat` 接入新 runtime 和新 Response Adapter，确认生产 registry 没有业务 tool 时仍能输出普通聊天 NDJSON。
4. 用无业务 fixture tools 在测试、replay 或显式 test harness 中验证注册、manifest、tool call、资源生产/消费、确认、失败收口和 response projection。
5. 增加架构验收，确认新增 tool 扩展不需要修改 orchestrator 主流程，且生产 registry 不包含 fixture tools。

## Open Questions

- 无。第一阶段必须完整交付通用编排闭环；业务 tool 的具体目录、领域合同和业务服务接入留到后续新增 tool 时定义。
