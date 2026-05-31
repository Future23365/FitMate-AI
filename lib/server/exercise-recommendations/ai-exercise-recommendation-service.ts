import "server-only";

import { z } from "zod";

import { buildPromptFromModules } from "@/lib/server/ai/prompt-config";
import {
  getStageDecision,
  type AiTokenBudgetDecision,
} from "@/lib/server/ai/token-budget";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import { serverRequest } from "@/lib/server/http/server-request";
import type { ExerciseCandidate } from "@/lib/server/workout-plans";
import {
  exerciseRecommendationCardSchema,
  type ExerciseRecommendationCard,
  type ExerciseRecommendationIntent,
} from "@/lib/shared/exercise-recommendations/schema";
import { buildConversationSummaryContext } from "@/lib/shared/chat/fitness-conversation-context";

type DeepSeekChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type GenerateAiExerciseRecommendationsRequest = {
  apiKey: string;
  intent: ExerciseRecommendationIntent;
  latestUserMessage: string;
  conversationSummary: string;
  candidates: ExerciseCandidate[];
  safetyNotes: string[];
  excludeExerciseIds: string[];
  tokenBudgetDecision?: AiTokenBudgetDecision;
  trace?: AiTraceLogger;
};

type GenerateAiExerciseRecommendationsResult =
  | {
      ok: true;
      card: ExerciseRecommendationCard;
    }
  | {
      ok: false;
      code: "ai_request_failed" | "empty_content" | "invalid_json" | "invalid_ai_output";
      message: string;
      detail?: unknown;
    };

const model = "deepseek-v4-flash";
const requestTimeoutMs = 45_000;

const modelOutputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  goal: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(260).optional(),
  items: z
    .array(
      z.object({
        exerciseId: z.string().trim().min(1),
        reasons: z.array(z.string().trim().min(1).max(120)).min(1).max(4),
      }),
    )
    .min(1)
    .max(10),
  safetyNotes: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
});

export async function generateAiExerciseRecommendations(
  request: GenerateAiExerciseRecommendationsRequest,
): Promise<GenerateAiExerciseRecommendationsResult> {
  const conversationSummaryContext = buildConversationSummaryContext({
    summary: request.conversationSummary,
    latestUserMessage: request.latestUserMessage,
  });
  const candidateById = new Map(
    request.candidates.map((candidate) => [candidate.exercise.id, candidate]),
  );
  const excludedExerciseIds = new Set(request.excludeExerciseIds);
  const messages: DeepSeekChatMessage[] = [
    {
      role: "system",
      content: buildPromptFromModules([
        "base_safety",
        "conversation_summary_context",
        "exercise_recommendation_generation",
        "exercise_candidate_constraints",
      ]),
    },
    {
      role: "user",
      content: JSON.stringify({
        intent: request.intent,
        conversationSummary: conversationSummaryContext.summary,
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        excludedExerciseIds: request.excludeExerciseIds,
        candidateExercises: request.candidates.map(toModelCandidateExercise),
      }),
    },
  ];

  const content = await requestDeepSeekRecommendationJson(
    request.apiKey,
    messages,
    request.trace,
    request.tokenBudgetDecision,
  );

  if (!content.ok) {
    return content;
  }

  const parsedJson = parseJsonObject(content.content);

  if (!parsedJson.ok) {
    return parsedJson;
  }

  const parsedOutput = modelOutputSchema.safeParse(parsedJson.value);

  if (!parsedOutput.success) {
    return {
      ok: false,
      code: "invalid_ai_output",
      message: "动作推荐模型输出结构校验失败。",
      detail: parsedOutput.error.flatten(),
    };
  }

  const selectedItems = dedupeByExerciseId(parsedOutput.data.items).filter(
    (item) => candidateById.has(item.exerciseId) && !excludedExerciseIds.has(item.exerciseId),
  );

  if (selectedItems.length === 0) {
    return {
      ok: false,
      code: "invalid_ai_output",
      message: "动作推荐模型没有返回合法候选动作。",
      detail: {
        returnedExerciseIds: parsedOutput.data.items.map((item) => item.exerciseId),
        candidateExerciseIds: [...candidateById.keys()],
        excludeExerciseIds: request.excludeExerciseIds,
      },
    };
  }

  const card = exerciseRecommendationCardSchema.parse({
    title: parsedOutput.data.title,
    goal: parsedOutput.data.goal || request.intent.goal,
    summary: parsedOutput.data.summary,
    items: selectedItems.map((item) => {
      const candidate = candidateById.get(item.exerciseId);
      const exercise = candidate?.exercise;

      if (!candidate || !exercise) {
        throw new Error(`Validated exerciseId disappeared from candidate map: ${item.exerciseId}`);
      }

      return {
        exerciseId: exercise.id,
        nameZh: exercise.nameZh,
        nameEn: exercise.nameEn,
        categoryZh: exercise.categoryZh ?? "训练",
        levelZh: exercise.levelZh ?? "初级",
        equipmentZh: exercise.equipmentZh ?? "未标注器械",
        primaryMusclesZh: exercise.primaryMusclesZh,
        secondaryMusclesZh: exercise.secondaryMusclesZh,
        imageUrl: exercise.imageUrls[0],
        reasons: item.reasons.length > 0 ? item.reasons : candidate.reasons.slice(0, 4),
      };
    }),
    safetyNotes: uniqueStrings([...request.safetyNotes, ...parsedOutput.data.safetyNotes]).slice(0, 8),
  });

  request.trace?.addStep({
    name: "动作推荐模型选择结果",
    type: "model_response",
    status: "success",
    output: {
      modelOutput: parsedOutput.data,
      card,
    },
  });

  return {
    ok: true,
    card,
  };
}

