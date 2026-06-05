# Agent Tool 编排器通用设计方案（修订版）

> 目标：实现一个与具体 LLM、业务场景、具体 tool 解耦的通用 `Agent Tool Orchestrator`。后续新增业务能力时，只新增并注册 tool，不改 orchestrator 主循环、不改 planner 接口、不改 executor 主流程、不改 policy 主流程、不改 `/api/chat` 主链路。

---

## 0. 设计评审结论

原方案的大方向是合理的：以 `Tool Bundle + ToolRegistry + Action Validator + Policy Guard + Executor + Resource Contract + Trace/Replay` 为核心，可以支撑长期扩展，也能避免把业务意图分流、toolName 特判、模型厂商能力写死在编排器里。

但原方案有几个需要调整的点：

1. **第一阶段略重**：`responseAdapter`、`traceProjection`、`resourceContract`、confirmation、replay 全部强制纳入第一阶段，会让落地成本偏高。建议保留这些扩展点，但把部分能力做成默认实现或渐进增强。
2. **Planner 和 LLM 的边界需要再切开**：Orchestrator 不应依赖某个模型的 function calling、JSON mode 或 SDK。应该定义 `PlannerPort`，具体模型只作为 `PlannerPort` 的实现。
3. **confirmation 不应该由 LLM 生成**：`request_confirmation` 不应作为 Planner 输出的 `AgentAction`。Planner 只能提出 `tool_call`，是否需要确认、确认 hash、过期时间都必须由服务端 `Policy Guard` 生成。
4. **Tool output 不能直接回灌给模型或用户**：需要显式区分 `internal output`、`model observation`、`user event`、`trace projection`，否则容易泄漏敏感数据，也容易被 tool output prompt injection 带偏。
5. **Resource Contract 需要 ResourceStore 支撑**：不能只靠 handler 返回 `producedResources`。资源必须在当前 run 的 `ResourceStore` 中登记，带 role、source、scope、version，后续 tool 只能消费已登记且 role 为 `consumable` 的资源。
6. **Response Adapter 应该默认化**：不应要求每个 tool 都写用户可见事件适配器。默认 renderer 先覆盖 80% 场景，特殊 tool 再通过可选 `toUserEvents` 扩展。
7. **缺少幂等、取消、预算、错误分类、manifest 版本快照**：这些不是花活，是通用编排器上线后能否稳定的底座。

最终建议：**保留 contract-first 架构，但把“所有能力强制实现”改成“核心闭环必备 + 默认实现 + 可选扩展”。**

---

## 1. 目标与非目标

### 1.1 目标

```txt
新增业务能力 = 新增 tool bundle + 注册到 ToolRegistry + 补 contract tests
```

而不是：

```txt
新增业务能力 = 修改 orchestrator / planner / executor / policy / api/chat 的业务分支
```

核心目标：

1. **模型无关**：core 不依赖具体 LLM SDK、function calling 格式、JSON mode 能力。
2. **业务无关**：core 不知道订单、商品、CRM、工单、权限业务语义。
3. **tool 可插拔**：新增 tool 只通过合同注册，不修改核心运行链路。
4. **服务端可控**：LLM 只负责提出 action，服务端负责校验、授权、执行、确认、收口。
5. **可追踪可回放**：每个 run 能记录 manifest、action、policy、tool result、resource、terminal result 和 stream events。
6. **默认安全**：未知权限、未知风险、非法 action、未登记资源、未确认写操作，一律不能执行。

### 1.2 非目标

第一阶段不做这些：

1. 不提前实现任何真实业务 tool。
2. 不做多 agent 协作框架。
3. 不做复杂 DAG / workflow DSL。
4. 不做并行 tool call。
5. 不做跨 run 资源直接消费。
6. 不在 `/api/chat` 里按关键词识别业务意图。
7. 不把某个模型厂商的 tool calling 协议作为 core contract。

---

## 2. 总体原则

```txt
LLM / Planner 是提议者，不是执行者。
Orchestrator 是确定性裁判，不重新理解业务语义。
Tool 是可审计能力单元，不是隐藏业务路由器。
Policy Guard 是唯一确认与授权边界。
ResourceStore 是 tool 间事实传递的唯一依据。
Response Renderer 只能投影真实结果，不能编造结果。
Trace / Replay 记录的是可复现链路，不记录未脱敏秘密。
```

关键约束：

1. core 里禁止出现具体业务 toolName 分支。
2. core 不读取用户自然语言关键词来选择业务能力。
3. LLM 不能生成 confirmation hash。
4. LLM 不能生成任意 NDJSON event。
5. tool handler 不能跳过 Policy Guard。
6. tool output 默认不可信，必须经过 projection / redaction 后才能进入模型上下文、用户事件或 trace。

---

## 3. 职责边界

```txt
/api/chat
  负责认证、请求校验、上下文恢复、调用 runtime、输出 NDJSON。

PlannerPort
  负责根据 state + manifest 产出结构化 AgentAction。
  可以由任意 LLM、规则 planner、replay planner 实现。

Orchestrator Runtime
  负责循环、step limit、timeout、action validation、policy 调用、executor 调用、terminal 收口。

Action Validator
  负责校验 action 结构、tool 可用性、input schema、resource refs、terminal grounding。

Policy Guard
  负责 permission、risk、sideEffect、confirmation、动态策略判断。

Executor
  负责调用 tool handler、timeout、abort、错误归一化、output schema 校验。

ResourceStore
  负责登记、查询、消费当前 run 内的资源。

Response Renderer
  负责把 terminal action + tool results + confirmation 转成 NDJSON events。

Trace / Replay
  负责记录脱敏后的可复现运行链路。
```

