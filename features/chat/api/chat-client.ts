import { clientRequest } from "@/lib/client/http/client-request";

import type { ApiChatMessage } from "@/features/chat/types";
import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { WorkoutPlanDraft, WorkoutRoutineDraft } from "@/lib/shared/workout-plans/draft-schema";

type WorkoutPlanDraftResponse = {
  ok: boolean;
  kind?: "plan" | "routine";
  message?: string;
  draft?: WorkoutPlanDraft | WorkoutRoutineDraft;
  candidates?: WorkoutPlanCandidateResponse;
};

export type WorkoutPlanDraftPayload = {
  kind: "plan" | "routine";
  draft: WorkoutPlanDraft | WorkoutRoutineDraft;
  exercises: Exercise[];
};

type WorkoutPlanCandidateResponse = {
  primaryCandidates?: Array<{ exercise?: Exercise }>;
  supplementaryCandidates?: Array<{ exercise?: Exercise }>;
};

type ExerciseRecommendationResponse = {
  ok: boolean;
  message?: string;
  card?: ExerciseRecommendationCard;
};

type ExerciseRecommendationRequestOptions = {
  excludeExerciseIds?: string[];
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
): Promise<WorkoutPlanDraftPayload> {
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

  const kind = data.kind ?? ("days" in data.draft ? "plan" : "routine");

  return {
    kind,
    draft: data.draft,
    exercises: collectDraftExercisesFromCandidates(data.draft, data.candidates),
  };
}

function collectDraftExercisesFromCandidates(
  draft: WorkoutPlanDraft | WorkoutRoutineDraft,
  candidates?: WorkoutPlanCandidateResponse,
) {
  const draftExerciseIds = new Set(
    ("days" in draft
      ? draft.days.flatMap((day) => day.items)
      : draft.sections.flatMap((section) => section.items)
    ).map((item) => item.exerciseId.toLowerCase()),
  );
  const exerciseById = new Map<string, Exercise>();

  for (const candidate of [
    ...(candidates?.primaryCandidates ?? []),
    ...(candidates?.supplementaryCandidates ?? []),
  ]) {
    const exercise = candidate.exercise;

    if (!exercise || !draftExerciseIds.has(exercise.id.toLowerCase())) {
      continue;
    }

    exerciseById.set(exercise.id.toLowerCase(), exercise);
  }

  return [...exerciseById.values()];
}

export async function requestExerciseRecommendations(
  messages: ApiChatMessage[],
  intent: unknown,
  conversationContext: FitnessConversationContext,
  parentTraceId?: string,
  options: ExerciseRecommendationRequestOptions = {},
) {
  const data = await clientRequest<ExerciseRecommendationResponse>("/api/ai/exercise-recommendations", {
    method: "POST",
    body: {
      messages,
      intent,
      conversationContext,
      parentTraceId,
      excludeExerciseIds: options.excludeExerciseIds,
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
