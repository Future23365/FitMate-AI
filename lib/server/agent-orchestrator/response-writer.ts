import "server-only";

import type {
  AgentAssistantSuggestion,
  AgentExecutionResult,
  AgentOperationSummary,
  AgentToolResultResourceRole,
  AgentToolResultRecord,
} from "./contracts";
import { resolveAgentToolResultResourceRole } from "./contracts";
import {
  assistantSuggestionListSchema,
  assistantSuggestionSchema,
  assistantSuggestionTargetOperationSchema,
  type AssistantSuggestion,
  type AssistantSuggestionKind,
  type AssistantSuggestionSource,
  type AssistantSuggestionTargetOperation,
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
  resourceRole?: AgentToolResultResourceRole;
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
    filteredSuggestions: AgentFilteredSuggestionSummary[];
  };
};

export type AgentResponseProjectionInput = {
  result: AgentExecutionResult;
  toolResults?: AgentToolResultRecord[];
};

export type AgentFilteredSuggestionSummary = {
  label: string;
  kind: AssistantSuggestionKind;
  source: AssistantSuggestionSource;
  targetOperation?: AssistantSuggestionTargetOperation;
  reason:
    | "unsupported_write_operation"
    | "missing_structured_operation_for_risky_source"
    | "invalid_suggestion_contract";
};

// Response Writer 只投影 AgentExecutionResult，避免重新解释用户语义或承诺未执行写入。
export function projectAgentExecutionResultToResponse(
  input: AgentResponseProjectionInput,
): AgentResponseProjection {
  const toolResultById = new Map(input.toolResults?.map((result) => [result.toolResultId, result]) ?? []);
  const references = collectResultReferences(input.result, toolResultById);

  switch (input.result.status) {
    case "answered": {
      const suggestionGate = buildAnsweredSuggestions(input.result);
      return {
        status: input.result.status,
        reply: resolveAnsweredReply(input.result.replyContext),
        assistantSuggestions: suggestionGate.visible,
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
          filteredSuggestions: suggestionGate.filtered,
        },
      };
    }
    case "needs_clarification": {
      const suggestionGate = normalizeAssistantSuggestions(input.result.assistantSuggestions, {
        kind: "clarification",
        blocking: true,
        source: "intent",
      });
      return {
        status: input.result.status,
        reply: input.result.question,
        assistantSuggestions: suggestionGate.visible,
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
          filteredSuggestions: suggestionGate.filtered,
        },
      };
    }
    case "generated":
      return {
        status: input.result.status,
        reply: `已为你生成「${input.result.artifact.title}」，可以在下方卡片查看训练内容。`,
        assistantSuggestions: [],
        references,
        metadata: {
          promisedWrite: true,
          hasExecutedWrite: true,
          safeOperationOnly: false,
          filteredSuggestions: [],
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
          filteredSuggestions: [],
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
          filteredSuggestions: [],
        },
      };
    case "blocked": {
      const suggestionGate = normalizeAssistantSuggestions(input.result.recoverySuggestions, {
        kind: "retry",
        blocking: true,
        source: "workout_generation",
      });
      return {
        status: input.result.status,
        reply: input.result.blockReason,
        assistantSuggestions: suggestionGate.visible,
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
          filteredSuggestions: suggestionGate.filtered,
        },
      };
    }
    case "failed": {
      const suggestionGate = normalizeAssistantSuggestions(input.result.recoverySuggestions, {
        kind: "retry",
        blocking: true,
        source: "workout_generation",
      });
      return {
        status: input.result.status,
        reply: "这次执行没有完成，我没有生成或修改训练结果。",
        assistantSuggestions: suggestionGate.visible,
        references,
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
          filteredSuggestions: suggestionGate.filtered,
        },
      };
    }
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
  const visible: AssistantSuggestion[] = [];
  const filtered: AgentFilteredSuggestionSummary[] = [];

  for (const suggestion of suggestions) {
    const candidate = {
      label: suggestion.label,
      message: suggestion.message,
      kind: defaults.kind,
      blocking: defaults.blocking,
      source: defaults.source,
      targetOperation: suggestion.targetOperation,
    };
    const parsed = assistantSuggestionSchema.safeParse(candidate);

    if (!parsed.success) {
      filtered.push({
        label: suggestion.label,
        kind: defaults.kind,
        source: defaults.source,
        targetOperation: suggestion.targetOperation,
        reason: "invalid_suggestion_contract",
      });
      continue;
    }

    const gate = evaluateSuggestionCapability(parsed.data);
    if (!gate.visible) {
      filtered.push({
        label: parsed.data.label,
        kind: parsed.data.kind,
        source: parsed.data.source,
        targetOperation: parsed.data.targetOperation,
        reason: gate.reason,
      });
      continue;
    }

    visible.push(parsed.data);
  }

  const parsedList = assistantSuggestionListSchema.safeParse(visible);

  return {
    visible: parsedList.success ? parsedList.data : [],
    filtered,
  };
}

// buildAnsweredSuggestions 只投影 Agent 显式给出的建议，避免 Response Writer 注入固定快捷按钮。
function buildAnsweredSuggestions(
  result: AgentExecutionResult & { status: "answered" },
) {
  return normalizeAssistantSuggestions(readReplyAssistantSuggestions(result.replyContext), {
    kind: "next_action",
    blocking: false,
    source: "exercise_recommendation",
  });
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

    const targetOperation = parseAgentSuggestionTargetOperation(record.targetOperation);

    return typeof record.label === "string" && typeof record.message === "string"
      ? [{ label: record.label, message: record.message, targetOperation }]
      : [];
  });
}

function parseAgentSuggestionTargetOperation(value: unknown): AgentAssistantSuggestion["targetOperation"] {
  const parsed = assistantSuggestionTargetOperationSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

function evaluateSuggestionCapability(suggestion: AssistantSuggestion):
  | { visible: true }
  | { visible: false; reason: AgentFilteredSuggestionSummary["reason"] } {
  if (suggestion.targetOperation) {
    return unsupportedSuggestionOperations.has(suggestion.targetOperation)
      ? { visible: false, reason: "unsupported_write_operation" }
      : { visible: true };
  }

  return isSafeLegacySuggestionSource(suggestion)
    ? { visible: true }
    : { visible: false, reason: "missing_structured_operation_for_risky_source" };
}

const unsupportedSuggestionOperations = new Set<AssistantSuggestionTargetOperation>([
  "unsupported_write",
  "save_artifact",
  "validate_and_save",
  "write_artifact",
]);

function isSafeLegacySuggestionSource(suggestion: AssistantSuggestion) {
  if (suggestion.kind === "clarification" && suggestion.source === "intent") {
    return true;
  }

  if (suggestion.source === "exercise_recommendation" && suggestion.kind === "next_action") {
    return true;
  }

  if (suggestion.source === "reference_resolution" && suggestion.kind === "clarification") {
    return true;
  }

  if (suggestion.source === "workout_patch" && suggestion.kind === "adjustment") {
    return true;
  }

  return false;
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
  toolResultById: Map<string, AgentToolResultRecord>,
): AgentResponseProjectionReference[] {
  const references: AgentResponseProjectionReference[] = [];

  for (const toolResultId of getUsedToolResultIds(result)) {
    const toolResult = toolResultById.get(toolResultId);
    references.push({
      kind: "tool_result",
      id: toolResult ? toolResultId : `missing:${toolResultId}`,
      resourceRole: toolResult ? resolveAgentToolResultResourceRole(toolResult) : undefined,
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