---

## 4. 推荐目录结构

```txt
lib/server/agent-core/
  contracts.ts
  define-tool.ts
  tool-registry.ts
  manifest.ts
  planner-port.ts
  action-validator.ts
  executor.ts
  resource-store.ts
  resource-contract.ts
  policy-guard.ts
  confirmation-store.ts
  runtime.ts
  observation.ts
  response-renderer.ts
  trace-replay.ts
  errors.ts
  redaction.ts
  idempotency.ts

lib/server/agent-planners/
  llm-planner.ts
  replay-planner.ts
  model-adapters/
    openai-adapter.ts
    anthropic-adapter.ts
    local-json-adapter.ts

lib/server/agent-tools/
  index.ts

lib/server/agent-tools/fixture/
  read-fixture.tool.ts
  resource-producer-fixture.tool.ts
  resource-consumer-fixture.tool.ts
  confirmation-write-fixture.tool.ts
  diagnostic-failure-fixture.tool.ts

app/api/chat/route.ts
app/api/agent/confirm/route.ts

tests/agent-core/
  define-tool.test.ts
  tool-registry.test.ts
  manifest.test.ts
  action-validator.test.ts
  runtime.test.ts
  resource-store.test.ts
  policy-guard.test.ts
  response-renderer.test.ts
  trace-replay.test.ts

```

说明：

- `agent-core` 不依赖具体业务 tool。
- `agent-planners` 可以依赖模型 SDK，但只实现 `PlannerPort`，不反向污染 core。
- `agent-tools/index.ts` 只负责注册当前可用 tools。
- 真实业务 tool 后续放到 `agent-tools/<domain>/`，但不要在第一阶段提前创建业务目录。
- fixture tools 只用于验证通用机制，不代表业务能力。

---

## 5. 核心类型

### 5.1 基础上下文

```ts
export type AgentActor = {
  userId: string;
  tenantId?: string;
  roles: string[];
  permissions: string[];
};

export type AgentRunInput = {
  runId: string;
  conversationId: string;
  actor: AgentActor;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  locale?: string;
  timezone?: string;
  maxSteps: number;
  overallTimeoutMs: number;
  perToolTimeoutMs: number;
  budget?: {
    maxPlannerCalls?: number;
    maxToolCalls?: number;
  };
};
```

### 5.2 可见性边界

```ts
export type Visibility = "internal" | "model" | "user" | "trace";

export type SafeProjection = {
  model?: unknown;
  user?: unknown;
  trace?: unknown;
};
```

规则：

```txt
internal output 只在服务端内部使用。
model projection 可以进入下一轮 Planner。
user projection 可以进入 NDJSON event。
trace projection 可以进入 trace，但必须脱敏。
```

不得把完整 tool output 默认塞给模型或用户。

### 5.3 Resource

```ts
export type ResourceRole = "consumable" | "diagnostic";

export type AgentResourceRef = {
  type: string;
  id: string;
};

export type RegisteredResource = AgentResourceRef & {
  role: ResourceRole;
  runId: string;
  sourceToolResultId: string;
  schemaVersion?: string;
  expiresAt?: string;
  summary?: unknown;
};

export type ToolResourceContract = {
  requires?: Array<{
    type: string;
    required: boolean;
    min?: number;
    max?: number;
    description: string;
  }>;
  produces?: Array<{
    type: string;
    role: ResourceRole;
    description: string;
  }>;
};
```

### 5.4 ToolResult

```ts
export type ToolFulfillment = {
  satisfied: boolean;
  producedResources: AgentResourceRef[];
  consumedResources: AgentResourceRef[];
  unmetRequirements: string[];
};

export type ToolError = {
  code:
    | "BAD_INPUT"
    | "UNAUTHORIZED"
    | "CONFIRMATION_REQUIRED"
    | "TIMEOUT"
    | "DEPENDENCY_FAILED"
    | "RESOURCE_UNMET"
    | "TOOL_FAILED"
    | "UNKNOWN";
  message: string;
  retryable: boolean;
};

export type ToolResult<Output> =
  | {
      ok: true;
      toolName: string;
      toolVersion: string;
      toolResultId: string;
      output: Output;
      fulfillment: ToolFulfillment;
      projection?: SafeProjection;
    }
  | {
      ok: false;
      toolName: string;
      toolVersion: string;
      toolResultId: string;
      error: ToolError;
      fulfillment: ToolFulfillment;
      projection?: SafeProjection;
    };
```

注意：`projection` 只允许放脱敏摘要；完整 `output` 不自动进入 Planner、用户响应或 trace。

---

## 6. Tool Bundle

Tool 是完整合同，但不要求每个 tool 都手写所有 adapter。核心字段必填，投影字段可选，core 提供默认实现。

```ts
export type ToolPolicy = {
  sideEffect: "read" | "write";
  riskLevel: "low" | "medium" | "high";
  permissions: string[];
  confirmation: "never" | "always" | "dynamic";
};

export type ToolContext = {
  runId: string;
  conversationId: string;
  actor: AgentActor;
  locale?: string;
  timezone?: string;
  deadlineAt: number;
  abortSignal: AbortSignal;
  idempotencyKey: string;
  resourceStore: ResourceStore;

  // 业务依赖通过 capabilities 注入，但 core 不理解其业务含义。
  capabilities: Record<string, unknown>;
};

export type Tool<I, O> = {
  name: string;
  version: string;
  description: string;
  whenToUse: string;
  whenNotToUse: string;

  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;

  policy: ToolPolicy;
  resourceContract?: ToolResourceContract;

  handler(input: I, ctx: ToolContext): Promise<ToolResult<O>>;

  // 可选：不写则使用默认安全投影。
  toModelObservation?: (result: ToolResult<O>) => unknown;
  toUserEvents?: (result: ToolResult<O>, ctx: ResponseAdapterContext) => AgentStreamEvent[];
  traceProjection?: (result: ToolResult<O>) => unknown;

  examples?: Array<{
    userRequest: string;
    input: I;
  }>;
};
```

