import { NextResponse } from "next/server";
import { z } from "zod";

import { startAiTrace } from "@/lib/server/dev/ai-trace-logger";
import { generateAiExerciseRecommendations } from "@/lib/server/exercise-recommendations/ai-exercise-recommendation-service";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { selectExerciseCandidates } from "@/lib/server/workout-plans";
import { exerciseRecommendationIntentSchema } from "@/lib/shared/exercise-recommendations/schema";

const exerciseRecommendationRequestSchema = z.object({
  latestUserMessage: z.string().trim().min(1).max(4000),
  conversationSummary: z.string().trim().max(2000).default(""),
  intent: exerciseRecommendationIntentSchema,
  parentTraceId: z.string().trim().min(1).max(120).optional(),
  excludeExerciseIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
});

function selectRecommendationCandidates(
  candidates: ReturnType<typeof selectExerciseCandidates>,
  excludeExerciseIds: Set<string>,
) {
  const primaryCandidates = candidates.primaryCandidates.filter(
    (candidate) => !excludeExerciseIds.has(candidate.exercise.id),
  );
  const supplementaryCandidates = candidates.supplementaryCandidates.filter(
    (candidate) => !excludeExerciseIds.has(candidate.exercise.id),
  );

  return [...primaryCandidates.slice(0, 16), ...supplementaryCandidates.slice(0, 8)].slice(0, 20);
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, message: "Missing DEEPSEEK_API_KEY environment variable." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedRequest = exerciseRecommendationRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request body.",
        detail: parsedRequest.error.flatten(),
      },
      { status: 400 },
    );
  }

  const trace = startAiTrace({
    route: "/api/ai/exercise-recommendations",
    title: parsedRequest.data.latestUserMessage,
    existingTraceId: parsedRequest.data.parentTraceId,
    metadata: {
      messageCount: 1,
      hasConversationSummary: parsedRequest.data.conversationSummary.trim().length > 0,
      continuedFromRoute: parsedRequest.data.parentTraceId ? "/api/chat" : undefined,
    },
  });

  try {
    trace.addStep({
      name: "动作推荐生成请求",
      type: "user_input",
      input: parsedRequest.data,
    });

    const exercises = await listAllExercises();
    const candidates = selectExerciseCandidates(parsedRequest.data.intent, exercises);
    const excludeExerciseIds = new Set(parsedRequest.data.excludeExerciseIds);
    const selectedCandidates = selectRecommendationCandidates(candidates, excludeExerciseIds);
    const fallbackCandidates =
      selectedCandidates.length === 0 && excludeExerciseIds.size > 0
        ? selectRecommendationCandidates(candidates, new Set())
        : [];
    const finalCandidates = selectedCandidates.length > 0 ? selectedCandidates : fallbackCandidates;
    const effectiveExcludeExerciseIds =
      selectedCandidates.length > 0 ? parsedRequest.data.excludeExerciseIds : [];
    const safetyNotes =
      selectedCandidates.length === 0 && fallbackCandidates.length > 0
        ? [...candidates.warnings, "当前条件下可替换动作不足，已回填部分高匹配动作。"]
        : candidates.warnings;

    trace.addStep({
      name: "动作推荐候选筛选",
      type: "candidate_selection",
      input: {
        intent: parsedRequest.data.intent,
        exerciseCount: exercises.length,
        excludeExerciseIds: parsedRequest.data.excludeExerciseIds,
      },
      output: {
        candidateStatus: candidates.candidateStatus,
        relevantCandidateCount: candidates.relevantCandidateCount,
        warnings: safetyNotes,
        selectedCandidates: finalCandidates,
      },
      metadata: {
        primaryCandidateCount: candidates.primaryCandidates.length,
        supplementaryCandidateCount: candidates.supplementaryCandidates.length,
        excludedRecommendationCount: excludeExerciseIds.size,
      },
    });

    if (finalCandidates.length === 0) {
      trace.finish("failed");
      return NextResponse.json(
        {
          ok: false,
          message: "当前条件下没有找到可推荐的动作，请放宽目标、器械或限制条件后再试。",
        },
        { status: 422 },
      );
    }

    const recommendationResult = await generateAiExerciseRecommendations({
      apiKey,
      intent: parsedRequest.data.intent,
      latestUserMessage: parsedRequest.data.latestUserMessage,
      conversationSummary: parsedRequest.data.conversationSummary,
      candidates: finalCandidates,
      safetyNotes,
      excludeExerciseIds: effectiveExcludeExerciseIds,
      trace,
    });

    if (!recommendationResult.ok) {
      trace.addStep({
        name: "动作推荐模型生成失败",
        type: "error",
        status: "failed",
        error: recommendationResult,
      });
      trace.finish("failed");

      return NextResponse.json(
        {
          ok: false,
          message: recommendationResult.message,
          detail: recommendationResult.detail,
        },
        { status: 502 },
      );
    }

    const result = {
      ok: true,
      intent: parsedRequest.data.intent,
      card: recommendationResult.card,
    };

    trace.addStep({
      name: "动作推荐接口结果",
      type: "final_response",
      status: "success",
      output: result,
    });
    trace.finish("success");

    return NextResponse.json(result);
  } catch (error) {
    trace.addStep({
      name: "动作推荐接口异常",
      type: "error",
      status: "failed",
      error,
    });
    trace.finish("failed");

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate exercise recommendations.",
        detail: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
