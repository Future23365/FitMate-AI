import { describe, expect, it } from "vitest";

import { exerciseRecommendationCardSchema } from "@/lib/shared/exercise-recommendations/schema";
import { exerciseListQuerySchema } from "@/lib/shared/exercises/query-schema";
import { workoutPlanDraftSchema, workoutPlanIntentSchema } from "@/lib/shared/workout-plans/draft-schema";
import { savedWorkoutSchema, scheduledWorkoutSchema } from "@/lib/shared/workouts/persistence-schema";

import {
  createSavedWorkout,
  createScheduledWorkout,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
} from "./fixtures/domain";

describe("shared schemas", () => {
  it("accepts valid workout plan and rejects invalid workout plan input", () => {
    expect(workoutPlanIntentSchema.safeParse(createWorkoutPlanIntent()).success).toBe(true);
    expect(workoutPlanIntentSchema.safeParse(createWorkoutPlanIntent({ sessionMinutes: 5 })).success).toBe(false);
    expect(workoutPlanDraftSchema.safeParse(createWorkoutPlanDraft()).success).toBe(true);
    expect(workoutPlanDraftSchema.safeParse(createWorkoutPlanDraft({ days: [] })).success).toBe(false);
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

  it("accepts valid workout persistence input and rejects invalid status or date", () => {
    expect(savedWorkoutSchema.safeParse(createSavedWorkout()).success).toBe(true);
    expect(savedWorkoutSchema.safeParse(createSavedWorkout({ title: "" })).success).toBe(false);
    expect(scheduledWorkoutSchema.safeParse(createScheduledWorkout()).success).toBe(true);
    expect(scheduledWorkoutSchema.safeParse(createScheduledWorkout({ date: "2026/05/25" })).success).toBe(false);
    expect(scheduledWorkoutSchema.safeParse(createScheduledWorkout({ status: "done" as never })).success).toBe(false);
  });
});
