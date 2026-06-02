# Agent Tool 编排器通用设计方案

## 1. 目标

本方案只设计通用 `Agent Tool Orchestrator`。它不提前实现任何具体业务 tool，也不把某个业务场景写进编排器。

核心目标：

```txt
后续新增业务能力时，只新增 tool bundle 并注册到 ToolRegistry，
不修改 Orchestrator 主循环、不修改 Planner 循环、不修改 Executor、
不修改 Policy Guard、不修改 Response Adapter 主流程、不修改 /api/chat 接入层。
```

新增能力应表达为：

```txt
新增 tool = manifest + inputSchema + outputSchema + resourceContract
           + policy metadata + handler + responseAdapter + traceProjection
           + 注册到 ToolRegistry
```

而不是：

```txt
新增能力 = 在 orchestrator 里增加 if/else、特殊 toolName 分支或业务恢复逻辑
```

第一阶段要建立完整闭环，但这个闭环是**通用编排闭环**，不是提前实现业务工具。

---

## 2. 职责边界

```txt
LLM Planner
  负责理解用户语义，并输出结构化 AgentAction

Orchestrator
  负责通用循环、合同校验、工具执行调度、状态推进和终止收口

Tool
  负责一个单一、确定性、可审计的能力

Policy Guard
  负责权限、风险、side effect 和 confirmation 边界

Response Adapter
  负责把真实 terminal action 和 tool results 投影成 NDJSON stream events

Trace / Replay
  负责记录和复现完整运行链路
```

Orchestrator 不允许知道具体业务 tool 名称，也不允许根据 tool 名称写业务分支。它只能理解以下通用概念：

```txt
tool 是否可用
tool input 是否符合 schema
tool output 是否符合 schema
tool result 是否满足 resourceContract
resource 是否 consumable
action 是否需要 policy / confirmation
terminal action 是否能被真实 tool results 支撑
response events 是否来自真实结果
```

---

## 3. 总体流程

```txt
/api/chat
  ↓
认证 / 请求校验 / 服务端上下文恢复
  ↓
ContextPackage
  ↓
ToolRegistry.listAvailable(context)
  ↓
Tool manifest 序列化
  ↓
Planner 输出 AgentAction
  ↓
Action Validator
  ↓
Policy Guard
  ↓
Executor 执行 tool handler
  ↓
input/output/resourceContract 校验
  ↓
Observation 压缩后返回 Planner
  ↓
循环，直到 terminal action
  ↓
Response Adapter 生成 NDJSON events
  ↓
Trace / replay fixture 记录完整链路
```

---

## 4. 推荐目录结构

目录只表达职责，不表达业务领域。

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
  runtime.test.ts
  tool-registry.test.ts
  response-adapter.test.ts
  trace-replay.test.ts
```

说明：

- `agent-core` 是通用核心层，不放业务 tool。
- `agent-tools/index.ts` 只负责注册当前可用 tools；第一阶段可以只注册测试 fixture 或空 registry。
- 真实业务 tool 后续按需要添加到 `agent-tools/<domain>/`，但本方案不提前创建业务目录。
- `tests/agent-core/fixture-tools.ts` 用无业务含义的 fixture tools 验证完整闭环。

---

## 5. 核心类型

```ts
export type ResourceRole = "consumable" | "diagnostic";

export type AgentResourceRef = {
  type: string;
  id: string;
};

export type ToolResourceContract = {
  requires?: Array<{
    type: string;
    required: boolean;
    description: string;
  }>;
  produces?: Array<{
    type: string;
    description: string;
  }>;
};

export type ToolFulfillment = {
  role: ResourceRole;
  satisfied: boolean;
  producedResources: AgentResourceRef[];
  consumedResources: AgentResourceRef[];
  unmetRequirements: string[];
  evidence?: unknown;
};

export type ToolResult<Output> =
  | {
      ok: true;
      toolResultId: string;
      output: Output;
      modelSummary: unknown;
      traceSummary: unknown;
      fulfillment: ToolFulfillment;
    }
  | {
      ok: false;
      toolResultId: string;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
      modelSummary: unknown;
      traceSummary: unknown;
      fulfillment: ToolFulfillment;
    };
