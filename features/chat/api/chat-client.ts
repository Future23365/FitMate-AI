import { clientRequest } from "@/lib/client/http/client-request";

import type { ApiChatMessage } from "@/features/chat/types";
import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";

type WorkoutPlanDraftResponse = {
  ok: boolean;
  message?: string;
  draft?: WorkoutPlanDraft;
};

type ExerciseRecommendationResponse = {
  ok: boolean;
  message?: string;
  card?: ExerciseRecommendationCard;
};

export function requestChatStream(
  messages: ApiChatMessage[],
  conversationContext: FitnessConversationContext,
  thinkingEnabled: boolean,
  signal: AbortSignal,
) {
  return clientRequest("/api/chat", {
    method: "POST",
    responseType: "raw",
    throwOnError: false,
    signal,
    body: {
      messages,
      conversationContext,
      thinkingEnabled,
    },
  });
}

export async function requestWorkoutPlanDraft(
  messages: ApiChatMessage[],
  intent: unknown,
  conversationContext: FitnessConversationContext,
  parentTraceId?: string,
) {
  const data = await clientRequest<WorkoutPlanDraftResponse>("/api/ai/workout-plan", {
    method: "POST",
    body: {
      messages,
      intent,
      conversationContext,
      parentTraceId,
    },
  });

  if (!data.ok) {
    throw new Error(data.message || "FitMate 安全引擎在校验时发现问题，无法生成计划。");
  }

  if (!data.draft) {
    throw new Error("训练计划生成失败，请稍后重试。");
  }

  return data.draft;
}

export async function requestExerciseRecommendations(
  messages: ApiChatMessage[],
  intent: unknown,
  conversationContext: FitnessConversationContext,
  parentTraceId?: string,
) {
  const data = await clientRequest<ExerciseRecommendationResponse>("/api/ai/exercise-recommendations", {
    method: "POST",
    body: {
      messages,
      intent,
      conversationContext,
      parentTraceId,
    },
  });

  if (!data.ok) {
    throw new Error(data.message || "动作推荐生成失败，请稍后重试。");
  }

  if (!data.card) {
    throw new Error("动作推荐生成失败，请稍后重试。");
  }

  return data.card;
}
