import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";

const chatHistoryStorageKey = "fitmate.chatHistory";

export function readChatHistory(): ChatConversation[] {
  try {
    const rawHistory = window.localStorage.getItem(chatHistoryStorageKey);
    const parsedHistory = rawHistory ? (JSON.parse(rawHistory) as ChatConversation[]) : [];

    return Array.isArray(parsedHistory) ? parsedHistory : [];
  } catch {
    return [];
  }
}

export function createConversationTitle(nextMessages: ChatMessage[]) {
  const firstUserMessage = nextMessages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "新对话";

  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

export function saveChatConversation(
  conversationId: string,
  messages: ChatMessage[],
  bubblePlans: Record<string, WorkoutPlanDraft>,
  bubbleExerciseRecommendations: Record<string, ExerciseRecommendationCard> = {},
  conversationContext?: FitnessConversationContext,
) {
  const messagesToSave = messages.map(
    ({
      isReasoning: _isReasoning,
      reasoningContent: _reasoningContent,
      suggestedQuestions,
      ...message
    }) => ({
      ...message,
      suggestedReplies: message.suggestedReplies ?? suggestedQuestions,
    }),
  );

  if (!messagesToSave.some((message) => message.role === "user")) {
    return;
  }

  // 只保留属于当前对话消息的计划，避免存入无关数据
  const messageIds = new Set(messagesToSave.map((message) => message.id));
  const plansToSave: Record<string, WorkoutPlanDraft> = {};
  for (const [messageId, draft] of Object.entries(bubblePlans)) {
    if (messageIds.has(messageId)) {
      plansToSave[messageId] = draft;
    }
  }
  const exerciseRecommendationsToSave: Record<string, ExerciseRecommendationCard> = {};
  for (const [messageId, card] of Object.entries(bubbleExerciseRecommendations)) {
    if (messageIds.has(messageId)) {
      exerciseRecommendationsToSave[messageId] = card;
    }
  }

  const conversations = readChatHistory();
  const existing = conversations.find((conversation) => conversation.id === conversationId);

  if (existing) {
    const isIdentical =
      existing.messages.length === messagesToSave.length &&
      existing.messages.every(
        (message, index) =>
          message.id === messagesToSave[index]?.id &&
          message.content === messagesToSave[index]?.content &&
          message.role === messagesToSave[index]?.role &&
          JSON.stringify(message.suggestedReplies ?? message.suggestedQuestions ?? []) ===
            JSON.stringify(messagesToSave[index]?.suggestedReplies ?? []),
      ) &&
      JSON.stringify(existing.plans ?? {}) === JSON.stringify(plansToSave) &&
      JSON.stringify(existing.exerciseRecommendations ?? {}) ===
        JSON.stringify(exerciseRecommendationsToSave) &&
      JSON.stringify(existing.conversationContext ?? null) ===
        JSON.stringify(conversationContext ?? null);

    if (isIdentical) {
      return;
    }
  }

  const nextConversation: ChatConversation = {
    id: conversationId,
    title: createConversationTitle(messagesToSave),
    updatedAt: new Date().toISOString(),
    messages: messagesToSave,
    plans: Object.keys(plansToSave).length > 0 ? plansToSave : undefined,
    exerciseRecommendations:
      Object.keys(exerciseRecommendationsToSave).length > 0
        ? exerciseRecommendationsToSave
        : undefined,
    conversationContext,
  };
  const nextHistory = [
    nextConversation,
    ...conversations.filter((conversation) => conversation.id !== conversationId),
  ].slice(0, 30);

  window.localStorage.setItem(chatHistoryStorageKey, JSON.stringify(nextHistory));
  window.dispatchEvent(new Event("fitmate:chat-history-updated"));
}
