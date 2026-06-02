# AI 健身聊天 Agent Tool 编排器设计方案

## 1. 设计目标

本项目需要一个面向 AI 健身聊天助手的可扩展 Agent Tool 编排器。

核心目标：

```txt
新增 Agent 能力时，不修改 orchestrator 主流程，
只新增单一职责 tool，并注册到 Tool Registry 中。
```

更准确地说：

```txt
新增功能 = 新增 tool manifest + inputSchema + outputSchema + handler + resource contract + policy metadata + response adapter
```

而不是：

```txt
新增功能 = 在 orchestrator 里继续增加业务 if/else 或特殊恢复逻辑
```

本方案的关键边界是：

```txt
LLM 负责理解用户语义和动态规划
Orchestrator 负责通用循环和合同执行
Tool 负责一个确定性业务能力
Policy 负责权限、风险和确认边界
Response Adapter 负责把真实执行结果转成聊天回复和卡片事件
```

---

## 2. 核心设计思想

Agent 编排器本身不关心“练胸、练背、生成 routine、保存 artifact、替换动作”等具体业务。

它只负责：

1. 接收当前用户输入和会话上下文
2. 构造 `ContextPackage`
3. 获取当前用户可用 tools
4. 让 LLM Planner 决定下一步 action
5. 校验 action 和 tool 参数
6. 通过 Policy Guard 检查权限、风险和确认状态
7. 执行 tool handler
8. 把 tool result 转成 observation 返回给 LLM
9. 直到得到 `final_answer`、`ask_user` 或 `need_confirmation`
10. 通过 Response Adapter 生成 NDJSON 聊天流事件

也就是说：

```txt
Orchestrator 只管通用流程
Tool 负责单一业务能力
Policy 负责安全边界
LLM 负责语义规划
Response Adapter 负责用户可见投影
```

Orchestrator 不允许知道具体工具名，例如：

```txt
searchExercises
generateRoutineDraft
validateRoutineDraft
saveConversationArtifactRevision
```

Orchestrator 只能知道：

```txt
这个 tool 是否可用
这个 action 是否合法
这个 tool 需要哪些资源
这个 tool 产生了哪些资源
这个 tool result 是否可被继续消费
这个 final answer 引用了哪些 tool result
```

---

## 3. 整体架构

```txt
用户消息
  ↓
/api/chat
  ↓
认证 / 请求校验 / 服务端 hydration
  ↓
ContextPackage
  ↓
Tool Retriever：按当前请求筛选相关 tools
  ↓
Planner：LLM 输出下一步 AgentAction
  ↓
Action Validator：校验 action / toolName / inputSchema
  ↓
Policy Guard：权限 / 风险 / 确认检查
  ↓
Executor：执行 tool handler
  ↓
Observation：压缩 tool result 给下一轮 LLM
  ↓
循环，直到 final_answer / ask_user / need_confirmation
  ↓
Response Adapter：生成 content / artifact / assistant_suggestions / done
```

---

## 4. 推荐目录结构

文件位置不要求一次性完全照搬，但新架构应按这些职责拆开。

```txt
app/
  api/
    chat/
      route.ts

lib/
  server/
    agent-core/
      orchestrator.ts
      planner.ts
      executor.ts
      policy.ts
      retriever.ts
      response-adapter.ts
      state.ts
      types.ts
      prompts.ts
      trace.ts

    agent-tools/
      define-tool.ts
      registry.ts
      types.ts

      exercises/
        search-exercise-candidates.tool.ts
        get-exercise-detail.tool.ts

      artifacts/
        list-conversation-artifacts.tool.ts
        get-conversation-artifact-payload.tool.ts
        save-conversation-artifact.tool.ts

      workout-drafts/
        register-routine-draft.tool.ts
        validate-routine-draft.tool.ts
        register-workout-patch.tool.ts
        validate-workout-patch.tool.ts

      user-memory/
        query-user-memory.tool.ts
        record-user-feedback.tool.ts

      index.ts

    exercises/
      exercise-service.ts
      exercise-repository.ts

    workout-plans/
      workout-plan-validation-service.ts
      domain-plan-engine.ts

    conversation-artifacts/
      artifact-service.ts

    policy-confirmation/
      policy-engine.ts

    ai/
      llm-service.ts
      token-budget.ts
      prompt-config.ts
```

---

## 5. Tool 类型设计

文件位置：

