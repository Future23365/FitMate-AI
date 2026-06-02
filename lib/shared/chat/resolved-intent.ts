import { z } from "zod";

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

export type ResolvedIntentType = z.infer<typeof resolvedIntentTypeSchema>;
export type ResolvedActionKind = z.infer<typeof resolvedActionKindSchema>;
export type ResolvedResponseMode = z.infer<typeof resolvedResponseModeSchema>;
export type ResolvedFieldSource = z.infer<typeof resolvedFieldSourceSchema>;
export type ResolvedFieldSources = z.infer<typeof resolvedFieldSourcesSchema>;
export type ResolvedReferenceRequirement = z.infer<typeof resolvedReferenceRequirementSchema>;
export type ResolvedAction = z.infer<typeof resolvedActionSchema>;
