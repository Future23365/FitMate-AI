import "server-only";

import { randomUUID } from "node:crypto";

import { createToolError } from "@/lib/server/agent-core/action-validator";
import type { AgentRunInput, AgentRunResult, AgentStreamEvent, JsonValue } from "@/lib/server/agent-core/contracts";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import { DeepSeekModelAdapter } from "@/lib/server/agent-planners/model-adapters/deepseek-model-adapter";
import type { PlannerPort } from "@/lib/server/agent-core/planner-port";
import type { CurrentUser } from "@/lib/server/users/current-user";

import type { PreparedChatRequest } from "./chat-service";

const CHAT_TEXT_FLOW_CONFIG_ERROR_CODE = "chat_ai_not_configured";
const ndjsonContentType = "application/x-ndjson; charset=utf-8";
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
  const plannerResult = input.planner
    ? { ok: true as const, planner: input.planner }
    : (input.plannerFactory ?? createProductionAgentTextChatPlanner)();

  if (!plannerResult.ok) {
    return createAgentTextChatNdjsonResponse([
      createSafeAgentTextChatErrorEvent(plannerResult.error),
      { type: "done" },
    ], { status: 503 });
  }

  const registry = createEmptyProductionTextChatRegistry();
  const result = await runAgentRuntime({
    registry,
    planner: plannerResult.planner,
    run: createAgentTextChatRunInput({
      request: input.request,
      currentUser: input.currentUser,
    }),
  });

  return createAgentTextChatNdjsonResponse(renderAgentTextChatResponseEvents({
    result,
    registry,
  }));
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
