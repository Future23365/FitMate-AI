import { z } from "zod";

export const workoutModeSchema = z.enum(["duration", "reps"]);
export const workoutSectionSchema = z.enum(["warmup", "training", "stretch"]);

// routine item schema 约束保存和执行都会使用的动作参数。
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

// WorkoutRoutine 请求和响应结构，表达用户保存的动作编排。
export const workoutRoutineSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  updatedAt: z.string().min(1),
  items: z.array(workoutItemSchema),
  trainingLoopRounds: z.number().int().positive().optional(),
  trainingLoopRestSeconds: z.number().int().min(0).optional(),
  warmupToTrainingRestSeconds: z.number().int().min(0).optional(),
  trainingToStretchRestSeconds: z.number().int().min(0).optional(),
});

export const workoutScheduleStatusSchema = z.enum(["cancelled", "completed", "missed", "planned", "rest"]);

// WorkoutSchedule 请求和响应结构，表达日历安排和休息日。
export const workoutScheduleSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  routineId: z.string().min(1).optional(),
  title: z.string().min(1),
  status: workoutScheduleStatusSchema,
  minutes: z.number().int().min(0),
  calories: z.number().int().min(0),
  items: z.array(workoutItemSchema),
  trainingLoopRounds: z.number().int().positive().optional(),
  trainingLoopRestSeconds: z.number().int().min(0).optional(),
  warmupToTrainingRestSeconds: z.number().int().min(0).optional(),
  trainingToStretchRestSeconds: z.number().int().min(0).optional(),
  sourceRoutineTitle: z.string().optional(),
});

// WorkoutSessionResult 请求和响应结构，保存一次训练完成摘要。
export const workoutSessionResultSchema = z.object({
  id: z.string().min(1),
  scheduleId: z.string().min(1),
  routineId: z.string().min(1).optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(0),
  completedStepCount: z.number().int().min(0),
  totalStepCount: z.number().int().min(0),
  completedExerciseCount: z.number().int().min(0),
  totalExerciseCount: z.number().int().min(0),
  estimatedCalories: z.number().int().min(0),
  actualCalories: z.number().int().min(0).optional(),
  status: z.enum(["completed", "abandoned"]),
});

// 客户端提交训练完成时不传 result id，由服务端按 schedule 归属创建或更新。
export const workoutSessionResultInputSchema = workoutSessionResultSchema.omit({
  id: true,
  scheduleId: true,
  routineId: true,
}).partial({
  status: true,
});
