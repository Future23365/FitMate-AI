import { z } from "zod";

export const workoutModeSchema = z.enum(["reps", "duration"]);
export const workoutDraftKindSchema = z.enum(["plan", "routine"]);

export const workoutExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const workoutRoutineSectionSchema = z.enum(["warmup", "training", "stretch"]);

export const workoutPlanIntentSchema = z.object({
  intentType: z.enum(["plan", "routine"]).default("plan"),
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

// AI 单次训练编排动作项，直接对应可执行 routine item 的核心参数。
export const workoutRoutineDraftItemSchema = workoutPlanItemDraftSchema.extend({
  section: workoutRoutineSectionSchema,
});

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
export const workoutDraftSchema = z.discriminatedUnion("kind", [
  workoutPlanDraftSchema.extend({ kind: z.literal("plan") }),
  workoutRoutineDraftSchema,
]);

export type WorkoutDraftKind = z.infer<typeof workoutDraftKindSchema>;
export type WorkoutMode = z.infer<typeof workoutModeSchema>;
export type WorkoutExperience = z.infer<typeof workoutExperienceSchema>;
export type WorkoutPlanIntent = z.infer<typeof workoutPlanIntentSchema>;
export type WorkoutPlanItemDraft = z.infer<typeof workoutPlanItemDraftSchema>;
export type WorkoutDayDraft = z.infer<typeof workoutDayDraftSchema>;
export type WorkoutPlanDraft = z.infer<typeof workoutPlanDraftSchema>;
export type WorkoutRoutineSection = z.infer<typeof workoutRoutineSectionSchema>;
export type WorkoutRoutineDraftItem = z.infer<typeof workoutRoutineDraftItemSchema>;
export type WorkoutRoutineDraftSection = z.infer<typeof workoutRoutineDraftSectionSchema>;
export type WorkoutRoutineDraft = z.infer<typeof workoutRoutineDraftSchema>;
export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;
