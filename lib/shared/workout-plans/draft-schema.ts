import { z } from "zod";

import {
  domainPlanSchedulePreviewEntrySchema,
  planStrategySchema,
} from "./plan-strategy-schema";

export const workoutModeSchema = z.enum(["reps", "duration"]);
export const workoutDraftKindSchema = z.enum(["plan", "routine"]);

export const workoutExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const workoutRoutineSectionSchema = z.enum(["warmup", "training", "stretch"]);
export const workoutPlanDayTypeSchema = z.enum(["strength", "cardio", "mobility", "recovery", "mixed", "rest"]);

export const workoutPlanIntentSchema = z.object({
  intentType: z.enum(["plan", "routine"]).default("plan"),
  goal: z.string().trim().min(1, "训练目标不能为空").max(80, "训练目标过长"),
  experience: workoutExperienceSchema,
  sessionMinutes: z.number().int().min(10).max(180),
  weeklyFrequency: z.number().int().min(1).max(7),
  calendarHorizonDays: z.number().int().min(1).max(90).optional(),
  equipment: z.array(z.string().trim().min(1)).max(20).default([]),
  injuryLimitations: z.array(z.string().trim().min(1)).max(20).default([]),
  preferences: z.array(z.string().trim().min(1)).max(20).default([]),
  avoidances: z.array(z.string().trim().min(1)).max(20).default([]),
});

const workoutDraftItemBaseSchema = z.object({
  exerciseId: z.string().trim().min(1, "exerciseId 不能为空"),
  mode: workoutModeSchema,
  sets: z.number().int().min(1).max(8),
  target: z.number().int().min(1).max(600),
  setRestSeconds: z.number().int().min(0).max(300),
  transitionRestSeconds: z.number().int().min(0).max(600),
  notes: z.string().trim().max(160).optional(),
});

// AI 长期计划训练日动作项必须声明 section，保证保存为 routine 后不丢失热身、主训练和拉伸语义。
export const workoutPlanItemDraftSchema = workoutDraftItemBaseSchema.extend({
  section: workoutRoutineSectionSchema,
});

// AI 长期计划训练日阶段，和 routine 草稿共用 warmup/training/stretch 的可执行分段语义。
export const workoutPlanDaySectionDraftSchema = z.object({
  section: workoutRoutineSectionSchema,
  title: z.string().trim().min(1, "阶段标题不能为空").max(80),
  items: z.array(workoutPlanItemDraftSchema).min(1, "训练阶段至少需要 1 个动作").max(12),
}).superRefine((section, ctx) => {
  for (const [itemIndex, item] of section.items.entries()) {
    if (item.section !== section.section) {
      ctx.addIssue({
        code: "custom",
        message: "动作项 section 必须与所属阶段一致",
        path: ["items", itemIndex, "section"],
      });
    }
  }
});

// AI 长期计划的周期日索引，用于把“第几天”从周频率和日历范围中拆出来。
export const workoutDayDraftSchema = z.object({
  title: z.string().trim().min(1, "训练日标题不能为空").max(80),
  focus: z.string().trim().min(1, "训练重点不能为空").max(80),
  cycleDayIndex: z.number().int().min(1).max(90),
  dayType: workoutPlanDayTypeSchema,
  isRestDay: z.boolean().default(false),
  estimatedMinutes: z.number().int().min(0).max(240),
  recoveryNotes: z.array(z.string().trim().min(1)).max(8).default([]),
  sections: z.array(workoutPlanDaySectionDraftSchema).max(3).default([]),
  safetyNotes: z.array(z.string().trim().min(1)).max(8).default([]),
}).superRefine((day, ctx) => {
  const expectedSections = ["warmup", "training", "stretch"] as const;

  if (day.isRestDay) {
    return;
  }

  for (const section of expectedSections) {
    if (!day.sections.some((candidate) => candidate.section === section && candidate.items.length > 0)) {
      ctx.addIssue({
        code: "custom",
        message: `训练日缺少 ${section} 阶段`,
        path: ["sections"],
      });
    }
  }
});

// AI 长期计划的周期节奏摘要，供卡片和导入逻辑解释训练日与休息日顺序。
export const workoutPlanSchedulePatternEntrySchema = z.object({
  cycleDayIndex: z.number().int().min(1).max(90),
  title: z.string().trim().min(1).max(80),
  dayType: workoutPlanDayTypeSchema,
  focus: z.string().trim().min(1).max(80),
  isRestDay: z.boolean(),
});

