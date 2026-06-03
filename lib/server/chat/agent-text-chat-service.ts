import "server-only";

import { randomUUID } from "node:crypto";

import { createToolError } from "@/lib/server/agent-core/action-validator";
import type {
  AgentResourceRef,
  AgentRunInput,
  AgentRunResult,
  AgentStreamEvent,
  AgentTraceEvent,
  JsonValue,
  ToolError,
} from "@/lib/server/agent-core/contracts";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { redactJsonValue } from "@/lib/server/agent-core/redaction";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import { DeepSeekModelAdapter } from "@/lib/server/agent-planners/model-adapters/deepseek-model-adapter";
import type { PlannerPort } from "@/lib/server/agent-core/planner-port";
import {
  startAiTrace,
  summarizeLatestUserMessage,
  type AiTraceLogger,
} from "@/lib/server/dev/ai-trace-logger";
import type { AiRunFinalDecision, AiTraceStatus } from "@/lib/server/dev/ai-trace-store";
import type { CurrentUser } from "@/lib/server/users/current-user";

import type { PreparedChatRequest } from "./chat-service";

const CHAT_TEXT_FLOW_CONFIG_ERROR_CODE = "chat_ai_not_configured";
const agentTextChatRoute = "/api/chat";
const ndjsonContentType = "application/x-ndjson; charset=utf-8";
const maxTraceSummaryLength = 600;
const unsupportedCapabilityMessage = "目前还不能直接生成、保存或执行训练计划。我可以先帮你梳理训练目标、解释动作和训练原则，或整理需要补充的信息。";
const genericChatFailureMessage = "聊天生成失败，请稍后重试。";
const chatServiceUnavailableMessage = "聊天服务暂时不可用，请稍后再试。";
const unsupportedCapabilitySuggestions = [
  "先帮我梳理训练目标",
  "解释一个动作怎么做",
  "我需要补充哪些信息",
];
const directUnsupportedErrorCodes = new Set<string>([
  AGENT_ERROR_CODES.UNKNOWN_TOOL,
  AGENT_ERROR_CODES.UNSUPPORTED_M0_CAPABILITY,
  AGENT_ERROR_CODES.MAX_TOOL_CALLS_EXCEEDED,
]);
const unsupportedRepairReasonCodes = new Set<string>([
  ...directUnsupportedErrorCodes,
  AGENT_ERROR_CODES.INVALID_ACTION,
  AGENT_ERROR_CODES.BUDGET_EXHAUSTED,
]);

type AgentTextChatConfigError = {
  code: typeof CHAT_TEXT_FLOW_CONFIG_ERROR_CODE;
  message: string;
  retryable: false;
  details?: JsonValue;
};

type AgentTextChatStreamEvent =
  | AgentStreamEvent
  | { type: "error"; error: AgentTextChatConfigError };

type AgentTextChatResponseSummary = ReturnType<typeof summarizeAgentTextChatResponseEvents>;

type PlannerFactoryResult =
  | { ok: true; planner: PlannerPort }
  | { ok: false; error: AgentTextChatConfigError };

type PlannerFactory = () => PlannerFactoryResult;

export type CreateAgentTextChatResponseInput = {
  request: PreparedChatRequest;
  currentUser: CurrentUser;
  planner?: PlannerPort;
  plannerFactory?: PlannerFactory;
};

type DeepSeekPlannerFactoryInput = {
  env?: Partial<Pick<NodeJS.ProcessEnv, "DEEPSEEK_API_KEY" | "DEEPSEEK_API_URL" | "DEEPSEEK_MODEL">>;
  fetchImpl?: typeof fetch;
};

