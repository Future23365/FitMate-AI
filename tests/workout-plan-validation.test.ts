import { describe, expect, it } from "vitest";

import {
  getCandidateExerciseIds,
  selectExerciseCandidates,
  sortReplacementCandidates,
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
import type { WorkoutDayDraft } from "@/lib/shared/workout-plans/draft-schema";

const exercises = [
  createExercise({
    id: "warmup",
    nameZh: "肩部动态热身",
    categoryZh: "热身",
    primaryMusclesZh: ["肩部"],
    allowedSections: ["warmup"],
    intensityRole: "activation",
    movementPattern: "mobility",
    goalTags: ["warmup", "mobility"],
  }),
  createExercise({ id: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
  createExercise({
    id: "stretch",
    nameZh: "胸肩拉伸",
    categoryZh: "拉伸",
    primaryMusclesZh: ["胸部"],
    allowedSections: ["stretch"],
    intensityRole: "recovery",
    movementPattern: "stretch",
    goalTags: ["mobility"],
  }),
  createExercise({
    id: "Knee_Circles",
    nameZh: "膝关节环绕",
    categoryZh: "灵活性",
    primaryMusclesZh: ["股四头肌"],
    allowedSections: ["stretch"],
    intensityRole: "recovery",
    movementPattern: "rotation",
    goalTags: ["mobility"],
  }),
  createExercise({
    id: "Wrist_Circles",
    nameZh: "手腕环绕",
    categoryZh: "灵活性",
    primaryMusclesZh: ["前臂"],
    allowedSections: ["stretch"],
    intensityRole: "recovery",
    movementPattern: "rotation",
    goalTags: ["mobility"],
  }),
  createExercise({
    id: "jump-squat",
    nameZh: "跳跃深蹲",
    primaryMusclesZh: ["股四头肌"],
    primaryMuscles: ["quadriceps"],
    allowedSections: ["training"],
    movementPattern: "squat",
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
    difficulty: "advanced",
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
    expect(chestResult.candidatePools.warmup.map((candidate) => candidate.exercise.id)).toContain("warmup");
    expect(chestResult.candidatePools.training.map((candidate) => candidate.exercise.id)).toContain("push-up");
    expect(chestResult.candidatePools.stretch.map((candidate) => candidate.exercise.id)).toContain("stretch");

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

  it("keeps legal total candidates available even when section pools differ from metadata", () => {
    const result = selectExerciseCandidates(
      createWorkoutPlanIntent({
        intentType: "routine",
        goal: "灵活性恢复",
        preferences: ["居家训练"],
      }),
      exercises,
    );

    expect(result.candidatePools.warmup.map((candidate) => candidate.exercise.id)).not.toContain("Knee_Circles");
    expect(result.candidatePools.warmup.map((candidate) => candidate.exercise.id)).not.toContain("Wrist_Circles");
    expect(getCandidateExerciseIds(result)).toEqual(
      expect.arrayContaining(["Knee_Circles", "Wrist_Circles"]),
    );
    expect(result.candidateStatus).not.toBe("insufficient");
  });

  it("returns structured shortage reasons when section pools are incomplete", () => {
    const result = selectExerciseCandidates(
      createWorkoutPlanIntent({ intentType: "routine", goal: "胸肌增肌" }),
      [exercises[1]],
    );

    expect(result.shortages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pool: "warmup", reasons: ["candidate_pool_below_required_minimum"] }),
        expect.objectContaining({ pool: "stretch", reasons: ["candidate_pool_below_required_minimum"] }),
      ]),
    );
  });

  it("sorts replacements by explicit group and regression before same-muscle fallback", () => {
    const original = createExercise({
      id: "standard-push-up",
      nameZh: "标准俯卧撑",
      difficulty: "intermediate",
      substitutionGroupId: "push:chest",
      regressionExerciseIds: ["wall-push-up"],
    });
    const candidates = [
      createExercise({
        id: "plank",
        nameZh: "平板支撑",
        movementPattern: "core",
        substitutionGroupId: "core:abs",
      }),
      createExercise({
        id: "wall-push-up",
        nameZh: "墙壁俯卧撑",
        difficulty: "beginner",
        substitutionGroupId: "push:chest",
      }),
      createExercise({
        id: "incline-push-up",
        nameZh: "上斜俯卧撑",
        difficulty: "beginner",
        substitutionGroupId: "push:chest",
      }),
    ].map((exercise, index) => ({
      exercise,
      score: 10 - index,
      reasons: [],
      source: "primary" as const,
    }));

    expect(sortReplacementCandidates(candidates, {
      originalExercise: original,
      direction: "regression",
    })[0].exercise.id).toBe("wall-push-up");
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
      fieldSources: {
        sessionMinutes: "current_user_message",
      },
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
      sessionMinutes: 12,
    });
    const routineDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 12,
      trainingLoopRounds: 2,
    });

    const result = validateWorkoutRoutineDraft(routineDraft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "current_user_message",
      },
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

  it("rejects routine drafts that are materially shorter than the target session duration", () => {
    const intent = createWorkoutPlanIntent({
      intentType: "routine",
      sessionMinutes: 40,
    });
    const routineDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 40,
      trainingLoopRounds: 2,
      trainingLoopRestSeconds: 90,
      sections: [
        createWorkoutRoutineDraft().sections[0],
        {
          section: "training",
          title: "主训练",
          items: [
            {
              exerciseId: "push-up",
              section: "training",
              mode: "reps",
              sets: 2,
              target: 10,
              setRestSeconds: 60,
              transitionRestSeconds: 60,
            },
          ],
        },
        createWorkoutRoutineDraft().sections[2],
      ],
    });

    const result = validateWorkoutRoutineDraft(routineDraft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "current_user_message",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.dayEstimates[0].estimatedMinutes).toBeLessThan(30);
    expect(result.errors.map((issue) => issue.code)).toContain("session_too_short");
    expect(result.warnings.map((issue) => issue.code)).toContain("day_estimate_mismatch");
  });

  it("downgrades default or LLM-inferred duration and frequency mismatches to warnings", () => {
    const intent = createWorkoutPlanIntent({
      intentType: "plan",
      sessionMinutes: 40,
      weeklyFrequency: 3,
    });
    const draft = createWorkoutPlanDraft({
      weeklyFrequency: 2,
      days: [createValidationDay(["warmup", "push-up"])],
    });
    const routineDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 40,
      trainingLoopRounds: 1,
    });

    const planResult = validateWorkoutPlanDraft(draft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "llm_inferred",
        weeklyFrequency: "default",
      },
    });
    const routineResult = validateWorkoutRoutineDraft(routineDraft, {
      ...intent,
      intentType: "routine",
    }, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "default",
      },
    });

    expect(planResult.valid).toBe(true);
    expect(planResult.errors.map((issue) => issue.code)).not.toContain("weekly_frequency_mismatch");
    expect(planResult.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["weekly_frequency_mismatch", "session_too_short"]),
    );
    expect(routineResult.valid).toBe(true);
    expect(routineResult.errors.map((issue) => issue.code)).not.toContain("session_too_short");
    expect(routineResult.warnings.map((issue) => issue.code)).toContain("session_too_short");
  });

  it("uses confirmed history or artifact constraints for hard duration failures only when explicitly confirmed", () => {
    const intent = createWorkoutPlanIntent({
      intentType: "routine",
      sessionMinutes: 40,
    });
    const routineDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 40,
      trainingLoopRounds: 1,
    });

    const unconfirmedHistoryResult = validateWorkoutRoutineDraft(routineDraft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "history",
      },
    });
    const confirmedArtifactResult = validateWorkoutRoutineDraft(routineDraft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "artifact",
      },
      confirmedConstraintFields: ["sessionMinutes"],
    });

    expect(unconfirmedHistoryResult.valid).toBe(true);
    expect(unconfirmedHistoryResult.errors.map((issue) => issue.code)).not.toContain("session_too_short");
    expect(unconfirmedHistoryResult.warnings.map((issue) => issue.code)).toContain("session_too_short");
    expect(confirmedArtifactResult.valid).toBe(false);
    expect(confirmedArtifactResult.errors.map((issue) => issue.code)).toContain("session_too_short");
  });

  it("does not apply explicit session duration checks to rest days", () => {
    const intent = createWorkoutPlanIntent({
      intentType: "plan",
      sessionMinutes: 30,
      weeklyFrequency: 1,
      calendarHorizonDays: 2,
    });
    const trainingDay: WorkoutDayDraft = {
      title: "Day 1 胸肌训练",
      focus: "胸部",
      cycleDayIndex: 1,
      dayType: "strength",
      isRestDay: false,
      estimatedMinutes: 30,
      recoveryNotes: [],
      safetyNotes: [],
      sections: [
        {
          section: "warmup",
          title: "热身",
          items: [{
            exerciseId: "warmup",
            section: "warmup",
            mode: "duration",
            sets: 1,
            target: 240,
            setRestSeconds: 0,
            transitionRestSeconds: 30,
          }],
        },
        {
          section: "training",
          title: "主训练",
          items: [{
            exerciseId: "push-up",
            section: "training",
            mode: "duration",
            sets: 3,
            target: 420,
            setRestSeconds: 90,
            transitionRestSeconds: 60,
          }],
        },
        {
          section: "stretch",
          title: "拉伸",
          items: [{
            exerciseId: "stretch",
            section: "stretch",
            mode: "duration",
            sets: 1,
            target: 180,
            setRestSeconds: 0,
            transitionRestSeconds: 0,
          }],
        },
      ],
    };
    const draft = createWorkoutPlanDraft({
      cycleLengthDays: 2,
      trainingDayCount: 1,
      restDayCount: 1,
      weeklyFrequency: 1,
      calendarHorizonDays: 2,
      days: [
        trainingDay,
        {
          title: "Day 2 恢复日",
          focus: "恢复",
          cycleDayIndex: 2,
          dayType: "rest",
          isRestDay: true,
          estimatedMinutes: 0,
          recoveryNotes: ["完整休息。"],
          safetyNotes: [],
          sections: [],
        },
      ],
    });

    const result = validateWorkoutPlanDraft(draft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "current_user_message",
        weeklyFrequency: "current_user_message",
        calendarHorizonDays: "current_user_message",
      },
    });

    expect(result.errors.map((issue) => issue.code)).not.toContain("session_too_short");
    expect(result.errors.map((issue) => issue.code)).not.toContain("session_too_long");
  });

  it("keeps explicit avoidances hard while unconfirmed injury limitations stay warnings", () => {
    const routineDraft = createWorkoutRoutineDraft();
    const avoidanceIntent = createWorkoutPlanIntent({
      intentType: "routine",
      avoidances: ["不要俯卧撑"],
    });
    const injuryIntent = createWorkoutPlanIntent({
      intentType: "routine",
      injuryLimitations: ["不要俯卧撑"],
    });

    const avoidanceResult = validateWorkoutRoutineDraft(routineDraft, avoidanceIntent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        avoidances: "current_user_message",
      },
    });
    const unconfirmedInjuryResult = validateWorkoutRoutineDraft(routineDraft, injuryIntent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        injuryLimitations: "llm_inferred",
      },
    });

    expect(avoidanceResult.valid).toBe(false);
    expect(avoidanceResult.errors.map((issue) => issue.code)).toContain("user_memory_constraint");
    expect(unconfirmedInjuryResult.valid).toBe(true);
    expect(unconfirmedInjuryResult.errors.map((issue) => issue.code)).not.toContain("user_memory_constraint");
    expect(unconfirmedInjuryResult.warnings.map((issue) => issue.code)).toContain("user_memory_constraint");
  });

  it("records section semantic mismatches as warnings without rejecting the routine", () => {
    const intent = createWorkoutPlanIntent({ intentType: "routine", sessionMinutes: 12 });
    const routineDraft = createWorkoutRoutineDraft({
      sections: [
        {
          section: "warmup",
          title: "热身",
          items: [
            {
              exerciseId: "Knee_Circles",
              section: "warmup",
              mode: "duration",
              sets: 1,
              target: 30,
              setRestSeconds: 0,
              transitionRestSeconds: 10,
            },
            {
              exerciseId: "Wrist_Circles",
              section: "warmup",
              mode: "duration",
              sets: 1,
              target: 30,
              setRestSeconds: 0,
              transitionRestSeconds: 10,
            },
          ],
        },
        ...createWorkoutRoutineDraft().sections.slice(1),
      ],
    });

    const result = validateWorkoutRoutineDraft(routineDraft, intent, {
      exercises,
      candidateExerciseIds: ["Knee_Circles", "Wrist_Circles", "push-up", "stretch"],
    });

    expect(result.valid).toBe(true);
    expect(result.errors.map((issue) => issue.code)).not.toContain("section_exercise_mismatch");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "section_exercise_mismatch",
          exerciseId: "Knee_Circles",
          section: "warmup",
          metadataSections: ["stretch"],
        }),
        expect.objectContaining({
          code: "section_exercise_mismatch",
          exerciseId: "Wrist_Circles",
          section: "warmup",
          metadataSections: ["stretch"],
        }),
      ]),
    );
  });

  it("keeps deterministic validation failures for invalid ids, candidates, sections, schema, and duration", () => {
    const intent = createWorkoutPlanIntent({ intentType: "routine", sessionMinutes: 40 });
    const missingSectionDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 40,
      sections: [
        createWorkoutRoutineDraft().sections[0],
        createWorkoutRoutineDraft().sections[1],
      ],
    });
    const shortDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 40,
      trainingLoopRounds: 1,
    });
    const invalidAndOutsideResult = validateWorkoutRoutineDraft(
      createWorkoutRoutineDraft({
        sections: [
          createWorkoutRoutineDraft().sections[0],
          {
            section: "training",
            title: "主训练",
            items: [
              {
                exerciseId: "unknown",
                section: "training",
                mode: "reps",
                sets: 3,
                target: 12,
                setRestSeconds: 45,
                transitionRestSeconds: 30,
              },
              {
                exerciseId: "jump-squat",
                section: "training",
                mode: "reps",
                sets: 3,
                target: 12,
                setRestSeconds: 45,
                transitionRestSeconds: 30,
              },
            ],
          },
          createWorkoutRoutineDraft().sections[2],
        ],
      }),
      createWorkoutPlanIntent({ intentType: "routine", sessionMinutes: 12 }),
      {
        exercises,
        candidateExerciseIds: ["warmup", "push-up", "stretch"],
      },
    );
    const shortResult = validateWorkoutRoutineDraft(shortDraft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      fieldSources: {
        sessionMinutes: "current_user_message",
      },
    });

    expect(() =>
      validateWorkoutRoutineDraft(missingSectionDraft, intent, {
        exercises,
        candidateExerciseIds: ["warmup", "push-up", "stretch"],
      }),
    ).toThrow();
    expect(invalidAndOutsideResult.valid).toBe(false);
    expect(invalidAndOutsideResult.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["invalid_exercise_id", "outside_candidate_exercise_id"]),
    );
    expect(shortResult.valid).toBe(false);
    expect(shortResult.errors.map((issue) => issue.code)).toContain("session_too_short");
    expect(() =>
      validateWorkoutRoutineDraft({ ...createWorkoutRoutineDraft(), sections: [] } as never, intent, {
        exercises,
        candidateExerciseIds: ["warmup", "push-up", "stretch"],
      }),
    ).toThrow();
  });

  it("records repeated and consecutive high-load days as warnings", () => {
    const intent = createWorkoutPlanIntent({
      intentType: "plan",
      weeklyFrequency: 7,
      calendarHorizonDays: 2,
    });
    const highLoadDay = createValidationDay(["warmup", "push-up"]);
    const draft = createWorkoutPlanDraft({
      cycleLengthDays: 2,
      weeklyFrequency: 7,
      calendarHorizonDays: 2,
      planStrategy: {
        goal: "胸肌训练",
        horizonDays: 2,
        weeklyFrequency: 7,
        sessionMinutes: 30,
        strategy: "repeat_previous_routine",
        progressionPolicy: "none",
        intensityBias: "normal",
        constraints: [],
        fieldSources: {},
        defaultAssumptions: [],
      },
      days: [
        {
          ...highLoadDay,
          cycleDayIndex: 1,
          sections: highLoadDay.sections.map((section) => ({
            ...section,
            items: section.items.map((item) => ({
              ...item,
              sets: section.section === "training" ? 8 : item.sets,
            })),
          })),
        },
        {
          ...highLoadDay,
          cycleDayIndex: 2,
          title: "Day 2",
          sections: highLoadDay.sections.map((section) => ({
            ...section,
            items: section.items.map((item) => ({
              ...item,
              sets: section.section === "training" ? 8 : item.sets,
            })),
          })),
        },
      ],
    });

    const result = validateWorkoutPlanDraft(draft, intent, {
      exercises,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
    });

    expect(result.valid).toBe(true);
    expect(result.errors.map((issue) => issue.code)).not.toContain("day_similarity_high");
    expect(result.errors.map((issue) => issue.code)).not.toContain("consecutive_load_high");
    expect(result.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["day_similarity_high", "consecutive_load_high"]),
    );
  });
});
