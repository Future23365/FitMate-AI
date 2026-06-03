import { z, type ZodTypeAny } from "zod";

import type { AgentErrorCode } from "./errors";

/** JsonValue 是 manifest、projection 和 stream event 可安全序列化字段的基础类型。 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** AgentActor 描述本次 Agent run 的调用主体，M0 只透传身份边界，不做权限判断。 */
export type AgentActor = {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  permissions?: string[];
};

/** AgentMessage 是 Planner 可见的上游对话输入，core 不解释自然语言语义。 */
export type AgentMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** AgentRuntimeLimits 约束 M0 Runtime 的确定性循环、超时和重复失败熔断边界。 */
export type AgentRuntimeLimits = {
  maxSteps?: number;
  maxPlannerCalls?: number;
  maxToolCalls?: number;
  maxInvalidActions?: number;
  duplicateFailureLimit?: number;
  perToolTimeoutMs?: number;
  overallTimeoutMs?: number;
};

/** AgentRunInput 是 Runtime 的入口合同，保持模型、业务 tool 和生产聊天链路解耦。 */
export type AgentRunInput = {
  runId: string;
  actor: AgentActor;
  userInput: string;
  messages?: AgentMessage[];
  metadata?: Record<string, JsonValue>;
  limits?: AgentRuntimeLimits;
};

/** ResourceRole 区分可被下游消费的业务资源和只能解释失败的诊断证据。 */
export type ResourceRole = "consumable" | "diagnostic";

/** AgentResourceRef 是 Planner 和 Runtime 之间传递已登记资源引用的最小安全形状。 */
export type AgentResourceRef = {
  resourceId: string;
  resourceType?: string;
  role?: ResourceRole;
  runId?: string;
  version?: string;
  schemaVersion?: string;
};

const agentResourceRefSchema = z.object({
  resourceId: z.string().min(1),
  resourceType: z.string().min(1).optional(),
  role: z.enum(["consumable", "diagnostic"]).optional(),
  runId: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  schemaVersion: z.string().min(1).optional(),
}).strict();

/** RegisteredResource 是当前 run 内 ResourceStore 已验收资源的事实记录。 */
export type RegisteredResource = {
  resourceId: string;
  resourceType: string;
  role: ResourceRole;
  runId: string;
  sourceToolResultId: string;
  schemaVersion: string;
  summary: JsonValue;
  version?: string;
  createdAt: string;
  expiresAt?: string;
};

/** RegisterResourceInput 是 tool 执行后声明待登记资源时允许提交的安全字段。 */
export type RegisterResourceInput = {
  resourceId: string;
  resourceType: string;
  role: ResourceRole;
  schemaVersion: string;
  summary: JsonValue;
  version?: string;
  expiresAt?: string;
};

/** ToolResourceRequirement 描述 tool 执行前必须消费的资源类型与角色边界。 */
export type ToolResourceRequirement = {
  resourceType: string;
  role?: ResourceRole;
  required?: boolean;
  minCount?: number;
};

/** ToolResourceProduction 描述 tool 成功或诊断性执行后允许产出的资源类型与角色。 */
export type ToolResourceProduction = {
  resourceType: string;
  role: ResourceRole;
  schemaVersion?: string;
};

/** ToolResourceContract 是 M1 Resource Contract Validator 校验 requires/produces 的共享合同。 */
export type ToolResourceContract = {
  requires?: ToolResourceRequirement[];
  produces?: ToolResourceProduction[];
};

/** ResourceStoreReader 是 handler 可见的只读资源接口，避免 tool 绕过 Runtime 自行登记资源。 */
export type ResourceStoreReader = {
  get(ref: AgentResourceRef): RegisteredResource | undefined;
  list(query?: { role?: ResourceRole; resourceType?: string }): RegisteredResource[];
  assertRegistered(ref: AgentResourceRef): RegisteredResource;
  assertConsumable(ref: AgentResourceRef, requirement?: ToolResourceRequirement): RegisteredResource;
  inventory(): Array<{ ref: AgentResourceRef; summary: JsonValue }>;
};

/** ResourceRequirementFailure 记录资源合同未满足时的结构化摘要。 */
export type ResourceRequirementFailure = {
  resourceType?: string;
  resourceId?: string;
  role?: ResourceRole;
  reason: AgentErrorCode;
  message: string;
};

/** ToolCallAction 是 Planner 请求执行已注册 tool 的唯一 M0 动作。 */
export const ToolCallActionSchema = z.object({
  type: z.literal("tool_call"),
  toolName: z.string().min(1),
  input: z.unknown(),
  consumes: z.array(agentResourceRefSchema).optional(),
  rationale: z.string().optional(),
}).strict();