### Tool 设计规则

1. 一个 tool 只表达一个确定性能力，不要做隐藏业务路由。
2. read tool 默认不需要 confirmation。
3. write tool 或 high risk tool 默认需要 confirmation，除非 Policy Guard 明确放行。
4. handler 不接收完整 HTTP request，不直接写 response。
5. handler 不生成 NDJSON 主流程事件，只返回结果和安全投影。
6. handler 抛出的异常必须被 Executor 归一化为 `ToolResult<ok:false>`。
7. tool 的 examples 必须是模型可见安全样例，不能包含用户隐私、token、数据库结构。

---

## 7. defineTool

```ts
export function defineTool<I, O>(tool: Tool<I, O>): Tool<I, O> {
  validateToolContractAtBoot(tool);
  return tool;
}
```

启动期校验至少包括：

```txt
name 格式合法
version 存在
inputSchema/outputSchema 可转换为 manifest schema
policy 存在
write/high risk tool 的 confirmation 策略合理
resourceContract 中 requires/produces 不冲突
examples 不超过数量和 token 限制
```

---

## 8. ToolRegistry

```ts
export type ToolAvailabilityContext = {
  actor: AgentActor;
  tenantId?: string;
  locale?: string;
  enabledToolNames?: string[];
  disabledToolNames?: string[];
  resourceInventory?: RegisteredResource[];
};

export class ToolRegistry {
  register(tool: Tool<unknown, unknown>): void;
  get(name: string): Tool<unknown, unknown> | null;
  listAvailable(context: ToolAvailabilityContext): Tool<unknown, unknown>[];
  serializeForPlanner(tools: Tool<unknown, unknown>[]): ToolManifest[];
  snapshot(tools: Tool<unknown, unknown>[]): ToolRegistrySnapshot;
}
```

Registry 必须保证：

1. tool name 唯一。
2. tool version 可追踪。
3. 未注册 tool 不能执行。
4. disabled 或无权限 tool 不进入 manifest。
5. manifest 只能包含模型可见安全字段。
6. handler、数据库对象、完整 payload、secret、用户敏感数据不得进入 manifest。
7. 每次 run 记录 `ToolRegistrySnapshot`，用于 replay。

---

## 9. Tool Manifest

Planner 看到的是 manifest，不是实现。

```ts
export type ToolManifest = {
  name: string;
  version: string;
  description: string;
  whenToUse: string;
  whenNotToUse: string;
  inputJsonSchema: unknown;
  outputSummarySchema?: unknown;
  resourceContract?: ToolResourceContract;
  policy: {
    sideEffect: "read" | "write";
    riskLevel: "low" | "medium" | "high";
    requiresConfirmationHint: boolean;
  };
  examples?: unknown[];
};
```

Manifest 要求：

```txt
必须能表达 object / array / record / union / enum / required / nested fields。
不能为了省 token 丢失执行关键结构。
不能暴露 handler、内部服务、数据库字段、secret、完整用户数据。
需要有 manifestHash，写入 trace。
```

建议使用 JSON Schema 作为中间格式，再由具体模型 adapter 转成模型厂商需要的格式。

---

## 10. PlannerPort：模型无关边界

core 只依赖 `PlannerPort`：

```ts
export type PlannerInput = {
  state: AgentRuntimeStateForPlanner;
  manifest: ToolManifest[];
};

export interface PlannerPort {
  decideNext(input: PlannerInput): Promise<AgentAction>;
}
```

具体实现：

```txt
LlmPlanner
  使用某个模型，但只输出 AgentAction。

ReplayPlanner
  使用固定 action 序列，用于测试和回放。

RulePlanner
  可选，用于完全不依赖 LLM 的测试场景。
```

模型 adapter 只负责：

```txt
把 ToolManifest 转成模型输入格式
调用具体 LLM SDK
把模型输出解析为 AgentAction candidate
```

模型 adapter 不负责：

```txt
执行 tool
绕过 Action Validator
绕过 Policy Guard
生成 confirmation hash
直接生成 NDJSON events
```

Planner / ModelAdapter 观测要求：

```txt
PlannerPort 返回合同保持 AgentAction，不把 diagnostics 写进 core 主接口。
LlmPlanner 可以在实例上保留可选模型调用诊断，供 production 接入层读取。
ModelAdapter 负责生成供应商无关的安全 envelope：request config、messages 摘要、raw response 摘要、parsed action、parse status、failure code 和 token usage。
诊断字段必须脱敏和截断，不记录 API key、authorization、cookie、完整敏感 payload 或完整 tool output。
ReplayPlanner、RulePlanner 和测试用 Fake planner 不强制实现供应商诊断；缺失 diagnostics 只能显示为“未记录模型调用”，不能推断业务失败。
```

---

## 11. AgentAction

Planner 只能输出三类 action：