```txt
lib/server/agent-tools/types.ts
```

```ts
import { z } from "zod";

export type ToolSideEffect = "none" | "read" | "write" | "external";

export type ToolRiskLevel = "low" | "medium" | "high";

export type AgentResourceRole = "consumable" | "diagnostic";

export type AgentResourceRef = {
  type:
    | "exercise_candidate_set"
    | "exercise_detail"
    | "conversation_artifact"
    | "artifact_payload"
    | "routine_draft"
    | "workout_patch"
    | "validation_result"
    | "policy_decision"
    | "artifact_revision"
    | "operation_result";
  id: string;
};

export type ToolContext = {
  userId: string;
  sessionId: string;
  requestId: string;
  traceId?: string;
  responseMessageId?: string;
  permissions: string[];
  now: string;
  signal?: AbortSignal;
};

export type ToolFulfillment = {
  role: AgentResourceRole;
  satisfied: boolean;
  producedResources: AgentResourceRef[];
  consumedResources: AgentResourceRef[];
  unmetRequirements?: string[];
  evidence?: Record<string, unknown>;
};

export type ToolResult<Output = unknown> =
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
        retryable?: boolean;
      };
      modelSummary: unknown;
      traceSummary: unknown;
      fulfillment: ToolFulfillment;
    };

export type ToolResourceContract = {
  requires?: Array<{
    type: AgentResourceRef["type"];
    required: boolean;
    description: string;
  }>;
  produces?: Array<{
    type: AgentResourceRef["type"];
    description: string;
  }>;
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

  resourceContract: ToolResourceContract;
  timeoutMs?: number;

  handler: (input: Input, ctx: ToolContext) => Promise<ToolResult<Output>>;
};
```

设计要求：

1. `handler` 不读取用户原文做关键词判断。
2. `handler` 只执行 `inputSchema` 表达的确定性操作。
3. `modelSummary` 只放下一轮 LLM 决策所需的精简信息。
4. `traceSummary` 可以更详细，但必须脱敏。
5. `fulfillment.role = "consumable"` 的结果才允许作为后续写入或生成依赖。
6. `fulfillment.role = "diagnostic"` 的结果只能用于解释、澄清、阻断或失败说明。

---

## 6. 单一职责 Tool 原则

新 tool 必须只承担一个业务能力。

推荐拆分：

```txt
searchExerciseCandidates
  只检索动作候选并登记 candidate set

getConversationArtifactPayload
  只读取可访问 artifact payload

registerRoutineDraft
  只登记 LLM 产出的 routine draft，不做动作检索

validateRoutineDraft
  只校验已登记 draft，不生成新动作

saveConversationArtifact
  只保存已经通过校验和 policy 的 payload
```

不推荐：

```txt
generateRoutineDraft
  同时理解用户目标、检索候选、补齐动作、生成 routine、校验、保存
```

如果一个 tool 的描述里出现“如果失败则自动补齐”“如果不够则重新检索”“如果已存在则顺便保存”这类逻辑，通常说明职责已经混在一起，应拆分。

---

## 7. defineTool 封装

文件位置：

```txt
lib/server/agent-tools/define-tool.ts
```

```ts
import { Tool } from "./types";

export function defineTool<I, O>(tool: Tool<I, O>): Tool<I, O> {
  return tool;
}
```

`defineTool` 只负责类型收敛，不做业务注册。

---

## 8. Tool Registry 设计

文件位置：

```txt
lib/server/agent-tools/registry.ts
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

Registry 是服务端白名单。LLM 不允许调用 registry 之外的 tool。

---

## 9. 示例 Tool：检索动作候选

文件位置：

```txt
lib/server/agent-tools/exercises/search-exercise-candidates.tool.ts
```

```ts
import { z } from "zod";
import { defineTool } from "../define-tool";
import { searchExercises } from "@/lib/server/exercises/exercise-service";

const inputSchema = z.object({
  filters: z.object({
    bodyRegions: z.array(z.enum(["upper_body", "lower_body", "core", "full_body"])).default([]),
    targetMuscles: z.array(z.string()).default([]),
    equipment: z.array(z.string()).default([]),
    level: z.enum(["beginner", "intermediate", "expert"]).optional(),
    homeRequirements: z.array(z.enum(["no_equipment", "small_space"])).default([]),
  }),
  resultRequirements: z.object({
    minCandidates: z.number().int().min(1).max(20).default(3),
    candidateUse: z.enum(["recommendation", "routine", "plan", "patch", "answer_only"]),
  }),
});

