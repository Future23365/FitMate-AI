import type { AgentRunResult, AgentStreamEvent, JsonValue, ToolResult } from "./contracts";
import { redactJsonValue, redactToolError } from "./redaction";

const genericUserVisibleErrorMessage = "聊天生成失败，请稍后重试。";

/** renderAgentResponseEvents 将 Runtime 收口结果转换为默认 NDJSON 白名单事件。 */
export function renderAgentResponseEvents(result: AgentRunResult): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];

  for (const toolResult of result.toolResults) {
    if (toolResult.ok && toolResult.fulfillment.satisfied) {
      events.push(renderToolResultEvent(toolResult));
    }
  }

  if (result.confirmationRequest) {
    events.push({
      type: "confirmation_request",
      pendingActionId: result.confirmationRequest.pendingActionId,
      actionHash: result.confirmationRequest.actionHash,
      expiresAt: result.confirmationRequest.expiresAt,
      message: result.confirmationRequest.message,
      toolName: result.confirmationRequest.toolName,
    });
  } else if (result.terminalAction?.type === "final_answer") {
    events.push({ type: "content", content: result.terminalAction.content });

    if (result.terminalAction.assistantSuggestions?.length) {
      events.push({ type: "assistant_suggestions", suggestions: result.terminalAction.assistantSuggestions });
    }
  } else if (result.terminalAction?.type === "ask_user") {
    events.push({ type: "content", content: result.terminalAction.question });

    if (result.terminalAction.suggestions?.length) {
      events.push({ type: "assistant_suggestions", suggestions: result.terminalAction.suggestions });
    }
  } else if (result.terminalError) {
    events.push({ type: "error", error: renderUserSafeToolError(result.terminalError) });
  }

  events.push({ type: "done" });
  return events;
}

/** renderAgentResponseNdjson 输出与生产流协议形态兼容的 NDJSON 字符串，但不接入生产路由。 */
export function renderAgentResponseNdjson(result: AgentRunResult): string {
  return renderAgentResponseEvents(result)
    .map((event) => JSON.stringify(event))
    .join("\n");
}

function renderToolResultEvent(result: Extract<ToolResult, { ok: true }>): AgentStreamEvent {
  return {
    type: "tool_result",
    toolResultId: result.toolResultId,
    toolName: result.toolName,
    content: redactJsonValue(result.projection.user ?? defaultToolResultSummary(result)),
  };
}

function defaultToolResultSummary(result: ToolResult): JsonValue {
  return {
    summary: result.fulfillment.summary,
    toolName: result.toolName,
    toolResultId: result.toolResultId,
  };
}

function renderUserSafeToolError(error: NonNullable<AgentRunResult["terminalError"]>) {
  const redactedError = redactToolError(error);

  // 默认 renderer 只负责通用安全边界：保留 code/details 供诊断，不把内部 message 暴露给用户事件。
  return {
    ...redactedError,
    message: genericUserVisibleErrorMessage,
  };
}
