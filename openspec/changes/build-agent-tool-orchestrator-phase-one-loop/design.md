## Context

`remove-current-agent-core-layer` 已经把当前旧 Agent core 定义为 delete-only。新 core 不能继续沿用旧 `AgentOrchestrator` 的实现细节，也不能为了兼容旧 tool name、旧 final result、旧 response writer 或旧 trace event 增加适配层。

本 change 的目标是按 `docs/agent-tool-orchestrator-design.md` 重建第一阶段完整闭环。第一阶段必须能真实接入 `/api/chat`，完成 LLM planner、多轮 tool call、tool contract 校验、policy/confirmation、response adapter 和 NDJSON 输出，并至少跑通动作推荐、读取 artifact、保存 artifact 三类基础工具。

## Goals / Non-Goals

**Goals:**

- 建立全新的 `agent-core`，只负责通用循环、合同校验和运行状态，不包含具体业务 tool 分支。
- 建立 `defineTool` 和 `ToolRegistry`，让工具以单一职责 bundle 注册。
- 让 tool bundle 同时声明 manifest、input/output schema、resource contract、policy metadata、handler、trace projection 和 response adapter。
- 让 Planner 只看到序列化后的安全 tool manifest，并输出结构化 `AgentAction`。
- 让 runtime 支持多轮 tool call、observation、`maxSteps`、timeout、防重复失败和结构化终止。
- 让 Response Adapter 只根据真实 tool results 和 final action 生成 `/api/chat` NDJSON 事件。
- 增加架构级测试，证明新增 tool 不需要改 orchestrator、executor、policy guard 或 `/api/chat` 主链。

**Non-Goals:**

- 不实现多 Agent 协作、自动反思、任务队列或后台长任务。
- 不新增独立向量库、任意 SQL tool 或任意函数调用。
- 不保留旧 Agent core 兼容层。
- 不让服务端关键词、正则、同义词表或规则评分重新解释用户自然语言。
- 不把所有未来业务 tool 一次性实现完；第一阶段只要求三类基础工具和扩展机制可验证。

## Decisions

### 1. 新 core 从 `lib/server/agent-core/**` 开始，不复用旧 core 文件

新实现应优先创建清晰的新目录，例如：

```txt
lib/server/agent-core/
  contracts.ts
  define-tool.ts
  tool-registry.ts
  manifest.ts
  planner.ts
  action-validator.ts
  resource-contract.ts
  policy-guard.ts
  runtime.ts
  response-adapter.ts
  trace-replay.ts

lib/server/agent-tools/
  exercises/search-exercise-candidates.tool.ts
  artifacts/get-conversation-artifact-payload.tool.ts
  artifacts/save-conversation-artifact.tool.ts
  index.ts
```

旧 `lib/server/agent-orchestrator/**` 如果仍残留，只能作为删除对象或历史参考，不得被新 core 导入。

备选方案是直接在旧目录重构，但旧目录已经绑定旧 runtime、旧 tool wrapper 和旧 response projection。继续使用会让“无旧兼容层”的边界不可验证。

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

这样后续新增业务能力时，只新增并注册 tool bundle。Orchestrator 不需要新增 `if (toolName === "...")`。

### 3. Registry 只负责注册、筛选和 manifest 序列化

`ToolRegistry` 应提供：

- `register(tool)`
- `get(toolName)`
- `listAvailable(context)`
- `serializeForPlanner(tools)`
- 注册重复、权限不可用、manifest 非法的结构化错误

Planner 只能看到安全 manifest，不得看到 handler、数据库对象、用户敏感 payload 或无法序列化的函数。

### 4. Planner 输出 `AgentAction`

Planner structured output 使用统一 action union：

```txt
tool_call
final_answer
ask_user
request_confirmation
```

`tool_call` 必须包含 `toolName`、`input`、`reason` 和可选 `consumes`。`final_answer` 必须引用当前 run 中可证明的 tool results 或明确说明不需要 tool。服务端只校验结构和资源边界，不基于用户原文改写 action 语义。

### 5. Runtime 是通用循环，不知道具体工具名

