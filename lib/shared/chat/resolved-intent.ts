import { z } from "zod";

import { referenceResolutionSchema } from "@/lib/shared/reference-resolver/schema";
import { workoutPlanIntentSchema } from "@/lib/shared/workout-plans/draft-schema";

export const resolvedIntentTypeSchema = z.enum([
  "general_fitness_advice",
  "exercise_recommendation",
  "workout_plan",
  "routine",
  "exercise_replacement",
  "exercise_explanation",
  "non_fitness",
]);

export const resolvedActionKindSchema = z.enum([
  "exercise_recommendation",
  "workout_routine",
  "workout_plan",
  "workout_patch",
  "exercise_replacement",
  "exercise_explanation",
  "none",
]);

export const resolvedResponseModeSchema = z.enum([
  "answer_only",
  "ask_clarification",
  "generate_directly",
  "generate_with_suggestions",
]);

export const resolvedFieldSourceSchema = z.enum([
  "current_user_message",
  "history",
  "artifact",
  "llm_inferred",
  "default",
]);

export const resolvedFieldSourcesSchema = z.object({
  goal: resolvedFieldSourceSchema.optional(),
  experience: resolvedFieldSourceSchema.optional(),
  sessionMinutes: resolvedFieldSourceSchema.optional(),
  weeklyFrequency: resolvedFieldSourceSchema.optional(),
  calendarHorizonDays: resolvedFieldSourceSchema.optional(),
  equipment: resolvedFieldSourceSchema.optional(),
  injuryLimitations: resolvedFieldSourceSchema.optional(),
  preferences: resolvedFieldSourceSchema.optional(),
  avoidances: resolvedFieldSourceSchema.optional(),
  sourceArtifactId: resolvedFieldSourceSchema.optional(),
}).default({});

export const resolvedReferenceRequirementSchema = z.object({
  required: z.boolean().default(false),
  reason: z.string().trim().max(300).optional(),
  allowedArtifactKinds: z.array(z.enum(["exercise_recommendation", "routine", "plan"])).default([]),
}).default({
  required: false,
  allowedArtifactKinds: [],
});

export const resolvedActionSchema = z.object({
  kind: resolvedActionKindSchema.default("none"),
  shouldTrigger: z.boolean().default(false),
  reason: z.string().trim().max(500).optional(),
  blockingMissingFields: z.array(z.string().trim().min(1)).max(12).default([]),
});

// ResolvedChatIntent 是聊天主链路的执行契约，回复、生成、trace 和前端事件都从它派生。
export const resolvedChatIntentSchema = z.object({
  type: resolvedIntentTypeSchema.default("general_fitness_advice"),
  action: resolvedActionSchema.default({
    kind: "none",
    shouldTrigger: false,
    blockingMissingFields: [],
  }),
  responseMode: resolvedResponseModeSchema.default("answer_only"),
  workoutIntent: workoutPlanIntentSchema.optional(),
  missingActionFields: z.array(z.string().trim().min(1)).max(12).default([]),
  clarificationReplies: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  adjustmentReplies: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  fieldSources: resolvedFieldSourcesSchema,
  referenceRequirement: resolvedReferenceRequirementSchema,
  referenceResolution: referenceResolutionSchema.optional(),
});

export type ResolvedIntentType = z.infer<typeof resolvedIntentTypeSchema>;
export type ResolvedActionKind = z.infer<typeof resolvedActionKindSchema>;
export type ResolvedResponseMode = z.infer<typeof resolvedResponseModeSchema>;
export type ResolvedFieldSource = z.infer<typeof resolvedFieldSourceSchema>;
export type ResolvedFieldSources = z.infer<typeof resolvedFieldSourcesSchema>;
export type ResolvedReferenceRequirement = z.infer<typeof resolvedReferenceRequirementSchema>;
export type ResolvedAction = z.infer<typeof resolvedActionSchema>;
export type ResolvedChatIntent = z.infer<typeof resolvedChatIntentSchema>;
