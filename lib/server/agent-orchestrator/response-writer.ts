import "server-only";

import type {
  AgentAssistantSuggestion,
  AgentExecutionResult,
  AgentOperationSummary,
  AgentToolResultRecord,
} from "./contracts";

export type AgentResponseProjectionReference = {
  kind:
    | "tool_result"
    | "revision"
    | "validation"
    | "policy_decision"
    | "operation_result"
    | "blocking_reason";
  id: string;
};

export type AgentResponseProjection = {
  status: AgentExecutionResult["status"];
  reply: string;
  assistantSuggestions: AgentAssistantSuggestion[];
  references: AgentResponseProjectionReference[];
  metadata: {
    promisedWrite: boolean;
    hasExecutedWrite: boolean;
    safeOperationOnly: boolean;
  };
};

export type AgentResponseProjectionInput = {
  result: AgentExecutionResult;
  toolResults?: AgentToolResultRecord[];
};

// Response Writer 只投影 AgentExecutionResult，避免重新解释用户语义或承诺未执行写入。
export function projectAgentExecutionResultToResponse(
  input: AgentResponseProjectionInput,
): AgentResponseProjection {
  const knownToolResultIds = new Set(input.toolResults?.map((result) => result.toolResultId) ?? []);
  const references = collectResultReferences(input.result, knownToolResultIds);

  switch (input.result.status) {
    case "answered":
      return {
        status: input.result.status,
        reply: resolveAnsweredReply(input.result.replyContext),
        assistantSuggestions: [],
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
        },
      };
    case "needs_clarification":
      return {
        status: input.result.status,
        reply: input.result.question,
        assistantSuggestions: input.result.assistantSuggestions,
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
        },
      };
    case "generated":
      return {
        status: input.result.status,
        reply: `已生成「${input.result.artifact.title}」，并通过训练结构校验。`,
        assistantSuggestions: [],
        references,
        metadata: {
          promisedWrite: true,
          hasExecutedWrite: true,
          safeOperationOnly: false,
        },
      };
    case "patched":
      return {
        status: input.result.status,
        reply: `已更新「${input.result.artifact.title}」：${input.result.patchResult.summary}`,
        assistantSuggestions: [],
        references,
        metadata: {
          promisedWrite: true,
          hasExecutedWrite: true,
          safeOperationOnly: false,
        },
      };
    case "completed_operation":
      return {
        status: input.result.status,
        reply: buildCompletedOperationReply(input.result.operation),
        assistantSuggestions: [],
        references,
        metadata: {
          promisedWrite: true,
          hasExecutedWrite: true,
          safeOperationOnly: true,
        },
      };
    case "blocked":
      return {
        status: input.result.status,
        reply: input.result.blockReason,
        assistantSuggestions: input.result.recoverySuggestions,
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
        },
      };
    case "failed":
      return {
        status: input.result.status,
        reply: "这次执行没有完成，我没有生成或修改训练结果。",
        assistantSuggestions: input.result.recoverySuggestions,
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
        },
      };
  }
}

// validateAgentResponseProjection 确认回复引用都来自本轮 Agent 结果和已登记 tool result。
export function validateAgentResponseProjection(input: AgentResponseProjectionInput) {
  const knownToolResultIds = new Set(input.toolResults?.map((result) => result.toolResultId) ?? []);
  const missingToolResultIds = getUsedToolResultIds(input.result).filter((id) => !knownToolResultIds.has(id));

  return {
    ok: missingToolResultIds.length === 0,
    missingToolResultIds,
  };
}

function resolveAnsweredReply(replyContext: Record<string, unknown>) {
  const directReply = replyContext.reply;

  if (typeof directReply === "string" && directReply.trim()) {
    return directReply.trim();
  }

  const summary = replyContext.summary;

  if (typeof summary === "string" && summary.trim()) {
    return summary.trim();
  }

  return "我已经根据本轮可用的上下文完成回答。";
}

function buildCompletedOperationReply(operation: AgentOperationSummary) {
  const visibleFields = operation.visibleFields
    .map((field) => `${field.label}：${String(field.value)}`)
    .join("；");

  return visibleFields
    ? `${operation.title}：${operation.summary}（${visibleFields}）`
    : `${operation.title}：${operation.summary}`;
}

function collectResultReferences(
  result: AgentExecutionResult,
  knownToolResultIds: Set<string>,
): AgentResponseProjectionReference[] {
  const references: AgentResponseProjectionReference[] = [];

  for (const toolResultId of getUsedToolResultIds(result)) {
    references.push({
      kind: "tool_result",
      id: knownToolResultIds.has(toolResultId) ? toolResultId : `missing:${toolResultId}`,
    });
  }

  if ("revisionId" in result) {
    references.push({ kind: "revision", id: result.revisionId });
  }

  if ("validationId" in result) {
    references.push({ kind: "validation", id: result.validationId });
  }

  if ("policyDecisionId" in result && result.policyDecisionId) {
    references.push({ kind: "policy_decision", id: result.policyDecisionId });
  }

  if (result.status === "completed_operation") {
    references.push({ kind: "operation_result", id: result.operationResultId });
  }

  if (result.status === "blocked") {
    references.push({ kind: "blocking_reason", id: result.blockReason });
  }

  return references;
}

function getUsedToolResultIds(result: AgentExecutionResult) {
  return "usedToolResultIds" in result ? result.usedToolResultIds : [];
}
