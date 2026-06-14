import { z } from "zod";

import { workoutModeSchema } from "@/lib/shared/workout-plans/draft-schema";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";
import type { JsonValue } from "@/lib/server/visible-outputs/contracts";

export const visibleTrainingProposalOutputType = "visibleTrainingProposal";
export const visibleTrainingProposalSchemaVersion = "1";
export const visibleTrainingProposalFactKind = "visible_training_proposal_displayed";
export const visibleTrainingProposalFactResourceType = "visible_training_proposal_fact";
/** visibleTrainingProposalFactIndexResourceType 标记 list_recent 只读索引 resource，不能作为训练方案事实消费。 */
export const visibleTrainingProposalFactIndexResourceType = "visible_training_proposal_fact_index";
export const visibleTrainingProposalFactSchemaVersion = 1;

const exerciseIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const visibleTrainingProposalKindSchema = z.enum(["exercise_selection", "routine", "plan"])
  .describe("结构化训练结果类型。exercise_selection 只用于纯主训练动作推荐集合；routine 用于单次可执行训练；plan 用于多天或周期训练计划。");

/** visibleTrainingPrescriptionSchema 对齐现有 routine / plan draft 的可执行动作处方字段。 */
export const visibleTrainingPrescriptionSchema = z.object({
  mode: workoutModeSchema,
  sets: z.number().int().min(1).max(8),
  target: z.number().int().min(1).max(600),
  setRestSeconds: z.number().int().min(0).max(300),
  transitionRestSeconds: z.number().int().min(0).max(600),
}).strict()
  .describe("单个动作项的执行处方。只允许在 kind=routine 或 kind=plan 的 exerciseItems[] 中出现，并且 routine / plan 的每个动作项都必须包含。");

/** visibleTrainingExerciseItemSchema 是可见训练方案里动作、分段、顺序和处方绑定的唯一动作事实项。 */
export const visibleTrainingExerciseItemSchema = z.object({
  exerciseId: exerciseIdSchema,
  section: exerciseAllowedSectionSchema,
  order: z.number().int().min(1).max(200),
  prescription: visibleTrainingPrescriptionSchema.optional()
    .describe("动作项的执行处方。kind=exercise_selection 时不得填写；kind=routine 或 kind=plan 时每个动作项都必须填写。"),
}).strict();

const visibleTrainingScheduleAssignmentSchema = z.object({
  cycleDayIndex: z.number().int().min(1).max(90),
  type: z.enum(["training", "rest"]),
}).strict();

/** visibleTrainingScheduleSchema 只表达同一套编排在周期内的训练日和休息日安排。 */
export const visibleTrainingScheduleSchema = z.object({
  cycleLengthDays: z.number().int().min(1).max(90),
  assignments: z.array(visibleTrainingScheduleAssignmentSchema).min(1).max(90),
}).strict()
  .describe("多天或周期训练计划的日程。只允许并且必须在 kind=plan 时出现；kind=exercise_selection 和 kind=routine 不允许包含 schedule。")
  .superRefine((schedule, ctx) => {
  if (schedule.assignments.length !== schedule.cycleLengthDays) {
    ctx.addIssue({
      code: "custom",
      message: "schedule.assignments 必须覆盖 1..cycleLengthDays。",
      path: ["assignments"],
    });
  }

  const seen = new Set<number>();
  for (const [index, assignment] of schedule.assignments.entries()) {
    if (seen.has(assignment.cycleDayIndex)) {
      ctx.addIssue({
        code: "custom",
        message: "schedule.assignments.cycleDayIndex 不能重复。",
        path: ["assignments", index, "cycleDayIndex"],
      });
    }
    seen.add(assignment.cycleDayIndex);
  }

  for (let day = 1; day <= schedule.cycleLengthDays; day += 1) {
    if (!seen.has(day)) {
      ctx.addIssue({
        code: "custom",
        message: "schedule.assignments 必须覆盖 1..cycleLengthDays。",
        path: ["assignments"],
      });
      break;
    }
  }
});

/** visibleTrainingProposalPayloadSchema 是用户可见训练方案的业务 payload，正文不作为动作事实源。 */
export const visibleTrainingProposalPayloadSchema = z.object({
  kind: visibleTrainingProposalKindSchema,
  exerciseItems: z.array(visibleTrainingExerciseItemSchema).min(1).max(40),
  schedule: visibleTrainingScheduleSchema.optional()
    .describe("训练日程。kind=plan 时必须填写；kind=exercise_selection 或 kind=routine 时不得填写。"),
}).strict().superRefine((payload, ctx) => {
  const sectionCounts = countSections(payload.exerciseItems);

  for (const [index, item] of payload.exerciseItems.entries()) {
    if (payload.kind === "exercise_selection") {
      if (item.section !== "training") {
        ctx.addIssue({
          code: "custom",
          message: "exercise_selection 只能包含 section = training 的动作项。",
          path: ["exerciseItems", index, "section"],
        });
      }
      if (item.prescription) {
        ctx.addIssue({
          code: "custom",
          message: "exercise_selection 不应输出 prescription。",
          path: ["exerciseItems", index, "prescription"],
        });
      }
      continue;
    }

    if (!item.prescription) {
      ctx.addIssue({
        code: "custom",
        message: "routine 和 plan 的每个动作项都必须包含 prescription。",
        path: ["exerciseItems", index, "prescription"],
      });
    }
  }

  if (payload.kind === "exercise_selection" && payload.schedule) {
    ctx.addIssue({
      code: "custom",
      message: "exercise_selection 不允许包含 schedule。",
      path: ["schedule"],
    });
  }

  if ((payload.kind === "routine" || payload.kind === "plan") && !sectionCounts.training) {
    ctx.addIssue({
      code: "custom",
      message: "routine 和 plan 必须包含 training 动作项。",
      path: ["exerciseItems"],
    });
  }

  if (payload.kind === "routine" && payload.schedule) {
    ctx.addIssue({
      code: "custom",
      message: "routine 不允许包含 schedule。",
      path: ["schedule"],
    });
  }

  if (payload.kind === "plan" && !payload.schedule) {
    ctx.addIssue({
      code: "custom",
      message: "plan 必须包含 schedule。",
      path: ["schedule"],
    });
  }

  const orderKeys = new Set<string>();
  for (const [index, item] of payload.exerciseItems.entries()) {
    const orderKey = `${item.section}:${item.order}`;
    if (orderKeys.has(orderKey)) {
      ctx.addIssue({
        code: "custom",
        message: "同一 section 内 order 不能重复。",
        path: ["exerciseItems", index, "order"],
      });
    }
    orderKeys.add(orderKey);
  }
});

export type VisibleTrainingProposalPayload = z.infer<typeof visibleTrainingProposalPayloadSchema>;
export type VisibleTrainingExerciseItem = z.infer<typeof visibleTrainingExerciseItemSchema>;
export type VisibleTrainingSchedule = z.infer<typeof visibleTrainingScheduleSchema>;

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function countSections(items: VisibleTrainingExerciseItem[]) {
  return items.reduce(
    (counts, item) => {
      counts[item.section] += 1;
      return counts;
    },
    { warmup: 0, training: 0, stretch: 0 },
  );
}