```ts
type AgentTerminalRef =
  | { type: "tool_result"; id: string }
  | { type: "resource"; id: string; resourceType?: string };

export type AgentAction =
  | {
      type: "tool_call";
      toolName: string;
      input: unknown;
      reason: string;
      consumes?: AgentResourceRef[];
    }
  | {
      type: "final_answer";
      content: string;
      suggestedQuestions?: string[];
      usedRefs?: AgentTerminalRef[];
      visibleOutputs?: VisibleOutputEnvelope[];
    }
  | {
      type: "ask_user";
      content: string;
      suggestedQuestions?: string[];
      usedRefs?: AgentTerminalRef[];
    };
```

明确移除：

```ts
// 不允许 Planner 输出这个。
{ type: "request_confirmation" }
```

confirmation 是 `Policy Guard` 的服务端决策，不是 LLM action。

---

## 12. Action Validator

Action Validator 负责确定性校验。

### 12.1 tool_call 校验

```txt
action 结构合法
toolName 已注册
tool 当前 context 可用
input 符合 tool.inputSchema
consumes 中的 resource 已存在于当前 run
consumes 中的 resource role 必须是 consumable
consumes 满足 tool.resourceContract.requires
Planner 不能消费 diagnostic resource
```

### 12.2 final_answer / ask_user 校验

```txt
final_answer.content / ask_user.content 必须承载用户可见文本
usedRefs[type="tool_result"].id 必须存在于当前 run
usedRefs[type="resource"] 必须存在于当前 run
final_answer 引用的 tool result 必须 ok=true 且 fulfillment.satisfied=true
final_answer 引用的 resource 必须是 consumable
ask_user 可以引用用于解释、阻断或澄清的 failed / diagnostic / unsatisfied 事实
不能引用当前 run 之外的 resource
不能携带任意 producedEvents
不能携带 ask_user.question、message、usedToolResultIds、usedResourceRefs 等旧同义字段
```

### 12.3 非法 action 处理

建议第一阶段实现：

```txt
invalid action -> 生成 invalid_action observation -> 允许 Planner 修复 1 次
连续非法 action 超限 -> terminal error
```

不要通过用户自然语言关键词做 fallback。

---

## 13. ResourceStore 与 Resource Contract

ResourceStore 是 tool 之间传递事实的唯一依据。

```ts
export interface ResourceStore {
  register(resource: RegisteredResource): void;
  get(ref: AgentResourceRef): RegisteredResource | null;
  list(): RegisteredResource[];
  assertConsumable(ref: AgentResourceRef): RegisteredResource;
}
```

规则：

1. 资源只在当前 run 内有效。
2. 跨 run 资源必须通过显式 import/read tool 重新引入，不能直接消费旧 run 的 resource id。
3. tool handler 可以声明 produced resource，但最终登记必须经过 core 校验。
4. produced resource 的 `type` 和 `role` 必须符合 tool.resourceContract.produces。
5. downstream tool 只能消费 `consumable` resource。
6. `diagnostic` 只能用于解释、失败原因、调试证据，不能伪装成成功业务结果。
7. resource id 必须由 core 或受控 ResourceStore 生成，不建议由 LLM 或 handler 任意拼接。

### 13.1 跨 run 业务事实桥

ResourceStore 只解决当前 run 内的事实传递。用户在上一轮已经看到、确认或生成过的结构化业务结果，不能直接作为旧 run resource 继续消费；它必须先被保存到业务层的持久化事实源，再在下一轮通过受控读取能力重新引入当前 run。

这个桥接层是 `/api/chat` 或等价业务入口的上下文恢复职责，不是 Orchestrator core 的职责：

```txt
上一轮用户可见结构化结果
  -> 业务层持久化事实源
  -> 轻量索引 / recent summary
  -> 下一轮上下文恢复
  -> read/import tool 读取完整事实
  -> ResourceStore 登记为当前 run 可消费资源
```

通用约束：

1. core 不定义具体业务事实类型，不知道任何具体领域对象或业务语义。
2. 业务层持久化事实源必须记录 owner、session/scope、kind、status、version 和 schemaVersion 等确定性边界。
3. 上下文恢复只能把轻量摘要、索引字段或可引用 id 暴露给 Planner；完整 payload 必须通过 read/import tool 按权限和 schema 读取。
4. read/import tool 必须验证当前 actor 是否可访问该事实，并把读取结果作为当前 run 的新 tool result 或 consumable resource 登记。
5. 下游 tool 只能消费当前 run 内重新登记后的 resource，不能消费历史 toolResultId、历史 resourceId 或模型从摘要中重建的 payload。
6. 如果引用不唯一、事实不存在、版本过期或权限不满足，read/import tool 必须返回结构化失败或要求澄清，不能静默选择一个候选。
7. 响应渲染可以重投影已读取且通过 schema 校验的事实，但不能从自然语言摘要、标题或模型回复正文反向重建结构化业务结果。

这个设计让多轮引用走稳定的数据桥，而不是让 Orchestrator 持有跨轮状态。新增业务类型时，应扩展业务事实 schema、索引和 read/import tool；除非出现通用安全、资源、trace 或 stream 协议缺口，否则不应修改 Orchestrator 主循环。

当前 production 文本聊天中的可见训练方案事实桥落地为：

```txt
final_answer.visibleOutputs[]
  -> Response Renderer 输出 visible_output 用户事件
  -> ConversationBusinessFact(kind=visible_training_proposal_displayed)
  -> /api/chat 恢复 recentVisibleTrainingProposals 轻量摘要
  -> inspectVisibleTrainingProposals(operation=list_recent) 查询当前会话可引用事实索引
  -> inspectVisibleTrainingProposals(operation=read_recent) 读取并校验当前 userId/conversationId/status/schemaVersion
  -> 当前 run 产出 visible_training_proposal_fact consumable resource
  -> searchExerciseResources.excludeExerciseIds 排除用户已看到的 exerciseId
```

