import { describe, expect, it } from "vitest";

import { exerciseRecommendationCardSchema } from "@/lib/shared/exercise-recommendations/schema";
import { exerciseListQuerySchema } from "@/lib/shared/exercises/query-schema";
import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  workoutRoutineDraftSchema,
} from "@/lib/shared/workout-plans/draft-schema";
import {
  workoutRoutineSchema,
  workoutScheduleSchema,
  workoutSessionResultInputSchema,
} from "@/lib/shared/workouts/persistence-schema";

import {
  createWorkoutItem,
  createWorkoutRoutine,
  createWorkoutSchedule,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

describe("shared schemas", () => {
  it("accepts valid workout plan and rejects invalid workout plan input", () => {
    expect(workoutPlanIntentSchema.safeParse(createWorkoutPlanIntent()).success).toBe(true);
    expect(workoutPlanIntentSchema.safeParse(createWorkoutPlanIntent({ sessionMinutes: 5 })).success).toBe(false);
    expect(workoutPlanDraftSchema.safeParse(createWorkoutPlanDraft()).success).toBe(true);
    expect(workoutPlanDraftSchema.safeParse(createWorkoutPlanDraft({ days: [] })).success).toBe(false);
    expect(workoutRoutineDraftSchema.safeParse(createWorkoutRoutineDraft()).success).toBe(true);
    expect(workoutRoutineDraftSchema.safeParse(createWorkoutRoutineDraft({ sections: [] })).success).toBe(false);
    expect(
      workoutRoutineDraftSchema.safeParse(
        createWorkoutRoutineDraft({
          sections: [
            {
              section: "warmup",
              title: "热身",
              items: [
                {
                  exerciseId: "warmup",
                  section: "training",
                  mode: "duration",
                  sets: 1,
                  target: 30,
                  setRestSeconds: 0,
                  transitionRestSeconds: 0,
                },
              ],
            },
            ...createWorkoutRoutineDraft().sections.slice(1),
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts valid recommendation and exercise query input while rejecting invalid values", () => {
    expect(
      exerciseRecommendationCardSchema.parse({
        title: "推荐动作",
        goal: "胸肌训练",
        items: [
          {
            exerciseId: "push-up",
            nameZh: "俯卧撑",
            categoryZh: "力量",
            levelZh: "新手",
            equipmentZh: "自重",
            primaryMusclesZh: ["胸部"],
            secondaryMusclesZh: ["肱三头肌"],
            reasons: ["匹配目标"],
          },
        ],
      }),
    ).toMatchObject({ title: "推荐动作" });
    expect(exerciseRecommendationCardSchema.safeParse({ title: "空推荐", goal: "胸肌", items: [] }).success).toBe(
      false,
    );
    expect(exerciseListQuerySchema.parse({ page: "2", published: "true", q: "  俯卧撑  " })).toMatchObject({
      page: 2,
      published: true,
      q: "俯卧撑",
    });
    expect(exerciseListQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
  });

  it("validates workout routine and routine item persistence input", () => {
    expect(workoutRoutineSchema.safeParse(createWorkoutRoutine()).success).toBe(true);
    expect(workoutRoutineSchema.safeParse(createWorkoutRoutine({ title: "" })).success).toBe(false);
    expect(workoutRoutineSchema.safeParse(createWorkoutRoutine({ items: [createWorkoutItem({ exerciseId: "" })] })).success).toBe(false);
    expect(workoutRoutineSchema.safeParse(createWorkoutRoutine({ items: [createWorkoutItem({ target: 0 })] })).success).toBe(false);
    expect(workoutRoutineSchema.safeParse(createWorkoutRoutine({ items: [createWorkoutItem({ setRestSeconds: -1 })] })).success).toBe(false);
    expect(workoutRoutineSchema.safeParse(createWorkoutRoutine({ items: [createWorkoutItem({ mode: "distance" as never })] })).success).toBe(false);
  });

  it("validates workout schedule persistence input", () => {
    expect(workoutScheduleSchema.safeParse(createWorkoutSchedule()).success).toBe(true);
    expect(workoutScheduleSchema.safeParse({ ...createWorkoutSchedule(), id: undefined }).success).toBe(false);
    expect(workoutScheduleSchema.safeParse(createWorkoutSchedule({ date: "2026/05/25" })).success).toBe(false);
    expect(workoutScheduleSchema.safeParse(createWorkoutSchedule({ status: "done" as never })).success).toBe(false);
    expect(workoutScheduleSchema.safeParse(createWorkoutSchedule({ minutes: -1 })).success).toBe(false);
  });

  it("validates workout session result persistence input", () => {
    expect(workoutSessionResultInputSchema.safeParse({
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    }).success).toBe(true);
    expect(workoutSessionResultInputSchema.safeParse({
      completedExerciseCount: -1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    }).success).toBe(false);
    expect(workoutSessionResultInputSchema.safeParse({
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "not-a-date",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    }).success).toBe(false);
    expect(workoutSessionResultInputSchema.safeParse({
      completedExerciseCount: 1,
      completedStepCount: 2,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    }).success).toBe(false);
  });
});