/** FinalAnswerAction 是 Planner 以最终回答收口时使用的终止动作。 */
export const FinalAnswerActionSchema = z.object({
  type: z.literal("final_answer"),
  content: z.string().min(1),
  usedToolResultIds: z.array(z.string().min(1)).optional(),
  usedResourceRefs: z.array(agentResourceRefSchema).optional(),
  assistantSuggestions: z.array(z.string().min(1)).optional(),
}).strict();

/** AskUserAction 是 Planner 需要用户补充信息时使用的终止动作。 */
export const AskUserActionSchema = z.object({
  type: z.literal("ask_user"),
  question: z.string().min(1),
  suggestions: z.array(z.string().min(1)).optional(),
  usedToolResultIds: z.array(z.string().min(1)).optional(),
  usedResourceRefs: z.array(agentResourceRefSchema).optional(),
}).strict();

/** AgentActionSchema 将 M0 action 限定为 tool_call、final_answer 和 ask_user 三类。 */
export const AgentActionSchema = z.discriminatedUnion("type", [
  ToolCallActionSchema,
  FinalAnswerActionSchema,
  AskUserActionSchema,
]);

export type ToolCallAction = z.infer<typeof ToolCallActionSchema>;
export type FinalAnswerAction = z.infer<typeof FinalAnswerActionSchema>;
export type AskUserAction = z.infer<typeof AskUserActionSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type TerminalAgentAction = FinalAnswerAction | AskUserAction;

/** ToolPolicy 描述 tool 的副作用、风险、权限和确认策略，M1 由 Policy Guard 统一裁决。 */
export type ToolPolicy = {
  sideEffect: "read" | "write";
  riskLevel: "low" | "medium" | "high";
  confirmation: "never" | "required" | "always" | "dynamic";
  permissions?: string[];
  policyVersion?: string;
  confirmationMessage?: string;
  confirmationExpiresInMs?: number;
  timeoutMs?: number;
};

/** ToolHandlerContext 是 Executor 调用 handler 时注入的运行上下文、取消信号和只读资源接口。 */
export type ToolHandlerContext = {
  runId: string;
  actor: AgentActor;
  toolCallId: string;
  signal: AbortSignal;
  metadata?: Record<string, JsonValue>;
  resources?: ResourceStoreReader;
  consumedResources?: AgentResourceRef[];
};

/** ToolProjectionContext 为 tool 输出生成模型/用户安全投影提供只读上下文。 */
export type ToolProjectionContext = Omit<ToolHandlerContext, "signal">;

/** ToolExample 是模型可见的安全示例，只允许暴露输入和说明，不携带 handler 输出。 */
export type ToolExample = {
  description: string;
  input: JsonValue;
};

/** Tool 定义单个可审计能力单元，handler 留在服务端，manifest 只暴露安全字段。 */
export type Tool<Input = any, Output = any> = {
  name: string;
  version: string;
  description: string;
  whenToUse: string;
  whenNotToUse: string;
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  policy: ToolPolicy;
  resourceContract?: ToolResourceContract;
  examples?: ToolExample[];
  handler: (input: Input, context: ToolHandlerContext) => Promise<Output> | Output;
  toResources?: (output: Output, context: ToolProjectionContext) => RegisterResourceInput[];
  toFulfillment?: (output: Output, context: ToolProjectionContext) => Partial<ToolFulfillment>;
  toModelObservation?: (output: Output, context: ToolProjectionContext) => JsonValue;
  toUserProjection?: (output: Output, context: ToolProjectionContext) => JsonValue;
};

/** AnyTool 是 registry/executor 存储已校验 tool 时使用的类型擦除边界。 */
export type AnyTool = Tool<any, any>;

/** ToolManifest 是 Planner 唯一可见的 tool 合同视图，不包含 handler 或服务端对象。 */
export type ToolManifest = {
  name: string;
  version: string;
  description: string;
  whenToUse: string;
  whenNotToUse: string;
  inputJsonSchema: JsonValue;
  outputJsonSchema: JsonValue;
  policyHint: Pick<ToolPolicy, "sideEffect" | "riskLevel" | "confirmation">;
  resourceContract?: ToolResourceContract;
  examples?: ToolExample[];
};

/** ToolError 是 Executor、Validator 和 Runtime 对失败结果的统一归一化形状。 */
export type ToolError = {
  code: AgentErrorCode;
  message: string;
  retryable: boolean;
  details?: JsonValue;
};

