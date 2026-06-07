import { clientRequest } from "@/lib/client/http/client-request";

import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import {
  isKnownAgentProgressStage,
  isKnownAgentProgressStatus,
  type AgentLoopPayload,
  type AgentProgressPayload,
} from "@/features/chat/types";
import { sanitizeAgentActivitySummary } from "@/lib/shared/agent-activity-summary";

export type AgentTextChatErrorPayload = {
  code?: string;
  message?: string;
  retryable?: boolean;
  details?: unknown;
};

const genericAgentTextChatErrorMessage = "聊天服务暂时没能完成这次回复。你可以稍后重试，或把问题缩小后再发一次。";
const chatServiceUnavailableMessage = "聊天服务暂时不可用，请稍后再试。";
const unsupportedCapabilityMessage = "目前还不能直接生成、保存或执行训练计划。你可以继续询问训练原则、动作说明或需要补充的信息。";
const unreadableChatResponseMessage = "聊天响应暂时无法读取。你可以稍后重试，或把问题缩小后再发一次。";
const visibleOutputValidationFailureMessage = "这次没有生成通过校验的可靠训练结果。你可以缩小范围、补充缺失条件，或先让我说明当前事实能支撑的内容。";
const budgetOrTimeoutFailureMessage = "这次请求需要的步骤或信息量超出了当前处理范围。你可以减少条件、缩小训练目标，或分两步提问。";
const unsupportedCapabilityErrorCodes = new Set([
  "unknown_tool",
  "unsupported_m0_capability",
  "max_tool_calls_exceeded",
]);
const visibleOutputValidationErrorCodes = new Set([
  "terminal_reference_invalid",
  "resource_missing",
  "resource_requirement_unmet",
  "resource_contract_violation",
]);
const budgetOrTimeoutErrorCodes = new Set([
  "budget_exhausted",
  "planner_exhausted",
  "max_steps_exceeded",
  "overall_timeout",
  "timeout",
]);

export type AgentTextChatEvent =
  | ({ type: "agent_loop" } & AgentLoopPayload)
  | ({ type: "agent_progress" } & AgentProgressPayload)
  | { type: "content"; content: string }
  | { type: "visible_output"; outputType: string; schemaVersion: string; payload: unknown; content?: unknown }
  | { type: "suggested_questions"; suggestedQuestions: string[] }
  | { type: "error"; error: AgentTextChatErrorPayload }
  | { type: "done" }
  | { type: "tool_result"; toolResultId: string; toolName: string; content: unknown }
  | {
      type: "confirmation_request";
      pendingActionId: string;
      actionHash: string;
      expiresAt: string;
      message: string;
      toolName: string;
    };

export type RequestAgentTextChatInput = {
  conversationId: string;
  responseMessageId: string;
  latestUserMessage: string;
  conversationSummary: string;
  conversationContext: FitnessConversationContext;
  thinkingEnabled: boolean;
  signal: AbortSignal;
  onEvent: (event: AgentTextChatEvent) => void;
};

export class AgentTextChatStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentTextChatStreamError";
  }
}

export class AgentTextChatHttpError extends Error {
  status: number;
  code?: string;
  data: unknown;

  constructor(message: string, status: number, data: unknown, code?: string) {
    super(message);
    this.name = "AgentTextChatHttpError";
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

// requestAgentTextChatResponse 是首页聊天的生产 NDJSON client，只解析通用 Agent 文本事件。
export async function requestAgentTextChatResponse(input: RequestAgentTextChatInput) {
  throwIfAborted(input.signal);

  const response = await clientRequest("/api/chat", {
    method: "POST",
    responseType: "raw",
    throwOnError: false,
    signal: input.signal,
    body: {
      conversationId: input.conversationId,
      responseMessageId: input.responseMessageId,
      latestUserMessage: input.latestUserMessage,
      conversationSummary: input.conversationSummary,
      conversationContext: input.conversationContext,
      thinkingEnabled: input.thinkingEnabled,
    },
  });

  if (!response.ok) {
    throw await createHttpError(response);
  }

  await consumeAgentTextChatNdjson(response, input.onEvent, input.signal);
}

// consumeAgentTextChatNdjson 逐行消费响应体，覆盖跨 chunk 缓存、空行和末尾残留行。
export async function consumeAgentTextChatNdjson(
  response: Response,
  onEvent: (event: AgentTextChatEvent) => void,
  signal?: AbortSignal,
) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new AgentTextChatStreamError("聊天响应缺少可读取的内容。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const abortHandler = () => {
    void reader.cancel();
  };

  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    while (true) {
      throwIfAborted(signal);
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = emitCompleteNdjsonLines(buffer, onEvent);
    }

    buffer += decoder.decode();
    emitFinalNdjsonLine(buffer, onEvent);
    throwIfAborted(signal);
  } finally {
    signal?.removeEventListener("abort", abortHandler);
    reader.releaseLock();
  }
}

