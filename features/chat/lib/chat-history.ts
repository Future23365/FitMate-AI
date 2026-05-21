import type { ChatConversation, ChatMessage } from "@/features/chat/types";
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
) {
  if (!messages.some((message) => message.role === "user")) {
    return;
  }

  // 只保留属于当前对话消息的计划，避免存入无关数据
  const messageIds = new Set(messages.map((message) => message.id));
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
      existing.messages.length === messages.length &&
      existing.messages.every(
        (message, index) =>
          message.id === messages[index]?.id &&
          message.content === messages[index]?.content &&
          message.role === messages[index]?.role &&
          message.reasoningContent === messages[index]?.reasoningContent,
      ) &&
      JSON.stringify(existing.plans ?? {}) === JSON.stringify(plansToSave) &&
      JSON.stringify(existing.exerciseRecommendations ?? {}) ===
        JSON.stringify(exerciseRecommendationsToSave);

    if (isIdentical) {
      return;
    }
  }

  const nextConversation: ChatConversation = {
    id: conversationId,
    title: createConversationTitle(messages),
    updatedAt: new Date().toISOString(),
    messages,
    plans: Object.keys(plansToSave).length > 0 ? plansToSave : undefined,
    exerciseRecommendations:
      Object.keys(exerciseRecommendationsToSave).length > 0
        ? exerciseRecommendationsToSave
        : undefined,
  };
  const nextHistory = [
    nextConversation,
    ...conversations.filter((conversation) => conversation.id !== conversationId),
  ].slice(0, 30);

  window.localStorage.setItem(chatHistoryStorageKey, JSON.stringify(nextHistory));
  window.dispatchEvent(new Event("fitmate:chat-history-updated"));
}
