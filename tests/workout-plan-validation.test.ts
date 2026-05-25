import { describe, expect, it } from "vitest";

import { selectExerciseCandidates, validateWorkoutPlanDraftExerciseIds } from "@/lib/server/workout-plans/exercise-candidate-service";
import { validateWorkoutPlanDraft } from "@/lib/server/workout-plans/workout-plan-validation-service";

import { createExercise, createWorkoutPlanDraft, createWorkoutPlanIntent } from "./fixtures/domain";

const exercises = [
  createExercise({ id: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
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

describe("workout plan candidate and validation services", () => {
  it("filters by target muscle, equipment, injury, avoidance, candidate sufficiency, and ordering", () => {
    const chestResult = selectExerciseCandidates(createWorkoutPlanIntent({ goal: "胸肌增肌", equipment: ["自重"] }), exercises);
    expect(chestResult.primaryCandidates[0].exercise.id).toBe("push-up");
    expect(chestResult.candidateStatus).toBe("insufficient");

    const injuryResult = selectExerciseCandidates(
      createWorkoutPlanIntent({
        goal: "腿部心肺",
        equipment: ["自重"],
        injuryLimitations: ["膝盖疼痛"],
      }),
      exercises,
    );
    expect(injuryResult.excluded).toEqual(
      expect.arrayContaining([expect.objectContaining({ exerciseId: "jump-squat" })]),
    );
    expect(injuryResult.warnings.join(" ")).toContain("伤病限制");

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
        {
          title: "Day 1",
          focus: "胸部",
          estimatedMinutes: 20,
          safetyNotes: [],
          items: [
            {
              exerciseId: "push-up",
              mode: "reps",
              sets: 3,
              target: 12,
              setRestSeconds: 45,
              transitionRestSeconds: 60,
            },
            {
              exerciseId: "unknown",
              mode: "duration",
              sets: 1,
              target: 30,
              setRestSeconds: 30,
              transitionRestSeconds: 0,
            },
          ],
        },
      ],
    });

    expect(validateWorkoutPlanDraftExerciseIds(draft, ["jump-squat"], exercises)).toMatchObject({
      valid: false,
      invalidExerciseIds: ["unknown"],
      outsideCandidateExerciseIds: ["push-up"],
    });
  });

  it("reports validation errors and warnings for risky or mismatched drafts", () => {
    const intent = createWorkoutPlanIntent({
      sessionMinutes: 10,
      injuryLimitations: ["膝盖疼痛"],
    });
    const draft = createWorkoutPlanDraft({
      weeklyFrequency: 2,
      safetyNotes: [],
      days: [
        {
          title: "Day 1",
          focus: "腿部",
          estimatedMinutes: 5,
          safetyNotes: [],
          items: [
            {
              exerciseId: "jump-squat",
              mode: "reps",
              sets: 5,
              target: 120,
              setRestSeconds: 10,
              transitionRestSeconds: 0,
            },
          ],
        },
      ],
    });

    const result = validateWorkoutPlanDraft(draft, intent, {
      exercises,
      candidateExerciseIds: ["jump-squat"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain("session_too_long");
    expect(result.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "weekly_frequency_mismatch",
        "beginner_volume_high",
        "rest_too_short",
        "high_risk_exercise",
        "missing_safety_notes",
      ]),
    );
  });
});
