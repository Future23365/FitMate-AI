import {
  addAiTraceStep,
  createAiTrace,
  finishAiTrace,
  updateAiTrace,
  type AiTrace,
  type AiTraceStepType,
  type AiTraceStatus,
} from "./ai-trace-store";

export type AiTraceLogger = {
  id?: string;
  addStep: (input: {
    name: string;
    type: AiTraceStepType;
    status?: AiTraceStatus;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    error?: unknown;
  }) => void;
  finish: (status: AiTraceStatus) => void;
  update: (input: Partial<AiTrace>) => void;
};

export function startAiTrace(input: {
  route: string;
  title: string;
  metadata?: Record<string, unknown>;
}): AiTraceLogger {
  const trace = createAiTrace(input);

  return {
    id: trace?.id,
    addStep(stepInput) {
      addAiTraceStep(trace?.id, {
        ...stepInput,
        endedAt: new Date().toISOString(),
      });
    },
    finish(status) {
      finishAiTrace(trace?.id, status);
    },
    update(updateInput) {
      updateAiTrace(trace?.id, updateInput);
    },
  };
}

export function summarizeLatestUserMessage(messages: Array<{ role: string; content: string }>) {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  return latest.length > 60 ? `${latest.slice(0, 60)}...` : latest || "AI 请求";
}
