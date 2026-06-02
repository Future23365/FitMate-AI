import { z } from "zod";

import type { ArtifactReferenceCandidate } from "@/lib/shared/conversation-artifacts/reference-candidates";
import type { ConversationArtifactKind, ConversationArtifactPayload } from "@/lib/shared/conversation-artifacts/schema";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { WorkoutPatchResult } from "@/lib/shared/workout-patches/schema";
import type { WorkoutPlanDraft, WorkoutRoutineDraft } from "@/lib/shared/workout-plans/draft-schema";

export const exerciseRecommendationToolSummarySchema = z.object({
  kind: z.literal("exercise_recommendation"),
  artifactId: z.string(),
  title: z.string(),
  exerciseIds: z.array(z.string()),
  exerciseNames: z.array(z.string()),
  targetMuscles: z.array(z.string()),
  reasons: z.array(z.string()),
});

export const routineToolSummarySchema = z.object({
  kind: z.literal("routine"),
  artifactId: z.string(),
  title: z.string(),
  sessionMinutes: z.number().optional(),
  sections: z.array(z.object({
    name: z.string(),
    exerciseIds: z.array(z.string()),
    setsReps: z.array(z.string()).optional(),
  })),
});

export const planToolSummarySchema = z.object({
  kind: z.literal("plan"),
  artifactId: z.string(),
  title: z.string(),
  weeklyFrequency: z.number().optional(),
  trainingDayCount: z.number().optional(),
  days: z.array(z.object({
    name: z.string(),
    exerciseIds: z.array(z.string()),
  })),
});

export const patchToolSummarySchema = z.object({
  kind: z.literal("patch"),
  artifactId: z.string(),
  sourceArtifactId: z.string().optional(),
  operations: z.array(z.object({
    operation: z.string(),
    target: z.string(),
    replacementExerciseId: z.string().optional(),
  })),
  changedExerciseIds: z.array(z.string()),
  reason: z.string().optional(),
  status: z.string().optional(),
});

export const artifactToolSummarySchema = z.discriminatedUnion("kind", [
  exerciseRecommendationToolSummarySchema,
  routineToolSummarySchema,
  planToolSummarySchema,
  patchToolSummarySchema,
]);

export type ArtifactToolSummary = z.infer<typeof artifactToolSummarySchema>;

export function truncateToolText(value: string | undefined, maxLength: number) {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

// Artifact payload 摘要是模型可见的唯一训练结构，避免完整 payload 泄漏进 prompt 或 trace。
export function summarizeArtifactPayloadForModel(input: {
  artifactId: string;
  kind: ConversationArtifactKind;
  payload: ConversationArtifactPayload;
  maxTextChars: number;
}): ArtifactToolSummary {
  if (input.kind === "exercise_recommendation") {
    const payload = input.payload as ExerciseRecommendationCard;

    return exerciseRecommendationToolSummarySchema.parse({
      kind: "exercise_recommendation",
      artifactId: input.artifactId,
      title: truncateToolText(payload.title, input.maxTextChars) ?? payload.title,
      exerciseIds: payload.items.map((item) => item.exerciseId),
      exerciseNames: payload.items.map((item) => item.nameZh),
      targetMuscles: unique(payload.items.flatMap((item) => item.primaryMusclesZh)).slice(0, 12),
      reasons: payload.items.flatMap((item) => item.reasons).map((reason) => truncateToolText(reason, input.maxTextChars) ?? reason).slice(0, 12),
    });
  }

  if (input.kind === "routine") {
    const payload = input.payload as WorkoutRoutineDraft;

    return routineToolSummarySchema.parse({
      kind: "routine",
      artifactId: input.artifactId,
      title: truncateToolText(payload.title, input.maxTextChars) ?? payload.title,
      sessionMinutes: payload.estimatedSessionMinutes,
      sections: payload.sections.map((section) => ({
        name: section.title,
        exerciseIds: section.items.map((item) => item.exerciseId),
        setsReps: section.items.map(formatSetsReps),
      })),
    });
  }

  const payload = input.payload as WorkoutPlanDraft;

  return planToolSummarySchema.parse({
    kind: "plan",
    artifactId: input.artifactId,
    title: truncateToolText(payload.title, input.maxTextChars) ?? payload.title,
    weeklyFrequency: payload.weeklyFrequency,
    trainingDayCount: payload.trainingDayCount,
    days: payload.days.map((day) => ({
      name: day.title,
      exerciseIds: day.sections.flatMap((section) => section.items.map((item) => item.exerciseId)),
    })),
  });
}

// Patch 结果摘要用于 trace 和测试覆盖，当前不注册为可读取 artifact kind。
export function summarizePatchResultForModel(input: {
  artifactId: string;
  result: WorkoutPatchResult;
  maxTextChars: number;
}) {
  return patchToolSummarySchema.parse({
    kind: "patch",
    artifactId: input.artifactId,
    sourceArtifactId: input.result.sourceArtifactId,
    operations: input.result.diff.map((entry) => ({
      operation: entry.operation,
      target: `${entry.target.artifactKind}:${entry.target.artifactId}:${entry.target.exerciseId}`,
      replacementExerciseId: entry.replacementExerciseId,
    })),
    changedExerciseIds: unique(input.result.diff.flatMap((entry) => [
      entry.originalExerciseId,
      entry.replacementExerciseId,
    ].filter(Boolean) as string[])),
    reason: truncateToolText(input.result.message, input.maxTextChars),
    status: input.result.status,
  });
}

export function summarizeArtifactCandidatesForModel(candidates: ArtifactReferenceCandidate[], maxTextChars: number) {
  return candidates.map((candidate) => ({
    artifactId: candidate.artifactId,
    kind: candidate.kind,
    title: truncateToolText(candidate.title, maxTextChars),
    summary: truncateToolText(candidate.summary, maxTextChars),
    exerciseIds: candidate.exerciseIds.slice(0, 12),
    goals: candidate.goals.slice(0, 6),
    updatedAt: candidate.updatedAt,
  }));
}

export function summarizeExerciseForModel(exercise: Exercise, maxTextChars: number) {
  return {
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    nameEn: exercise.nameEn,
    categoryZh: exercise.categoryZh,
    levelZh: exercise.levelZh,
    equipmentZh: exercise.equipmentZh,
    primaryMusclesZh: exercise.primaryMusclesZh.slice(0, 8),
    secondaryMusclesZh: exercise.secondaryMusclesZh.slice(0, 8),
    allowedSections: exercise.allowedSections,
    riskTags: exercise.riskTags.slice(0, 8),
    goalTags: exercise.goalTags.slice(0, 8),
    instructionsZh: exercise.instructionsZh.map((item) => truncateToolText(item, maxTextChars)).filter(Boolean).slice(0, 6),
  };
}

export function summarizeExerciseCandidatesForModel(exercises: Exercise[], maxTextChars: number) {
  return exercises.map((exercise) => summarizeExerciseForModel(exercise, maxTextChars));
}

function formatSetsReps(item: { sets: number; mode: "reps" | "duration"; target: number }) {
  return item.mode === "duration" ? `${item.sets}组 x ${item.target}秒` : `${item.sets}组 x ${item.target}次`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