```

---

## 6. Tool Bundle

Tool 不是一个裸 handler，而是一份完整合同。

```ts
export type Tool<I, O> = {
  name: string;
  description: string;
  whenToUse: string;
  whenNotToUse: string;

  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;

  sideEffect: "read" | "write";
  riskLevel: "low" | "medium" | "high";
  permissions: string[];
  requiresConfirmation: boolean;

  resourceContract: ToolResourceContract;

  handler(input: I, ctx: ToolContext): Promise<ToolResult<O>>;
  responseAdapter(result: ToolResult<O>, ctx: ResponseAdapterContext): AgentStreamEvent[];
  traceProjection(result: ToolResult<O>): unknown;

  examples: Array<{
    userRequest: string;
    input: I;
  }>;
};
```

后续业务 tool 必须通过这份合同接入。Orchestrator 不为任何 tool 写特殊分支。

---

## 7. defineTool

```ts
export function defineTool<I, O>(tool: Tool<I, O>): Tool<I, O> {
  return tool;
}
```

`defineTool` 只负责类型收敛和合同表达，不负责注册，也不负责业务选择。

---

## 8. ToolRegistry

```ts
export class ToolRegistry {
  register(tool: Tool<unknown, unknown>): void;
  get(name: string): Tool<unknown, unknown> | null;
  listAvailable(context: ToolAvailabilityContext): Tool<unknown, unknown>[];
  serializeForPlanner(tools: Tool<unknown, unknown>[]): ToolManifest[];
}
```

Registry 必须保证：

1. tool name 唯一。
2. 未注册 tool 不能执行。
3. disabled 或无权限 tool 不进入 Planner manifest。
4. manifest 只能包含模型可见安全字段。
5. handler、数据库对象、完整 payload、用户敏感数据不得进入 manifest。

---

## 9. Tool Manifest

Planner 看到的是 manifest，不是 tool 实现。

```ts
export type ToolManifest = {
  name: string;
  description: string;
  whenToUse: string;
  whenNotToUse: string;
  inputSchemaSummary: unknown;
  outputSchemaSummary: unknown;
  resourceContract: ToolResourceContract;
  sideEffect: "read" | "write";
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  examples: unknown[];
};
```

manifest 摘要必须足够完整，能表达 object、array、record、union、enum、required fields 和 nested fields。不能为了省 token 丢失执行关键结构。

---

## 10. AgentAction

Planner 输出统一结构：

```ts
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
      usedToolResultIds: string[];
      producedEvents?: unknown[];
    }
  | {
      type: "ask_user";
      question: string;
      suggestions?: string[];
      usedToolResultIds: string[];
    }
  | {
      type: "request_confirmation";
      toolName: string;
      input: unknown;
      actionHash: string;
      expiresAt: string;
      message: string;
    };
```

服务端只校验结构、权限、资源和合同，不用关键词或正则重解释用户语义。

---

## 11. Runtime Loop

```ts
export async function runAgentOrchestrator(input: AgentRunInput): Promise<AgentRunResult> {
  const state = createInitialState(input);

  while (!state.terminal) {
    enforceStepLimit(state);
    enforceTimeout(state);

    const tools = registry.listAvailable(state.context);
    const manifest = registry.serializeForPlanner(tools);
    const action = await planner.decideNext({ state, manifest });

    validateAction(action, state, registry);
    const policyDecision = await policyGuard.evaluate(action, state);

    if (policyDecision.type === "requires_confirmation") {
      return buildConfirmationResult(policyDecision, state);
    }

    if (action.type !== "tool_call") {
      return buildTerminalResult(action, state);
    }

    const result = await executor.execute(action, state);
    validateToolResult(result, action, state);
    state.addObservation(toObservation(result));
  }

  return state.result;
}
```

Runtime 不允许出现具体业务 toolName 分支。

---

## 12. 防循环边界

第一阶段必须实现：

```txt
maxSteps
overall timeout
per-tool timeout
重复失败熔断
非法 action 修复或失败收口
```

重复失败熔断使用确定性 key：

```txt
toolName + normalizedInput + failureCode
```

不得使用用户自然语言关键词判断是否重复。

---

## 13. Resource Contract

资源合同是 tool 之间传递事实的唯一依据。

```txt
consumable
  可以被后续 tool 或 final answer 消费