可见训练方案边界：

1. 训练方案事实只能来自已通过服务端校验的 `final_answer.visibleOutputs[]`，不能来自 `searchExerciseResources` handler output、model observation、trace、自然语言回复正文或模型猜测。
2. `visibleTrainingProposal` 是业务 outputType，不是 core 特例；core 只校验通用 envelope 并通过 registry 分发 validator/renderer。
3. `searchExerciseResources` 只提供分组动作事实候选；它不产出 routine、plan、prescription、schedule 或训练卡片事实。
4. `inspectVisibleTrainingProposals` 是业务 inspect/read/import tool，不是 core 特例；`list_recent` 只返回当前 actor 和当前会话可访问的轻量索引，`read_recent` 才导入完整历史可见训练方案 fact。
5. `searchExerciseResources.excludeExerciseIds` 只排除用户已看到或明确要求排除的 `exerciseId`，不提供分页、limit、offset、candidate set、训练生成或保存副作用。

---

## 14. Policy Guard

Policy Guard 负责权限、风险、side effect、confirmation 和动态策略。

```ts
export type PolicyDecision =
  | { type: "allow" }
  | {
      type: "deny";
      error: ToolError;
    }
  | {
      type: "requires_confirmation";
      pendingActionId: string;
      actionHash: string;
      expiresAt: string;
      message: string;
    };
```

确认规则：

```txt
write tool 默认需要 confirmation
high risk tool 默认需要 confirmation
confirmation: always 必须确认
confirmation: never 仍可被动态策略升级为需要确认
confirmation: dynamic 由 Policy Guard 根据 input/context/resource 决定
```

confirmation hash 由服务端生成：

```txt
HMAC-SHA256(
  canonicalJson({
    runId,
    conversationId,
    actorId,
    tenantId,
    toolName,
    toolVersion,
    inputHash,
    resourceRefs,
    policyVersion,
    expiresAt
  }),
  serverSecret
)
```

必须同时保存 `pendingAction`：

```ts
export type PendingAction = {
  pendingActionId: string;
  runId: string;
  conversationId: string;
  actorId: string;
  action: Extract<AgentAction, { type: "tool_call" }>;
  actionHash: string;
  expiresAt: string;
  status: "pending" | "confirmed" | "expired" | "consumed";
};
```

确认恢复流程：

```txt
/api/agent/confirm 接收 pendingActionId + actionHash
服务端读取 PendingAction
校验 actor / conversation / expiresAt / hash / status
通过后执行 PendingAction 中保存的 tool_call
不重新相信客户端或 LLM 传入的新 input
执行成功后 pendingAction 标记为 consumed
```

---

## 15. Executor

Executor 只做通用执行，不写业务分支。

```ts
export async function executeTool(
  action: Extract<AgentAction, { type: "tool_call" }>,
  state: AgentRuntimeState,
): Promise<ToolResult<unknown>> {
  const tool = registry.get(action.toolName);
  if (!tool) return buildToolError("UNKNOWN");

  const input = tool.inputSchema.parse(action.input);
  const ctx = buildToolContext(action, state);

  return runWithTimeoutAndAbort(
    () => tool.handler(input, ctx),
    state.config.perToolTimeoutMs,
  );
}
```

Executor 必须处理：

```txt
per-tool timeout
AbortSignal
异常归一化
outputSchema 校验
resourceContract 校验
idempotencyKey 注入
retryable error 标记
```

第一阶段建议串行执行 tool call。并行 tool call 后续再扩展，因为并行会引入资源竞争、确认顺序、stream interleave 和 partial failure 问题。

---

## 16. Runtime Loop

```ts
export async function runAgentOrchestrator(input: AgentRunInput): Promise<AgentRunResult> {
  const state = createInitialState(input);

  while (!state.terminal) {
    enforceStepLimit(state);
    enforceOverallTimeout(state);
    enforceBudget(state);

    const availableTools = registry.listAvailable(buildAvailabilityContext(state));
    const manifest = registry.serializeForPlanner(availableTools);
    state.recordManifestSnapshot(registry.snapshot(availableTools));

    const action = await planner.decideNext({
      state: state.toPlannerState(),
      manifest,
    });

    const validation = validateAction(action, state, registry);
    if (!validation.ok) {
      if (state.canRepairInvalidAction()) {
        state.addObservation(buildInvalidActionObservation(validation));
        continue;
      }
      return buildTerminalError(validation.error, state);
    }

    if (action.type === "final_answer" || action.type === "ask_user") {
      return buildTerminalResult(action, state);
    }

    const policyDecision = await policyGuard.evaluate(action, state);

    if (policyDecision.type === "deny") {
      return buildTerminalError(policyDecision.error, state);
    }

    if (policyDecision.type === "requires_confirmation") {
      return buildConfirmationResult(policyDecision, state);
    }

    const result = await executor.execute(action, state);
    const resultValidation = validateToolResult(result, action, state);

    if (!resultValidation.ok) {
      state.addObservation(buildToolContractViolationObservation(resultValidation));
      continue;
    }

    state.addToolResult(result);
    state.addObservation(toObservation(result, action, state));
  }

  return state.result;
}
```

核心要求：

```txt
Runtime 不能出现具体业务 toolName 分支。
Runtime 不直接读取用户自然语言做业务判断。
Runtime 不信任 Planner 的 action，必须全部校验。
Runtime 不信任 tool output，必须 schema/resource/projection 校验。
```

---

## 17. Observation 压缩与注入安全

Tool output 不能直接进入下一轮 Planner。

