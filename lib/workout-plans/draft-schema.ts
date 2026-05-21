import { z } from "zod";

export const workoutModeSchema = z.enum(["reps", "duration"]);

export const workoutExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);

export const workoutPlanIntentSchema = z.object({
  goal: z.string().trim().min(1, "训练目标不能为空").max(80, "训练目标过长"),
  experience: workoutExperienceSchema,
  sessionMinutes: z.number().int().min(10).max(180),
  weeklyFrequency: z.number().int().min(1).max(7),
  equipment: z.array(z.string().trim().min(1)).max(20).default([]),
  injuryLimitations: z.array(z.string().trim().min(1)).max(20).default([]),
  preferences: z.array(z.string().trim().min(1)).max(20).default([]),
  avoidances: z.array(z.string().trim().min(1)).max(20).default([]),
});

export const workoutPlanItemDraftSchema = z.object({
  exerciseId: z.string().trim().min(1, "exerciseId 不能为空"),
  mode: workoutModeSchema,
  sets: z.number().int().min(1).max(8),
  target: z.number().int().min(1).max(600),
  setRestSeconds: z.number().int().min(0).max(300),
  transitionRestSeconds: z.number().int().min(0).max(600),
  notes: z.string().trim().max(160).optional(),
});

export const workoutDayDraftSchema = z.object({
  title: z.string().trim().min(1, "训练日标题不能为空").max(80),
  focus: z.string().trim().min(1, "训练重点不能为空").max(80),
  dayIndex: z.number().int().min(1).max(7).optional(),
  estimatedMinutes: z.number().int().min(5).max(240),
  items: z.array(workoutPlanItemDraftSchema).min(1, "训练日至少需要 1 个动作").max(12),
  safetyNotes: z.array(z.string().trim().min(1)).max(8).default([]),
});

export const workoutPlanDraftSchema = z.object({
  title: z.string().trim().min(1, "训练计划标题不能为空").max(100),
  goal: z.string().trim().min(1, "训练目标不能为空").max(120),
  summary: z.string().trim().max(400).optional(),
  weeklyFrequency: z.number().int().min(1).max(7),
  estimatedSessionMinutes: z.number().int().min(5).max(240),
  days: z.array(workoutDayDraftSchema).min(1, "训练计划至少需要 1 个训练日").max(7),
  safetyNotes: z.array(z.string().trim().min(1)).max(10).default([]),
});

export type WorkoutMode = z.infer<typeof workoutModeSchema>;
export type WorkoutExperience = z.infer<typeof workoutExperienceSchema>;
export type WorkoutPlanIntent = z.infer<typeof workoutPlanIntentSchema>;
export type WorkoutPlanItemDraft = z.infer<typeof workoutPlanItemDraftSchema>;
export type WorkoutDayDraft = z.infer<typeof workoutDayDraftSchema>;
export type WorkoutPlanDraft = z.infer<typeof workoutPlanDraftSchema>;
