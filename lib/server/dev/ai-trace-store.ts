export type AiTraceStatus = "running" | "success" | "failed";

export type AiRunFinalDecision = {
  status: "success" | "recoverable_failure" | "hard_failure";
  reason?: string;
  code?: string;
  responseType?: string;
};

export type AiTraceStepType =
  | "user_input"
  | "token_budget"
  | "model_request"
  | "model_response"
  | "intent"
  | "reference_resolution"
  | "tool_decision"
  | "rag_query"
  | "tool_call"
  | "patch_proposal"
  | "exercise_lookup"
  | "candidate_selection"
  | "validation"
  | "persistence"
  | "response_write"
  | "final_response"
  | "error";

export type AiTraceStep = {
  id: string;
  name: string;
  type: AiTraceStepType;
  status: AiTraceStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

export type AiTrace = {
  id: string;
  runId: string;
  route: string;
  title: string;
  status: AiTraceStatus;
  createdAt: string;
  endedAt?: string;
  durationMs?: number;
  userId?: string;
  sessionId?: string;
  messageId?: string;
  model?: string;
  promptVersion?: string;
  toolVersions?: Record<string, string>;
  input?: unknown;
  steps: AiTraceStep[];
  finalDecision?: AiRunFinalDecision;
  metadata?: Record<string, unknown>;
};

// AiRunTrace 是 AI 编排复盘的语义 envelope，当前复用开发态 AiTrace 存储和调试页契约。
export type AiRunTrace = AiTrace;

type AiTraceStore = {
  traces: AiTrace[];
};

const maxTraces = 50;
const maxSerializedValueLength = 120_000;
const maxTraceStringLength = 8_000;
const sensitiveKeyRegex = /^(api[_-]?key|authorization|bearer|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|secret|password|credential|cookie|set-cookie)$/i;

declare global {
  var __fitmateAiTraceStore: AiTraceStore | undefined;
}

export function isAiTraceEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_AI_TRACE_LOG === "true";
}

export function listAiTraces() {
  if (!isAiTraceEnabled()) {
    return [];
  }

  return getStore().traces;
}

export function listAiTracesForUser(userId: string) {
  return listAiTraces().filter((trace) => trace.userId === userId);
}

export function clearAiTraces(userId?: string) {
  if (!isAiTraceEnabled()) {
    return;
  }

  getStore().traces = userId
    ? getStore().traces.filter((trace) => trace.userId !== userId)
    : [];
}

export function createAiTrace(input: {
  route: string;
  title: string;
  runId?: string;
  userId?: string;
  sessionId?: string;
  messageId?: string;
  model?: string;
  promptVersion?: string;
  toolVersions?: Record<string, string>;
  input?: unknown;
  metadata?: Record<string, unknown>;
  existingTraceId?: string;
}) {
  if (!isAiTraceEnabled()) {
    return null;
  }

  if (input.existingTraceId) {
    const existingTrace = findTrace(input.existingTraceId);

    if (existingTrace) {
      updateAiTrace(existingTrace.id, {
        userId: input.userId ?? existingTrace.userId,
        sessionId: input.sessionId ?? existingTrace.sessionId,
        messageId: input.messageId ?? existingTrace.messageId,
        model: input.model ?? existingTrace.model,
        promptVersion: input.promptVersion ?? existingTrace.promptVersion,
        toolVersions: {
          ...(existingTrace.toolVersions ?? {}),
          ...(input.toolVersions ?? {}),
        },
        metadata: {
          ...(existingTrace.metadata ?? {}),
          ...input.metadata,
          continuedRoutes: [
            ...getContinuedRoutes(existingTrace.metadata),
            input.route,
          ],
        },
      });

      return existingTrace;
    }
  }

  const id = createId("trace");
  const trace: AiTrace = {
    id,
    runId: input.runId ?? id,
    route: input.route,
    title: input.title,
    status: "running",
    createdAt: new Date().toISOString(),
    userId: input.userId,
    sessionId: input.sessionId,
    messageId: input.messageId,
    model: input.model,
    promptVersion: input.promptVersion,
    toolVersions: sanitizeTraceValue(input.toolVersions) as Record<string, string> | undefined,
    input: sanitizeTraceValue(input.input),
    steps: [],
    metadata: sanitizeTraceValue(input.metadata) as Record<string, unknown> | undefined,
  };

  const store = getStore();
  store.traces = [trace, ...store.traces].slice(0, maxTraces);

  return trace;
}

