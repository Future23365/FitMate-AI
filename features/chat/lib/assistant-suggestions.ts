import type { ChatMessage } from "@/features/chat/types";
import {
  assistantSuggestionSchema,
  type AssistantSuggestion,
} from "@/lib/shared/chat/assistant-suggestions";

// normalizeAssistantSuggestions 只校验统一建议对象，逐条丢弃坏项，不再消费旧 Agent stream 事件。
export function normalizeAssistantSuggestions(value: unknown): AssistantSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => assistantSuggestionSchema.safeParse(item))
    .filter((result): result is { success: true; data: AssistantSuggestion } => result.success)
    .map((result) => result.data)
    .slice(0, 3);
}

function createLegacySuggestionsFromReplies(rawReplies: unknown): AssistantSuggestion[] {
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

export function getMessageAssistantSuggestions(message: ChatMessage): AssistantSuggestion[] {
  if (message.assistantSuggestions?.length) {
    return normalizeAssistantSuggestions(message.assistantSuggestions);
  }

  return createLegacySuggestionsFromReplies(message.suggestedReplies ?? message.suggestedQuestions ?? []);
}
