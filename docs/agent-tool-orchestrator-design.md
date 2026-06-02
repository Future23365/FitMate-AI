# Next.js Agent Tool 编排器设计方案

## 1. 设计目标

本项目目标是设计一个可扩展的 Agent Tool 编排器。

核心目标：

```txt
新增 Agent 能力时，不修改 orchestrator 主流程，
只需要新增 tool，并注册到 Tool Registry 中。
```

更准确地说：

```txt
新增功能 = 新增 tool manifest + inputSchema + handler + policy metadata
```

而不是：

```txt
新增功能 = 修改大量 if/else 判断逻辑
```

---

## 2. 核心设计思想

Agent 编排器本身不关心具体业务。

它只负责：

1. 接收用户输入
2. 获取可用 tools
3. 让 LLM 判断下一步动作
4. 校验 tool 参数
5. 检查权限和风险
6. 执行 tool
7. 把 tool 结果返回给 LLM
8. 直到生成最终回答

也就是说：

```txt
Orchestrator 只管通用流程
Tool 负责业务能力
Policy 负责安全边界
LLM 负责动态规划
```

---

## 3. 整体架构

```txt
用户输入
  ↓
API Route / Server Action
  ↓
Agent Orchestrator
  ↓
Tool Retriever：筛选相关 tools
  ↓
Planner：LLM 决定下一步动作
  ↓
Policy Guard：权限 / 风险 / 确认检查
  ↓
Executor：执行 tool
  ↓
Observation：把结果喂回 LLM
  ↓
循环，直到 final_answer
```

---

## 4. Next.js 推荐目录结构

```txt
src/
  app/
    api/
      agent/
        route.ts

  lib/
    agent/
      orchestrator.ts
      planner.ts
      executor.ts
      policy.ts
      retriever.ts
      state.ts
      types.ts
      prompts.ts

    tools/
      defineTool.ts
      registry.ts
      types.ts

      order/
        getOrder.tool.ts
        refundOrder.tool.ts

      email/
        sendEmail.tool.ts

      index.ts

    services/
      llm.ts
      orderService.ts
      refundService.ts
      emailService.ts

    auth/
      getCurrentUser.ts

    utils/
      timeout.ts
      hash.ts
```

---

## 5. Tool 类型设计

文件位置：

```txt
src/lib/tools/types.ts
```

```ts
import { z } from "zod";

export type ToolSideEffect = "none" | "read" | "write" | "external";

export type ToolRiskLevel = "low" | "medium" | "high";

export type ToolContext = {
  userId: string;
  permissions: string[];
  requestId: string;
  signal?: AbortSignal;
};

export type ToolResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  summary?: string;
};

export type Tool<Input = unknown, Output = unknown> = {
  name: string;
  description: string;

  inputSchema: z.ZodType<Input>;
  outputSchema?: z.ZodType<Output>;

  whenToUse: string;
  whenNotToUse?: string;

  examples?: Array<{
    userRequest: string;
    input: Input;
  }>;

  sideEffect: ToolSideEffect;
  riskLevel: ToolRiskLevel;
  permissions?: string[];

  requiresConfirmation?: boolean;
  timeoutMs?: number;
  retryable?: boolean;

  handler: (input: Input, ctx: ToolContext) => Promise<ToolResult<Output>>;
};
```

---

## 6. defineTool 封装

文件位置：

```txt
src/lib/tools/defineTool.ts
```

```ts
import { Tool } from "./types";

export function defineTool<I, O>(tool: Tool<I, O>): Tool<I, O> {
  return tool;
}
```

---

## 7. Tool Registry 设计

文件位置：

```txt
src/lib/tools/registry.ts
```

```ts
import { Tool } from "./types";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string) {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.values());
  }

  listAvailable(ctx: { permissions: string[] }) {
    return this.list().filter((tool) => {
      if (!tool.permissions?.length) return true;

      return tool.permissions.every((permission) =>
        ctx.permissions.includes(permission),
      );
    });
  }
}
```

---

## 8. 示例 Tool：查询订单

文件位置：

```txt
src/lib/tools/order/getOrder.tool.ts
```

