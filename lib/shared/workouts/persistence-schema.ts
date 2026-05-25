import { z } from "zod";

export const workoutModeSchema = z.enum(["duration", "reps"]);
export const workoutSectionSchema = z.enum(["warmup", "training", "stretch"]);

export const workoutItemSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  nameZh: z.string().min(1),
  nameEn: z.string(),
  categoryZh: z.string(),
  equipmentZh: z.string(),
  musclesZh: z.array(z.string()),
  instructionsZh: z.array(z.string()),
  imageUrl: z.string(),
  imageUrls: z.array(z.string()).optional(),
  mode: workoutModeSchema,
  target: z.number().int().positive(),
  sets: z.number().int().positive(),
  setRestSeconds: z.number().int().min(0),
  transitionRestSeconds: z.number().int().min(0),
  restSeconds: z.number().int().min(0).optional(),
  section: workoutSectionSchema.optional(),
});

export const savedWorkoutSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  savedAt: z.string().min(1),
  items: z.array(workoutItemSchema),
  trainingLoopRounds: z.number().int().positive().optional(),
  trainingLoopRestSeconds: z.number().int().min(0).optional(),
});

export const scheduleStatusSchema = z.enum(["completed", "missed", "planned", "rest"]);

export const scheduledWorkoutSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  planId: z.string().min(1),
  title: z.string().min(1),
  status: scheduleStatusSchema,
  minutes: z.number().int().min(0),
  calories: z.number().int().min(0),
  items: z.array(workoutItemSchema),
  trainingLoopRounds: z.number().int().positive().optional(),
  trainingLoopRestSeconds: z.number().int().min(0).optional(),
  sourcePlanTitle: z.string().optional(),
});
