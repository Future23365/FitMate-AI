import { z } from "zod";

import { workoutPlanIntentSchema } from "@/lib/shared/workout-plans/draft-schema";

export const exerciseRecommendationIntentSchema = workoutPlanIntentSchema;

export const exerciseRecommendationItemSchema = z.object({
  exerciseId: z.string().trim().min(1),
  nameZh: z.string().trim().min(1),
  nameEn: z.string().trim().optional(),
  categoryZh: z.string().trim().min(1),
  levelZh: z.string().trim().min(1),
  equipmentZh: z.string().trim().min(1),
  primaryMusclesZh: z.array(z.string().trim().min(1)),
  secondaryMusclesZh: z.array(z.string().trim().min(1)),
  imageUrl: z.string().trim().optional(),
  reasons: z.array(z.string().trim().min(1)).max(6).default([]),
});

export const exerciseRecommendationCardSchema = z.object({
  title: z.string().trim().min(1).max(100),
  goal: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(260).optional(),
  items: z.array(exerciseRecommendationItemSchema).min(1).max(10),
  safetyNotes: z.array(z.string().trim().min(1)).max(8).default([]),
});

export type ExerciseRecommendationIntent = z.infer<typeof exerciseRecommendationIntentSchema>;
export type ExerciseRecommendationItem = z.infer<typeof exerciseRecommendationItemSchema>;
export type ExerciseRecommendationCard = z.infer<typeof exerciseRecommendationCardSchema>;