```ts
import { z } from "zod";
import { defineTool } from "../defineTool";
import { orderService } from "@/lib/services/orderService";

export const getOrderTool = defineTool({
  name: "get_order",
  description: "根据订单 ID 查询订单详情，包括订单状态、金额、商品列表和物流信息。",

  whenToUse: "当用户想查询订单详情、订单状态、物流进度、订单金额时使用。",
  whenNotToUse: "当用户想取消订单、退款、修改地址时不要使用。",

  inputSchema: z.object({
    orderId: z.string().describe("订单 ID"),
  }),

  sideEffect: "read",
  riskLevel: "low",
  permissions: ["order:read"],
  requiresConfirmation: false,
  timeoutMs: 8000,

  examples: [
    {
      userRequest: "帮我查一下订单 12345 到哪了",
      input: {
        orderId: "12345",
      },
    },
  ],

  async handler(input, ctx) {
    const order = await orderService.getOrder({
      orderId: input.orderId,
      userId: ctx.userId,
    });

    if (!order) {
      return {
        ok: false,
        error: {
          code: "ORDER_NOT_FOUND",
          message: "没有找到该订单",
        },
        summary: "没有找到该订单，可能需要用户确认订单号。",
      };
    }

    return {
      ok: true,
      data: order,
      summary: `订单 ${order.id} 当前状态为 ${order.status}`,
    };
  },
});
```

---

## 9. 示例 Tool：订单退款

文件位置：

```txt
src/lib/tools/order/refundOrder.tool.ts
```

```ts
import { z } from "zod";
import { defineTool } from "../defineTool";
import { refundService } from "@/lib/services/refundService";

export const refundOrderTool = defineTool({
  name: "refund_order",
  description: "为指定订单发起退款申请。",

  whenToUse: "当用户明确要求退款、退货退款、取消已支付订单并退款时使用。",
  whenNotToUse: "当用户只是查询订单、查询物流、询问退款政策时不要使用。",

  inputSchema: z.object({
    orderId: z.string().describe("订单 ID"),
    reason: z.string().describe("退款原因"),
  }),

  sideEffect: "write",
  riskLevel: "high",
  permissions: ["order:refund"],
  requiresConfirmation: true,
  timeoutMs: 10000,

  async handler(input, ctx) {
    const result = await refundService.refund({
      orderId: input.orderId,
      reason: input.reason,
      userId: ctx.userId,
    });

    return {
      ok: true,
      data: result,
      summary: `已为订单 ${input.orderId} 发起退款申请`,
    };
  },
});
```

---

## 10. 注册所有 Tools

文件位置：

```txt
src/lib/tools/index.ts
```

```ts
import { ToolRegistry } from "./registry";

import { getOrderTool } from "./order/getOrder.tool";
import { refundOrderTool } from "./order/refundOrder.tool";

export const toolRegistry = new ToolRegistry();

toolRegistry.register(getOrderTool);
toolRegistry.register(refundOrderTool);
```

后续新增功能时，只需要：

```ts
toolRegistry.register(newTool);
```

---

## 11. Agent Action 协议

文件位置：

```txt
src/lib/agent/types.ts
```

```ts
import { z } from "zod";

export const agentActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("call_tool"),
    toolName: z.string(),
    arguments: z.unknown(),
    reason: z.string(),
  }),

  z.object({
    type: z.literal("ask_user"),
    question: z.string(),
    reason: z.string(),
  }),

  z.object({
    type: z.literal("final_answer"),
    content: z.string(),
  }),
]);

export type AgentAction = z.infer<typeof agentActionSchema>;

export type AgentState = {
  messages: Array<{
    role: "user" | "assistant" | "tool";
    content: string;
  }>;

  toolCalls: Array<{
    toolName: string;
    arguments: unknown;
    result: unknown;
    createdAt: number;
  }>;

  observations: Array<{
    toolName: string;
    ok: boolean;
    summary: string;
    compactData?: unknown;
  }>;

  confirmedActionHashes: string[];
};

export type AgentRunResult =
  | {
      type: "answer";
      content: string;
      state: AgentState;
    }
  | {
      type: "need_user_input";
      question: string;
      state: AgentState;
    }
  | {
      type: "need_confirmation";
      message: string;
      confirmationToken: string;
      pendingAction: AgentAction;
      state: AgentState;
    };
```

---

## 12. Agent Prompt

