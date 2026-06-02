import type { ChatMessage, ChatStreamEvent } from "@/features/chat/types";
import type { AssistantSuggestion } from "@/lib/shared/chat/assistant-suggestions";

// 前端建议适配层只做协议兼容，不重新解释业务来源，避免 UI 同时消费新旧两套字段。
export function readAssistantSuggestionsFromStreamEvent(event: ChatStreamEvent): AssistantSuggestion[] {
  if (event.type === "assistant_suggestions") {
    return readAssistantSuggestionListLightweight(event.assistantSuggestions);
  }

  const rawReplies =
    event.type === "suggested_replies"
      ? event.suggestedReplies
      : event.type === "suggested_questions"
        ? event.suggestedQuestions
        : [];

  if (!Array.isArray(rawReplies)) {
    return [];
  }

  return rawReplies
    .filter((reply): reply is string => typeof reply === "string")
    .map((reply) => reply.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((reply) => ({
      label: reply.length > 40 ? `${reply.slice(0, 38)}…` : reply,
      message: reply,
      kind: "clarification",
      blocking: true,
      source: "legacy",
    }));
}

// readAssistantSuggestionListLightweight 只校验 UI 展示所需字段，服务端仍负责完整 schema 契约。
function readAssistantSuggestionListLightweight(value: unknown): AssistantSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readAssistantSuggestionLightweight(item))
    .filter((item): item is AssistantSuggestion => Boolean(item))
    .slice(0, 3);
}

function readAssistantSuggestionLightweight(value: unknown): AssistantSuggestion | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const message = typeof raw.message === "string" ? raw.message.trim() : "";

  if (!label || !message) {
    return null;
  }

  return {
    label,
    message,
    kind: readSuggestionKind(raw.kind),
    blocking: typeof raw.blocking === "boolean" ? raw.blocking : false,
    source: readSuggestionSource(raw.source),
  };
}

function readSuggestionKind(value: unknown): AssistantSuggestion["kind"] {
  return value === "clarification" ||
    value === "next_action" ||
    value === "adjustment" ||
    value === "retry" ||
    value === "confirmation"
    ? value
    : "clarification";
}

function readSuggestionSource(value: unknown): AssistantSuggestion["source"] {
  return value === "intent" ||
    value === "exercise_recommendation" ||
    value === "workout_generation" ||
    value === "artifact_failure" ||
    value === "reference_resolution" ||
    value === "workout_patch" ||
    value === "patch_confirmation" ||
    value === "legacy"
    ? value
    : "legacy";
}

export function getMessageAssistantSuggestions(message: ChatMessage): AssistantSuggestion[] {
  if (message.assistantSuggestions?.length) {
    return message.assistantSuggestions;
  }

  return readAssistantSuggestionsFromStreamEvent({
    type: "suggested_replies",
    suggestedReplies: message.suggestedReplies ?? message.suggestedQuestions ?? [],
  });
}
