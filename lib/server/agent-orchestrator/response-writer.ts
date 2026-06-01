import "server-only";

import type {
  AgentAssistantSuggestion,
  AgentExecutionResult,
  AgentOperationSummary,
  AgentToolResultRecord,
} from "./contracts";
import {
  assistantSuggestionListSchema,
  type AssistantSuggestion,
} from "@/lib/shared/chat/assistant-suggestions";

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
  assistantSuggestions: AssistantSuggestion[];
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
        assistantSuggestions: buildAnsweredSuggestions(input.result, input.toolResults ?? []),
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
        assistantSuggestions: normalizeAssistantSuggestions(input.result.assistantSuggestions, {
          kind: "clarification",
          blocking: true,
          source: "intent",
        }),
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
        assistantSuggestions: normalizeAssistantSuggestions(input.result.recoverySuggestions, {
          kind: "retry",
          blocking: true,
          source: "workout_generation",
        }),
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
        assistantSuggestions: normalizeAssistantSuggestions(input.result.recoverySuggestions, {
          kind: "retry",
          blocking: true,
          source: "workout_generation",
        }),
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

// normalizeAssistantSuggestions 是 Agent 宽松建议合同到前端统一建议协议的唯一出口。
function normalizeAssistantSuggestions(
  suggestions: AgentAssistantSuggestion[],
  defaults: Pick<AssistantSuggestion, "kind" | "blocking" | "source">,
) {
  const normalized = suggestions.map((suggestion) => ({
    label: suggestion.label,
    message: suggestion.message,
    kind: defaults.kind,
    blocking: defaults.blocking,
    source: defaults.source,
  }));
  const parsed = assistantSuggestionListSchema.safeParse(normalized);

  return parsed.success ? parsed.data : [];
}

// buildAnsweredSuggestions 为已完成的只读推荐结果补充下一步建议，不重新解释用户自然语言。
function buildAnsweredSuggestions(
  result: AgentExecutionResult & { status: "answered" },
  toolResults: AgentToolResultRecord[],
) {
  const explicitSuggestions = normalizeAssistantSuggestions(readReplyAssistantSuggestions(result.replyContext), {
    kind: "next_action",
    blocking: false,
    source: "exercise_recommendation",
  });

  if (explicitSuggestions.length > 0) {
    return explicitSuggestions;
  }

  const usedToolResultIds = new Set(result.usedToolResultIds);
  const hasRecommendationSource = toolResults.some((toolResult) => (
    usedToolResultIds.has(toolResult.toolResultId) &&
    toolResult.toolName === "searchExercises" &&
    toolResult.status === "success" &&
    readToolResultCandidateUse(toolResult) === "recommendation" &&
    Boolean(toolResult.candidateSetId)
  ));

  if (!hasRecommendationSource) {
    return [];
  }

  return assistantSuggestionListSchema.parse([
    {
      label: "生成训练",
      message: "按这些动作生成一套适合我的训练",
      kind: "next_action",
      blocking: false,
      source: "exercise_recommendation",
    },
    {
      label: "换一批",
      message: "换一批更简单的动作",
      kind: "adjustment",
      blocking: false,
      source: "exercise_recommendation",
    },
  ]);
}

function readToolResultCandidateUse(toolResult: AgentToolResultRecord) {
  const summary = toolResult.modelSummary;

  if (!summary || typeof summary !== "object") {
    return undefined;
  }

  const candidateUse = (summary as Record<string, unknown>).candidateUse;

  return typeof candidateUse === "string" ? candidateUse : undefined;
}

function readReplyAssistantSuggestions(replyContext: Record<string, unknown>): AgentAssistantSuggestion[] {
  const raw = replyContext.assistantSuggestions;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;

    return typeof record.label === "string" && typeof record.message === "string"
      ? [{ label: record.label, message: record.message }]
      : [];
  });
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