文件位置：

```txt
src/lib/agent/prompts.ts
```

```ts
export const systemPrompt = `
你是一个 agent planner。

你可以根据用户请求选择合适的 tool。
你必须严格遵守以下规则：

1. 只调用可用 tool 列表中的工具。
2. 不要编造 tool。
3. 调用 tool 时，参数必须符合 inputSchema。
4. 信息不足时，使用 ask_user。
5. 工具结果已经足够回答用户时，使用 final_answer。
6. 对高风险操作、写操作、外部副作用操作，不要假设用户已经确认。
7. 不要直接声称已经完成某个操作，除非你已经收到对应 tool 的成功结果。
8. 不要把内部 tool 名称暴露给用户，除非用户明确要求技术细节。
9. 你的输出必须是 AgentAction JSON。
`;

export function buildPlannerPrompt(params: {
  userInput: string;
  tools: unknown[];
  observations: unknown[];
}) {
  return `
用户请求：
${params.userInput}

可用 tools：
${JSON.stringify(params.tools, null, 2)}

已有观察结果：
${JSON.stringify(params.observations, null, 2)}

请决定下一步 action。
`;
}
```

---

## 13. Tool 序列化

文件位置：

```txt
src/lib/agent/planner.ts
```

```ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { Tool } from "@/lib/tools/types";
import { AgentAction, agentActionSchema, AgentState } from "./types";
import { buildPlannerPrompt, systemPrompt } from "./prompts";
import { llm } from "@/lib/services/llm";

function serializeTool(tool: Tool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema),
    whenToUse: tool.whenToUse,
    whenNotToUse: tool.whenNotToUse,
    sideEffect: tool.sideEffect,
    riskLevel: tool.riskLevel,
    requiresConfirmation: tool.requiresConfirmation,
    examples: tool.examples,
  };
}

export async function planNextAction(params: {
  userInput: string;
  state: AgentState;
  tools: Tool[];
}): Promise<AgentAction> {
  const prompt = buildPlannerPrompt({
    userInput: params.userInput,
    tools: params.tools.map(serializeTool),
    observations: params.state.observations,
  });

  const result = await llm.generateObject({
    schema: agentActionSchema,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return result;
}
```

---

## 14. LLM Service 抽象

文件位置：

```txt
src/lib/services/llm.ts
```

可以先写成抽象层，避免业务代码直接依赖某个 SDK。

```ts
import { z } from "zod";

export const llm = {
  async generateObject<T>(params: {
    schema: z.ZodType<T>;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
  }): Promise<T> {
    // 这里可以接 OpenAI、Vercel AI SDK、Anthropic 等
    // 伪代码：
    //
    // const result = await model.generate({
    //   messages: params.messages,
    //   response_format: params.schema,
    // });
    //
    // return params.schema.parse(result);

    throw new Error("llm.generateObject 尚未实现");
  },
};
```

如果使用 Vercel AI SDK，可以后续替换为：

```ts
// import { generateObject } from "ai";
// import { openai } from "@ai-sdk/openai";
```

---

## 15. Policy Guard

文件位置：

```txt
src/lib/agent/policy.ts
```

```ts
import { AgentAction } from "./types";
import { Tool } from "@/lib/tools/types";
import { createActionHash } from "@/lib/utils/hash";

export type PolicyResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
      needConfirmation?: boolean;
      confirmationMessage?: string;
      confirmationToken?: string;
    };

export function checkPolicy(params: {
  action: AgentAction;
  tool?: Tool;
  ctx: {
    permissions: string[];
    confirmedActionHashes: string[];
  };
}): PolicyResult {
  const { action, tool, ctx } = params;

  if (action.type !== "call_tool") {
    return { allowed: true };
  }

  if (!tool) {
    return {
      allowed: false,
      reason: "TOOL_NOT_FOUND",
    };
  }

  if (tool.permissions?.length) {
    const hasAllPermissions = tool.permissions.every((permission) =>
      ctx.permissions.includes(permission),
    );

    if (!hasAllPermissions) {
      return {
        allowed: false,
        reason: "NO_PERMISSION",
      };
    }
  }

  const actionHash = createActionHash(action);

  const isRisky =
    tool.sideEffect === "write" ||
    tool.sideEffect === "external" ||
    tool.riskLevel === "high" ||
    tool.requiresConfirmation;

  if (isRisky && !ctx.confirmedActionHashes.includes(actionHash)) {
    return {
      allowed: false,
      reason: "CONFIRMATION_REQUIRED",
      needConfirmation: true,
      confirmationToken: actionHash,
      confirmationMessage: buildConfirmationMessage(action, tool),
    };
  }

  return { allowed: true };
}

function buildConfirmationMessage(action: AgentAction, tool: Tool) {
  if (action.type !== "call_tool") return "";

  return `这个操作会执行「${tool.description}」，可能产生实际影响。请确认是否继续。`;
}
```

