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
          consumedResources: result.fulfillment.consumedResources,
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
      toolResultId: result.toolResultId,
      toolName: result.toolName,
      ok: true,
      fulfillment: createLightweightFulfillmentSummary(result),
      terminalUsedRef: { type: "tool_result", id: result.toolResultId },
      modelFactsChannel: TOOL_RESULT_MODEL_PROJECTION_CHANNEL,
      projectionModelOmitted: true,
      boundary: "详细事实见 toolResults[].projection.model；此 observation 只保留 ok=true 执行结果索引，避免同一事实在 observations 和 toolResults 中重复传递。如需在 terminal action 引用本次结果，usedRefs[] 中复制 terminalUsedRef 的 type/id 形状，不要把 resourceType 写成 tool_result。只有 ok=true 且 fulfillment.satisfied=true 的结果可支撑成功 final_answer；satisfied=false 只能用于 ask_user、继续合法 tool_call、repair 或失败收口。",
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
  producedResources?: JsonValue;
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
        previousToolResultId: input.previousToolResultId,
        previousOk: input.previousOk,
        previousSatisfied: input.previousSatisfied,
        repeatCount: input.repeatCount,
        resultSummary: input.resultSummary,
        producedResources: input.producedResources,
        allowedNextActions: input.previousSatisfied
          ? [
              "基于 previousToolResultId 输出带 usedRefs 的合法 final_answer。",
              "调用其他当前 manifest 中可见且 input 不同的合法 tool。",
              "提交改变后的合法 tool input。",
              "使用 ask_user 澄清缺失信息。",
              "在当前事实不足时用不带 visibleOutputs 的 final_answer 失败收口。",
            ]
          : [
              "previousToolResultId 是 satisfied=false 诊断结果，不能支撑成功 final_answer。",
              "调用其他当前 manifest 中可见且 input 不同的合法 tool。",
              "提交改变后的合法 tool input。",
              "使用 ask_user 澄清缺失信息或放宽条件。",
              "在当前事实不足时交由 repair 或失败 fallback 收口。",
            ],
      },
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

function createLightweightFulfillmentSummary(result: Extract<ToolResult, { ok: true }>): JsonValue {
  const summary: Record<string, JsonValue> = {
    satisfied: result.fulfillment.satisfied,
    summary: result.fulfillment.summary,
  };

  if (result.fulfillment.producedResources) {
    summary.producedResources = result.fulfillment.producedResources as unknown as JsonValue;
  }

  if (result.fulfillment.consumedResources) {
    summary.consumedResources = result.fulfillment.consumedResources as unknown as JsonValue;
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
