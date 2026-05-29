import { describe, expect, it } from "vitest";

import {
  selectExerciseCandidates,
  validateWorkoutPlanDraftExerciseIds,
  validateWorkoutRoutineDraftExerciseIds,
} from "@/lib/server/workout-plans/exercise-candidate-service";
import {
  validateWorkoutPlanDraft,
  validateWorkoutRoutineDraft,
} from "@/lib/server/workout-plans/workout-plan-validation-service";

import {
  createExercise,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

const exercises = [
  createExercise({ id: "warmup", nameZh: "肩部动态热身", categoryZh: "热身", primaryMusclesZh: ["肩部"] }),
  createExercise({ id: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
  createExercise({ id: "stretch", nameZh: "胸肩拉伸", categoryZh: "拉伸", primaryMusclesZh: ["胸部"] }),
  createExercise({
    id: "jump-squat",
    nameZh: "跳跃深蹲",
    primaryMusclesZh: ["股四头肌"],
    primaryMuscles: ["quadriceps"],
    riskTags: ["high_impact", "knee_attention"],
    goalTags: ["cardio"],
  }),
  createExercise({
    id: "expert-lift",
    nameZh: "高阶抓举",
    level: "expert",
    levelZh: "专家",
    equipment: "barbell",
    equipmentZh: "杠铃",
    goalTags: ["strength"],
  }),
];

function createValidationDay(exerciseIds: string[]) {
  return {
    title: "Day 1",
    focus: "胸部",
    cycleDayIndex: 1,
    dayType: "strength" as const,
    isRestDay: false,
    estimatedMinutes: 20,
    recoveryNotes: [],
    safetyNotes: [],
    sections: [
      {
        section: "warmup" as const,
        title: "热身",
        items: [{
          exerciseId: exerciseIds[0],
          section: "warmup" as const,
          mode: "duration" as const,
          sets: 1,
          target: 30,
          setRestSeconds: 0,
          transitionRestSeconds: 10,
        }],
      },
      {
        section: "training" as const,
        title: "主训练",
        items: exerciseIds.slice(1).map((exerciseId) => ({
          exerciseId,
          section: "training" as const,
          mode: "reps" as const,
          sets: 3,
          target: 12,
          setRestSeconds: 45,
          transitionRestSeconds: 60,
        })),
      },
      {
        section: "stretch" as const,
        title: "拉伸",
        items: [{
          exerciseId: "stretch",
          section: "stretch" as const,
          mode: "duration" as const,
          sets: 1,
          target: 30,
          setRestSeconds: 0,
          transitionRestSeconds: 0,
        }],
      },
    ],
  };
}

describe("workout plan candidate and validation services", () => {
  it("filters by target muscle, equipment, avoidance, candidate sufficiency, and ordering", () => {
    const chestResult = selectExerciseCandidates(createWorkoutPlanIntent({ goal: "胸肌增肌", equipment: ["自重"] }), exercises);
    expect(chestResult.primaryCandidates[0].exercise.id).toBe("push-up");
    expect(chestResult.candidateStatus).toBe("insufficient");

    const avoidedResult = selectExerciseCandidates(
      createWorkoutPlanIntent({
        goal: "胸肌增肌",
        equipment: ["自重"],
        avoidances: ["俯卧撑"],
      }),
      exercises,
    );
    expect(avoidedResult.excluded).toEqual(
      expect.arrayContaining([expect.objectContaining({ exerciseId: "push-up" })]),
    );
    expect(avoidedResult.candidateStatus).toBe("insufficient");
  });

  it("validates exercise ids against store and candidate set", () => {
    const draft = createWorkoutPlanDraft({
      days: [
        createValidationDay(["warmup", "push-up", "unknown"]),
      ],
    });

    expect(validateWorkoutPlanDraftExerciseIds(draft, ["jump-squat"], exercises)).toMatchObject({
      valid: false,
      invalidExerciseIds: ["unknown"],
      outsideCandidateExerciseIds: ["warmup", "push-up", "stretch"],
    });

    expect(
      validateWorkoutRoutineDraftExerciseIds(createWorkoutRoutineDraft(), ["warmup", "push-up"], exercises),
    ).toMatchObject({
      valid: false,
      invalidExerciseIds: [],
      outsideCandidateExerciseIds: ["stretch"],
    });
  });

  it("reports validation errors and warnings for mismatched drafts", () => {
    const intent = createWorkoutPlanIntent({
      sessionMinutes: 10,
    });
    const draft = createWorkoutPlanDraft({
      weeklyFrequency: 2,
      safetyNotes: [],
      days: [
        {
          ...createValidationDay(["warmup", "jump-squat"]),
          focus: "腿部",
          sections: [
            {
              section: "warmup" as const,
              title: "热身",
              items: [{
                exerciseId: "warmup",
                section: "warmup" as const,
                mode: "duration" as const,
                sets: 1,
                target: 30,
                setRestSeconds: 0,
                transitionRestSeconds: 10,
              }],
            },
            {
              section: "training" as const,
              title: "主训练",
              items: [{
                exerciseId: "jump-squat",
                section: "training" as const,
                mode: "reps" as const,
                sets: 5,
                target: 120,
                setRestSeconds: 10,
                transitionRestSeconds: 0,
              }],
            },
            {
              section: "stretch" as const,
              title: "拉伸",
              items: [{
                exerciseId: "stretch",
                section: "stretch" as const,
                mode: "duration" as const,
                sets: 1,
                target: 30,
                setRestSeconds: 0,
                transitionRestSeconds: 0,
              }],
            },
          ],
        },
      ],
    });

    const result = validateWorkoutPlanDraft(draft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "jump-squat", "stretch"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain("session_too_long");
    expect(result.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "weekly_frequency_mismatch",
        "beginner_volume_high",
        "rest_too_short",
      ]),
    );
  });

  it("validates routine draft sections, loop config, and estimated duration", () => {
    const intent = createWorkoutPlanIntent({
      intentType: "routine",
      sessionMinutes: 30,
    });
    const routineDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 12,
      trainingLoopRounds: 2,
    });

    const result = validateWorkoutRoutineDraft(routineDraft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
    });

    expect(result.valid).toBe(true);
    expect(result.exerciseIds).toEqual(["warmup", "push-up", "stretch"]);
    expect(result.dayEstimates[0]).toMatchObject({
      dayIndex: 1,
      exerciseCount: 3,
    });

    const outsideCandidateResult = validateWorkoutRoutineDraft(routineDraft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up"],
    });

    expect(outsideCandidateResult.valid).toBe(false);
    expect(outsideCandidateResult.errors.map((issue) => issue.code)).toContain("outside_candidate_exercise_id");
  });
});