export function addAiTraceStep(
  traceId: string | undefined,
  input: Omit<AiTraceStep, "id" | "status" | "startedAt"> & {
    status?: AiTraceStatus;
    startedAt?: string;
  },
) {
  if (!traceId || !isAiTraceEnabled()) {
    return null;
  }

  const trace = findTrace(traceId);

  if (!trace) {
    return null;
  }

  const step: AiTraceStep = {
    id: createId("step"),
    name: input.name,
    type: input.type,
    status: input.status ?? "success",
    startedAt: input.startedAt ?? new Date().toISOString(),
    endedAt: input.endedAt,
    durationMs: input.durationMs ?? getDurationMs(input.startedAt, input.endedAt),
    input: sanitizeTraceValue(input.input),
    output: sanitizeTraceValue(input.output),
    metadata: sanitizeTraceValue(input.metadata) as Record<string, unknown> | undefined,
    error: sanitizeTraceValue(input.error),
  };

  trace.steps.push(step);

  return step;
}

export function updateAiTrace(traceId: string | undefined, input: Partial<AiTrace>) {
  if (!traceId || !isAiTraceEnabled()) {
    return;
  }

  const trace = findTrace(traceId);

  if (!trace) {
    return;
  }

  Object.assign(trace, sanitizeTraceValue(input));
}

export function finishAiTrace(
  traceId: string | undefined,
  status: AiTraceStatus,
  finalDecision?: AiRunFinalDecision,
) {
  if (!traceId || !isAiTraceEnabled()) {
    return;
  }

  const trace = findTrace(traceId);

  if (!trace) {
    return;
  }

  const endedAt = new Date().toISOString();

  trace.status = status;
  trace.endedAt = endedAt;
  trace.durationMs = new Date(endedAt).getTime() - new Date(trace.createdAt).getTime();
  trace.finalDecision = sanitizeTraceValue(finalDecision) as AiRunFinalDecision | undefined;
}

function getStore() {
  globalThis.__fitmateAiTraceStore ??= { traces: [] };

  return globalThis.__fitmateAiTraceStore;
}

function findTrace(traceId: string) {
  return getStore().traces.find((trace) => trace.id === traceId);
}

function getContinuedRoutes(metadata: AiTrace["metadata"]) {
  const continuedRoutes = metadata?.continuedRoutes;

  return Array.isArray(continuedRoutes)
    ? continuedRoutes.filter((route): route is string => typeof route === "string")
    : [];
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getDurationMs(startedAt?: string, endedAt?: string) {
  if (!startedAt || !endedAt) {
    return undefined;
  }

  return Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
}

function sanitizeTraceValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value, (key, item) => {
      if (key && sensitiveKeyRegex.test(key)) {
        return "[REDACTED]";
      }

      if (typeof item === "bigint") {
        return item.toString();
      }

      if (typeof item === "string" && item.length > maxTraceStringLength) {
        return {
          truncated: true,
          originalLength: item.length,
          maxLength: maxTraceStringLength,
          preview: item.slice(0, maxTraceStringLength),
        };
      }

      if (item instanceof Error) {
        return {
          name: item.name,
          message: item.message,
          stack: item.stack,
        };
      }

      return item;
    });

    if (!serialized) {
      return value;
    }

    const normalized =
      serialized.length > maxSerializedValueLength
        ? JSON.stringify({
            truncated: true,
            originalLength: serialized.length,
            maxLength: maxSerializedValueLength,
            preview: serialized.slice(0, maxSerializedValueLength),
          })
        : serialized;

    return JSON.parse(normalized);
  } catch {
    return String(value);
  }
}