/** ToolFulfillment 总结一次 tool 调用是否满足资源合同，供 renderer 和 trace 类测试读取。 */
export type ToolFulfillment = {
  summary: string;
  satisfied: boolean;
  producedResources?: AgentResourceRef[];
  consumedResources?: AgentResourceRef[];
  unmetRequirements?: ResourceRequirementFailure[];
};

/** ToolResult 是 M0 工具执行后的唯一结果合同，成功与失败都带稳定 id 和摘要。 */
export type ToolResult<Output = unknown> = {
  toolResultId: string;
  toolName: string;
  toolVersion: string;
  toolCallId: string;
  normalizedInputHash: string;
  startedAt: string;
  completedAt: string;
} & (
  | {
      ok: true;
      output: Output;
      projection: {
        model?: JsonValue;
        user?: JsonValue;
      };
      fulfillment: ToolFulfillment;
    }
  | {
      ok: false;
      error: ToolError;
      fulfillment: ToolFulfillment;
    }
);

/** AgentObservation 是 Runtime 回传给 Planner 的安全观察值，不承载完整 tool output。 */
export type AgentObservation = {
  type: "tool_result" | "invalid_action" | "runtime_error";
  source: "tool" | "validator" | "runtime";
  toolResultId?: string;
  toolName?: string;
  ok: boolean;
  content: JsonValue;
};

/** PolicyDecision 是 Policy Guard 在 Executor 前输出的唯一策略裁决。 */
export type PolicyDecision =
  | { kind: "allow"; policyVersion: string; reason: string }
  | { kind: "deny"; policyVersion: string; error: ToolError }
  | { kind: "requires_confirmation"; policyVersion: string; message: string; expiresAt: string };

/** PendingAction 保存服务端已验收但等待用户确认的 tool_call，不信任客户端重传 input。 */
export type PendingAction = {
  pendingActionId: string;
  actionHash: string;
  runId: string;
  actor: AgentActor;
  toolName: string;
  toolVersion: string;
  toolCall: ToolCallAction;
  inputHash: string;
  resourceRefs: AgentResourceRef[];
  policyVersion: string;
  status: "pending" | "consumed" | "expired";
  createdAt: string;
  expiresAt: string;
  message: string;
};

/** ConfirmationRequest 是 renderer 可安全输出的确认请求白名单摘要。 */
export type ConfirmationRequest = {
  pendingActionId: string;
  actionHash: string;
  expiresAt: string;
  message: string;
  toolName: string;
};

/** ConfirmationResumeInput 是 core resume 入口接受的最小确认输入。 */
export type ConfirmationResumeInput = {
  pendingActionId: string;
  actionHash: string;
  run: AgentRunInput;
  clientAction?: unknown;
};

/** AgentTraceEvent 是 M1 fixture 用来断言资源、策略和确认链路的安全摘要。 */
export type AgentTraceEvent =
  | { type: "resource_registered"; toolResultId: string; resource: AgentResourceRef; summary: JsonValue }
  | { type: "policy_decision"; toolName: string; decision: PolicyDecision["kind"]; policyVersion: string }
  | { type: "confirmation_request"; request: ConfirmationRequest }
  | { type: "confirmation_resume"; pendingActionId: string; status: "consumed" }
  | { type: "terminal_grounding"; actionType: TerminalAgentAction["type"]; usedResourceRefs: AgentResourceRef[] };

/** AgentRunResult 是 Runtime loop 的收口结果，renderer 只消费这个已校验结构。 */
export type AgentRunResult = {
  runId: string;
  status: "completed" | "needs_input" | "failed" | "requires_confirmation";
  terminalAction?: TerminalAgentAction;
  terminalError?: ToolError;
  confirmationRequest?: ConfirmationRequest;
  toolResults: ToolResult[];
  observations: AgentObservation[];
  traceEvents: AgentTraceEvent[];
  steps: number;
};

/** AgentStreamEvent 是默认 Response Renderer 允许输出的 NDJSON 白名单事件。 */
export type AgentStreamEvent =
  | { type: "content"; content: string }
  | { type: "tool_result"; toolResultId: string; toolName: string; content: JsonValue }
  | { type: "confirmation_request"; pendingActionId: string; actionHash: string; expiresAt: string; message: string; toolName: string }
  | { type: "assistant_suggestions"; suggestions: string[] }
  | { type: "error"; error: ToolError }
  | { type: "done" };

/** parseAgentAction 在 runtime 边界把 Planner 输出收敛为 M0 AgentAction。 */
export function parseAgentAction(action: unknown) {
  return AgentActionSchema.safeParse(action);
}
