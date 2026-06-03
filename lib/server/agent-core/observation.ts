import type { AgentObservation, JsonValue, ToolError, ToolResult } from "./contracts";
import { redactJsonValue } from "./redaction";

/** createToolObservation 将 ToolResult 投影成 Planner 可见安全 observation，不回灌完整 output。 */
export function createToolObservation(result: ToolResult): AgentObservation {
  if (!result.ok) {
    return {
      type: "tool_result",
      source: "tool",
      toolResultId: result.toolResultId,
      toolName: result.toolName,
      ok: false,
      content: redactJsonValue({
        code: result.error.code,
        message: result.error.message,
        fulfillment: {
          satisfied: result.fulfillment.satisfied,
          consumedResources: result.fulfillment.consumedResources,
          unmetRequirements: result.fulfillment.unmetRequirements,
        },
      }),
    };
  }

  return {
    type: "tool_result",
    source: "tool",
    toolResultId: result.toolResultId,
    toolName: result.toolName,
    ok: result.fulfillment.satisfied,
    content: redactJsonValue(withFulfillmentSummary(result.projection.model ?? {
      summary: result.fulfillment.summary,
      toolName: result.toolName,
      toolResultId: result.toolResultId,
    }, result)),
  };
}

/** createInvalidActionObservation 将非法 action 反馈给后续 Planner，M0 不做服务端语义改写。 */
export function createInvalidActionObservation(error: ToolError): AgentObservation {
  return {
    type: "invalid_action",
    source: "validator",
    ok: false,
    content: redactJsonValue({
      code: error.code,
      message: error.message,
      details: error.details,
    }),
  };
}

/** compressPlannerObservations 控制模型上下文增长，只保留可校验引用、错误码和安全摘要。 */
export function compressPlannerObservations(observations: AgentObservation[], maxContentCharacters = 1_200): AgentObservation[] {
  return observations.map((observation) => ({
    type: observation.type,
    source: observation.source,
    toolResultId: observation.toolResultId,
    toolName: observation.toolName,
    ok: observation.ok,
    content: compactJsonValue(redactJsonValue(observation.content), maxContentCharacters),
  }));
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
    content: redactJsonValue({
      code: error.code,
      message: error.message,
      details: error.details,
    }),
  };
}

function compactJsonValue(value: JsonValue, remainingCharacters: number): JsonValue {
  if (remainingCharacters <= 0) {
    return "[truncated]";
  }

  if (typeof value === "string") {
    if (value.length <= remainingCharacters) {
      return value;
    }
    return `${value.slice(0, remainingCharacters)}...[truncated]`;
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (Array.isArray(value)) {
    const nextBudget = Math.max(120, Math.floor(remainingCharacters / Math.max(value.length, 1)));
    return value.map((item) => compactJsonValue(item, nextBudget));
  }

  const result: Record<string, JsonValue> = {};
  const entries = Object.entries(value);
  const nextBudget = Math.max(120, Math.floor(remainingCharacters / Math.max(entries.length, 1)));

  for (const [key, child] of entries) {
    result[key] = compactJsonValue(child, nextBudget);
  }

  return result;
}
