import { z } from "zod";

const planStrategyFieldSourceSchema = z.enum([
  "current_user_message",
  "history",
  "artifact",
  "llm_inferred",
  "default",
]);

const planStrategyFieldSourcesSchema = z.object({
  goal: planStrategyFieldSourceSchema.optional(),
  experience: planStrategyFieldSourceSchema.optional(),
  sessionMinutes: planStrategyFieldSourceSchema.optional(),
  weeklyFrequency: planStrategyFieldSourceSchema.optional(),
  calendarHorizonDays: planStrategyFieldSourceSchema.optional(),
  equipment: planStrategyFieldSourceSchema.optional(),
  injuryLimitations: planStrategyFieldSourceSchema.optional(),
  preferences: planStrategyFieldSourceSchema.optional(),
  avoidances: planStrategyFieldSourceSchema.optional(),
  sourceArtifactId: planStrategyFieldSourceSchema.optional(),
}).default({});

export const planStrategyTypeSchema = z.enum([
  "repeat_previous_routine",
  "repeat_same_routine_with_progression",
  "weekly_split",
  "alternating_ab",
  "custom",
]);

export const planProgressionPolicySchema = z.enum([
  "none",
  "volume_small_increase",
  "difficulty_small_increase",
]);

export const planIntensityBiasSchema = z.enum([
  "conservative",
  "normal",
  "challenging",
]);

// PlanStrategy 是长期计划引擎的输入契约，LLM 或聊天意图只能产出策略，不能直接铺满日历。
export const planStrategySchema = z.object({
  goal: z.string().trim().min(1, "计划目标不能为空").max(120),
  horizonDays: z.number().int().min(1).max(90),
  weeklyFrequency: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(10).max(180),
  strategy: planStrategyTypeSchema,
  sourceArtifactId: z.string().trim().min(1).optional(),
  progressionPolicy: planProgressionPolicySchema,
  intensityBias: planIntensityBiasSchema,
  constraints: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  fieldSources: planStrategyFieldSourcesSchema,
  defaultAssumptions: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
});

// schedulePreview 只表达可解释的预览安排，实际写入 WorkoutSchedule 必须经过后续确认和持久化校验。
export const domainPlanSchedulePreviewEntrySchema = z.object({
  dayIndex: z.number().int().min(1).max(90),
  weekIndex: z.number().int().min(1).max(13),
  weekdayIndex: z.number().int().min(1).max(7),
  isTrainingDay: z.boolean(),
  title: z.string().trim().min(1).max(100),
  focus: z.string().trim().min(1).max(120),
  sourceArtifactId: z.string().trim().min(1).optional(),
  intensity: planIntensityBiasSchema,
  recoveryNotes: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
});

export type PlanStrategyType = z.infer<typeof planStrategyTypeSchema>;
export type PlanProgressionPolicy = z.infer<typeof planProgressionPolicySchema>;
export type PlanIntensityBias = z.infer<typeof planIntensityBiasSchema>;
export type PlanStrategy = z.infer<typeof planStrategySchema>;
export type DomainPlanSchedulePreviewEntry = z.infer<typeof domainPlanSchedulePreviewEntrySchema>;
