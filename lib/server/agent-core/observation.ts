import type { AgentObservation, ToolError, ToolResult } from "./contracts";

/** createToolObservation 将 ToolResult 投影成 Planner 可见安全 observation，不回灌完整 output。 */
export function createToolObservation(result: ToolResult): AgentObservation {
  if (!result.ok) {
    return {
      type: "tool_result",
      source: "tool",
      toolResultId: result.toolResultId,
      toolName: result.toolName,
      ok: false,
      content: {
        code: result.error.code,
        message: result.error.message,
      },
    };
  }

  return {
    type: "tool_result",
    source: "tool",
    toolResultId: result.toolResultId,
    toolName: result.toolName,
    ok: true,
    content: result.projection.model ?? {
      summary: result.fulfillment.summary,
      toolName: result.toolName,
      toolResultId: result.toolResultId,
    },
  };
}

/** createInvalidActionObservation 将非法 action 反馈给后续 Planner，M0 不做服务端语义改写。 */
export function createInvalidActionObservation(error: ToolError): AgentObservation {
  return {
    type: "invalid_action",
    source: "validator",
    ok: false,
    content: {
      code: error.code,
      message: error.message,
    },
  };
}

/** createRuntimeErrorObservation 用于记录 maxSteps、timeout 等运行时边界触发。 */
export function createRuntimeErrorObservation(error: ToolError): AgentObservation {
  return {
    type: "runtime_error",
    source: "runtime",
    ok: false,
    content: {
      code: error.code,
      message: error.message,
    },
  };
}