---

## 16. Action Hash

文件位置：

```txt
src/lib/utils/hash.ts
```

```ts
import crypto from "crypto";

export function createActionHash(input: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}
```

确认高风险操作时，不要只确认 toolName，而是确认整个 action。

这样可以避免：

```txt
用户确认退款订单 123
系统却执行退款订单 456
```

---

## 17. Executor

文件位置：

```txt
src/lib/agent/executor.ts
```

```ts
import { Tool, ToolContext } from "@/lib/tools/types";
import { withTimeout } from "@/lib/utils/timeout";

export async function executeTool(params: {
  tool: Tool;
  args: unknown;
  ctx: ToolContext;
}) {
  const { tool, args, ctx } = params;

  const parsed = tool.inputSchema.safeParse(args);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_ARGUMENTS",
        message: parsed.error.message,
      },
      summary: "工具参数不正确，需要重新生成参数或询问用户。",
    };
  }

  try {
    const result = await withTimeout(
      tool.handler(parsed.data, ctx),
      tool.timeoutMs ?? 10000,
    );

    return result;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "TOOL_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      summary: "工具执行失败。",
    };
  }
}
```

---

## 18. Timeout 工具函数

文件位置：

```txt
src/lib/utils/timeout.ts
```

```ts
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
```

---

## 19. Tool Retriever

文件位置：

```txt
src/lib/agent/retriever.ts
```

MVP 阶段可以先做简单关键词匹配。

```ts
import { Tool } from "@/lib/tools/types";

export function retrieveTools(params: {
  userInput: string;
  tools: Tool[];
  topK: number;
}) {
  const query = params.userInput.toLowerCase();

  return params.tools
    .map((tool) => {
      const text = [
        tool.name,
        tool.description,
        tool.whenToUse,
        tool.whenNotToUse,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const score = query
        .split(/\s+/)
        .filter((word) => text.includes(word)).length;

      return {
        tool,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, params.topK)
    .map((item) => item.tool);
}
```

后续 tools 多了之后，可以改成 embedding retrieval。

---

## 20. State 处理函数

文件位置：

```txt
src/lib/agent/state.ts
```

```ts
import { AgentState } from "./types";

export function createInitialAgentState(): AgentState {
  return {
    messages: [],
    toolCalls: [],
    observations: [],
    confirmedActionHashes: [],
  };
}

export function appendToolResult(
  state: AgentState,
  params: {
    toolName: string;
    arguments: unknown;
    result: {
      ok: boolean;
      summary?: string;
      data?: unknown;
      error?: unknown;
    };
  },
): AgentState {
  return {
    ...state,
    toolCalls: [
      ...state.toolCalls,
      {
        toolName: params.toolName,
        arguments: params.arguments,
        result: params.result,
        createdAt: Date.now(),
      },
    ],
    observations: [
      ...state.observations,
      {
        toolName: params.toolName,
        ok: params.result.ok,
        summary: params.result.summary ?? "",
        compactData: params.result.data,
      },
    ],
  };
}

export function appendObservation(
  state: AgentState,
  params: {
    toolName: string;
    ok: boolean;
    summary: string;
    compactData?: unknown;
  },
): AgentState {
  return {
    ...state,
    observations: [...state.observations, params],
  };
}
```

---

## 21. Orchestrator 主流程

文件位置：

```txt
src/lib/agent/orchestrator.ts
```

