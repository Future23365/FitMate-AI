import type { AgentObservation, JsonValue, ToolError, ToolResult } from "./contracts";
import { AGENT_ERROR_CODES } from "./errors";
import { redactJsonValue } from "./redaction";

/** OK_TOOL_RESULT_INDEX_OBSERVATION_ROLE 标记 ok=true 的 tool fact 已降级为索引通道。 */
export const OK_TOOL_RESULT_INDEX_OBSERVATION_ROLE = "ok_tool_result_index";

/** TOOL_RESULT_MODEL_PROJECTION_CHANNEL 指向成功 tool facts 的详细权威模型输入通道。 */
export const TOOL_RESULT_MODEL_PROJECTION_CHANNEL = "toolResults[].projection.model";

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
        details: result.error.details,
        fulfillment: {
          satisfied: result.fulfillment.satisfied,
          unmetRequirements: result.fulfillment.unmetRequirements,
        },
      }),
    };
  }

  return createOkToolResultIndexObservation(result);
}

/** createOkToolResultIndexObservation 只给 Planner 留成功执行结果索引，详细事实由 toolResults 承载。 */
function createOkToolResultIndexObservation(result: Extract<ToolResult, { ok: true }>): AgentObservation {
  return {
    type: "tool_result",
    source: "tool",
    toolResultId: result.toolResultId,
    toolName: result.toolName,
    ok: true,
    content: redactJsonValue({
      observationRole: OK_TOOL_RESULT_INDEX_OBSERVATION_ROLE,
      toolName: result.toolName,
      ok: true,
      fulfillment: createLightweightFulfillmentSummary(result),
      modelFactsChannel: TOOL_RESULT_MODEL_PROJECTION_CHANNEL,
      projectionModelOmitted: true,
      factLevel: result.fulfillment.satisfied ? "tool_result_index" : "diagnostic_tool_result_index",
      factSource: {
        detailedFacts: TOOL_RESULT_MODEL_PROJECTION_CHANNEL,
        projectionModelOmitted: true,
      },
    }),
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

/** createDuplicateToolInputObservation 提醒 Planner 复用同等执行结果或提交改变后的合法 input。 */
export function createDuplicateToolInputObservation(input: {
  toolName: string;
  toolVersion: string;
  normalizedInputHash: string;
  previousToolResultId: string;
  previousOk: boolean;
  previousSatisfied: boolean;
  repeatCount: number;
  resultSummary?: string;
}): AgentObservation {
  return {
    type: "invalid_action",
    source: "runtime",
    toolResultId: input.previousToolResultId,
    toolName: input.toolName,
    ok: false,
    content: redactJsonValue({
      code: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
      message: "当前 run 已经有相同 toolName、toolVersion 和 input 的执行结果；重复相同 input 不会产生新的 current-run 事实。",
      details: {
        toolName: input.toolName,
        toolVersion: input.toolVersion,
        normalizedInputHash: input.normalizedInputHash,
        previousOk: input.previousOk,
        previousSatisfied: input.previousSatisfied,
        repeatCount: input.repeatCount,
        resultSummary: input.resultSummary,
      },
    }),
  };
}

/** compressPlannerObservations 控制模型上下文增长，只保留可校验引用、错误码和安全摘要。 */
export function compressPlannerObservations(observations: AgentObservation[], maxContentCharacters = 1_200): AgentObservation[] {
  return observations.map((observation) => ({
    type: observation.type,
    source: observation.source,
    toolName: observation.toolName,
    ok: observation.ok,
    content: compactJsonValue(redactJsonValue(observation.content), maxContentCharacters),
  }));
}

function createLightweightFulfillmentSummary(result: Extract<ToolResult, { ok: true }>): JsonValue {
  const summary: Record<string, JsonValue> = {
    satisfied: result.fulfillment.satisfied,
    summary: result.fulfillment.summary,
  };

  if (result.fulfillment.producedResources) {
    summary.producedResourceCount = result.fulfillment.producedResources.length;
  }

  return summary;
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
