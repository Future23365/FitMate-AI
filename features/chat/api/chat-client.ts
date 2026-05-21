import { clientRequest } from "@/lib/client/http/client-request";

import type { ApiChatMessage } from "@/features/chat/types";
import type { WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";

type WorkoutPlanDraftResponse = {
  ok: boolean;
  message?: string;
  draft?: WorkoutPlanDraft;
};

export function requestChatStream(
  messages: ApiChatMessage[],
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
      thinkingEnabled,
    },
  });
}

export async function requestWorkoutPlanDraft(
  messages: ApiChatMessage[],
  intent: unknown,
) {
  const data = await clientRequest<WorkoutPlanDraftResponse>("/api/ai/workout-plan", {
    method: "POST",
    body: {
      messages,
      intent,
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