```ts
import { toolRegistry } from "@/lib/tools";
import { ToolContext } from "@/lib/tools/types";
import { AgentRunResult, AgentState } from "./types";
import { planNextAction } from "./planner";
import { retrieveTools } from "./retriever";
import { checkPolicy } from "./policy";
import { executeTool } from "./executor";
import { appendObservation, appendToolResult } from "./state";

export async function runAgent(params: {
  userInput: string;
  ctx: ToolContext;
  state: AgentState;
}): Promise<AgentRunResult> {
  const maxSteps = 8;

  let state = params.state;

  for (let step = 0; step < maxSteps; step++) {
    const availableTools = toolRegistry.listAvailable({
      permissions: params.ctx.permissions,
    });

    const candidateTools = retrieveTools({
      userInput: params.userInput,
      tools: availableTools,
      topK: 10,
    });

    const action = await planNextAction({
      userInput: params.userInput,
      state,
      tools: candidateTools,
    });

    if (action.type === "final_answer") {
      return {
        type: "answer",
        content: action.content,
        state,
      };
    }

    if (action.type === "ask_user") {
      return {
        type: "need_user_input",
        question: action.question,
        state,
      };
    }

    const tool = toolRegistry.get(action.toolName);

    const policy = checkPolicy({
      action,
      tool,
      ctx: {
        permissions: params.ctx.permissions,
        confirmedActionHashes: state.confirmedActionHashes,
      },
    });

    if (!policy.allowed) {
      if (policy.needConfirmation) {
        return {
          type: "need_confirmation",
          message: policy.confirmationMessage ?? "请确认是否继续执行该操作。",
          confirmationToken: policy.confirmationToken ?? "",
          pendingAction: action,
          state,
        };
      }

      state = appendObservation(state, {
        toolName: action.toolName,
        ok: false,
        summary: `工具调用被拒绝：${policy.reason}`,
      });

      continue;
    }

    if (!tool) {
      state = appendObservation(state, {
        toolName: action.toolName,
        ok: false,
        summary: `工具不存在：${action.toolName}`,
      });

      continue;
    }

    const result = await executeTool({
      tool,
      args: action.arguments,
      ctx: params.ctx,
    });

    state = appendToolResult(state, {
      toolName: action.toolName,
      arguments: action.arguments,
      result,
    });
  }

  return {
    type: "answer",
    content: "我尝试了多步处理，但没有得到稳定结果。建议补充更多信息后重试。",
    state,
  };
}
```

---

## 22. Next.js API Route

文件位置：

```txt
src/app/api/agent/route.ts
```

```ts
import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/orchestrator";
import { createInitialAgentState } from "@/lib/agent/state";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    input,
    state,
  }: {
    input: string;
    state?: ReturnType<typeof createInitialAgentState>;
  } = body;

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "UNAUTHORIZED",
        message: "请先登录。",
      },
      {
        status: 401,
      },
    );
  }

  const result = await runAgent({
    userInput: input,
    state: state ?? createInitialAgentState(),
    ctx: {
      userId: user.id,
      permissions: user.permissions,
      requestId: crypto.randomUUID(),
    },
  });

  return NextResponse.json(result);
}
```

---

## 23. 前端调用示例

```ts
async function sendMessage(input: string, state: unknown) {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      state,
    }),
  });

  if (!res.ok) {
    throw new Error("Agent request failed");
  }

  return res.json();
}
```

---

## 24. 高风险操作确认流程

当 agent 返回：

```ts
{
  type: "need_confirmation",
  message: "这个操作会执行退款，可能产生实际影响。请确认是否继续。",
  confirmationToken: "...",
  pendingAction: {...},
  state: {...}
}
```

前端展示确认按钮。

用户点击确认后，把 `confirmationToken` 加入 state：

```ts
const nextState = {
  ...state,
  confirmedActionHashes: [
    ...state.confirmedActionHashes,
    confirmationToken,
  ],
};
```

然后再次调用：

```ts
await sendMessage(userInput, nextState);
```

---

## 25. 新增 Tool 的标准流程

新增一个功能时，不修改 orchestrator。

只做 4 件事：

```txt
1. 新建 xxx.tool.ts
2. 写 description / whenToUse / whenNotToUse
3. 写 inputSchema / handler
4. 注册到 toolRegistry
```

例如新增“发送邮件”：

```txt
src/lib/tools/email/sendEmail.tool.ts
```

