import { clientRequest } from "@/lib/client/http/client-request";

import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";

export type AgentTextChatErrorPayload = {
  code?: string;
  message?: string;
  retryable?: boolean;
  details?: unknown;
};

export type AgentTextChatEvent =
  | { type: "content"; content: string }
  | { type: "assistant_suggestions"; suggestions: string[] }
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
  if (error instanceof AgentTextChatHttpError || error instanceof AgentTextChatStreamError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "聊天请求失败，请稍后重试。";
}

export function isAgentTextChatAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function getAgentTextChatEventErrorMessage(event: Extract<AgentTextChatEvent, { type: "error" }>) {
  return event.error.message || event.error.code || "聊天生成失败，请稍后重试。";
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
    case "content":
      if (typeof event.content !== "string") {
        throw new AgentTextChatStreamError("content 事件缺少文本内容。");
      }
      return { type: "content", content: event.content };
    case "assistant_suggestions":
      if (!Array.isArray(event.suggestions) || event.suggestions.some((suggestion) => typeof suggestion !== "string")) {
        throw new AgentTextChatStreamError("assistant_suggestions 事件格式不合法。");
      }
      return { type: "assistant_suggestions", suggestions: event.suggestions };
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

async function createHttpError(response: Response) {
  const text = await response.text().catch(() => "");
  const data = parseErrorResponseText(text);
  const payload = getErrorPayloadFromResponseData(data);
  const fallback = response.statusText || "聊天请求失败，请稍后重试。";

  return new AgentTextChatHttpError(
    payload.message || payload.code || fallback,
    response.status,
    data,
    payload.code,
  );
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
    return { message: typeof value === "string" ? value : "聊天生成失败，请稍后重试。" };
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
