import type { PlannerVisibleToolResult, ToolResult } from "./contracts";

/** toPlannerVisibleToolResult 构造 Planner 专用低风险投影，避免完整 ToolResult 进入模型上下文。 */
export function toPlannerVisibleToolResult(result: ToolResult): PlannerVisibleToolResult {
  if (!result.ok) {
    return {
      toolName: result.toolName,
      ok: false,
      error: result.error,
      fulfillment: createPlannerVisibleFulfillment(result.fulfillment),
    };
  }

  return {
    toolName: result.toolName,
    ok: true,
    projection: {
      model: result.projection.model,
    },
    fulfillment: createPlannerVisibleFulfillment(result.fulfillment),
  };
}

/** createPlannerVisibleFulfillment 只保留模型决策需要的业务状态，不暴露 resource/tool result 引用。 */
function createPlannerVisibleFulfillment(result: ToolResult["fulfillment"]): PlannerVisibleToolResult["fulfillment"] {
  return {
    summary: result.summary,
    satisfied: result.satisfied,
    unmetRequirements: result.unmetRequirements,
  };
}