```ts
import { z } from "zod";
import { defineTool } from "../defineTool";
import { emailService } from "@/lib/services/emailService";

export const sendEmailTool = defineTool({
  name: "send_email",
  description: "发送一封邮件给指定收件人。",

  whenToUse: "当用户明确要求发送邮件、通知某人、回复邮件时使用。",
  whenNotToUse: "当用户只是想草拟邮件、修改文案、总结邮件内容时不要直接发送。",

  inputSchema: z.object({
    to: z.string().email().describe("收件人邮箱"),
    subject: z.string().describe("邮件标题"),
    body: z.string().describe("邮件正文"),
  }),

  sideEffect: "external",
  riskLevel: "high",
  permissions: ["email:send"],
  requiresConfirmation: true,
  timeoutMs: 10000,

  async handler(input, ctx) {
    const result = await emailService.send({
      to: input.to,
      subject: input.subject,
      body: input.body,
      userId: ctx.userId,
    });

    return {
      ok: true,
      data: result,
      summary: `邮件已发送给 ${input.to}`,
    };
  },
});
```

然后注册：

```ts
import { sendEmailTool } from "./email/sendEmail.tool";

toolRegistry.register(sendEmailTool);
```

---

## 26. 不推荐的设计

不要在 orchestrator 里写业务判断。

不推荐：

```ts
if (intent === "query_order") {
  callGetOrder();
} else if (intent === "refund") {
  callRefund();
} else if (intent === "send_email") {
  callSendEmail();
}
```

这种设计后期会失控。

因为业务越多，判断会变成：

```ts
if (
  user.isVip &&
  order.status === "paid" &&
  !order.hasRefund &&
  intent === "refund" &&
  region === "TW"
) {
  // ...
}
```

正确做法：

```txt
业务规则放进 tool handler
通用流程留在 orchestrator
```

---

## 27. 推荐的 MVP 范围

第一版先实现这些：

```txt
1. defineTool
2. ToolRegistry
3. inputSchema 校验
4. Planner 输出 AgentAction
5. 单轮 tool call
6. 多轮 tool call
7. maxSteps 防死循环
8. write / external tool 确认机制
```

暂时不要一开始就做：

```txt
1. 多 Agent 协作
2. 长期记忆
3. 复杂 workflow 引擎
4. 自动反思
5. 分布式任务队列
6. 复杂权限后台
```

这些可以等基础闭环跑稳后再加。

---

## 28. 后续增强方向

### 28.1 Tool Retrieval 升级

当 tools 超过 20 个后，不建议每次把所有 tools 都塞给 LLM。

可以升级为：

```txt
用户请求
  ↓
embedding 检索相关 tools
  ↓
topK tools
  ↓
交给 Planner
```

### 28.2 Observation 压缩

不要把 tool 的 raw data 全部塞回 LLM。

推荐格式：

```ts
type Observation = {
  toolName: string;
  ok: boolean;
  summary: string;
  compactData?: unknown;
  dataRef?: string;
};
```

完整数据可以放缓存、数据库或对象存储里。

### 28.3 Middleware 化

后续可以把 policy、日志、限流、审计抽成 middleware。

```ts
agent.use(permissionMiddleware);
agent.use(confirmationMiddleware);
agent.use(rateLimitMiddleware);
agent.use(auditLogMiddleware);
```

目标 API：

```ts
const agent = createAgent({
  name: "commerce-agent",
  llm,
  registry,
  maxSteps: 8,
  toolRetriever,
  policyGuards: [
    permissionGuard,
    confirmationGuard,
    riskGuard,
  ],
  observers: [
    auditLogger,
    metricsCollector,
  ],
});
```

---

## 29. 最终设计原则

最重要的一句话：

```txt
Orchestrator 只管通用流程，
Tool 负责业务能力，
Policy 负责边界，
LLM 负责动态规划。
```

新增能力时，理想流程应该是：

```txt
新增 tool 文件
  ↓
声明 manifest / schema / handler
  ↓
注册到 registry
  ↓
Agent 自动获得新能力
```

不要把 agent 写成一堆业务 if/else。

应该让它始终保持：

```ts
const action = await planner.plan();
await policy.check(action);
const result = await executor.run(action);
state.append(result);
```

这样项目后期才有扩展性。
