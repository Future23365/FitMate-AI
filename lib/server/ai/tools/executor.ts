import "server-only";

import { ZodError } from "zod";

import { getReadonlyTool } from "./registry";
import type {
  ControlledToolContext,
  ControlledToolError,
  ExecutedToolCall,
  ReadonlyToolName,
} from "./types";

let toolCallCounter = 0;

// Tool executor 统一处理白名单、Schema、耗时和 trace，调用方不直接接触底层服务函数。
export async function executeReadonlyTool(input: {
  toolName: string;
  toolInput: unknown;
  context: ControlledToolContext;
  stepIndex?: number;
  reason?: string;
}): Promise<ExecutedToolCall> {
  const startedAt = Date.now();
  const tool = getReadonlyTool(input.toolName);
  const callId = `readonly_tool_${Date.now()}_${++toolCallCounter}`;

  if (!tool) {
    return finishToolCall({
      id: callId,
      toolName: input.toolName,
      toolInput: input.toolInput,
      context: input.context,
      startedAt,
      status: "failed",
      error: {
        code: "unknown_tool",
        message: "Readonly tool is not registered.",
      },
      reason: input.reason,
      stepIndex: input.stepIndex,
    });
  }

  const parsedInput = tool.inputSchema.safeParse(input.toolInput);

  if (!parsedInput.success) {
    return finishToolCall({
      id: callId,
      toolName: tool.name,
      toolInput: input.toolInput,
      context: input.context,
      startedAt,
      status: "failed",
      error: normalizeZodError(parsedInput.error),
      reason: input.reason,
      stepIndex: input.stepIndex,
    });
  }

  try {
    const result = await tool.execute(parsedInput.data, input.context);

    if (!result.ok) {
      return finishToolCall({
        id: callId,
        toolName: tool.name,
        toolInput: parsedInput.data,
        context: input.context,
        startedAt,
        status: "failed",
        error: result.error,
        traceSummary: result.traceSummary,
        reason: input.reason,
        stepIndex: input.stepIndex,
      });
    }

    return finishToolCall({
      id: callId,
      toolName: tool.name,
      toolInput: parsedInput.data,
      context: input.context,
      startedAt,
      status: "success",
      modelSummary: result.modelSummary,
      traceSummary: result.traceSummary,
      reason: input.reason,
      stepIndex: input.stepIndex,
    });
  } catch (error) {
    return finishToolCall({
      id: callId,
      toolName: tool.name,
      toolInput: parsedInput.data,
      context: input.context,
      startedAt,
      status: "failed",
      error: {
        code: "execution_failed",
        message: "Readonly tool execution failed.",
        detail: error instanceof Error ? error.message : error,
      },
      reason: input.reason,
      stepIndex: input.stepIndex,
    });
  }
}

function finishToolCall(input: {
  id: string;
  toolName: string;
  toolInput: unknown;
  context: ControlledToolContext;
  startedAt: number;
  status: "success" | "failed";
  modelSummary?: unknown;
  traceSummary?: unknown;
  error?: ControlledToolError;
  reason?: string;
  stepIndex?: number;
}): ExecutedToolCall {
  const durationMs = Date.now() - input.startedAt;
  const toolName = input.toolName as ReadonlyToolName;
  const call: ExecutedToolCall = {
    id: input.id,
    toolName,
    input: input.toolInput,
    status: input.status,
    durationMs,
    modelSummary: input.modelSummary,
    traceSummary: input.traceSummary,
    error: input.error,
    priority: getToolPriority(toolName),
  };

  input.context.trace?.addStep({
    name: `${input.toolName} 只读工具执行`,
    type: "tool_call",
    status: input.status === "success" ? "success" : "failed",
    input: {
      toolName: input.toolName,
      arguments: input.toolInput,
      reason: input.reason,
    },
    output: input.status === "success" ? input.traceSummary : undefined,
    error: input.error,
    metadata: {
      readonlyToolCallId: input.id,
      stepIndex: input.stepIndex,
      durationMs,
      fallback: input.status === "failed",
    },
  });

  return call;
}

function normalizeZodError(error: ZodError): ControlledToolError {
  return {
    code: "schema_validation_failed",
    message: "Readonly tool input did not match schema.",
    detail: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

function getToolPriority(toolName: ReadonlyToolName) {
  if (toolName === "getArtifactPayload") {
    return 1;
  }
  if (toolName === "getExerciseById") {
    return 2;
  }
  if (toolName === "searchArtifacts") {
    return 4;
  }
  return 5;
}
