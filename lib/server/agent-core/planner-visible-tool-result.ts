import type { PlannerVisibleToolResult, ToolResult } from "./contracts";

/** toPlannerVisibleToolResult 构造 Planner 专用低风险投影，避免完整 ToolResult 进入模型上下文。 */
export function toPlannerVisibleToolResult(result: ToolResult): PlannerVisibleToolResult {
  if (!result.ok) {
    return {
      toolResultId: result.toolResultId,
      toolName: result.toolName,
      ok: false,
      error: result.error,
      fulfillment: result.fulfillment,
    };
  }

  return {
    toolResultId: result.toolResultId,
    toolName: result.toolName,
    ok: true,
    projection: {
      model: result.projection.model,
    },
    fulfillment: result.fulfillment,
  };
}
