export type AiTraceStatus = "running" | "success" | "failed";

export type AiTraceStepType =
  | "user_input"
  | "model_request"
  | "model_response"
  | "intent"
  | "exercise_lookup"
  | "candidate_selection"
  | "validation"
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
  route: string;
  title: string;
  status: AiTraceStatus;
  createdAt: string;
  endedAt?: string;
  durationMs?: number;
  steps: AiTraceStep[];
  metadata?: Record<string, unknown>;
};

type AiTraceStore = {
  traces: AiTrace[];
};

const maxTraces = 50;
const maxSerializedValueLength = 120_000;

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

export function clearAiTraces() {
  if (!isAiTraceEnabled()) {
    return;
  }

  getStore().traces = [];
}

export function createAiTrace(input: {
  route: string;
  title: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isAiTraceEnabled()) {
    return null;
  }

  const trace: AiTrace = {
    id: createId("trace"),
    route: input.route,
    title: input.title,
    status: "running",
    createdAt: new Date().toISOString(),
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
    durationMs: input.durationMs,
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

export function finishAiTrace(traceId: string | undefined, status: AiTraceStatus) {
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
}

function getStore() {
  globalThis.__fitmateAiTraceStore ??= { traces: [] };

  return globalThis.__fitmateAiTraceStore;
}

function findTrace(traceId: string) {
  return getStore().traces.find((trace) => trace.id === traceId);
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeTraceValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") {
        return item.toString();
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
            maxLength: maxSerializedValueLength,
            preview: serialized.slice(0, maxSerializedValueLength),
          })
        : serialized;

    return JSON.parse(normalized);
  } catch {
    return String(value);
  }
}
