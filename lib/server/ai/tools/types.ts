import type { z } from "zod";

import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";

export const readonlyToolNames = [
  "searchArtifacts",
  "getArtifactPayload",
  "getExerciseById",
  "searchExercises",
] as const;

export type ReadonlyToolName = (typeof readonlyToolNames)[number];

export type ControlledToolErrorCode =
  | "unknown_tool"
  | "schema_validation_failed"
  | "forbidden"
  | "not_found"
  | "invalid_payload"
  | "execution_failed";

export type ControlledToolError = {
  code: ControlledToolErrorCode;
  message: string;
  detail?: unknown;
};

export type ControlledToolBudget = {
  maxSteps: number;
  maxDecisionCalls: number;
  timeoutMs: number;
  maxBundleChars: number;
  maxFreeTextChars: number;
  searchArtifactsMaxResults: number;
  searchExercisesMaxResults: number;
};

export type ControlledToolContext = {
  userId: string;
  sessionId?: string;
  trace?: AiTraceLogger;
  budget: ControlledToolBudget;
  allowedArtifactIds?: string[];
};

export type ControlledToolSuccess<Output> = {
  ok: true;
  output: Output;
  modelSummary: unknown;
  traceSummary: unknown;
};

export type ControlledToolFailure = {
  ok: false;
  error: ControlledToolError;
  traceSummary?: unknown;
};

export type ControlledToolResult<Output> =
  | ControlledToolSuccess<Output>
  | ControlledToolFailure;

export type ControlledReadTool<Input, Output> = {
  name: ReadonlyToolName;
  description: string;
  inputSchema: z.ZodType<Input>;
  execute(input: Input, context: ControlledToolContext): Promise<ControlledToolResult<Output>>;
};

export type ExecutedToolCall = {
  id: string;
  toolName: ReadonlyToolName;
  input: unknown;
  status: "success" | "failed";
  durationMs: number;
  modelSummary?: unknown;
  traceSummary?: unknown;
  error?: ControlledToolError;
  priority: number;
};

export type ReadonlyToolContextBundle = {
  enabled: boolean;
  available: boolean;
  stopReason:
    | "feature_flag_disabled"
    | "trigger_not_allowed"
    | "deterministic_skip"
    | "model_finish"
    | "tool_failure_fallback"
    | "decision_failure_fallback"
    | "step_limit"
    | "timeout";
  decisionCallCount: number;
  toolExecutionCount: number;
  totalDurationMs: number;
  stepLimitReached: boolean;
  timeout: boolean;
  truncated: boolean;
  serializedLength: number;
  calls: ExecutedToolCall[];
  modelContext: unknown[];
};