export const searchExerciseCandidatesTool = defineTool({
  name: "searchExerciseCandidates",
  description: "按结构化条件检索动作库候选，并返回可被后续 tool 引用的 exercise_candidate_set。",
  whenToUse: "当 Agent 需要数据库动作候选、动作推荐、训练编排候选或替换动作候选时使用。",
  whenNotToUse: "当 Agent 只是需要解释已经读取到的动作详情时不要使用。",
  inputSchema,
  sideEffect: "read",
  riskLevel: "low",
  permissions: ["exercise:read"],
  requiresConfirmation: false,
  timeoutMs: 8000,
  resourceContract: {
    produces: [
      {
        type: "exercise_candidate_set",
        description: "满足结构化过滤条件的动作候选集合。",
      },
    ],
  },
  examples: [
    {
      userRequest: "给我推荐几个居家练背动作",
      input: {
        filters: {
          bodyRegions: ["upper_body"],
          targetMuscles: ["背部"],
          equipment: [],
          homeRequirements: ["no_equipment"],
        },
        resultRequirements: {
          minCandidates: 3,
          candidateUse: "recommendation",
        },
      },
    },
  ],
  async handler(input, ctx) {
    const result = await searchExercises(input);
    const candidateSetId = `exercise_candidate_set_${ctx.requestId}`;
    const satisfied = result.candidates.length >= input.resultRequirements.minCandidates;

    return {
      ok: true,
      toolResultId: `tool_result_${ctx.requestId}`,
      output: {
        candidateSetId,
        candidates: result.candidates,
        diagnostics: result.diagnostics,
      },
      modelSummary: {
        candidateSetId,
        candidateCount: result.candidates.length,
        candidateUse: input.resultRequirements.candidateUse,
        candidates: result.candidates.map((candidate) => ({
          exerciseId: candidate.id,
          nameZh: candidate.nameZh,
          equipmentZh: candidate.equipmentZh,
          primaryMusclesZh: candidate.primaryMusclesZh,
        })),
      },
      traceSummary: {
        appliedFilters: input.filters,
        diagnostics: result.diagnostics,
      },
      fulfillment: {
        role: satisfied ? "consumable" : "diagnostic",
        satisfied,
        producedResources: satisfied
          ? [{ type: "exercise_candidate_set", id: candidateSetId }]
          : [],
        consumedResources: [],
        unmetRequirements: satisfied ? [] : ["insufficient_candidates"],
        evidence: {
          candidateCount: result.candidates.length,
        },
      },
    };
  },
});
```

注意：这个 tool 不负责决定用户是不是“想练背”，也不生成训练计划。用户语义由 LLM 负责，tool 只执行结构化检索。

---

## 10. 示例 Tool：读取会话 Artifact Payload

文件位置：

```txt
lib/server/agent-tools/artifacts/get-conversation-artifact-payload.tool.ts
```

```ts
import { z } from "zod";
import { defineTool } from "../define-tool";
import { getActiveArtifactPayload } from "@/lib/server/conversation-artifacts/artifact-service";

const inputSchema = z.object({
  artifactId: z.string().min(1),
  allowedArtifactIds: z.array(z.string().min(1)).default([]),
});