// createAgentTextChatResponse 是 /api/chat 到 agent-core 的薄接入层，只负责构造 run、空 registry 和 NDJSON 投影。
export async function createAgentTextChatResponse(input: CreateAgentTextChatResponseInput): Promise<Response> {
  const registry = createEmptyProductionTextChatRegistry();
  const run = createAgentTextChatRunInput({
    request: input.request,
    currentUser: input.currentUser,
  });
  const trace = startAgentTextChatTrace({
    request: input.request,
    currentUser: input.currentUser,
    run,
    registry,
  });

  const plannerResult = input.planner
    ? { ok: true as const, planner: input.planner }
    : (input.plannerFactory ?? createProductionAgentTextChatPlanner)();

  if (!plannerResult.ok) {
    const events: AgentTextChatStreamEvent[] = [
      createSafeAgentTextChatErrorEvent(plannerResult.error),
      { type: "done" },
    ];

    recordAgentTextChatConfigFailureTrace({
      trace,
      error: plannerResult.error,
      events,
    });

    return createAgentTextChatNdjsonResponse(events, { status: 503 });
  }

  let result: AgentRunResult;

  try {
    result = await runAgentRuntime({
      registry,
      planner: plannerResult.planner,
      run,
    });
  } catch (error) {
    const runtimeError = createUnexpectedRuntimeError(error);
    const events: AgentTextChatStreamEvent[] = [
      createSafeRuntimeErrorEvent(runtimeError),
      { type: "done" },
    ];

    recordAgentTextChatRuntimeExceptionTrace({
      trace,
      error: runtimeError,
      events,
    });

    return createAgentTextChatNdjsonResponse(events, { status: 500 });
  }

  const events = renderAgentTextChatResponseEvents({
    result,
    registry,
  });

  recordAgentTextChatRuntimeResultTrace({
    trace,
    result,
    registry,
    events,
  });

  return createAgentTextChatNdjsonResponse(events);
}

// createProductionAgentTextChatPlanner 是生产 DeepSeek planner 的唯一构造入口，缺配置时返回稳定配置错误。
export function createProductionAgentTextChatPlanner(
  input: DeepSeekPlannerFactoryInput = {},
): PlannerFactoryResult {
  const env = input.env ?? process.env;
  const apiKey = readOptionalEnv(env.DEEPSEEK_API_KEY);

  if (!apiKey) {
    return {
      ok: false,
      error: createConfigurationError(["DEEPSEEK_API_KEY"]),
    };
  }

  return {
    ok: true,
    planner: new LlmPlanner(new DeepSeekModelAdapter({
      apiKey,
      endpoint: readOptionalEnv(env.DEEPSEEK_API_URL),
      model: readOptionalEnv(env.DEEPSEEK_MODEL),
      fetchImpl: input.fetchImpl,
    })),
  };
}

// createAgentTextChatRunInput 把服务端 hydration 事实投影给 Planner，不引入业务 tool 或自然语言分流。
export function createAgentTextChatRunInput(input: {
  request: PreparedChatRequest;
  currentUser: CurrentUser;
}): AgentRunInput {
  const latestUserMessage = getLatestUserMessage(input.request);

  return {
    runId: `chat_${input.request.responseMessageId ?? randomUUID()}`,
    actor: {
      userId: input.currentUser.id,
      sessionId: input.request.conversationId,
      requestId: input.request.responseMessageId,
    },
    userInput: latestUserMessage,
    messages: input.request.rawMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    metadata: {
      conversationId: input.request.conversationId ?? null,
      responseMessageId: input.request.responseMessageId ?? null,
      conversationSummary: input.request.conversationSummaryContext.summary,
      hasClientConversationSummary: input.request.hasClientConversationSummary,
      thinkingEnabled: input.request.thinkingEnabled,
      hydration: input.request.hydration as unknown as JsonValue,
    },
    limits: {
      maxSteps: 4,
      maxPlannerCalls: 4,
      maxToolCalls: 0,
      maxInvalidActions: 1,
      maxRepairAttempts: 1,
      overallTimeoutMs: 40_000,
      perToolTimeoutMs: 1_000,
    },
  };
}

// createEmptyProductionTextChatRegistry 明确表达本阶段没有任何生产业务 tool 可执行。
export function createEmptyProductionTextChatRegistry() {
  return new ToolRegistry();
}