diagnostic
  只能作为解释、澄清、失败或调试证据
```

规则：

1. 下游 tool 只能消费当前 run 已登记的 `consumable` resource。
2. terminal action 引用 tool result 时必须验证 result 存在。
3. 成功投影不能引用 diagnostic-only resource 伪装成成功结果。
4. resource id 必须来自当前 run，不能跨 run 直接消费。

---

## 14. Policy Guard

Policy Guard 负责：

```txt
permission
riskLevel
sideEffect
requiresConfirmation
confirmation action hash
```

写操作或高风险操作必须经过确认。确认 hash 由服务端生成：

```txt
stableActionPayload + userId + conversationId + toolName + resourceRefs + expiresAt
```

LLM 不能伪造确认，tool handler 不能自行跳过确认。

---

## 15. Response Adapter

Response Adapter 负责把真实运行结果转为 NDJSON stream events。

通用事件类型：

```ts
export type AgentStreamEvent =
  | { type: "content"; content: string }
  | { type: "tool_result"; toolName: string; toolResultId: string; payload: unknown }
  | { type: "confirmation_request"; actionHash: string; message: string; expiresAt: string }
  | { type: "assistant_suggestions"; suggestions: string[] }
  | { type: "error"; code: string; message: string; retryable: boolean }
  | { type: "done"; traceId: string };
```

通用 Response Adapter 不按 toolName 写业务分支。具体 tool 如果需要特殊用户可见事件，必须通过 tool bundle 自带的 `responseAdapter` 注册。

---

## 16. Trace / Replay

Trace 必须记录：

```txt
context summary
available tool manifest summary
planner action
action validation result
policy decision
tool input summary
tool output summary
resource refs
terminal action
response events
errors
```

Replay fixture 必须允许测试在不调用真实模型的情况下提供 action 序列，复现 runtime、policy、resource contract 和 response adapter。

---

## 17. `/api/chat` 接入

`/api/chat` 负责：

```txt
认证
请求 schema 校验
服务端上下文恢复
创建 AgentRunInput
调用新 runtime
输出 NDJSON stream
写 trace id
```

`/api/chat` 不负责：

```txt
判断具体业务意图
根据用户原文选择 tool
改写 Planner 语义
根据 toolName 写业务分支
回退旧 Agent core
```

---

## 18. 第一阶段完整闭环范围

第一阶段必须完成以下能力：

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

第 15 项只用于验证通用机制，不代表提前实现业务 tool。fixture tools 应覆盖：

```txt
read fixture
resource producer fixture
resource consumer fixture
confirmation write fixture
diagnostic failure fixture
```

验收标准：

```txt
只新增并注册 fixture tool，即可被 Planner manifest 发现、被 runtime 调用、
经过 schema/resource/policy 校验，并由 Response Adapter 输出 NDJSON events。
```

---

## 19. 后续新增业务 Tool 的规则

后续新增业务 tool 时，只允许做：

```txt
1. 新增 tool 文件
2. 定义 inputSchema
3. 定义 outputSchema
4. 定义 resourceContract
5. 定义 policy metadata
6. 实现 handler
7. 实现 responseAdapter
8. 实现 traceProjection
9. 注册到 ToolRegistry
10. 补 tool contract 测试
```

不得做：

```txt
1. 修改 orchestrator 主循环
2. 修改 Planner 循环
3. 修改 Executor 主流程
4. 修改 Policy Guard 主流程
5. 修改 Resource Contract Validator 主流程
6. 修改 Response Adapter 主流程
7. 修改 /api/chat 主链路
8. 在服务端增加关键词意图分流
9. 在 core 里写具体 toolName 分支
```

如果新增 tool 必须改 core 才能工作，说明通用合同设计仍不完整，应先补通用合同，而不是给该 tool 开特例。