export const workoutPlanDraftSchema = z.object({
  kind: z.literal("plan").default("plan"),
  title: z.string().trim().min(1, "训练计划标题不能为空").max(100),
  goal: z.string().trim().min(1, "训练目标不能为空").max(120),
  summary: z.string().trim().max(400).optional(),
  cycleLengthDays: z.number().int().min(1).max(90),
  trainingDayCount: z.number().int().min(0).max(90),
  restDayCount: z.number().int().min(0).max(90),
  cycleRepeatable: z.boolean(),
  weeklyFrequency: z.number().int().min(1).max(7).optional(),
  calendarHorizonDays: z.number().int().min(1).max(90).optional(),
  estimatedSessionMinutes: z.number().int().min(5).max(240),
  progression: z.string().trim().min(1, "递进说明不能为空").max(400),
  recoveryStrategy: z.string().trim().min(1, "恢复策略不能为空").max(400),
  schedulePattern: z.array(workoutPlanSchedulePatternEntrySchema).min(1).max(90),
  planStrategy: planStrategySchema.optional(),
  schedulePreview: z.array(domainPlanSchedulePreviewEntrySchema).max(90).optional(),
  days: z.array(workoutDayDraftSchema).min(1, "训练计划至少需要 1 个周期日").max(90),
  safetyNotes: z.array(z.string().trim().min(1)).max(10).default([]),
}).superRefine((draft, ctx) => {
  const trainingDayCount = draft.days.filter((day) => !day.isRestDay).length;
  const restDayCount = draft.days.filter((day) => day.isRestDay).length;

  if (draft.days.length !== draft.cycleLengthDays) {
    ctx.addIssue({
      code: "custom",
      message: "days.length 必须与 cycleLengthDays 一致",
      path: ["days"],
    });
  }

  if (draft.schedulePattern.length !== draft.cycleLengthDays) {
    ctx.addIssue({
      code: "custom",
      message: "schedulePattern.length 必须与 cycleLengthDays 一致",
      path: ["schedulePattern"],
    });
  }

  if (trainingDayCount !== draft.trainingDayCount) {
    ctx.addIssue({
      code: "custom",
      message: "trainingDayCount 必须与非休息训练日数量一致",
      path: ["trainingDayCount"],
    });
  }

  if (restDayCount !== draft.restDayCount) {
    ctx.addIssue({
      code: "custom",
      message: "restDayCount 必须与休息日数量一致",
      path: ["restDayCount"],
    });
  }

  const cycleIndexes = new Set<number>();
  for (const [index, day] of draft.days.entries()) {
    if (cycleIndexes.has(day.cycleDayIndex)) {
      ctx.addIssue({
        code: "custom",
        message: "cycleDayIndex 不能重复",
        path: ["days", index, "cycleDayIndex"],
      });
    }
    cycleIndexes.add(day.cycleDayIndex);
  }
});

// AI 单次训练编排动作项，直接对应可执行 routine item 的核心参数。
export const workoutRoutineDraftItemSchema = workoutPlanItemDraftSchema;

// AI 单次训练编排阶段，要求热身、主训练和拉伸以结构化方式分段。
export const workoutRoutineDraftSectionSchema = z.object({
  section: workoutRoutineSectionSchema,
  title: z.string().trim().min(1, "阶段标题不能为空").max(80),
  items: z.array(workoutRoutineDraftItemSchema).min(1, "训练阶段至少需要 1 个动作").max(12),
});

// AI 单次训练编排草稿，是聊天推送 routine 的唯一结构化数据源。
export const workoutRoutineDraftSchema = z.object({
  kind: z.literal("routine"),
  title: z.string().trim().min(1, "动作编排标题不能为空").max(100),
  goal: z.string().trim().min(1, "训练目标不能为空").max(120),
  summary: z.string().trim().max(400).optional(),
  estimatedSessionMinutes: z.number().int().min(5).max(240),
  trainingLoopRounds: z.number().int().min(1).max(12),
  trainingLoopRestSeconds: z.number().int().min(0).max(600),
  sections: z.array(workoutRoutineDraftSectionSchema).length(3, "必须包含热身、训练、拉伸三个阶段"),
  safetyNotes: z.array(z.string().trim().min(1)).max(10).default([]),
}).superRefine((draft, ctx) => {
  const expectedSections = ["warmup", "training", "stretch"] as const;

  for (const section of expectedSections) {
    if (!draft.sections.some((candidate) => candidate.section === section)) {
      ctx.addIssue({
        code: "custom",
        message: `缺少 ${section} 阶段`,
        path: ["sections"],
      });
    }
  }

  for (const section of draft.sections) {
    for (const [itemIndex, item] of section.items.entries()) {
      if (item.section !== section.section) {
        ctx.addIssue({
          code: "custom",
          message: "动作项 section 必须与所属阶段一致",
          path: ["sections", draft.sections.indexOf(section), "items", itemIndex, "section"],
        });
      }
    }
  }
});

// AI 训练草稿响应使用 kind 分流，避免 routine 继续伪装成单日 plan。
export const workoutDraftSchema = z.union([workoutPlanDraftSchema, workoutRoutineDraftSchema]);

export type WorkoutDraftKind = z.infer<typeof workoutDraftKindSchema>;
export type WorkoutMode = z.infer<typeof workoutModeSchema>;
export type WorkoutExperience = z.infer<typeof workoutExperienceSchema>;
export type WorkoutPlanIntent = z.infer<typeof workoutPlanIntentSchema>;
export type WorkoutPlanItemDraft = z.infer<typeof workoutPlanItemDraftSchema>;
export type WorkoutPlanDaySectionDraft = z.infer<typeof workoutPlanDaySectionDraftSchema>;
export type WorkoutPlanDayType = z.infer<typeof workoutPlanDayTypeSchema>;
export type WorkoutDayDraft = z.infer<typeof workoutDayDraftSchema>;
export type WorkoutPlanDraft = z.infer<typeof workoutPlanDraftSchema>;
export type WorkoutRoutineSection = z.infer<typeof workoutRoutineSectionSchema>;
export type WorkoutRoutineDraftItem = z.infer<typeof workoutRoutineDraftItemSchema>;
export type WorkoutRoutineDraftSection = z.infer<typeof workoutRoutineDraftSectionSchema>;
export type WorkoutRoutineDraft = z.infer<typeof workoutRoutineDraftSchema>;
export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;