export function getAgentTextChatErrorMessage(error: unknown) {
  if (error instanceof AgentTextChatHttpError) {
    return getSafeAgentTextChatUserMessage(error.code);
  }

  if (error instanceof AgentTextChatStreamError) {
    return unreadableChatResponseMessage;
  }

  return genericAgentTextChatErrorMessage;
}

export function isAgentTextChatAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function getAgentTextChatEventErrorMessage(event: Extract<AgentTextChatEvent, { type: "error" }>) {
  return getSafeAgentTextChatUserMessage(event.error.code);
}

function emitCompleteNdjsonLines(
  buffer: string,
  onEvent: (event: AgentTextChatEvent) => void,
) {
  let nextBuffer = buffer;
  let newlineIndex = nextBuffer.indexOf("\n");

  while (newlineIndex >= 0) {
    const line = nextBuffer.slice(0, newlineIndex);
    emitNdjsonLine(line, onEvent);
    nextBuffer = nextBuffer.slice(newlineIndex + 1);
    newlineIndex = nextBuffer.indexOf("\n");
  }

  return nextBuffer;
}

function emitFinalNdjsonLine(line: string, onEvent: (event: AgentTextChatEvent) => void) {
  if (line.trim()) {
    emitNdjsonLine(line, onEvent);
  }
}

function emitNdjsonLine(line: string, onEvent: (event: AgentTextChatEvent) => void) {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new AgentTextChatStreamError(`聊天响应包含非法 NDJSON：${(error as Error).message}`);
  }

  onEvent(parseAgentTextChatEvent(parsed));
}

function parseAgentTextChatEvent(value: unknown): AgentTextChatEvent {
  if (!value || typeof value !== "object" || typeof (value as { type?: unknown }).type !== "string") {
    throw new AgentTextChatStreamError("聊天响应事件缺少 type 字段。");
  }

  const event = value as { type: string; [key: string]: unknown };

  switch (event.type) {
    case "agent_loop":
      return parseAgentLoopEvent(event);
    case "agent_progress":
      return parseAgentProgressEvent(event);
    case "content":
      if (typeof event.content !== "string") {
        throw new AgentTextChatStreamError("content 事件缺少文本内容。");
      }
      return { type: "content", content: event.content };
    case "suggested_questions":
      if (
        !Array.isArray(event.suggestedQuestions)
        || event.suggestedQuestions.some((suggestedQuestion) => typeof suggestedQuestion !== "string")
      ) {
        throw new AgentTextChatStreamError("suggested_questions 事件格式不合法。");
      }
      return { type: "suggested_questions", suggestedQuestions: event.suggestedQuestions };
    case "visible_output":
      return {
        type: "visible_output",
        outputType: String(event.outputType ?? ""),
        schemaVersion: String(event.schemaVersion ?? ""),
        payload: event.payload,
        content: event.content,
      };
    case "error":
      return { type: "error", error: normalizeErrorPayload(event.error) };
    case "done":
      return { type: "done" };
    case "tool_result":
      return {
        type: "tool_result",
        toolResultId: String(event.toolResultId ?? ""),
        toolName: String(event.toolName ?? ""),
        content: event.content,
      };
    case "confirmation_request":
      return {
        type: "confirmation_request",
        pendingActionId: String(event.pendingActionId ?? ""),
        actionHash: String(event.actionHash ?? ""),
        expiresAt: String(event.expiresAt ?? ""),
        message: String(event.message ?? ""),
        toolName: String(event.toolName ?? ""),
      };
    default:
      throw new AgentTextChatStreamError(`未知聊天响应事件：${event.type}`);
  }
}

