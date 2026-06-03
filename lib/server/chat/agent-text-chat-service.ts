import "server-only";

import { randomUUID } from "node:crypto";

import { createToolError } from "@/lib/server/agent-core/action-validator";
import type { AgentRunInput, AgentStreamEvent, JsonValue } from "@/lib/server/agent-core/contracts";
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
      { type: "error", error: plannerResult.error },
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

  return createAgentTextChatNdjsonResponse(renderAgentResponseEvents(result));
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