export const getConversationArtifactPayloadTool = defineTool({
  name: "getConversationArtifactPayload",
  description: "读取当前用户可访问的 ConversationArtifact 完整 payload，并返回 artifact_payload 资源。",
  whenToUse: "当 Agent 需要查看用户之前生成的训练卡片、推荐卡片或计划详情时使用。",
  whenNotToUse: "当只需要最近 artifact 标题和摘要时不要使用。",
  inputSchema,
  sideEffect: "read",
  riskLevel: "low",
  permissions: ["artifact:read"],
  requiresConfirmation: false,
  resourceContract: {
    requires: [
      {
        type: "conversation_artifact",
        required: false,
        description: "如果 artifactId 来自候选集合，应引用该候选边界。",
      },
    ],
    produces: [
      {
        type: "artifact_payload",
        description: "当前用户可访问的完整 artifact payload。",
      },
    ],
  },
  async handler(input, ctx) {
    if (input.allowedArtifactIds.length > 0 && !input.allowedArtifactIds.includes(input.artifactId)) {
      return {
        ok: false,
        toolResultId: `tool_result_${ctx.requestId}`,
        error: {
          code: "FORBIDDEN_ARTIFACT",
          message: "artifactId 不在允许的候选边界内。",
          retryable: false,
        },
        modelSummary: {
          errorCode: "FORBIDDEN_ARTIFACT",
        },
        traceSummary: {
          artifactId: input.artifactId,
          allowedArtifactIds: input.allowedArtifactIds,
        },
        fulfillment: {
          role: "diagnostic",
          satisfied: false,
          producedResources: [],
          consumedResources: [],
          unmetRequirements: ["artifact_not_allowed"],
        },
      };
    }

    const payload = await getActiveArtifactPayload({
      userId: ctx.userId,
      artifactId: input.artifactId,
    });

    const artifactPayloadId = `artifact_payload_${ctx.requestId}`;

    if (!payload.ok) {
      return {
        ok: false,
        toolResultId: `tool_result_${ctx.requestId}`,
        error: {
          code: payload.code,
          message: payload.message,
          retryable: false,
        },
        modelSummary: {
          artifactPayloadId,
          artifactId: input.artifactId,
          errorCode: payload.code,
        },
        traceSummary: {
          artifactId: input.artifactId,
          payloadStatus: "not_found",
        },
        fulfillment: {
          role: "diagnostic",
          satisfied: false,
          producedResources: [],
          consumedResources: [],
          unmetRequirements: ["artifact_payload_not_found"],
        },
      };
    }

    return {
      ok: true,
      toolResultId: `tool_result_${ctx.requestId}`,
      output: payload,
      modelSummary: {
        artifactPayloadId,
        artifactId: input.artifactId,
        kind: payload.kind,
        title: payload.title,
      },
      traceSummary: {
        artifactId: input.artifactId,
        payloadStatus: "found",
      },
      fulfillment: {
        role: "consumable",
        satisfied: true,
        producedResources: [{ type: "artifact_payload", id: artifactPayloadId }],
        consumedResources: [],
      },
    };
  },
});
```

注意：解析“上一套训练”“刚才那个卡片”应由 LLM 基于上下文选择工具和结构化参数；tool 只验证 artifact 是否可访问。

---

## 11. 示例 Tool：保存会话 Artifact

文件位置：

```txt
lib/server/agent-tools/artifacts/save-conversation-artifact.tool.ts
```

```ts
import { z } from "zod";
import { defineTool } from "../define-tool";
import { createOrUpdateConversationArtifact } from "@/lib/server/conversation-artifacts/artifact-service";
import { resolveResourcePayload } from "@/lib/server/agent-core/result-store";

const inputSchema = z.object({
  payloadResourceId: z.string().min(1),
  validationResultId: z.string().min(1),
  policyDecisionId: z.string().min(1),
  artifactKind: z.enum(["exercise_recommendation", "routine", "plan"]),
});

export const saveConversationArtifactTool = defineTool({
  name: "saveConversationArtifact",
  description: "保存已经通过 validation 和 policy 的会话 artifact payload。",
  whenToUse: "当 Agent 已经拥有可保存 payload、validation_result 和 policy_decision 时使用。",
  whenNotToUse: "当 draft 未校验、policy 未通过或用户还需要确认时不要使用。",
  inputSchema,
  sideEffect: "write",
  riskLevel: "medium",
  permissions: ["artifact:write"],
  requiresConfirmation: false,
  resourceContract: {
    requires: [
      {
        type: "validation_result",
        required: true,
        description: "保存前必须引用通过校验的 validation result。",
      },
      {
        type: "policy_decision",
        required: true,
        description: "保存前必须引用允许写入的 policy decision。",
      },
    ],
    produces: [
      {
        type: "artifact_revision",
        description: "保存完成后的 artifact 或 revision。",
      },
    ],
  },
  async handler(input, ctx) {
    const payload = resolveResourcePayload(ctx, input.payloadResourceId);

    const artifact = await createOrUpdateConversationArtifact({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      messageId: ctx.responseMessageId,
      kind: input.artifactKind,
      payload,
    });

    return {
      ok: true,
      toolResultId: `tool_result_${ctx.requestId}`,
      output: {
        artifactId: artifact.id,
        revisionId: artifact.id,
        artifactKind: input.artifactKind,
      },
      modelSummary: {
        artifactId: artifact.id,
        revisionId: artifact.id,
        artifactKind: input.artifactKind,
      },
      traceSummary: {
        artifactId: artifact.id,
        validationResultId: input.validationResultId,
        policyDecisionId: input.policyDecisionId,
      },
      fulfillment: {
        role: "consumable",
        satisfied: true,
        producedResources: [
          {
            type: "artifact_revision",
            id: artifact.id,
          },
        ],
        consumedResources: [
          {
            type: "validation_result",
            id: input.validationResultId,
          },
          {
            type: "policy_decision",
            id: input.policyDecisionId,
          },
        ],
      },
    };
  },
});
```

注意：保存 tool 不生成 payload，不修复 draft，不重新执行语义判断，只消费已登记资源。

---

## 12. 注册所有 Tools

文件位置：

```txt
lib/server/agent-tools/index.ts
```

```ts
import { ToolRegistry } from "./registry";
import { searchExerciseCandidatesTool } from "./exercises/search-exercise-candidates.tool";
import { getConversationArtifactPayloadTool } from "./artifacts/get-conversation-artifact-payload.tool";
import { saveConversationArtifactTool } from "./artifacts/save-conversation-artifact.tool";