```ts
export type AgentObservation = {
  observationId: string;
  source: "tool" | "validator" | "policy" | "runtime";
  toolResultId?: string;
  content: unknown;
  visibility: "model";
  warnings?: string[];
};
```

规则：

1. 进入 Planner 的 observation 必须来自 `toModelObservation` 或默认安全摘要。
2. observation 必须标注为“外部数据/工具结果”，不得当作 system 指令。
3. tool 返回的文本如果包含“忽略之前指令”“调用某 tool”等内容，只能作为数据，不得升级为指令。
4. 超长 output 必须压缩、截断或摘要化。
5. 敏感字段必须脱敏后才进入 observation。

---

## 18. Response Renderer 与 NDJSON Events

通用事件类型：

```ts
export type BaseStreamEvent = {
  eventId: string;
  traceId: string;
  runId: string;
  ts: string;
};

export type AgentStreamEvent =
  | (BaseStreamEvent & { type: "content"; content: string })
  | (BaseStreamEvent & {
      type: "tool_result";
      toolName: string;
      toolResultId: string;
      payload: unknown;
    })
  | (BaseStreamEvent & {
      type: "confirmation_request";
      pendingActionId: string;
      actionHash: string;
      message: string;
      expiresAt: string;
    })
  | (BaseStreamEvent & { type: "suggested_questions"; suggestedQuestions: string[] })
  | (BaseStreamEvent & { type: "error"; code: string; message: string; retryable: boolean })
  | (BaseStreamEvent & { type: "done" });
```

Renderer 规则：

1. LLM 不允许直接输出 `AgentStreamEvent`。
2. Runtime 根据 terminal result、tool result、confirmation result 生成事件。
3. tool 的 `toUserEvents` 是可选扩展，必须是纯函数，不能执行副作用。
4. `toUserEvents` 只能返回白名单事件类型。
5. 默认 renderer 必须能处理普通 final answer、ask user、tool result、error、confirmation、done。
6. 用户可见 payload 必须使用 `projection.user` 或默认脱敏摘要，不能直接暴露完整 `output`。

---

## 19. 防循环与预算边界

第一阶段必须实现：

```txt
maxSteps
overall timeout
per-tool timeout
planner call limit
tool call limit
重复失败熔断
非法 action 修复次数限制
```

重复失败熔断使用确定性 key：

```txt
toolName + toolVersion + normalizedInputHash + failureCode
```

重复 tool 调用诊断使用确定性 key：

```txt
toolName + toolVersion + normalizedInputHash
```

当同一 run 中再次请求相同 tool 和归一化 input 时，trace / replay 必须记录 `duplicate_tool_call` 摘要；这只是通用诊断，不替代预算、validator 或业务 tool 合同。production `/api/chat` 当前低风险只读链路预算为：

```txt
maxToolCalls = 10
maxPlannerCalls = 11
maxSteps = 22
```

这个预算只允许多步只读链路完成，例如 `read/import -> query -> final_answer`，不得用于绕过 Action Validator、Policy Guard、ResourceStore、Resource Contract Validator 或 Response Renderer。

不要使用用户自然语言关键词判断是否重复。

---

## 20. Trace / Replay

Trace 记录脱敏后的可复现链路。

```ts
export type AgentTrace = {
  traceId: string;
  runId: string;
  conversationId: string;
  startedAt: string;
  endedAt?: string;
  registrySnapshots: ToolRegistrySnapshot[];
  plannerCalls: Array<{
    inputSummary: unknown;
    rawOutput?: unknown;
    parsedAction?: AgentAction;
    validationResult: unknown;
  }>;
  policyDecisions: PolicyDecision[];
  toolExecutions: Array<{
    toolName: string;
    toolVersion: string;
    inputSummary: unknown;
    resultSummary: unknown;
    error?: ToolError;
  }>;
  resources: RegisteredResource[];
  terminalAction?: AgentAction;
  responseEvents: AgentStreamEvent[];
};
```

Replay 要求：

```txt
不调用真实模型
不调用真实业务依赖，除非显式开启 integration 模式
使用 ReplayPlanner 提供 action 序列
可以复现 runtime、validator、policy、resource、renderer 行为
trace 中不保存 secret、完整敏感 payload、数据库连接信息
```

开发态 trace debugger 展示边界：

```txt
/dev/ai-traces 按入口与上下文、ToolRegistry/Manifest、Planner/ModelAdapter、Runtime/Validator、Policy/Resource、Response Renderer、错误诊断和 Raw/导出分组。
默认展示模块状态、关键 code/id、LLM 调用轮次、真实 token usage、预算估算、失败边界和用户可见响应摘要。
完整 messages 摘要、raw model text 摘要、parsed action、runtime traceEvents 和 Raw trace 只放在展开区或保存全链路 log 中。
保存全链路 log 必须继续脱敏；保存用户问答记录只能保留用户问题和最终文本回答。
真实 token usage 来自 ModelAdapter / 模型供应商响应，runtime estimated_tokens 只代表调用前预算估算，两者不能混用。
```

---

## 21. `/api/chat` 接入

`/api/chat` 负责：

```txt
认证
请求 schema 校验
恢复服务端上下文
恢复跨 run 业务事实摘要
创建 AgentRunInput
调用 runAgentOrchestrator
输出 NDJSON stream
写 traceId
处理客户端 abort
```

`/api/chat` 不负责：

```txt
判断具体业务意图
根据用户原文选择 tool
改写 Planner 语义
根据 toolName 写业务分支
从自然语言摘要重建完整业务事实
回退旧 Agent core
生成 confirmation hash
```

上下文恢复规则：