Runtime 的循环固定为：

```txt
build ContextPackage
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

### 6. Resource contract 是跨 tool 的唯一可消费证明

Tool result 必须声明 `role`：

```txt
consumable
diagnostic
```

下游 tool 或 final answer 只能消费当前 run 中 `consumable` 且满足 `resourceContract` 的资源。`diagnostic` 只能作为解释、澄清或失败证据。服务端不得从 tool raw output 或用户文本中猜测资源是否可用。

### 7. Policy Guard 独立于 Planner 和 Tool handler

Policy Guard 负责权限、风险、确认状态和 action hash。需要确认的操作必须返回 `request_confirmation` 或等价 NDJSON 事件，确认 hash 必须由服务端根据稳定 action payload、userId、conversationId、toolName、resource refs 和过期时间生成。

LLM 不能直接绕过确认写入；tool handler 也不能自己决定确认已经满足。

### 8. Response Adapter 是注册式投影，不是旧 Response Writer

Response Adapter 接收 `AgentRunResult`、terminal action 和当前 run 的 tool results。用户可见 `content`、artifact、assistant suggestions、confirmation 和 `done` 事件只能来自真实执行结果。

具体业务卡片投影由 tool bundle 的 `responseAdapter` 或注册式 adapter 提供。新增 tool 需要新增自己的 adapter，但不得修改通用 response adapter 主流程。

### 9. `/api/chat` 只接入新 core

`/api/chat` 保留认证、请求校验、服务端 hydration、NDJSON stream 和 trace id 输出；聊天服务调用新 runtime。实现阶段不得把旧 Agent core 作为 fallback，也不得在新 core 失败时切回旧 intent-first 或旧 readonly loop。

### 10. Trace / replay fixture 是第一阶段验收的一部分

每次 run 必须记录可审计 trace，包括 context 摘要、manifest 摘要、planner action、policy decision、tool input/output 摘要、resource refs、response events 和错误。Replay fixture 必须能在不调用真实模型的情况下重放 planner actions，验证 runtime、resource contract、policy 和 response adapter。

## Risks / Trade-offs

- [Risk] 第一阶段范围较大。→ Mitigation：只实现三类基础工具，但 core 合同必须完整，避免留下占位循环。
- [Risk] 新 tool 的 response adapter 仍可能变成隐性业务分支。→ Mitigation：adapter 随 tool 注册，通用 adapter 只按注册结果调度，不按 tool name 写分支。
- [Risk] 旧 open changes 与新 core 规格冲突。→ Mitigation：实现以本 change、`remove-current-agent-core-layer` 和 `docs/agent-tool-orchestrator-design.md` 为准，旧实现只作为反例或经验。
- [Risk] LLM structured action 不稳定。→ Mitigation：Action Validator、repair feedback、`maxSteps` 和 replay fixture 同步覆盖；服务端只修结构问题，不改写语义。
- [Risk] `/api/chat` 在新 core 接入初期出现功能空窗。→ Mitigation：按任务顺序先建立 core 与三类工具闭环，再切入 `/api/chat`；切入后不回退旧 core。

## Migration Plan

1. 先完成 `remove-current-agent-core-layer` 或至少确保生产路径不再依赖旧 core。
2. 新建 `agent-core` contracts、registry、manifest、planner、runtime、policy、response adapter 和 trace/replay 模块。
3. 新建三类基础 tools，并通过 registry 注册。
4. 用 replay fixture 跑通动作推荐、读取 artifact、保存 artifact 三类路径。
5. 将 `/api/chat` 接入新 runtime 和新 Response Adapter。
6. 增加架构扫描，确认新增 tool 扩展不需要修改 orchestrator 主流程，且旧 core 不在生产路径。

## Open Questions

- 第一阶段使用的 planner 模型沿用当前模型配置还是单独增加配置项，实施时可按现有 AI 配置模式决定。
- confirmation 的用户确认入口是否沿用当前前端交互事件，还是先只输出 NDJSON 确认事件，实施时按现有聊天 UI 能力决定。
