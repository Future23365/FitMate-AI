import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createCandidateTrimSummary,
  createExerciseRecommendationBudgetDecision,
} from "@/lib/server/ai/token-budget";
import { startAiTrace } from "@/lib/server/dev/ai-trace-logger";
import { generateAiExerciseRecommendations } from "@/lib/server/exercise-recommendations/ai-exercise-recommendation-service";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { selectExerciseCandidates } from "@/lib/server/workout-plans";
import { exerciseRecommendationIntentSchema } from "@/lib/shared/exercise-recommendations/schema";
import type { ExerciseExposureSource } from "@/lib/server/workout-plans";

const exerciseRecommendationRequestSchema = z.object({
  latestUserMessage: z.string().trim().min(1).max(4000),
  conversationSummary: z.string().trim().max(2000).default(""),
  intent: exerciseRecommendationIntentSchema,
  parentTraceId: z.string().trim().min(1).max(120).optional(),
  excludeExerciseIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  currentSessionExerciseIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  recentRecommendationExerciseIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  futurePlanExerciseIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
});

function selectRecommendationCandidates(
  candidates: ReturnType<typeof selectExerciseCandidates>,
) {
  const primaryCandidates = candidates.primaryCandidates;
  const supplementaryCandidates = candidates.supplementaryCandidates;

  return [...primaryCandidates.slice(0, 16), ...supplementaryCandidates.slice(0, 8)].slice(0, 20);
}

function buildRecommendationExposureSources(input: z.infer<typeof exerciseRecommendationRequestSchema>) {
  const sources: ExerciseExposureSource[] = [];

  if (input.excludeExerciseIds.length > 0) {
    sources.push({ reason: "current_card", exerciseIds: input.excludeExerciseIds });
  }

  if (input.currentSessionExerciseIds.length > 0) {
    sources.push({ reason: "current_session_exposure", exerciseIds: input.currentSessionExerciseIds });
  }

  if (input.recentRecommendationExerciseIds.length > 0) {
    sources.push({ reason: "recent_recommendation", exerciseIds: input.recentRecommendationExerciseIds });
  }

  if (input.futurePlanExerciseIds.length > 0) {
    sources.push({ reason: "future_overuse", exerciseIds: input.futurePlanExerciseIds });
  }

  return sources;
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
    const exposureSources = buildRecommendationExposureSources(parsedRequest.data);
    const candidates = selectExerciseCandidates(parsedRequest.data.intent, exercises, {
      exposureSources,
    });
    const finalCandidates = selectRecommendationCandidates(candidates);
    const candidateTrim = createCandidateTrimSummary({
      beforeCount: candidates.primaryCandidates.length + candidates.supplementaryCandidates.length,
      afterCount: finalCandidates.length,
      maxVisibleCount: 20,
      reason: "动作推荐模型只接收排序后的 Top N 候选和白名单字段。",
    });
    const tokenBudgetDecision = createExerciseRecommendationBudgetDecision({
      latestUserMessage: parsedRequest.data.latestUserMessage,
      conversationSummary: parsedRequest.data.conversationSummary,
      candidateTrim,
    });
    const safetyNotes = candidates.warnings;
    const effectiveExcludeExerciseIds = candidates.recommendationTrace.excludedExerciseIds;

    trace.addStep({
      name: "Token 预算决策",
      type: "token_budget",
      output: tokenBudgetDecision,
      metadata: {
        aiStageStatus: "executed",
        route: "/api/ai/exercise-recommendations",
        promptModules: [...new Set(tokenBudgetDecision.stages.flatMap((stage) => stage.promptModules))],
        candidateTrim,
      },
    });

    trace.addStep({
      name: "动作推荐候选筛选",
      type: "candidate_selection",
      input: {
        intent: parsedRequest.data.intent,
        exerciseCount: exercises.length,
        exposureSources,
      },
      output: {
        candidateStatus: candidates.candidateStatus,
        relevantCandidateCount: candidates.relevantCandidateCount,
        warnings: safetyNotes,
        selectedCandidates: finalCandidates,
        recommendationTrace: candidates.recommendationTrace,
      },
      metadata: {
        aiStage: "exercise_candidate_selection",
        aiStageStatus: "executed",
        candidateTrim,
        primaryCandidateCount: candidates.primaryCandidates.length,
        supplementaryCandidateCount: candidates.supplementaryCandidates.length,
        excludedRecommendationCount: candidates.recommendationTrace.excludedExerciseIds.length,
        relaxedConstraints: candidates.recommendationTrace.relaxedConstraints,
      },
    });

    if (finalCandidates.length === 0 || candidates.candidateStatus === "insufficient") {
      trace.finish("failed");
      return NextResponse.json(
        {
          ok: false,
          message: "当前条件下没有找到足够可推荐的动作，请放宽目标、器械或限制条件后再试。",
          recommendationTrace: candidates.recommendationTrace,
          relaxationOptions: candidates.relaxationOptions,
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
      tokenBudgetDecision,
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