```txt
/api/chat 可以读取服务端已保存的 recent summary、索引字段和引用 id，并将这些轻量事实放入 AgentRunInput。
/api/chat 不读取完整业务 payload 来替 Planner 决策，也不根据用户原文解析“上一个”“这个”等引用。
需要完整事实时，Planner 必须选择已注册的 read/import tool，由 tool 执行权限、状态、版本和 schema 校验。
read/import tool 成功后，Executor / ResourceStore 再把该事实登记为当前 run 内可消费资源。
```

当前 production 文本聊天基础问答边界：

```txt
生产文本聊天可以使用空 ToolRegistry；空 registry 只表示没有可执行业务 tool，不表示不能做基础自然语言问答。
普通聊天、能力说明、训练原则解释、信息整理等不需要工具执行的问题，必须由 LLM 返回合法 final_answer，再由 Response Renderer 投影为 content。
当 tools 为空时，Prompt 必须要求模型禁止 tool_call；需要更多用户信息时返回 ask_user。
服务端不得根据“你能干什么”等用户原文写死回答，也不得把 unsupported fallback 当作基础问答的正常回复。
unsupported fallback 只处理模型明确返回不可执行 tool_call 的安全错误边界，职责是阻止内部 runtime / validator / provider 文案进入用户气泡。
```

确认建议单独入口：

```txt
/api/agent/confirm
  输入 pendingActionId + actionHash
  校验 pending action
  执行已保存 action
  输出 NDJSON stream
```

也可以复用 `/api/chat`，但请求 schema 必须区分普通用户消息和 confirmation resume。

---

## 22. 第一阶段建议范围

原方案的第一阶段范围偏满。建议拆成 M0 / M1 / M2。

### M0：合同内核闭环

必须完成：

```txt
1. defineTool
2. ToolRegistry
3. Tool manifest 序列化
4. PlannerPort + ReplayPlanner
5. AgentAction schema
6. Action Validator
7. Runtime 单步/多步循环
8. inputSchema / outputSchema 校验
9. maxSteps / timeout
10. 默认 Response Renderer
11. fixture read tool 端到端测试
```

验收标准：

```txt
只新增并注册 fixture read tool，即可被 manifest 暴露、被 ReplayPlanner 选择、被 Executor 调用，并输出 NDJSON。
```

### M1：安全与资源闭环

必须完成：

```txt
1. ResourceStore
2. resourceContract validator
3. consumable / diagnostic 资源角色
4. Policy Guard
5. confirmation pending action + action hash
6. confirmation resume
7. Trace / Replay fixture
8. fixture producer / consumer / confirmation write / diagnostic failure tools
```

验收标准：

```txt
producer 产出 consumable resource，consumer 只能消费当前 run 内已登记 resource；write fixture 必须经过 confirmation；diagnostic failure 不得被 final answer 伪装成成功结果。
```

### M2：上线硬化

建议完成：

```txt
1. LlmPlanner + 至少两个 ModelAdapter
2. manifestHash / registry snapshot
3. redaction 策略
4. observation 压缩
5. idempotencyKey
6. planner/tool budget
7. prompt injection 测试
8. tool manifest linter
9. contract test helper
10. trace 脱敏审计
```

验收标准：

```txt
替换模型 adapter 不改 agent-core；新增业务 tool 不改 agent-core；trace 可回放；敏感字段不会进入 manifest、observation、user event。
```

---

## 23. fixture tools 覆盖矩阵

```txt
read fixture
  覆盖 read tool、input/output schema、默认 renderer。

resource producer fixture
  覆盖 produces consumable resource、ResourceStore.register。

resource consumer fixture
  覆盖 requires resource、consumes 校验、resource 不存在失败。

confirmation write fixture
  覆盖 write sideEffect、Policy Guard、pending action、confirmation resume、idempotency。

diagnostic failure fixture
  覆盖 ok:false、diagnostic resource、不能被 final answer 当成成功事实。

invalid action fixture
  覆盖 Planner 输出非法 toolName、非法 input、非法 resource ref 后的修复/失败收口。
```

---

## 24. 后续新增业务 Tool 的规则

允许做：

```txt
1. 新增 tool 文件
2. 定义 inputSchema
3. 定义 outputSchema
4. 定义 policy metadata
5. 定义 resourceContract，如需要
6. 实现 handler
7. 可选实现 toModelObservation
8. 可选实现 toUserEvents
9. 可选实现 traceProjection
10. 注册到 ToolRegistry
11. 补 tool contract 测试
```

不得做：

```txt
1. 修改 orchestrator 主循环
2. 修改 PlannerPort 接口
3. 修改 Executor 主流程
4. 修改 Policy Guard 主流程
5. 修改 Resource Contract Validator 主流程
6. 修改 Response Renderer 主流程
7. 修改 /api/chat 主链路
8. 在服务端增加关键词意图分流
9. 在 core 里写具体 toolName 分支
10. 在 tool handler 里绕过 confirmation 或权限
```

如果新增 tool 必须改 core 才能工作，按下面规则判断：

```txt
只有一个 tool 需要：优先改 tool contract，不改 core。
两个以上无关 tool 都需要：考虑抽象成 core 的通用扩展点。
涉及安全、权限、资源、trace、stream 协议：必须回到 core contract 统一设计，不能开业务特例。
```

### 24.1 Agent prompt / model input 合同治理

后续修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results 或业务 tool 的模型可见说明时，先使用项目级 `.codex/skills/agent-prompt-contract-governance/SKILL.md`。

该 Skill 只治理模型实际可见合同，不替代 `.codex/skills/agent-tool-change-governance/SKILL.md`：

