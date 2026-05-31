import {
  addAiTraceStep,
  createAiTrace,
  finishAiTrace,
  updateAiTrace,
  type AiTrace,
  type AiRunFinalDecision,
  type AiTraceStepType,
  type AiTraceStatus,
} from "./ai-trace-store";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";

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
  finish: (status: AiTraceStatus, finalDecision?: AiRunFinalDecision) => void;
  update: (input: Partial<AiTrace>) => void;
};

export function startAiTrace(input: {
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
}): AiTraceLogger {
  const trace = createAiTrace(input);

  return {
    id: trace?.id,
    addStep(stepInput) {
      protectTraceWrite("addStep", () => {
        addAiTraceStep(trace?.id, {
          ...stepInput,
          endedAt: toUtcISOString(new Date()),
        });
      });
    },
    finish(status, finalDecision) {
      protectTraceWrite("finish", () => {
        finishAiTrace(trace?.id, status, finalDecision);
      });
    },
    update(updateInput) {
      protectTraceWrite("update", () => {
        updateAiTrace(trace?.id, updateInput);
      });
    },
  };
}

export function summarizeLatestUserMessage(messages: Array<{ role: string; content: string }>) {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  return latest.length > 60 ? `${latest.slice(0, 60)}...` : latest || "AI 请求";
}

function protectTraceWrite(action: string, writer: () => void) {
  try {
    writer();
  } catch (error) {
    console.warn("[ai-trace] write_failed", {
      action,
      detail: error instanceof Error ? error.message : error,
    });
  }
}