// 将服务端完整候选压缩成模型选择动作所需的最小字段，展示字段仍由服务端完整对象补齐。
function toModelCandidateExercise(candidate: ExerciseCandidate) {
  const exercise = candidate.exercise;

  return {
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    targetMusclesZh: exercise.primaryMusclesZh,
    equipmentOrLocation: exercise.equipmentZh,
    level: exercise.level,
    categoryZh: exercise.categoryZh,
    matchingReasons: candidate.reasons.slice(0, 4),
    candidateSource: candidate.source,
  };
}

async function requestDeepSeekRecommendationJson(
  apiKey: string,
  messages: DeepSeekChatMessage[],
  trace?: AiTraceLogger,
  tokenBudgetDecision?: AiTokenBudgetDecision,
): Promise<
  | { ok: true; content: string }
  | { ok: false; code: "ai_request_failed" | "empty_content"; message: string; detail?: unknown }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const budgetStage = getStageDecision(tokenBudgetDecision, "exercise_recommendation_generation");

  try {
    trace?.addStep({
      name: "动作推荐大模型请求",
      type: "model_request",
      input: {
        model,
        messages,
        stream: false,
        response_format: {
          type: "json_object",
        },
        thinking: {
          type: "disabled",
        },
      },
      metadata: {
        aiStage: "exercise_recommendation_generation",
        aiStageStatus: "executed",
        promptModules: budgetStage?.promptModules ?? ["exercise_recommendation_generation"],
        tokenBudgetDecision,
        candidateTrim: budgetStage?.candidateTrim,
        timeoutMs: requestTimeoutMs,
      },
    });

    const response = await serverRequest("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      responseType: "raw",
      throwOnError: false,
      signal: controller.signal,
      body: {
        model,
        messages,
        stream: false,
        response_format: {
          type: "json_object",
        },
        thinking: {
          type: "disabled",
        },
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "ai_request_failed",
        message: "DeepSeek action recommendation request failed.",
        detail: await response.text(),
      };
    }

    const body = (await response.json()) as DeepSeekChatResponse;
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    trace?.addStep({
      name: "动作推荐大模型回复",
      type: "model_response",
      output: {
        content,
      },
      metadata: {
        tokenUsage: body.usage,
        emptyContent: !content,
      },
    });

    if (!content) {
      return {
        ok: false,
        code: "empty_content",
        message: "DeepSeek action recommendation request returned empty content.",
      };
    }

    return {
      ok: true,
      content,
    };
  } catch (error) {
    return {
      ok: false,
      code: "ai_request_failed",
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek action recommendation request timed out."
          : "DeepSeek action recommendation request failed.",
      detail: error instanceof Error ? error.message : error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonObject(content: string):
  | { ok: true; value: unknown }
  | { ok: false; code: "invalid_json"; message: string; detail?: unknown } {
  const normalized = content.trim();
  const jsonText = normalized.startsWith("```")
    ? normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : normalized;

  try {
    return {
      ok: true,
      value: JSON.parse(jsonText),
    };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_json",
      message: "动作推荐模型返回了非法 JSON。",
      detail: error instanceof Error ? error.message : error,
    };
  }
}

function dedupeByExerciseId<T extends { exerciseId: string }>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (seen.has(item.exerciseId)) {
      continue;
    }

    seen.add(item.exerciseId);
    result.push(item);
  }

  return result;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
