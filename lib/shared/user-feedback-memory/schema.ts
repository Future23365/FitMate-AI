import { z } from "zod";

export const userMemoryKindSchema = z.enum([
  "explicit_preference",
  "exercise_feedback",
  "constraint",
  "temporary_context",
  "injury_or_pain_signal",
  "training_behavior",
]);

export const userMemorySubjectTypeSchema = z.enum([
  "exercise",
  "body_part",
  "goal",
  "equipment",
  "schedule",
  "health",
  "general",
]);

export const userMemorySourceSchema = z.enum(["chat", "workout_result", "profile", "system"]);
export const userMemoryStatusSchema = z.enum(["active", "pending_confirmation", "dismissed", "expired"]);

export const userExerciseFeedbackKindSchema = z.enum([
  "dislike",
  "too_hard",
  "too_easy",
  "pain",
  "skipped",
  "completed",
]);

const memoryValueSchema = z.record(z.string(), z.unknown());

// UserMemory 是跨聊天、训练结果和用户画像共用的结构化记忆写入契约。
export const userMemoryInputSchema = z.object({
  kind: userMemoryKindSchema,
  subjectType: userMemorySubjectTypeSchema.default("general"),
  subjectId: z.string().trim().min(1).max(160).optional(),
  subjectLabel: z.string().trim().min(1).max(160).optional(),
  value: memoryValueSchema,
  confidence: z.number().min(0).max(1).default(1),
  source: userMemorySourceSchema,
  expiresAt: z.date().optional(),
  requiresConfirmation: z.boolean().default(false),
  status: userMemoryStatusSchema.default("active"),
});

// UserExerciseFeedback 专门表达动作级偏好和难度反馈，供候选过滤与替代排序读取。
export const userExerciseFeedbackInputSchema = z.object({
  exerciseId: z.string().trim().min(1).max(160),
  kind: userExerciseFeedbackKindSchema,
  value: memoryValueSchema,
  confidence: z.number().min(0).max(1).default(1),
  source: userMemorySourceSchema,
  expiresAt: z.date().optional(),
  requiresConfirmation: z.boolean().default(false),
  status: userMemoryStatusSchema.default("active"),
});

// 训练完成反馈只作为递进输入，不直接沉淀成永久偏好。
export const workoutCompletionFeedbackSchema = z.object({
  completionRate: z.number().min(0).max(1),
  skippedExerciseIds: z.array(z.string().trim().min(1)).max(80).default([]),
  actualDurationSeconds: z.number().int().min(0),
  subjectiveFatigue: z.number().int().min(1).max(10).optional(),
});

export const conversationMemoryStateSchema = z.object({
  currentMessage: z.object({
    requestedExerciseIds: z.array(z.string()).default([]),
    dislikedExerciseIds: z.array(z.string()).default([]),
    tooHardExerciseIds: z.array(z.string()).default([]),
    temporaryAvoidanceLabels: z.array(z.string()).default([]),
    healthSignalLabels: z.array(z.string()).default([]),
  }),
  activeExerciseFeedback: z.array(z.object({
    exerciseId: z.string(),
    kind: userExerciseFeedbackKindSchema,
    confidence: z.number().min(0).max(1),
    requiresConfirmation: z.boolean(),
    status: userMemoryStatusSchema,
  })).default([]),
  activeMemories: z.array(z.object({
    kind: userMemoryKindSchema,
    subjectType: userMemorySubjectTypeSchema,
    subjectId: z.string().optional(),
    subjectLabel: z.string().optional(),
    confidence: z.number().min(0).max(1),
    requiresConfirmation: z.boolean(),
    status: userMemoryStatusSchema,
  })).default([]),
  recentWorkoutFeedback: z.array(workoutCompletionFeedbackSchema).default([]),
});

export type UserMemoryKind = z.infer<typeof userMemoryKindSchema>;
export type UserMemorySubjectType = z.infer<typeof userMemorySubjectTypeSchema>;
export type UserMemorySource = z.infer<typeof userMemorySourceSchema>;
export type UserMemoryStatus = z.infer<typeof userMemoryStatusSchema>;
export type UserExerciseFeedbackKind = z.infer<typeof userExerciseFeedbackKindSchema>;
export type UserMemoryInput = z.input<typeof userMemoryInputSchema>;
export type UserExerciseFeedbackInput = z.input<typeof userExerciseFeedbackInputSchema>;
export type WorkoutCompletionFeedback = z.infer<typeof workoutCompletionFeedbackSchema>;
export type ConversationMemoryState = z.infer<typeof conversationMemoryStateSchema>;
