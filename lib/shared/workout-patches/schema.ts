import { z } from "zod";

import {
  conversationArtifactKindSchema,
} from "@/lib/shared/conversation-artifacts/schema";
import {
  workoutPlanDraftSchema,
  workoutRoutineDraftSchema,
  workoutRoutineSectionSchema,
} from "@/lib/shared/workout-plans/draft-schema";
import { confirmationRequestSchema } from "@/lib/shared/policy-confirmation/schema";

export const workoutPatchScopeSchema = z.enum([
  "artifact_only",
  "saved_routine",
  "future_schedule",
  "completed_history",
]);

export const workoutPatchOperationTypeSchema = z.enum([
  "replace_exercise",
  "adjust_load",
  "remove_exercise",
]);

const defaultPatchPreserve = {
  section: true,
  order: true,
  sets: true,
  target: true,
  duration: true,
  rest: true,
};

// ExerciseLocator 描述 Patch 允许修改的最小动作位置，避免只靠 exerciseId 误改多处。
export const exerciseLocatorSchema = z.object({
  artifactId: z.string().trim().min(1),
  artifactKind: conversationArtifactKindSchema.extract(["routine", "plan"]),
  cycleDayIndex: z.number().int().min(1).max(42).optional(),
  section: workoutRoutineSectionSchema,
  exerciseId: z.string().trim().min(1),
  occurrenceIndex: z.number().int().min(1).optional(),
});

export const patchPreserveSchema = z.object({
  section: z.boolean().default(true),
  order: z.boolean().default(true),
  sets: z.boolean().default(true),
  target: z.boolean().default(true),
  duration: z.boolean().default(true),
  rest: z.boolean().default(true),
});

export const replaceExerciseOperationSchema = z.object({
  operation: z.literal("replace_exercise"),
  target: exerciseLocatorSchema,
  replacementExerciseId: z.string().trim().min(1).optional(),
  preserve: patchPreserveSchema.default(defaultPatchPreserve),
  reason: z.string().trim().max(240).optional(),
});

export const adjustLoadOperationSchema = z.object({
  operation: z.literal("adjust_load"),
  target: exerciseLocatorSchema,
  direction: z.enum(["easier", "harder"]).default("easier"),
  preserve: patchPreserveSchema.pick({
    section: true,
    order: true,
    rest: true,
  }).default({
    section: true,
    order: true,
    rest: true,
  }),
  reason: z.string().trim().max(240).optional(),
});

export const removeExerciseOperationSchema = z.object({
  operation: z.literal("remove_exercise"),
  target: exerciseLocatorSchema,
  replacementRequired: z.boolean().default(true),
  replacementExerciseId: z.string().trim().min(1).optional(),
  preserve: patchPreserveSchema.default(defaultPatchPreserve),
  reason: z.string().trim().max(240).optional(),
});

export const workoutPatchOperationSchema = z.discriminatedUnion("operation", [
  replaceExerciseOperationSchema,
  adjustLoadOperationSchema,
  removeExerciseOperationSchema,
]);

// WorkoutPatch 是聊天训练草稿局部修改的服务端协议，第一版只允许单个 artifact-only operation。
export const workoutPatchSchema = z.object({
  scope: workoutPatchScopeSchema.default("artifact_only"),
  target: z.object({
    artifactId: z.string().trim().min(1),
    artifactKind: conversationArtifactKindSchema.extract(["routine", "plan"]),
  }),
  operations: z.array(workoutPatchOperationSchema).min(1).max(1),
  reason: z.string().trim().min(1).max(500),
});

// PlanPatch 复用 WorkoutPatch 协议，但目标 artifactKind 必须是 plan。
export const planPatchSchema = workoutPatchSchema.superRefine((patch, ctx) => {
  if (patch.target.artifactKind !== "plan") {
    ctx.addIssue({
      code: "custom",
      message: "PlanPatch target.artifactKind 必须是 plan",
      path: ["target", "artifactKind"],
    });
  }
});

export const workoutPatchStatusSchema = z.enum([
  "applied",
  "blocked",
  "ambiguous",
  "confirmation_required",
  "validation_failed",
]);

export const workoutPatchDiffEntrySchema = z.object({
  operation: workoutPatchOperationTypeSchema,
  target: exerciseLocatorSchema,
  originalExerciseId: z.string().trim().min(1),
  replacementExerciseId: z.string().trim().min(1).optional(),
  preservedFields: z.array(z.string().trim().min(1)).default([]),
  changedFields: z.array(z.string().trim().min(1)).default([]),
  reason: z.string().trim().min(1),
});

export const workoutPatchResultSchema = z.object({
  status: workoutPatchStatusSchema,
  message: z.string().trim().min(1),
  sourceArtifactId: z.string().trim().min(1).optional(),
  artifactId: z.string().trim().min(1).optional(),
  artifactKind: conversationArtifactKindSchema.extract(["routine", "plan"]).optional(),
  payload: z.union([workoutRoutineDraftSchema, workoutPlanDraftSchema]).optional(),
  diff: z.array(workoutPatchDiffEntrySchema).default([]),
  confirmation: confirmationRequestSchema.optional(),
  suggestedReplies: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  failureReasons: z.array(z.string().trim().min(1)).default([]),
});

export type WorkoutPatchScope = z.infer<typeof workoutPatchScopeSchema>;
export type ExerciseLocator = z.infer<typeof exerciseLocatorSchema>;
export type PatchPreserve = z.infer<typeof patchPreserveSchema>;
export type WorkoutPatchOperation = z.infer<typeof workoutPatchOperationSchema>;
export type WorkoutPatch = z.infer<typeof workoutPatchSchema>;
export type PlanPatch = z.infer<typeof planPatchSchema>;
export type WorkoutPatchDiffEntry = z.infer<typeof workoutPatchDiffEntrySchema>;
export type WorkoutPatchResult = z.infer<typeof workoutPatchResultSchema>;
