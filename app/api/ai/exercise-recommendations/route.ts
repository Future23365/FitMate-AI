import { NextResponse } from "next/server";
import { z } from "zod";

import { startAiTrace, summarizeLatestUserMessage } from "@/lib/server/dev/ai-trace-logger";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { selectExerciseCandidates } from "@/lib/server/workout-plans";
import { fitnessConversationContextSchema } from "@/lib/shared/chat/fitness-conversation-context";
import {
  exerciseRecommendationCardSchema,
  exerciseRecommendationIntentSchema,
} from "@/lib/shared/exercise-recommendations/schema";

const exerciseRecommendationRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(4000),
    }),
  ).min(1).max(200),
  intent: exerciseRecommendationIntentSchema,
  conversationContext: fitnessConversationContextSchema.optional(),
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

  return [...primaryCandidates.slice(0, 8), ...supplementaryCandidates.slice(0, 8)].slice(0, 8);
}

export async function POST(request: Request) {
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
    title: summarizeLatestUserMessage(parsedRequest.data.messages),
    existingTraceId: parsedRequest.data.parentTraceId,
    metadata: {
      messageCount: parsedRequest.data.messages.length,
      hasConversationContext: Boolean(parsedRequest.data.conversationContext),
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

    const card = exerciseRecommendationCardSchema.parse({
      title: "动作推荐",
      goal: parsedRequest.data.intent.goal,
      summary: "以下只展示动作候选，不包含组数、次数、休息或训练日安排。是否编排成训练由后续聊天决定。",
      items: finalCandidates.map((candidate) => {
        const exercise = candidate.exercise;

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
          reasons: candidate.reasons.slice(0, 4),
        };
      }),
      safetyNotes,
    });

    const result = {
      ok: true,
      intent: parsedRequest.data.intent,
      card,
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
