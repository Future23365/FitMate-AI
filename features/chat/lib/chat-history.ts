"use client";

import { clientRequest } from "@/lib/client/http/client-request";
import type { ChatConversation, ChatMessage } from "@/features/chat/types";
import type { ConversationSummaryContext, FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type {
  WorkoutPlanDraft,
  WorkoutPlanIntent,
  WorkoutRoutineDraft,
} from "@/lib/shared/workout-plans/draft-schema";

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

// createChatConversationSavePayload 显式白名单持久化字段，避免请求态 UI 字段进入聊天历史。
export function createChatConversationSavePayload(
  conversationId: string,
  messages: ChatMessage[],
  bubblePlans: Record<string, WorkoutPlanDraft>,
  bubbleRoutines: Record<string, WorkoutRoutineDraft> = {},
  bubbleExerciseRecommendations: Record<string, ExerciseRecommendationCard> = {},
  bubbleRecommendationIntents: Record<string, WorkoutPlanIntent> = {},
  conversationSummary?: Pick<ConversationSummaryContext, "summary">,
  conversationContext?: FitnessConversationContext,
) {
  const messagesToSave = messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    assistantSuggestions: message.assistantSuggestions,
    suggestedReplies: message.suggestedReplies ?? message.suggestedQuestions,
    visibleOutputs: message.visibleOutputs,
  }));

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
  const routinesToSave: Record<string, WorkoutRoutineDraft> = {};
  for (const [messageId, draft] of Object.entries(bubbleRoutines)) {
    if (messageIds.has(messageId)) {
      routinesToSave[messageId] = draft;
    }
  }
  const exerciseRecommendationsToSave: Record<string, ExerciseRecommendationCard> = {};
  for (const [messageId, card] of Object.entries(bubbleExerciseRecommendations)) {
    if (messageIds.has(messageId)) {
      exerciseRecommendationsToSave[messageId] = card;
    }
  }
  const recommendationIntentsToSave: Record<string, WorkoutPlanIntent> = {};
  for (const [messageId, intent] of Object.entries(bubbleRecommendationIntents)) {
    if (messageIds.has(messageId)) {
      recommendationIntentsToSave[messageId] = intent;
    }
  }

  return {
    id: conversationId,
    title: createConversationTitle(messagesToSave),
    updatedAt: new Date().toISOString(),
    messages: messagesToSave,
    plans: Object.keys(plansToSave).length > 0 ? plansToSave : undefined,
    routines: Object.keys(routinesToSave).length > 0 ? routinesToSave : undefined,
    exerciseRecommendations:
      Object.keys(exerciseRecommendationsToSave).length > 0
        ? exerciseRecommendationsToSave
        : undefined,
    recommendationIntents:
      Object.keys(recommendationIntentsToSave).length > 0
        ? recommendationIntentsToSave
        : undefined,
    conversationSummary,
    conversationContext,
  };
}

export async function saveChatConversation(
  conversationId: string,
  messages: ChatMessage[],
  bubblePlans: Record<string, WorkoutPlanDraft>,
  bubbleRoutines: Record<string, WorkoutRoutineDraft> = {},
  bubbleExerciseRecommendations: Record<string, ExerciseRecommendationCard> = {},
  bubbleRecommendationIntents: Record<string, WorkoutPlanIntent> = {},
  conversationSummary?: Pick<ConversationSummaryContext, "summary">,
  conversationContext?: FitnessConversationContext,
) {
  const payload = createChatConversationSavePayload(
    conversationId,
    messages,
    bubblePlans,
    bubbleRoutines,
    bubbleExerciseRecommendations,
    bubbleRecommendationIntents,
    conversationSummary,
    conversationContext,
  );

  if (!payload) {
    return null;
  }

  const data = await clientRequest<ChatConversationResponse>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PUT",
      errorMessage: "保存对话失败",
      body: payload,
    },
  );

  window.dispatchEvent(new Event("fitmate:chat-history-updated"));
  return data.item;
}
