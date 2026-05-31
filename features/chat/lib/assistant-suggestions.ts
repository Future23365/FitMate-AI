import type { ChatMessage, ChatStreamEvent } from "@/features/chat/types";
import {
  assistantSuggestionListSchema,
  type AssistantSuggestion,
} from "@/lib/shared/chat/assistant-suggestions";

// 前端建议适配层只做协议兼容，不重新解释业务来源，避免 UI 同时消费新旧两套字段。
export function readAssistantSuggestionsFromStreamEvent(event: ChatStreamEvent): AssistantSuggestion[] {
  if (event.type === "assistant_suggestions") {
    const parsed = assistantSuggestionListSchema.safeParse(event.assistantSuggestions);
    return parsed.success ? parsed.data : [];
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

export function getMessageAssistantSuggestions(message: ChatMessage): AssistantSuggestion[] {
  if (message.assistantSuggestions?.length) {
    return message.assistantSuggestions;
  }

  return readAssistantSuggestionsFromStreamEvent({
    type: "suggested_replies",
    suggestedReplies: message.suggestedReplies ?? message.suggestedQuestions ?? [],
  });
}
