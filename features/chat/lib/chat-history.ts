"use client";

import { clientRequest } from "@/lib/client/http/client-request";
import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";

type ChatHistoryResponse = {
  items: ChatConversation[];
};

type ChatConversationResponse = {
  item: ChatConversation;
};

export async function readChatHistory(): Promise<ChatConversation[]> {
  const data = await clientRequest<ChatHistoryResponse>("/api/chat/conversations", {
    errorMessage: "聊天历史加载失败",
  });

  return data.items;
}

export async function readChatConversation(id: string): Promise<ChatConversation | null> {
  try {
    const data = await clientRequest<ChatConversationResponse>(
      `/api/chat/conversations/${encodeURIComponent(id)}`,
      { errorMessage: "聊天记录加载失败" },
    );

    return data.item;
  } catch {
    return null;
  }
}

export async function deleteChatConversation(id: string) {
  await clientRequest(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    responseType: "raw",
    errorMessage: "删除对话失败",
  });
}

export function createConversationTitle(nextMessages: ChatMessage[]) {
  const firstUserMessage = nextMessages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "新对话";

  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

export async function saveChatConversation(
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
    return null;
  }

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

  const data = await clientRequest<ChatConversationResponse>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PUT",
      errorMessage: "保存对话失败",
      body: {
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
      },
    },
  );

  window.dispatchEvent(new Event("fitmate:chat-history-updated"));
  return data.item;
}