export const toolRegistry = new ToolRegistry();

toolRegistry.register(searchExerciseCandidatesTool);
toolRegistry.register(getConversationArtifactPayloadTool);
toolRegistry.register(saveConversationArtifactTool);
```

后续新增功能时，只需要：

```ts
toolRegistry.register(newTool);
```

前提是 `newTool` 已经声明完整 manifest、schema、resource contract、policy metadata 和 response adapter。

---

## 13. Agent Action 协议

文件位置：

```txt
lib/server/agent-core/types.ts
```

```ts
import { z } from "zod";

export const agentActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("call_tool"),
    toolName: z.string(),
    input: z.unknown(),
    reason: z.string(),
  }),

  z.object({
    type: z.literal("ask_user"),
    question: z.string(),
    suggestions: z.array(z.object({
      label: z.string(),
      message: z.string(),
    })).default([]),
    reason: z.string(),
  }),

  z.object({
    type: z.literal("final_answer"),
    content: z.string(),
    usedToolResultIds: z.array(z.string()).default([]),
  }),
]);

export type AgentAction = z.infer<typeof agentActionSchema>;

export type AgentObservation = {
  toolResultId: string;
  toolName: string;
  ok: boolean;
  role: "consumable" | "diagnostic";
  summary: unknown;
  producedResources: Array<{
    type: string;
    id: string;
  }>;
  errorCode?: string;
};

export type AgentState = {
  runId: string;
  userId: string;
  sessionId: string;
  contextPackage: ContextPackage;
  toolCalls: Array<{
    toolName: string;
    input: unknown;
    reason: string;
    createdAt: string;
  }>;
  observations: AgentObservation[];
  confirmedActionHashes: string[];
};

