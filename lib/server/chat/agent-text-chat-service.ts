import "server-only";

import { randomUUID } from "node:crypto";

import { createToolError } from "@/lib/server/agent-core/action-validator";
import type {
  AgentResourceRef,
  AgentRunInput,
  AgentRunResult,
  AgentProgressEvent,
  AgentProgressStage,
  AgentStreamEvent,
  AgentTraceEvent,
  JsonValue,
  ToolError,
} from "@/lib/server/agent-core/contracts";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createManifestHash } from "@/lib/server/agent-core/manifest-hardening";
import { redactJsonValue } from "@/lib/server/agent-core/redaction";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createProductionToolRegistry } from "@/lib/server/agent-tools";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import { DeepSeekModelAdapter } from "@/lib/server/agent-planners/model-adapters/deepseek-model-adapter";
import type { PlannerModelTraceEvent } from "@/lib/server/agent-planners/model-adapters/model-adapter";
import type { PlannerPort } from "@/lib/server/agent-core/planner-port";
import {
  listRecentVisibleTrainingProposalSummaries,
  persistVisibleTrainingProposalFactsFromEvents,
  toJsonValue,
  type PersistVisibleTrainingProposalFactsResult,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";
import { createProductionTerminalOutputValidatorRegistry } from "@/lib/server/visible-training-proposals/visible-training-proposal-validator";
import { createProductionVisibleOutputRendererRegistry } from "@/lib/server/visible-training-proposals/visible-training-proposal-renderer";
import { readExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";
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
// unsupportedToolActionMessage 只表达工具不可执行的安全边界，不替代模型的基础问答回复。
const unsupportedToolActionMessage = "刚才这个请求需要当前未接入的工具，所以我不能直接执行这个操作。你可以把它改成普通文本问题，或先补充想让我整理的信息。";
const genericChatFailureMessage = "聊天生成失败，请稍后重试。";
const chatServiceUnavailableMessage = "聊天服务暂时不可用，请稍后再试。";
const unsupportedToolActionSuggestions = [
  "改成普通文本问题",
  "先解释训练原则",
  "我需要补充哪些信息",
];
const directUnsupportedErrorCodes = new Set<string>([
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

type AgentTextChatNdjsonWriter = {
  write: (event: AgentTextChatStreamEvent) => Promise<boolean>;
  readonly events: AgentTextChatStreamEvent[];
};

type AgentTextChatResponseSummary = ReturnType<typeof summarizeAgentTextChatResponseEvents>;
type FactPersistenceTraceResult = PersistVisibleTrainingProposalFactsResult | { ok: false; code: "restore_failed"; message: string; savedCount: 0 };

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

const toolActivityStageByToolName = new Map<string, AgentProgressStage>([
  ["inspectVisibleTrainingProposals", "reading_artifacts"],
  ["resolveExerciseResourceMentions", "querying_exercises"],
  ["searchExerciseResources", "querying_exercises"],
]);

// createAgentTextChatResponse 是 /api/chat 到 agent-core 的薄接入层，只负责构造 run、生产 registry 和 NDJSON 投影。
export async function createAgentTextChatResponse(input: CreateAgentTextChatResponseInput): Promise<Response> {
  const registry = await createProductionTextChatRegistry();
  const terminalOutputValidators = createProductionTerminalOutputValidatorRegistry();
  const visibleOutputRenderers = createProductionVisibleOutputRendererRegistry();
  const recentVisibleTrainingProposals = await restoreRecentVisibleTrainingProposalsForRun({
    request: input.request,
    currentUser: input.currentUser,
  });
  const run = createAgentTextChatRunInput({
    request: input.request,
    currentUser: input.currentUser,
    recentVisibleTrainingProposals,
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

  return createAgentTextChatStreamingResponse(async (writer) => {
    const progressWriter = createAgentProgressWriter(writer);
    await progressWriter.write("preparing_context");

    let result: AgentRunResult;

    try {
      result = await runAgentRuntime({
        registry,
        planner: plannerResult.planner,
        run,
        terminalOutputValidators,
        onTraceEvent: async (event) => {
          const stage = mapRuntimeTraceEventToAgentProgressStage(event, registry);

          if (stage) {
            await progressWriter.write(stage, getProgressStatusFromTraceEvent(event));
          }
        },
      });
    } catch (error) {
      const runtimeError = createUnexpectedRuntimeError(error);
      const events: AgentTextChatStreamEvent[] = [
        createSafeRuntimeErrorEvent(runtimeError),
        { type: "done" },
      ];

      recordAgentTextChatRuntimeExceptionTrace({
        trace,
        planner: plannerResult.planner,
        error: runtimeError,
        events,
      });

      for (const event of events) {
        await writer.write(event);
      }
      return;
    }

    const events = renderAgentTextChatResponseEvents({
      result,
      registry,
      visibleOutputRenderers,
    });
    const factPersistence = await persistVisibleTrainingProposalFactsFromEvents({
      userId: input.currentUser.id,
      conversationId: input.request.conversationId,
      messageId: input.request.responseMessageId,
      events: events as AgentStreamEvent[],
    });

    recordAgentTextChatRuntimeResultTrace({
      trace,
      planner: plannerResult.planner,
      result,
      registry,
      events,
      factPersistence,
    });

    await progressWriter.write("writing_reply");

    for (const event of events) {
      await writer.write(event);
    }
  });
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
  recentVisibleTrainingProposals?: JsonValue[];
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
      recentVisibleTrainingProposals: input.recentVisibleTrainingProposals ?? [],
    },
    limits: {
      maxSteps: 22,
      maxPlannerCalls: 11,
      maxToolCalls: 10,
      maxInvalidActions: 1,
      maxRepairAttempts: 1,
      overallTimeoutMs: 40_000,
      perToolTimeoutMs: 1_000,
    },
  };
}

// createProductionTextChatRegistry 明确表达当前生产聊天只接入受控低风险只读业务 tool，并注入数据库 facet catalog。
export async function createProductionTextChatRegistry() {
  const searchExerciseResourcesFacetCatalog = await readExerciseResourceFacetCatalog();

  return createProductionToolRegistry({ searchExerciseResourcesFacetCatalog });
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

function createAgentTextChatStreamingResponse(
  writeBody: (writer: AgentTextChatNdjsonWriter) => Promise<void>,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", ndjsonContentType);
  headers.set("Cache-Control", "no-store");

  const encoder = new TextEncoder();
  const events: AgentTextChatStreamEvent[] = [];
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const writer: AgentTextChatNdjsonWriter = {
        events,
        write: async (event) => {
          if (closed) {
            return false;
          }

          try {
            events.push(event);
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            return true;
          } catch {
            closed = true;
            return false;
          }
        },
      };

      void (async () => {
        try {
          await writeBody(writer);
        } catch (error) {
          const runtimeError = createUnexpectedRuntimeError(error);
          await writer.write(createSafeRuntimeErrorEvent(runtimeError));
          await writer.write({ type: "done" });
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // stream 已被客户端取消时不再影响服务端 runtime 结果。
            }
          }
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, {
    ...init,
    headers,
  });
}

function createAgentProgressWriter(writer: AgentTextChatNdjsonWriter) {
  let sequence = 0;

  return {
    write: async (
      stage: AgentProgressStage,
      status: AgentProgressEvent["status"] = "active",
    ) => {
      sequence += 1;
      await writer.write({
        type: "agent_progress",
        stage,
        status,
        messageKey: stage,
        sequence,
      });
    },
  };
}

function mapRuntimeTraceEventToAgentProgressStage(
  event: AgentTraceEvent,
  registry: ToolRegistry,
): AgentProgressStage | undefined {
  switch (event.type) {
    case "registry_snapshot":
      return "preparing_context";
    case "planner_action":
    case "budget_event":
    case "duplicate_tool_call":
      return "analyzing_request";
    case "validation_result":
    case "policy_decision":
      return "validating_result";
    case "tool_execution":
      return resolveToolExecutionProgressStage(event, registry);
    case "resource_registered":
    case "confirmation_request":
    case "terminal_grounding":
      return "finalizing";
    case "confirmation_resume":
      return undefined;
  }
}

function resolveToolExecutionProgressStage(
  event: Extract<AgentTraceEvent, { type: "tool_execution" }>,
  registry: ToolRegistry,
): AgentProgressStage {
  const tool = registry.get(event.toolName);
  const metadataStage = readSafeAgentProgressStage(tool?.metadata?.uiActivityStage);

  if (metadataStage) {
    return metadataStage;
  }

  if (tool?.resourceContract?.produces?.some((resource) => (
    resource.resourceType === "visible_training_proposal_fact"
    || resource.resourceType === "visible_training_proposal_fact_index"
  ))) {
    return "reading_artifacts";
  }

  // 生产 adapter 只在 tool 已执行后投影粗粒度 UI 阶段，不参与 Planner 选择或输入改写。
  return toolActivityStageByToolName.get(event.toolName) ?? "analyzing_request";
}

function readSafeAgentProgressStage(value: JsonValue | undefined): AgentProgressStage | undefined {
  return typeof value === "string" && isKnownAgentProgressStage(value) ? value : undefined;
}

function isKnownAgentProgressStage(stage: string): stage is AgentProgressStage {
  return [
    "preparing_context",
    "analyzing_request",
    "querying_exercises",
    "reading_artifacts",
    "generating_workout",
    "validating_result",
    "saving_result",
    "writing_reply",
    "finalizing",
  ].includes(stage);
}

function getProgressStatusFromTraceEvent(event: AgentTraceEvent): AgentProgressEvent["status"] {
  if (event.type === "validation_result" && !event.ok) {
    return "failed";
  }

  if (event.type === "tool_execution" && !event.ok) {
    return "failed";
  }

  if (event.type === "budget_event" && event.status === "exhausted") {
    return "failed";
  }

  return "active";
}

function renderAgentTextChatResponseEvents(input: {
  result: AgentRunResult;
  registry: ToolRegistry;
  visibleOutputRenderers: ReturnType<typeof createProductionVisibleOutputRendererRegistry>;
}): AgentTextChatStreamEvent[] {
  if (isUnsupportedCapabilityFailure(input)) {
    return [
      { type: "content", content: unsupportedToolActionMessage },
      { type: "assistant_suggestions", suggestions: unsupportedToolActionSuggestions },
      { type: "done" },
    ];
  }

  return renderAgentResponseEvents(input.result, {
    visibleOutputRenderers: input.visibleOutputRenderers,
  });
}

async function restoreRecentVisibleTrainingProposalsForRun(input: {
  request: PreparedChatRequest;
  currentUser: CurrentUser;
}): Promise<JsonValue[]> {
  try {
    const summaries = await listRecentVisibleTrainingProposalSummaries({
      userId: input.currentUser.id,
      conversationId: input.request.conversationId,
      limit: 3,
    });

    return summaries.map((summary) => toJsonValue(summary));
  } catch {
    return [];
  }
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
  planner: PlannerPort;
  result: AgentRunResult;
  registry: ToolRegistry;
  events: AgentTextChatStreamEvent[];
  factPersistence?: FactPersistenceTraceResult;
}) {
  const modelDiagnostics = readPlannerModelTraceEvents(input.planner);
  const tokenUsageSummary = summarizePlannerModelTokenUsage(modelDiagnostics);

  recordAgentTextChatModelDiagnosticsTrace({
    trace: input.trace,
    diagnostics: modelDiagnostics,
    result: input.result,
  });

  input.trace.update({
    model: modelDiagnostics.find((diagnostic) => diagnostic.response?.model || diagnostic.request.model)?.response?.model
      ?? modelDiagnostics.find((diagnostic) => diagnostic.request.model)?.request.model,
    metadata: {
      ...createAgentTextChatTraceBoundaryMetadata(input.registry),
      plannerModelCallCount: modelDiagnostics.length,
      tokenUsageSummary,
    },
  });

  for (const event of input.result.traceEvents) {
    const output = event.type === "registry_snapshot"
      ? summarizeRegistrySnapshotTraceEvent(event, input.registry)
      : summarizeRuntimeTraceEvent(event);

    input.trace.addStep({
      name: getRuntimeTraceEventLabel(event),
      type: getRuntimeTraceStepType(event),
      status: event.type === "tool_execution" && !event.ok ? "failed" : undefined,
      input: event.type === "tool_execution" ? event.inputSummary : undefined,
      output,
      metadata: {
        eventType: event.type,
        pipeline: "agent-core-text-chat",
        runtimeStep: "step" in event ? event.step : undefined,
        toolName: event.type === "tool_execution" ? event.toolName : undefined,
        toolResultId: event.type === "tool_execution" ? event.toolResultId : undefined,
        boundary: event.type === "tool_execution" ? "tool_execution" : undefined,
      },
    });
  }

  if (input.result.toolResults.length > 0) {
    input.trace.addStep({
      name: "Tool result 摘要",
      type: "runtime_event",
      output: {
        toolResults: input.result.toolResults.map(summarizeToolResultForTrace),
      },
      metadata: {
        pipeline: "agent-core-text-chat",
        boundary: "tool_result_projection",
      },
    });
  }

  if (input.factPersistence) {
    input.trace.addStep({
      name: "可见训练方案事实桥摘要",
      type: "runtime_event",
      status: input.factPersistence.ok ? undefined : "failed",
      output: redactTraceValue(input.factPersistence),
      metadata: {
        pipeline: "agent-core-text-chat",
        boundary: "visible_training_proposal_fact_bridge",
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
      plannerModelCallCount: modelDiagnostics.length,
      tokenUsageSummary,
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
  planner: PlannerPort;
  error: ToolError;
  events: AgentTextChatStreamEvent[];
}) {
  const responseSummary = summarizeAgentTextChatResponseEvents(input.events);
  const modelDiagnostics = readPlannerModelTraceEvents(input.planner);

  recordAgentTextChatModelDiagnosticsTrace({
    trace: input.trace,
    diagnostics: modelDiagnostics,
  });

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
      plannerModelCallCount: modelDiagnostics.length,
      tokenUsageSummary: summarizePlannerModelTokenUsage(modelDiagnostics),
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
    recentVisibleTrainingProposals: input.run.metadata?.recentVisibleTrainingProposals ?? [],
    registry: summarizeRegistry(input.registry),
    limits: input.run.limits,
  };
}

function createAgentTextChatTraceBoundaryMetadata(registry: ToolRegistry) {
  return {
    pipeline: "agent-core-text-chat",
    route: agentTextChatRoute,
    registry: summarizeRegistry(registry),
    renderer: "visible-output-agent-response-renderer",
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
    manifestHash: createManifestHash(manifest),
    toolCount: manifest.length,
    toolNames: manifest.map((tool) => tool.name),
  };
}

function summarizeRegistrySnapshotTraceEvent(
  event: Extract<AgentTraceEvent, { type: "registry_snapshot" }>,
  registry: ToolRegistry,
) {
  const manifest = registry.serializeForPlanner();

  return {
    type: event.type,
    snapshotId: event.snapshotId,
    manifestHash: event.manifestHash,
    toolCount: event.toolCount,
    toolNames: manifest.map((tool) => tool.name),
    tools: redactTraceValue(manifest),
  };
}

function getRuntimeTraceStepType(event: AgentTraceEvent) {
  if (event.type === "tool_execution") {
    return "tool_call";
  }

  if (event.type === "validation_result") {
    return "validation";
  }

  if (event.type === "budget_event") {
    return "token_budget";
  }

  if (event.type === "duplicate_tool_call") {
    return "runtime_event";
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
    case "tool_execution":
      return "Tool 执行";
    case "duplicate_tool_call":
      return "重复 Tool 调用";
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
    case "tool_execution":
      return {
        type: event.type,
        step: event.step,
        source: event.source,
        toolName: event.toolName,
        toolVersion: event.toolVersion,
        toolCallId: event.toolCallId,
        toolResultId: event.toolResultId,
        normalizedInputHash: event.normalizedInputHash,
        ok: event.ok,
        satisfied: event.satisfied,
        failureCode: event.failureCode,
        error: event.error ? redactTraceValue(event.error) : undefined,
        fulfillment: redactTraceValue(event.fulfillment),
        projectionSummary: event.projectionSummary ? redactTraceValue(event.projectionSummary) : undefined,
        producedResources: event.producedResources?.map(summarizeResourceRef),
        consumedResources: event.consumedResources?.map(summarizeResourceRef),
        startedAt: event.startedAt,
        completedAt: event.completedAt,
        durationMs: event.durationMs,
      };
    case "duplicate_tool_call":
      return {
        type: event.type,
        step: event.step,
        toolName: event.toolName,
        toolVersion: event.toolVersion,
        normalizedInputHash: event.normalizedInputHash,
        previousCount: event.previousCount,
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

// recordAgentTextChatModelDiagnosticsTrace 把 LlmPlanner 的可选模型诊断投影进开发态 trace，失败不影响 NDJSON。
function recordAgentTextChatModelDiagnosticsTrace(input: {
  trace: AiTraceLogger;
  diagnostics: readonly PlannerModelTraceEvent[];
  result?: AgentRunResult;
}) {
  try {
    for (const diagnostic of input.diagnostics) {
      const runtimeLinkage = createPlannerRuntimeLinkage(diagnostic, input.result);

      input.trace.addStep({
        name: `模型请求 #${diagnostic.plannerCallIndex}`,
        type: "model_request",
        input: diagnostic.request,
        output: {
          provider: diagnostic.provider,
          adapterName: diagnostic.adapterName,
          model: diagnostic.request.model,
          plannerCallIndex: diagnostic.plannerCallIndex,
          runtimeStep: diagnostic.runtimeStep,
          messageCount: diagnostic.request.messageCount,
          toolCount: diagnostic.request.run.toolCount,
          observationCount: diagnostic.request.run.observationCount,
          toolResultCount: diagnostic.request.run.toolResultCount,
        },
        metadata: {
          pipeline: "agent-core-text-chat",
          boundary: "planner_model_adapter",
          runId: diagnostic.runId,
          plannerCallIndex: diagnostic.plannerCallIndex,
          runtimeStep: diagnostic.runtimeStep,
          response_format: diagnostic.request.response_format,
          tokenUsage: diagnostic.tokenUsage,
          runtimeLinkage,
        },
      });

      input.trace.addStep({
        name: `模型响应 #${diagnostic.plannerCallIndex}`,
        type: "model_response",
        status: diagnostic.parseStatus === "parsed" ? "success" : "failed",
        output: {
          provider: diagnostic.provider,
          adapterName: diagnostic.adapterName,
          model: diagnostic.response?.model ?? diagnostic.request.model,
          httpStatus: diagnostic.response?.httpStatus,
          parseStatus: diagnostic.parseStatus,
          failureCode: diagnostic.failureCode,
          actionType: diagnostic.actionType,
          toolName: diagnostic.toolName,
          rawText: diagnostic.response?.rawText,
          rawTextLength: diagnostic.response?.rawTextLength,
          rawResponse: diagnostic.response?.rawResponse,
          parsedAction: diagnostic.parsedAction,
          tokenUsage: diagnostic.tokenUsage,
          diagnostics: diagnostic.diagnostics,
          runtimeLinkage,
        },
        metadata: {
          pipeline: "agent-core-text-chat",
          boundary: "planner_model_adapter",
          runId: diagnostic.runId,
          plannerCallIndex: diagnostic.plannerCallIndex,
          runtimeStep: diagnostic.runtimeStep,
          parseStatus: diagnostic.parseStatus,
          failureCode: diagnostic.failureCode,
          tokenUsage: diagnostic.tokenUsage,
          runtimeLinkage,
        },
      });
    }
  } catch (error) {
    console.warn("[agent-text-chat-trace] model_diagnostics_write_failed", {
      detail: error instanceof Error ? error.message : error,
    });
  }
}

function readPlannerModelTraceEvents(planner: PlannerPort): readonly PlannerModelTraceEvent[] {
  const diagnosticPlanner = planner as PlannerPort & {
    getModelTraceEvents?: () => readonly PlannerModelTraceEvent[];
  };

  try {
    return diagnosticPlanner.getModelTraceEvents?.() ?? [];
  } catch (error) {
    console.warn("[agent-text-chat-trace] model_diagnostics_read_failed", {
      detail: error instanceof Error ? error.message : error,
    });
    return [];
  }
}

function createPlannerRuntimeLinkage(
  diagnostic: PlannerModelTraceEvent,
  result: AgentRunResult | undefined,
) {
  const validation = result?.traceEvents.find((event) => (
    event.type === "validation_result" && event.step === diagnostic.runtimeStep
  ));
  const plannerAction = result?.traceEvents.find((event) => (
    event.type === "planner_action" && event.step === diagnostic.runtimeStep
  ));
  const estimatedTokenBudget = result?.traceEvents.find((event) => (
    event.type === "budget_event" &&
    event.budget === "estimated_tokens" &&
    event.step === diagnostic.runtimeStep
  ));

  return {
    runId: diagnostic.runId,
    plannerCallIndex: diagnostic.plannerCallIndex,
    runtimeStep: diagnostic.runtimeStep,
    actionType: diagnostic.actionType ?? (plannerAction?.type === "planner_action" ? plannerAction.actionType : undefined),
    toolName: diagnostic.toolName ?? (plannerAction?.type === "planner_action" ? plannerAction.toolName : undefined),
    validation: validation?.type === "validation_result"
      ? {
          ok: validation.ok,
          code: validation.code,
        }
      : undefined,
    estimatedTokenBudget,
    terminalStatus: result?.status,
    terminalActionType: result?.terminalAction?.type,
    terminalErrorCode: result?.terminalError?.code,
  };
}

function summarizePlannerModelTokenUsage(diagnostics: readonly PlannerModelTraceEvent[]) {
  const summary = diagnostics.reduce(
    (sum, diagnostic) => ({
      prompt_tokens: sum.prompt_tokens + (diagnostic.tokenUsage?.prompt_tokens ?? 0),
      completion_tokens: sum.completion_tokens + (diagnostic.tokenUsage?.completion_tokens ?? 0),
      total_tokens: sum.total_tokens + (diagnostic.tokenUsage?.total_tokens ?? 0),
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  );

  return summary.prompt_tokens || summary.completion_tokens || summary.total_tokens ? summary : undefined;
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
    visibleOutputCount: events.filter((event) => event.type === "visible_output").length,
  };
}

function summarizeToolResultForTrace(result: AgentRunResult["toolResults"][number]) {
  const base = {
    toolResultId: result.toolResultId,
    toolName: result.toolName,
    ok: result.ok,
    satisfied: result.fulfillment.satisfied,
    summary: result.fulfillment.summary,
  };

  if (!result.ok) {
    return {
      ...base,
      failureCode: result.error.code,
    };
  }

  return {
    ...base,
    model: summarizeTraceProjectionValue(result.projection.model),
    user: summarizeTraceProjectionValue(result.projection.user),
  };
}

function summarizeTraceProjectionValue(value: JsonValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, JsonValue>;
  return {
    status: record.status,
    totalMatches: record.totalMatches,
    returnedCount: record.returnedCount,
    truncated: record.truncated,
    suitabilities: record.suitabilities,
    appliedFilters: record.appliedFilters,
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

  if (summary.visibleOutputCount > 0) {
    return "visible_output";
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