// createAgentTextChatNdjsonResponse 保持 /api/chat 输出为前端可逐行消费的 NDJSON 白名单事件。
export function createAgentTextChatNdjsonResponse(
  events: AgentTextChatStreamEvent[],
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", ndjsonContentType);
  headers.set("Cache-Control", "no-store");

  return new Response(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, {
    ...init,
    headers,
  });
}

function renderAgentTextChatResponseEvents(input: {
  result: AgentRunResult;
  registry: ToolRegistry;
}): AgentTextChatStreamEvent[] {
  if (isUnsupportedCapabilityFailure(input)) {
    return [
      { type: "content", content: unsupportedCapabilityMessage },
      { type: "assistant_suggestions", suggestions: unsupportedCapabilitySuggestions },
      { type: "done" },
    ];
  }

  return renderAgentResponseEvents(input.result);
}

function isUnsupportedCapabilityFailure(input: {
  result: AgentRunResult;
  registry: ToolRegistry;
}) {
  const error = input.result.terminalError;

  if (!error || input.result.status !== "failed") {
    return false;
  }

  if (directUnsupportedErrorCodes.has(error.code)) {
    return true;
  }

  const registryEmpty = isProductionTextChatRegistryEmpty(input);
  const attemptedToolCall = input.result.traceEvents.some(
    (event) => event.type === "planner_action" && event.actionType === "tool_call",
  );

  if (!registryEmpty || !attemptedToolCall) {
    return false;
  }

  if (error.code === AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED) {
    return true;
  }

  return hasUnsupportedTraceReason(input.result) || getLastValidationCode(error.details) !== undefined;
}

function isProductionTextChatRegistryEmpty(input: {
  result: AgentRunResult;
  registry: ToolRegistry;
}) {
  return input.registry.serializeForPlanner().length === 0
    || input.result.registrySnapshot?.tools.length === 0
    || input.result.traceEvents.some((event) => event.type === "registry_snapshot" && event.toolCount === 0);
}

function hasUnsupportedTraceReason(result: AgentRunResult) {
  return result.traceEvents.some((event) => {
    if (event.type === "validation_result" && event.code) {
      return unsupportedRepairReasonCodes.has(event.code);
    }

    if (event.type === "budget_event" && event.reason) {
      return unsupportedRepairReasonCodes.has(event.reason);
    }

    return false;
  });
}

function getLastValidationCode(details: JsonValue | undefined) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }

  const lastCode = details.lastCode;
  return typeof lastCode === "string" && unsupportedRepairReasonCodes.has(lastCode)
    ? lastCode
    : undefined;
}

function createSafeAgentTextChatErrorEvent(
  error: AgentTextChatConfigError,
): Extract<AgentTextChatStreamEvent, { type: "error" }> {
  return {
    type: "error",
    error: {
      ...error,
      message: getSafeAgentTextChatErrorMessage(error.code),
    },
  };
}

function getSafeAgentTextChatErrorMessage(code?: string) {
  if (code === CHAT_TEXT_FLOW_CONFIG_ERROR_CODE) {
    return chatServiceUnavailableMessage;
  }

  return genericChatFailureMessage;
}

function createConfigurationError(missing: string[]): AgentTextChatConfigError {
  const error = createToolError(
    AGENT_ERROR_CODES.INVALID_ACTION,
    "Chat AI model configuration is missing.",
    { code: CHAT_TEXT_FLOW_CONFIG_ERROR_CODE, missing },
  );

  return {
    code: CHAT_TEXT_FLOW_CONFIG_ERROR_CODE,
    message: error.message,
    retryable: false,
    details: error.details,
  };
}

function getLatestUserMessage(request: PreparedChatRequest) {
  return [...request.rawMessages].reverse().find((message) => message.role === "user")?.content
    ?? request.messages[0]?.content
    ?? "";
}

