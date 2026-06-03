import type { AgentObservation, JsonValue, ToolError, ToolResult } from "./contracts";

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
    ok: result.fulfillment.satisfied,
    content: withFulfillmentSummary(result.projection.model ?? {
      summary: result.fulfillment.summary,
      toolName: result.toolName,
      toolResultId: result.toolResultId,
    }, result),
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

function withFulfillmentSummary(content: JsonValue, result: Extract<ToolResult, { ok: true }>): JsonValue {
  const fulfillment = {
    satisfied: result.fulfillment.satisfied,
  };
  const resourceSummary: Record<string, JsonValue> = { ...fulfillment };

  if (result.fulfillment.producedResources) {
    resourceSummary.producedResources = result.fulfillment.producedResources as unknown as JsonValue;
  }

  if (result.fulfillment.consumedResources) {
    resourceSummary.consumedResources = result.fulfillment.consumedResources as unknown as JsonValue;
  }

  if (content && typeof content === "object" && !Array.isArray(content)) {
    const objectContent: Record<string, JsonValue> = { ...(content as Record<string, JsonValue>) };
    objectContent.fulfillment = resourceSummary;
    return objectContent;
  }

  return {
    value: content,
    fulfillment: resourceSummary,
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