export type AgentRunResult =
  | {
      type: "answer";
      content: string;
      usedToolResultIds: string[];
      state: AgentState;
    }
  | {
      type: "need_user_input";
      question: string;
      suggestions: Array<{
        label: string;
        message: string;
      }>;
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

`final_answer` 不代表写入成功。是否写入成功必须由 `usedToolResultIds` 指向的成功 tool result 证明。

---

## 14. ContextPackage

Agent 输入上下文必须来自结构化来源。

```ts
export type ContextPackage = {
  latestUserMessage: string;
  recentMessages: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt?: string;
  }>;
  recentArtifacts: Array<{
    artifactId: string;
    kind: string;
    title: string;
    summary?: string;
    updatedAt?: string;
  }>;
  memorySnapshot?: {
    facts: string[];
    preferences: string[];
    avoidances: string[];
    equipment?: string[];
  };
  provenance: Array<{
    sourceKind: string;
    sourceId: string;
    trustLevel: "user_supplied" | "database_summary" | "structured_fact" | "derived_summary";
    visibleCharCount: number;
  }>;
};
```

规则：

1. `conversationSummary` 只能作为后台摘要或可选 `ContextSnapshot`，不能作为执行事实源。
2. 需要完整 artifact payload 时必须调用 artifact tool。
3. 需要动作事实时必须调用 exercise tool。
4. 需要保存结果时必须引用当前 run 中已登记的资源。

---

## 15. Agent Prompt

文件位置：

```txt
lib/server/agent-core/prompts.ts
```

```ts
export const systemPrompt = `
你是 AI 健身聊天助手的 agent planner。

你负责理解用户语义、选择合适工具、决定是否继续调用工具、询问用户或给出最终回答。

你必须遵守：

1. 只调用可用 tools 列表中的工具。
2. 不要编造 tool。
3. 调用 tool 时，input 必须符合 inputSchema。
4. Tool 只执行结构化输入，不会替你理解用户自然语言。
5. 信息不足时，使用 ask_user。
6. 对写操作、高风险操作、外部副作用操作，不要假设用户已经确认。
7. 不要声称已经生成、保存或修改训练结果，除非你引用了对应成功 tool result。
8. 不要把 failed 或 diagnostic tool result 当成可消费资源。
9. 不要把内部 tool 名称暴露给用户，除非用户明确询问技术细节。
10. 你的输出必须是 AgentAction JSON。
`;
```

Planner 输入必须包含：

```txt
ContextPackage
可用 tools 的精简 manifest
已有 observations
当前预算
```

不应包含：

```txt
完整 tool raw data
完整数据库记录
无关 UI 展示字段
过长 trace 诊断
```

---

## 16. Tool 序列化

文件位置：

```txt
lib/server/agent-core/planner.ts
```

```ts
function serializeTool(tool: Tool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toJsonSchemaSummary(tool.inputSchema),
    whenToUse: tool.whenToUse,
    whenNotToUse: tool.whenNotToUse,
    sideEffect: tool.sideEffect,
    riskLevel: tool.riskLevel,
    requiresConfirmation: tool.requiresConfirmation,
    resourceContract: tool.resourceContract,
    examples: tool.examples,
  };
}
```

Schema 摘要必须保留：

```txt
required
enum
const
array items
discriminated union variants
object nested properties
min / max / default
```

不能为了省 token 把执行关键字段瘦掉。

---

## 17. LLM Service 抽象

文件位置：

```txt
lib/server/ai/llm-service.ts
```

```ts
import { z } from "zod";

export type GenerateObjectInput<T> = {
  schema: z.ZodType<T>;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  traceMetadata?: Record<string, unknown>;
};

export type LlmService = {
  generateObject<T>(input: GenerateObjectInput<T>): Promise<T>;
};
```

业务代码不应直接依赖具体 SDK。模型供应商切换应发生在 `LlmService` 实现层。

---

## 18. Policy Guard

文件位置：

```txt
lib/server/agent-core/policy.ts
```

```ts
import { AgentAction } from "./types";
import { Tool } from "@/lib/server/agent-tools/types";
import { createActionHash } from "./state";

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
    return { allowed: false, reason: "TOOL_NOT_FOUND" };
  }

  if (tool.permissions?.length) {
    const hasAllPermissions = tool.permissions.every((permission) =>
      ctx.permissions.includes(permission),
    );

    if (!hasAllPermissions) {
      return { allowed: false, reason: "NO_PERMISSION" };
    }
  }

  const actionHash = createActionHash(action);
  const risky =
    tool.sideEffect === "write" ||
    tool.sideEffect === "external" ||
    tool.riskLevel === "high" ||
    tool.requiresConfirmation;

  if (risky && !ctx.confirmedActionHashes.includes(actionHash)) {
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
```

Policy Guard 只判断权限、风险和确认，不替 LLM 解释用户语义。

---

## 19. Executor

文件位置：

```txt
lib/server/agent-core/executor.ts
```

```ts
import { Tool, ToolContext, ToolResult } from "@/lib/server/agent-tools/types";
import { withTimeout } from "./timeout";

export async function executeTool(params: {
  tool: Tool;
  input: unknown;
  ctx: ToolContext;
}): Promise<ToolResult> {
  const { tool, input, ctx } = params;
  const parsed = tool.inputSchema.safeParse(input);

  if (!parsed.success) {
    return createDiagnosticToolResult({
      toolName: tool.name,
      code: "INVALID_ARGUMENTS",
      message: parsed.error.message,
      retryable: true,
      ctx,
    });
  }

  try {
    return await withTimeout(
      tool.handler(parsed.data, ctx),
      tool.timeoutMs ?? 10000,
    );
  } catch (error) {
    return createDiagnosticToolResult({
      toolName: tool.name,
      code: "TOOL_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
      retryable: false,
      ctx,
    });
  }
}
```

Executor 不知道业务工具名，只知道 schema、timeout、handler 和 result contract。

---

## 20. Tool Retriever

文件位置：

```txt
lib/server/agent-core/retriever.ts
```

Tool Retriever 的目标是减少模型一次看到的工具数量，但不能通过服务端关键词判断用户意图。

推荐策略：

```txt
1. 先按权限过滤 tools
2. 再按 tool manifest 做轻量召回
3. tools 数量较少时可直接返回全部可用 tools
4. tools 超过阈值后使用 embedding / BM25 / manifest tags 做召回
```

禁止：

```txt
服务端根据用户原文判断这是 routine / recommendation / patch
服务端基于关键词强制选择某个业务 tool
服务端把 LLM 的语义规划改写成另一个 action
```

---

## 21. State 与 Observation

文件位置：

```txt
lib/server/agent-core/state.ts
```

```ts
export function appendToolResult(
  state: AgentState,
  params: {
    toolName: string;
    input: unknown;
    result: ToolResult;
  },
): AgentState {
  return {
    ...state,
    toolCalls: [
      ...state.toolCalls,
      {
        toolName: params.toolName,
        input: params.input,
        reason: "",
        createdAt: new Date().toISOString(),
      },
    ],
    observations: [
      ...state.observations,
      {
        toolResultId: params.result.toolResultId,
        toolName: params.toolName,
        ok: params.result.ok,
        role: params.result.fulfillment.role,
        summary: params.result.modelSummary,
        producedResources: params.result.fulfillment.producedResources,
        errorCode: params.result.ok ? undefined : params.result.error.code,
      },
    ],
  };
}
```

Observation 只能放模型下一轮需要看的摘要。完整 payload 留在服务端 result store、数据库或 trace 中。

---

## 22. Orchestrator 主流程

文件位置：

```txt
lib/server/agent-core/orchestrator.ts
```

```ts
export async function runAgent(params: {
  contextPackage: ContextPackage;
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
      contextPackage: params.contextPackage,
      tools: availableTools,
      topK: 12,
    });

    const action = await planNextAction({
      contextPackage: params.contextPackage,
      state,
      tools: candidateTools,
      remainingSteps: maxSteps - step,
    });

    if (action.type === "final_answer") {
      return validateAndReturnFinalAnswer(action, state);
    }

    if (action.type === "ask_user") {
      return {
        type: "need_user_input",
        question: action.question,
        suggestions: action.suggestions,
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

      state = appendPolicyObservation(state, action, policy);
      continue;
    }

    if (!tool) {
      state = appendUnknownToolObservation(state, action);
      continue;
    }

    const result = await executeTool({
      tool,
      input: action.input,
      ctx: params.ctx,
    });

    state = appendToolResult({
      state,
      toolName: action.toolName,
      input: action.input,
      result,
    });
  }

  return {
    type: "answer",
    content: "这次没有得到稳定结果，我没有生成或修改训练内容。",
    usedToolResultIds: [],
    state,
  };
}
```

这个主流程不允许出现任何业务工具名。

---

## 23. Response Adapter

文件位置：

```txt
lib/server/agent-core/response-adapter.ts
```

Response Adapter 负责把 `AgentRunResult` 和被引用的 tool results 转成前端聊天流。

```txt
AgentRunResult.answer
  -> content
  -> assistant_suggestions
  -> artifact events
  -> done

AgentRunResult.need_user_input
  -> content
  -> assistant_suggestions
  -> done

AgentRunResult.need_confirmation
  -> content
  -> confirmation_required
  -> done
```

规则：

1. Adapter 不重新解释用户语义。
2. Adapter 不调用业务 tool。
3. Adapter 不承诺未执行写入。
4. Adapter 只能根据成功 tool result 的 response projection 输出 artifact/card event。
5. 新 artifact 类型必须新增对应 response adapter，而不是修改 orchestrator。

---

## 24. `/api/chat` 接入

文件位置：

```txt
app/api/chat/route.ts
```

`/api/chat` 仍然负责：

```txt
认证
请求体 Zod 校验
读取 saved conversation
读取 recent artifact summaries
构造 ContextPackage
启动 trace
调用 runAgent
返回 NDJSON stream
```

`/api/chat` 不负责：

```txt
判断用户意图
选择业务 tool
生成训练计划
保存 artifact
修复模型输出语义
```

---

## 25. 高风险操作确认流程

当 Agent 返回：

```ts
{
  type: "need_confirmation",
  message: "这个操作会保存新的训练计划，请确认是否继续。",
  confirmationToken: "...",
  pendingAction: {...},
  state: {...}
}
```

前端展示确认按钮。

用户确认后，把 `confirmationToken` 加入 state：

```ts
const nextState = {
  ...state,
  confirmedActionHashes: [
    ...state.confirmedActionHashes,
    confirmationToken,
  ],
};
```

然后再次调用 `/api/chat`。

确认的是完整 action hash，不是 toolName。这样可以避免用户确认的是保存 A 计划，系统执行保存 B 计划。

---

## 26. 新增 Tool 的标准流程

新增业务能力时，不修改 orchestrator。

只做这些事：

```txt
1. 新建 xxx.tool.ts
2. 写 description / whenToUse / whenNotToUse
3. 写 inputSchema / outputSchema
4. 声明 resourceContract
5. 声明 sideEffect / riskLevel / permissions / confirmation
6. 写单一职责 handler
7. 写 modelSummary / traceSummary / fulfillment
8. 注册到 toolRegistry
9. 如有用户可见新结果，新增 response adapter
10. 补对应测试和黑盒验收
```

---

## 27. 不推荐的设计

不要在 orchestrator 里写业务判断。

不推荐：

```ts
if (toolName === "searchExercises") {
  emitActivity("querying_exercises");
} else if (toolName === "generateRoutineDraft") {
  emitActivity("generating_workout");
} else if (toolName === "saveConversationArtifactRevision") {
  emitActivity("saving_result");
}
```

不推荐：

```ts
if (finalResult.status === "generated" && !revisionId) {
  recommendedNextTool = "saveConversationArtifactRevision";
}
```

不推荐：

```ts
if (userText.includes("练背")) {
  callSearchExercises({ targetMuscles: ["背部"] });
}
```

正确做法：

```txt
业务规则放进 tool handler
工具选择交给 LLM Planner
权限和确认交给 Policy Guard
用户可见输出交给 Response Adapter
Orchestrator 只执行通用循环
```

---

## 28. 第一阶段完整闭环范围

第一阶段应直接做完整可用闭环，不做临时占位。

范围：

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
15. 至少覆盖动作推荐、读取 artifact、保存 artifact 三类基础工具
```

暂不做：

```txt
1. 多 Agent 协作
2. 自动反思
3. 分布式任务队列
4. 任意 SQL / 任意函数调用
5. 服务端关键词意图分流
```

---

## 29. 后续增强方向

### 29.1 Tool Retrieval 升级

当 tools 超过 20 个后，不建议每次把所有 tools 都塞给 LLM。

可以升级为：

```txt
ContextPackage
  ↓
tool manifest embedding / BM25
  ↓
topK tools
  ↓
交给 Planner
```

### 29.2 Observation 压缩

不要把 tool 的 raw data 全部塞回 LLM。

推荐格式：

```ts
type Observation = {
  toolResultId: string;
  toolName: string;
  ok: boolean;
  role: "consumable" | "diagnostic";
  summary: unknown;
  producedResources: AgentResourceRef[];
  dataRef?: string;
};
```

完整数据可以放当前 run state、数据库或对象存储里。

### 29.3 Middleware 化

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
  name: "fitness-chat-agent",
  llm,
  registry,
  maxSteps: 8,
  toolRetriever,
  policyGuards: [
    permissionGuard,
    confirmationGuard,
    riskGuard,
  ],
  responseAdapters: [
    exerciseRecommendationAdapter,
    conversationArtifactAdapter,
    confirmationAdapter,
  ],
  observers: [
    aiTraceLogger,
    blackboxReplayLogger,
  ],
});
```

---

## 30. 最终设计原则

最重要的一句话：

```txt
Orchestrator 只管通用流程，
Tool 负责单一业务能力，
Policy 负责权限和风险边界，
LLM 负责语义规划，
Response Adapter 负责真实结果投影。
```

新增能力时，理想流程应该是：

```txt
新增 tool 文件
  ↓
声明 manifest / schema / resource contract / policy metadata
  ↓
实现单一职责 handler
  ↓
注册到 registry
  ↓
如有新用户可见结果则新增 response adapter
  ↓
Agent 自动获得新能力
```

不要把 Agent 写成一堆业务分支。项目后期的扩展性来自清晰的 tool contract，而不是越来越复杂的 orchestrator。