function parseAgentLoopEvent(event: Record<string, unknown>): AgentTextChatEvent {
  if (typeof event.loopTurn !== "number" || !Number.isSafeInteger(event.loopTurn) || event.loopTurn <= 0) {
    throw new AgentTextChatStreamError("agent_loop 事件 loopTurn 字段不合法。");
  }

  if (typeof event.sequence !== "number" || !Number.isFinite(event.sequence) || event.sequence < 0) {
    throw new AgentTextChatStreamError("agent_loop 事件 sequence 字段不合法。");
  }

  return {
    type: "agent_loop",
    loopTurn: event.loopTurn,
    sequence: event.sequence,
  };
}

function parseAgentProgressEvent(event: Record<string, unknown>): AgentTextChatEvent {
  if (typeof event.stage !== "string" || !event.stage.trim()) {
    throw new AgentTextChatStreamError("agent_progress 事件缺少 stage 字段。");
  }

  if (typeof event.status !== "string" || !isKnownAgentProgressStatus(event.status)) {
    throw new AgentTextChatStreamError("agent_progress 事件 status 字段不合法。");
  }

  if (typeof event.sequence !== "number" || !Number.isFinite(event.sequence) || event.sequence < 0) {
    throw new AgentTextChatStreamError("agent_progress 事件 sequence 字段不合法。");
  }

  const messageKey =
    typeof event.messageKey === "string" && isKnownAgentProgressStage(event.messageKey)
      ? event.messageKey
      : undefined;

  if (event.messageKey !== undefined && !messageKey) {
    throw new AgentTextChatStreamError("agent_progress 事件 messageKey 字段不合法。");
  }

  return {
    type: "agent_progress",
    stage: event.stage,
    status: event.status,
    messageKey,
    ...parseAgentActivitySummary(event.activitySummary),
    sequence: event.sequence,
  };
}

function parseAgentActivitySummary(value: unknown): Pick<AgentProgressPayload, "activitySummary"> {
  if (value === undefined) {
    return {};
  }

  const sanitized = sanitizeAgentActivitySummary(value);

  return sanitized.ok ? { activitySummary: sanitized.summary } : {};
}

async function createHttpError(response: Response) {
  const text = await response.text().catch(() => "");
  const data = parseErrorResponseText(text);
  const payload = getErrorPayloadFromResponseData(data);

  return new AgentTextChatHttpError(
    getSafeAgentTextChatUserMessage(payload.code),
    response.status,
    data,
    payload.code,
  );
}

function getSafeAgentTextChatUserMessage(code?: string) {
  if (code === "chat_ai_not_configured") {
    return chatServiceUnavailableMessage;
  }

  if (code && unsupportedCapabilityErrorCodes.has(code)) {
    return unsupportedCapabilityMessage;
  }

  if (code && visibleOutputValidationErrorCodes.has(code)) {
    return visibleOutputValidationFailureMessage;
  }

  if (code && budgetOrTimeoutErrorCodes.has(code)) {
    return budgetOrTimeoutFailureMessage;
  }

  return genericAgentTextChatErrorMessage;
}

function parseErrorResponseText(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstLine = trimmed.split("\n").find(Boolean);

    if (firstLine) {
      try {
        return JSON.parse(firstLine);
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }
}

function getErrorPayloadFromResponseData(data: unknown): AgentTextChatErrorPayload {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    if (record.type === "error") {
      return normalizeErrorPayload(record.error);
    }

    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.error === "string"
        ? record.error
        : typeof record.message === "string"
          ? record.message
          : undefined,
    };
  }

  return typeof data === "string" ? { message: data } : {};
}

function normalizeErrorPayload(value: unknown): AgentTextChatErrorPayload {
  if (!value || typeof value !== "object") {
    return { message: typeof value === "string" ? value : genericAgentTextChatErrorMessage };
  }

  const record = value as Record<string, unknown>;

  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    retryable: typeof record.retryable === "boolean" ? record.retryable : undefined,
    details: record.details,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The chat request was aborted.", "AbortError");
  }
}