```txt
agent-tool-change-governance：先判断 Agent tool / core / production 变更能改哪里、不能改哪里。
agent-prompt-contract-governance：再检查 prompt / model input 是否正确表达 AgentAction、tool loop、resource、policy、grounding 和 repair 合同。
```

如果一次 change 同时新增业务 tool 和修改模型可见说明，先用 `agent-tool-change-governance` 定模块边界，再用 `agent-prompt-contract-governance` 审模型可见合同。

prompt 合同治理时必须优先确认模型实际看到的输入，而不是只读源文件文案。需要检查 prompt builder、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results，以及必要时的 `codex_logs/ai_trace_log.js` 或黑盒报告。

模型可见描述性自然语言默认使用中文，包括 system / developer prompt、tool manifest 的 `description` / `whenToUse` / `whenNotToUse`、schema description、examples description、repair feedback、observations、compressed tool results 和 final grounding 说明。`toolName`、字段名、枚举值、action type、resource type、schema id、命令、路径、错误码和代码标识符保持英文原样，不要为了中文化改动执行合同。

非文案类 Agent prompt change 的 OpenSpec 文档必须写清：

```txt
1. prompt 修改类型。
2. 允许触碰的 model input 入口。
3. 禁止触碰的 runtime / core 模块。
4. 是否涉及业务 tool 模型可见说明。
5. 是否涉及 core contract、resource、policy、grounding 或 production 接入。
6. 验证计划。
```

通用 Agent prompt 必须表达：

```txt
1. 模型只能输出受控 AgentAction。
2. 允许的 action 类型和每类 action 的必需字段。
3. toolName 只能来自 ToolRegistry。
4. tool input 必须严格匹配 schema。
5. 模型不能假装 tool 已执行或虚构 tool result。
6. final_answer 必须基于 satisfied=true 的 tool result 或 consumable resource。
7. diagnostic / failed / unsatisfied 结果只能用于 ask_user、失败解释、阻断说明或 repair。
8. write / high risk tool 必须经过 Policy Guard / confirmation。
9. 模型不能绕过 ResourceStore、Policy Guard、Resource Contract Validator 或 Response Renderer。
```

新增业务 tool 时，业务 tool 的模型可见说明必须覆盖：何时使用、何时不用、input schema 关键字段、成功结果含义、失败或 diagnostic 含义、resource role 和 final answer 引用方式。上述说明默认使用中文，技术标识保持英文原样。不得把单个业务 tool 的语义特例写进通用 prompt，也不得新增服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判去改写 LLM 的高层语义决策。

---

## 25. 最容易走偏的地方

### 25.1 把 Planner 当成可信执行器

错误做法：

```txt
LLM 说要确认，所以信它的 actionHash。
LLM 说某个 tool result 支撑 final answer，所以直接输出。
LLM 说某 resource 可用，所以传给下游 tool。
```

正确做法：

```txt
LLM 只产出候选 action。
服务端校验所有结构、权限、资源、确认和 grounding。
```

### 25.2 Tool 变成隐藏业务编排器

错误做法：

```txt
一个 superTool 内部根据业务关键词再分流到多个能力。
```

正确做法：

```txt
拆成多个单一能力 tool，由 Planner 基于 manifest 选择，由 ResourceStore 传递事实。
```

### 25.3 Response Adapter 变成 UI 业务层

错误做法：

```txt
每个 tool 都写复杂 UI 事件，甚至在 adapter 里查库、补业务逻辑。
```

正确做法：

```txt
默认 renderer 覆盖通用输出；tool 的 toUserEvents 只做纯投影，不做副作用。
```

### 25.4 Resource Contract 太抽象，最后没人认真用

错误做法：

```txt
所有 resource type 都叫 data/result/context。
所有 role 都随便填 consumable。
```

正确做法：

```txt
建立 resource type 命名规范和 contract tests。
resource role 由 contract 和 validator 共同约束。
```

### 25.5 以“模型无关”为名，实际被模型协议锁死

错误做法：

```txt
core contract 直接使用某模型的 tool_calls 格式。
```

正确做法：

```txt
core 使用 AgentAction。
模型 adapter 负责厂商格式转换。
```

---

## 26. 最小验收清单

上线前至少满足：

```txt
[ ] core 中 grep 不到具体业务 toolName。
[ ] /api/chat 中没有业务关键词分流。
[ ] Planner 输出非法 toolName 时不会执行。
[ ] Planner 输出非法 input 时不会执行。
[ ] Planner 引用不存在 resource 时不会执行。
[ ] diagnostic resource 不能支撑成功 final answer。
[ ] write/high risk tool 未确认不会执行。
[ ] confirmation hash 由服务端生成并校验。
[ ] confirmation resume 执行的是服务端保存的 pending action，不是客户端新传 input。
[ ] tool output 不会默认进入 model/user/trace。
[ ] trace 不含 secret、完整敏感 payload。
[ ] ReplayPlanner 能复现 runtime 行为。
[ ] 替换 LLM adapter 不需要修改 agent-core。
[ ] 新增 fixture tool 不需要修改 runtime/executor/policy/response/api。
```

---

## 27. 结论

这个架构不算“方向过度”，但原来的第一阶段范围有点“实现过度”。

建议最终落地口径：

```txt
第一阶段先打穿通用 runtime + registry + validator + executor + 默认 renderer。
第二阶段补 resource / policy / confirmation / trace 的硬边界。
第三阶段再接真实 LLM adapter 和真实业务 tool。
```

这样可以保持长期架构正确，又不会在第一阶段被过多抽象拖慢。

---