function readOptionalEnv(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function startAgentTextChatTrace(input: {
  request: PreparedChatRequest;
  currentUser: CurrentUser;
  run: AgentRunInput;
  registry: ToolRegistry;
}): AiTraceLogger {
  try {
    const trace = startAiTrace({
      route: agentTextChatRoute,
      title: `文本聊天：${summarizeLatestUserMessage(input.request.rawMessages)}`,
      runId: input.run.runId,
      userId: input.currentUser.id,
      sessionId: input.request.conversationId,
      messageId: input.request.responseMessageId,
      input: summarizeAgentTextChatRunInput(input),
      metadata: createAgentTextChatTraceBoundaryMetadata(input.registry),
    });

    trace.addStep({
      name: "文本聊天请求输入",
      type: "user_input",
      input: summarizeAgentTextChatRunInput(input),
      output: {
        accepted: true,
        registry: summarizeRegistry(input.registry),
      },
      metadata: createAgentTextChatTraceBoundaryMetadata(input.registry),
    });

    return trace;
  } catch (error) {
    console.warn("[agent-text-chat-trace] start_failed", {
      detail: error instanceof Error ? error.message : error,
    });
    return createNoopTraceLogger();
  }
}

// recordAgentTextChatRuntimeResultTrace 将 agent-core 的安全事件摘要投影到开发态 trace，不把 dev store 下沉进 runtime。
function recordAgentTextChatRuntimeResultTrace(input: {
  trace: AiTraceLogger;
  result: AgentRunResult;
  registry: ToolRegistry;
  events: AgentTextChatStreamEvent[];
}) {
  for (const event of input.result.traceEvents) {
    input.trace.addStep({
      name: getRuntimeTraceEventLabel(event),
      type: getRuntimeTraceStepType(event),
      output: summarizeRuntimeTraceEvent(event),
      metadata: {
        eventType: event.type,
        pipeline: "agent-core-text-chat",
      },
    });
  }

  const responseSummary = summarizeAgentTextChatResponseEvents(input.events);
  input.trace.addStep({
    name: "NDJSON 响应写入",
    type: "response_write",
    output: responseSummary,
    metadata: {
      route: agentTextChatRoute,
      eventCount: input.events.length,
      source: "renderAgentResponseEvents",
    },
  });

  input.trace.finish(getTraceStatusFromAgentRunResult(input.result), createFinalDecision({
    result: input.result,
    registry: input.registry,
    responseSummary,
  }));
}

function recordAgentTextChatConfigFailureTrace(input: {
  trace: AiTraceLogger;
  error: AgentTextChatConfigError;
  events: AgentTextChatStreamEvent[];
}) {
  const responseSummary = summarizeAgentTextChatResponseEvents(input.events);

  input.trace.addStep({
    name: "模型配置错误",
    type: "error",
    status: "failed",
    output: {
      code: input.error.code,
      retryable: input.error.retryable,
      details: redactTraceValue(input.error.details),
    },
    error: {
      code: input.error.code,
      message: input.error.message,
    },
    metadata: {
      boundary: "planner_configuration",
    },
  });
  input.trace.addStep({
    name: "NDJSON 错误响应写入",
    type: "response_write",
    output: responseSummary,
    metadata: {
      route: agentTextChatRoute,
      eventCount: input.events.length,
    },
  });
  input.trace.finish("failed", {
    status: "hard_failure",
    reason: "planner_configuration_missing",
    code: input.error.code,
    responseType: getResponseType(responseSummary),
  });
}

function recordAgentTextChatRuntimeExceptionTrace(input: {
  trace: AiTraceLogger;
  error: ToolError;
  events: AgentTextChatStreamEvent[];
}) {
  const responseSummary = summarizeAgentTextChatResponseEvents(input.events);

  input.trace.addStep({
    name: "Runtime 异常",
    type: "error",
    status: "failed",
    output: {
      code: input.error.code,
      retryable: input.error.retryable,
      details: redactTraceValue(input.error.details),
    },
    error: {
      code: input.error.code,
      message: input.error.message,
    },
    metadata: {
      boundary: "runtime_exception",
    },
  });
  input.trace.addStep({
    name: "NDJSON 错误响应写入",
    type: "response_write",
    output: responseSummary,
    metadata: {
      route: agentTextChatRoute,
      eventCount: input.events.length,
    },
  });
  input.trace.finish("failed", {
    status: "hard_failure",
    reason: "runtime_exception",
    code: input.error.code,
    responseType: getResponseType(responseSummary),
  });
}

function summarizeAgentTextChatRunInput(input: {
  request: PreparedChatRequest;
  currentUser: CurrentUser;
  run: AgentRunInput;
  registry: ToolRegistry;
}) {
  return {
    route: agentTextChatRoute,
    runId: input.run.runId,
    userId: input.currentUser.id,
    conversationId: input.request.conversationId ?? null,
    responseMessageId: input.request.responseMessageId ?? null,
    latestUserMessage: summarizeText(input.run.userInput),
    messageCount: input.request.rawMessages.length,
    messages: input.request.rawMessages.map((message) => ({
      role: message.role,
      content: summarizeText(message.content),
    })),
    hydration: input.request.hydration,
    conversationSummary: summarizeText(input.request.conversationSummaryContext.summary),
    thinkingEnabled: input.request.thinkingEnabled,
    hasClientConversationSummary: input.request.hasClientConversationSummary,
    registry: summarizeRegistry(input.registry),
    limits: input.run.limits,
  };
}

function createAgentTextChatTraceBoundaryMetadata(registry: ToolRegistry) {
  return {
    pipeline: "agent-core-text-chat",
    route: agentTextChatRoute,
    registry: summarizeRegistry(registry),
    renderer: "default-agent-response-renderer",
    legacyPathParticipation: {
      removedIntentFlow: false,
      removedDomainAgentRuntime: false,
      removedBusinessCardEvents: false,
    },
  };
}

function summarizeRegistry(registry: ToolRegistry) {
  const manifest = registry.serializeForPlanner();

  return {
    toolCount: manifest.length,
    toolNames: manifest.map((tool) => tool.name),
  };
}

function getRuntimeTraceStepType(event: AgentTraceEvent) {
  if (event.type === "validation_result") {
    return "validation";
  }

  if (event.type === "budget_event") {
    return "token_budget";
  }

  if (event.type === "terminal_grounding") {
    return "final_response";
  }

  return "runtime_event";
}

function getRuntimeTraceEventLabel(event: AgentTraceEvent) {
  switch (event.type) {
    case "registry_snapshot":
      return "Registry 快照";
    case "planner_action":
      return "Planner action";
    case "validation_result":
      return event.ok ? "Action 校验通过" : "Action 校验失败";
    case "budget_event":
      return "预算事件";
    case "resource_registered":
      return "Resource 注册";
    case "policy_decision":
      return "Policy 决策";
    case "confirmation_request":
      return "确认请求";
    case "confirmation_resume":
      return "确认恢复";
    case "terminal_grounding":
      return "Terminal grounding";
  }
}

function summarizeRuntimeTraceEvent(event: AgentTraceEvent): unknown {
  switch (event.type) {
    case "registry_snapshot":
      return {
        type: event.type,
        snapshotId: event.snapshotId,
        manifestHash: event.manifestHash,
        toolCount: event.toolCount,
      };
    case "planner_action":
      return {
        type: event.type,
        step: event.step,
        actionType: event.actionType,
        toolName: event.toolName,
      };
    case "validation_result":
      return {
        type: event.type,
        step: event.step,
        ok: event.ok,
        code: event.code,
      };
    case "budget_event":
      return {
        type: event.type,
        budget: event.budget,
        status: event.status,
        used: event.used,
        limit: event.limit,
        step: event.step,
        reason: event.reason,
      };
    case "resource_registered":
      return {
        type: event.type,
        toolResultId: event.toolResultId,
        resource: summarizeResourceRef(event.resource),
        summary: redactTraceValue(event.summary),
      };
    case "policy_decision":
      return {
        type: event.type,
        toolName: event.toolName,
        decision: event.decision,
        policyVersion: event.policyVersion,
      };
    case "confirmation_request":
      return {
        type: event.type,
        pendingActionId: event.request.pendingActionId,
        actionHash: event.request.actionHash,
        expiresAt: event.request.expiresAt,
        toolName: event.request.toolName,
      };
    case "confirmation_resume":
      return {
        type: event.type,
        pendingActionId: event.pendingActionId,
        status: event.status,
      };
    case "terminal_grounding":
      return {
        type: event.type,
        actionType: event.actionType,
        usedResourceRefs: event.usedResourceRefs.map(summarizeResourceRef),
      };
  }
}

function summarizeResourceRef(resource: AgentResourceRef): unknown {
  return {
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
    role: resource.role,
    runId: resource.runId,
    version: resource.version,
    schemaVersion: resource.schemaVersion,
  };
}

function summarizeAgentTextChatResponseEvents(events: AgentTextChatStreamEvent[]) {
  const content = events
    .filter((event): event is Extract<AgentStreamEvent, { type: "content" }> => event.type === "content")
    .map((event) => event.content)
    .join("\n");
  const suggestions = events
    .filter((event): event is Extract<AgentStreamEvent, { type: "assistant_suggestions" }> => event.type === "assistant_suggestions")
    .flatMap((event) => event.suggestions);
  const errorCodes = events
    .filter((event): event is Extract<AgentTextChatStreamEvent, { type: "error" }> => event.type === "error")
    .map((event) => event.error.code);

  return {
    eventTypes: events.map((event) => event.type),
    done: events.some((event) => event.type === "done"),
    content: summarizeText(content),
    contentLength: content.length,
    suggestionCount: suggestions.length,
    errorCodes,
    confirmationRequestCount: events.filter((event) => event.type === "confirmation_request").length,
    toolResultCount: events.filter((event) => event.type === "tool_result").length,
  };
}

function createFinalDecision(input: {
  result: AgentRunResult;
  registry: ToolRegistry;
  responseSummary: AgentTextChatResponseSummary;
}): AiRunFinalDecision {
  if (input.result.status === "failed") {
    return {
      status: isUnsupportedCapabilityFailure(input) ? "recoverable_failure" : "hard_failure",
      reason: input.result.status,
      code: input.result.terminalError?.code,
      responseType: getResponseType(input.responseSummary),
    };
  }

  return {
    status: "success",
    reason: input.result.status,
    code: input.result.terminalError?.code,
    responseType: input.result.terminalAction?.type ?? input.result.status,
  };
}

function getTraceStatusFromAgentRunResult(result: AgentRunResult): AiTraceStatus {
  return result.status === "failed" ? "failed" : "success";
}

function getResponseType(summary: AgentTextChatResponseSummary) {
  if (summary.errorCodes.length > 0) {
    return "error";
  }

  if (summary.confirmationRequestCount > 0) {
    return "confirmation_request";
  }

  if (summary.contentLength > 0) {
    return "content";
  }

  return "done";
}

function createSafeRuntimeErrorEvent(error: ToolError): Extract<AgentStreamEvent, { type: "error" }> {
  return {
    type: "error",
    error: {
      ...error,
      message: getSafeAgentTextChatErrorMessage(error.code),
    },
  };
}

function createUnexpectedRuntimeError(error: unknown): ToolError {
  return createToolError(
    AGENT_ERROR_CODES.INVALID_ACTION,
    "Agent text chat runtime failed unexpectedly.",
    {
      cause: error instanceof Error ? error.message : String(error),
    },
  );
}

function redactTraceValue(value: unknown): JsonValue {
  return redactJsonValue(value, { maxStringLength: maxTraceSummaryLength });
}

function summarizeText(value: string) {
  if (value.length <= maxTraceSummaryLength) {
    return value;
  }

  return `${value.slice(0, maxTraceSummaryLength)}...[truncated]`;
}

function createNoopTraceLogger(): AiTraceLogger {
  return {
    addStep() {},
    finish() {},
    update() {},
  };
}
