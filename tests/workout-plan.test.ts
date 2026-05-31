import exercisesData from "@/data/exercises.zh.json";
import { describe, expect, it } from "vitest";

import {
  convertWorkoutPlanDraftToWorkoutRoutine,
  convertWorkoutRoutineDraftToWorkoutRoutine,
} from "@/features/workout-plans/lib/workout-routine-conversion";
import {
  buildWorkoutPlanSchedules,
  getWorkoutPlanImportOptions,
  selectWorkoutPlanSchedulesToReplace,
} from "@/features/workout-plans/lib/workout-plan-scheduling";
import { selectExerciseCandidates } from "@/lib/server/workout-plans/exercise-candidate-service";
import type { Exercise } from "@/lib/shared/exercises/types";
import { workoutPlanIntentSchema, type WorkoutDayDraft } from "@/lib/shared/workout-plans/draft-schema";
import { normalizeWorkoutItem } from "@/lib/shared/workouts/composition";

import {
  createExercise,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

const exercises = exercisesData as Exercise[];

function createPlanDay(
  overrides: Partial<WorkoutDayDraft> & {
    cycleDayIndex: number;
    focus: string;
    title: string;
    trainingExerciseId?: string;
  },
): WorkoutDayDraft {
  if (overrides.isRestDay) {
    return {
      title: overrides.title,
      focus: overrides.focus,
      cycleDayIndex: overrides.cycleDayIndex,
      dayType: overrides.dayType ?? "rest",
      isRestDay: true,
      estimatedMinutes: overrides.estimatedMinutes ?? 0,
      recoveryNotes: overrides.recoveryNotes ?? ["轻松活动并保证睡眠。"],
      safetyNotes: overrides.safetyNotes ?? [],
      sections: [],
    };
  }

  const trainingExerciseId = overrides.trainingExerciseId ?? "push-up";

  return {
    title: overrides.title,
    focus: overrides.focus,
    cycleDayIndex: overrides.cycleDayIndex,
    dayType: overrides.dayType ?? "strength",
    isRestDay: false,
    estimatedMinutes: overrides.estimatedMinutes ?? 20,
    recoveryNotes: overrides.recoveryNotes ?? [],
    safetyNotes: overrides.safetyNotes ?? [],
    sections: overrides.sections ?? [
      {
        section: "warmup",
        title: "热身",
        items: [{
          exerciseId: trainingExerciseId,
          section: "warmup",
          mode: "duration",
          sets: 1,
          target: 30,
          setRestSeconds: 0,
          transitionRestSeconds: 20,
        }],
      },
      {
        section: "training",
        title: "主训练",
        items: [{
          exerciseId: trainingExerciseId,
          section: "training",
          mode: "reps",
          sets: 2,
          target: 12,
          setRestSeconds: 30,
          transitionRestSeconds: 30,
        }],
      },
      {
        section: "stretch",
        title: "拉伸",
        items: [{
          exerciseId: trainingExerciseId,
          section: "stretch",
          mode: "duration",
          sets: 1,
          target: 30,
          setRestSeconds: 0,
          transitionRestSeconds: 0,
        }],
      },
    ],
  };
}

describe("workout plan core logic", () => {
  it("validates workout plan intent schema", () => {
    const validIntent = createWorkoutPlanIntent({
      intentType: "plan",
      goal: "增肌塑形",
      sessionMinutes: 45,
      weeklyFrequency: 3,
      equipment: ["哑铃"],
      preferences: ["居家"],
    });

    expect(workoutPlanIntentSchema.parse(validIntent)).toMatchObject({
      experience: "beginner",
      sessionMinutes: 45,
    });
    expect(
      workoutPlanIntentSchema.safeParse({
        ...validIntent,
        experience: "superman",
      }).success,
    ).toBe(false);
  });

  it("selects relevant exercise candidates from real seed data", () => {
    const beginnerResult = selectExerciseCandidates(
      createWorkoutPlanIntent({
        intentType: "plan",
        goal: "提升心肺",
        weeklyFrequency: 3,
        equipment: ["自重"],
        preferences: [],
      }),
      exercises,
    );
    expect(beginnerResult.primaryCandidates.some((candidate) => candidate.exercise.level === "expert")).toBe(false);
    expect(beginnerResult.primaryCandidates.every((candidate) => candidate.score >= 28)).toBe(true);
    expect(beginnerResult.supplementaryCandidates.every((candidate) => candidate.score < 28)).toBe(true);

    const chestResult = selectExerciseCandidates(
      createWorkoutPlanIntent({
        goal: "胸肌增肌",
        equipment: ["自重"],
      }),
      exercises,
    );
    expect(chestResult.isEnoughCandidates).toBe(true);
    expect(chestResult.candidateStatus).not.toBe("insufficient");
    expect(chestResult.primaryCandidates.slice(0, 8).every((candidate) => candidate.exercise.primaryMusclesZh.includes("胸部"))).toBe(
      true,
    );
    expect(chestResult.primaryCandidates.some((candidate) => /俯卧撑/.test(candidate.exercise.nameZh))).toBe(true);

    const noneEquipmentResult = selectExerciseCandidates(
      createWorkoutPlanIntent({
        goal: "胸肌增肌",
        equipment: ["none"],
      }),
      exercises,
    );
    expect(noneEquipmentResult.primaryCandidates.some((candidate) => /俯卧撑/.test(candidate.exercise.nameZh))).toBe(
      true,
    );
  });

  it("excludes current recommendation card exercises and records recommendation trace", () => {
    const fixtureExercises = [
      createExercise({ id: "push-up", nameZh: "俯卧撑" }),
      createExercise({ id: "incline-push-up", nameZh: "上斜俯卧撑" }),
    ];

    const result = selectExerciseCandidates(
      createWorkoutPlanIntent({ goal: "胸肌训练", equipment: ["自重"] }),
      fixtureExercises,
      {
        minCandidates: 1,
        exposureSources: [{ reason: "current_card", exerciseIds: ["push-up"] }],
      },
    );

    expect(result.primaryCandidates.map((candidate) => candidate.exercise.id)).not.toContain("push-up");
    expect(result.excluded.find((item) => item.exerciseId === "push-up")).toMatchObject({
      reasonCodes: ["current_card"],
      relaxable: false,
    });
    expect(result.recommendationTrace).toMatchObject({
      goal: "胸肌训练",
      excludedExerciseIds: ["push-up"],
      excludeReasons: { "push-up": ["current_card"] },
      fallbackUsed: false,
    });
    expect(result.recommendationTrace.finalExerciseIds).toContain("incline-push-up");
  });

  it("excludes non-medical feedback reasons while keeping health-risk tagged actions eligible", () => {
    const fixtureExercises = [
      createExercise({ id: "push-up", nameZh: "俯卧撑" }),
      createExercise({ id: "hard-push-up", nameZh: "高难俯卧撑" }),
      createExercise({
        id: "knee-jump",
        nameZh: "膝主导跳跃",
        riskTags: ["knee_pain"],
        contraindications: ["膝痛"],
      }),
      createExercise({ id: "current-card-push-up", nameZh: "当前卡片俯卧撑" }),
      createExercise({ id: "incline-push-up", nameZh: "上斜俯卧撑" }),
      createExercise({ id: "wall-push-up", nameZh: "墙壁俯卧撑" }),
      createExercise({ id: "wide-push-up", nameZh: "宽距俯卧撑" }),
    ];

    const result = selectExerciseCandidates(
      createWorkoutPlanIntent({ goal: "胸肌训练", equipment: ["自重"], injuryLimitations: ["膝"] }),
      fixtureExercises,
      {
        minCandidates: 1,
        exposureSources: [{ reason: "current_card", exerciseIds: ["current-card-push-up"] }],
        memoryState: {
          currentMessage: {
            requestedExerciseIds: [],
            dislikedExerciseIds: [],
            tooHardExerciseIds: ["hard-push-up"],
            temporaryAvoidanceLabels: [],
            healthSignalLabels: [],
          },
          activeExerciseFeedback: [
            {
              exerciseId: "push-up",
              kind: "dislike",
              confidence: 1,
              requiresConfirmation: false,
              status: "active",
            },
          ],
          activeMemories: [],
          recentWorkoutFeedback: [],
        },
      },
    );

    expect(result.candidateStatus).not.toBe("insufficient");
    expect(result.recommendationTrace.excludeReasons).toMatchObject({
      "push-up": ["user_dislike"],
      "hard-push-up": ["too_hard"],
      "current-card-push-up": ["current_card"],
    });
    expect(result.recommendationTrace.excludeReasons["knee-jump"]).toBeUndefined();
    expect([
      ...result.primaryCandidates.map((candidate) => candidate.exercise.id),
      ...result.supplementaryCandidates.map((candidate) => candidate.exercise.id),
    ]).toContain("knee-jump");
    expect(result.primaryCandidates.map((candidate) => candidate.exercise.id)).toEqual(
      expect.arrayContaining(["incline-push-up", "wall-push-up", "wide-push-up"]),
    );
  });

  it("relaxes non-critical exposure constraints before reporting candidate shortage", () => {
    const fixtureExercises = [createExercise({ id: "push-up", nameZh: "俯卧撑" })];
    const relaxed = selectExerciseCandidates(
      createWorkoutPlanIntent({ goal: "综合训练", equipment: ["自重"] }),
      fixtureExercises,
      {
        minCandidates: 1,
        exposureSources: [{ reason: "recent_recommendation", exerciseIds: ["push-up"] }],
      },
    );

    expect(relaxed.candidateStatus).toBe("enough");
    expect(relaxed.recommendationTrace.fallbackUsed).toBe(true);
    expect(relaxed.recommendationTrace.relaxedConstraints).toEqual(["recent_recommendation"]);
    expect(relaxed.recommendationTrace.finalExerciseIds).toContain("push-up");

    const blocked = selectExerciseCandidates(
      createWorkoutPlanIntent({ goal: "综合训练", equipment: ["自重"] }),
      fixtureExercises,
      {
        minCandidates: 1,
        exposureSources: [{ reason: "current_card", exerciseIds: ["push-up"] }],
      },
    );

    expect(blocked.candidateStatus).toBe("insufficient");
    expect(blocked.recommendationTrace.fallbackUsed).toBe(false);
    expect(blocked.relaxationOptions).toEqual([]);
    expect(blocked.recommendationTrace.finalExerciseIds).toEqual([]);
  });

  it("converts workout plan draft to saved workout and keeps image compatibility", () => {
    const candidates = selectExerciseCandidates(
      createWorkoutPlanIntent({
        intentType: "plan",
        goal: "提升心肺",
        weeklyFrequency: 3,
        equipment: ["自重"],
        preferences: [],
      }),
      exercises,
    );
    const exerciseIds = candidates.primaryCandidates.slice(0, 2).map((candidate) => candidate.exercise.id);
    expect(exerciseIds).toHaveLength(2);

    const draft = createWorkoutPlanDraft({
      title: "活力减脂计划",
      goal: "全身减脂",
      weeklyFrequency: 3,
      estimatedSessionMinutes: 30,
      days: [
        createPlanDay({
          title: "Day 1 核心激活",
          focus: "核心与下肢",
          cycleDayIndex: 1,
          estimatedMinutes: 25,
          safetyNotes: ["训练前后注意拉伸"],
          sections: [
            {
              section: "warmup",
              title: "热身",
              items: [{
                exerciseId: exerciseIds[0],
                section: "warmup",
                mode: "duration",
                sets: 1,
                target: 30,
                setRestSeconds: 0,
                transitionRestSeconds: 20,
              }],
            },
            {
              section: "training",
              title: "主训练",
              items: [{
              exerciseId: exerciseIds[1],
              section: "training",
              mode: "duration",
              sets: 3,
              target: 30,
              setRestSeconds: 45,
              transitionRestSeconds: 60,
              notes: "平稳呼吸",
              }],
            },
            {
              section: "stretch",
              title: "拉伸",
              items: [{
                exerciseId: exerciseIds[0],
                section: "stretch",
                mode: "duration",
                sets: 1,
                target: 30,
                setRestSeconds: 0,
                transitionRestSeconds: 0,
              }],
            },
          ],
        }),
      ],
    });

    const workoutRoutine = convertWorkoutPlanDraftToWorkoutRoutine(draft, exercises, {
      createId: () => "fixture-id",
      dayIndex: 1,
      id: "workout-1",
      updatedAt: new Date("2026-05-25T10:30:00.000Z"),
    });

    expect(workoutRoutine).toMatchObject({
      id: "workout-1",
      title: "Day 1 核心激活",
      updatedAt: "2026-05-25T10:30:00.000Z",
    });
    expect(workoutRoutine.items).toHaveLength(3);
    expect(workoutRoutine.items.map((item) => item.section)).toEqual(["warmup", "training", "stretch"]);
    expect(workoutRoutine.items[0]).toMatchObject({
      exerciseId: exerciseIds[0],
      section: "warmup",
    });
    expect(workoutRoutine.items[0].imageUrls).toHaveLength(
      exercises.find((exercise) => exercise.id === exerciseIds[0])?.imageUrls.length ?? 0,
    );

    expect(
      normalizeWorkoutItem({
        ...workoutRoutine.items[0],
        imageUrl: "/legacy-demo.jpg",
        imageUrls: undefined,
      }).imageUrls,
    ).toEqual(["/legacy-demo.jpg"]);
  });

  it("converts each AI draft day into an independent workout routine", () => {
    const candidates = selectExerciseCandidates(createWorkoutPlanIntent({ goal: "全身训练" }), exercises);
    const exerciseIds = candidates.primaryCandidates.slice(0, 2).map((candidate) => candidate.exercise.id);
    const draft = createWorkoutPlanDraft({
      title: "两日训练草稿",
      days: [
        createPlanDay({
          title: "Day 1 上肢",
          focus: "上肢",
          cycleDayIndex: 1,
          trainingExerciseId: exerciseIds[0],
        }),
        createPlanDay({
          title: "Day 2 下肢",
          focus: "下肢",
          cycleDayIndex: 2,
          dayType: "mixed",
          trainingExerciseId: exerciseIds[1],
        }),
      ],
    });

    const routines = [1, 2].map((dayIndex) =>
      convertWorkoutPlanDraftToWorkoutRoutine(draft, exercises, {
        createId: () => `routine-${dayIndex}`,
        dayIndex,
        id: `routine-${dayIndex}`,
        updatedAt: new Date("2026-05-25T10:30:00.000Z"),
      }),
    );

    expect(routines).toHaveLength(2);
    expect(routines.map((routine) => routine.title)).toEqual(["Day 1 上肢", "Day 2 下肢"]);
    expect(routines[0].items[1].exerciseId).not.toBe(routines[1].items[1].exerciseId);
  });

  it("builds cycle-based workout schedules and scoped replacement range", () => {
    const draft = createWorkoutPlanDraft({
      title: "三日周期计划",
      days: [
        createPlanDay({ title: "Day 1 上肢", focus: "上肢", cycleDayIndex: 1 }),
        createPlanDay({ title: "Day 2 恢复", focus: "恢复", cycleDayIndex: 2, isRestDay: true }),
        createPlanDay({ title: "Day 3 下肢", focus: "下肢", cycleDayIndex: 3 }),
      ],
    });
    const routineA = createWorkoutRoutineDraft();
    const routine = convertWorkoutRoutineDraftToWorkoutRoutine(routineA, [
      createExercise({ id: "warmup" }),
      createExercise({ id: "push-up" }),
      createExercise({ id: "stretch" }),
    ], { id: "routine-1" });
    const importOptions = getWorkoutPlanImportOptions(draft);
    const schedules = buildWorkoutPlanSchedules(draft, [
      { cycleDayIndex: 1, routine: { ...routine, id: "routine-1", title: "Day 1 上肢" } },
      { cycleDayIndex: 3, routine: { ...routine, id: "routine-3", title: "Day 3 下肢" } },
    ], {
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      daysToImport: importOptions[1].daysToImport,
      createId: () => "id",
    });

    expect(importOptions.map((option) => option.label)).toEqual(["导入本周期", "重复 2 个周期", "重复 4 个周期"]);
    expect(schedules).toHaveLength(6);
    expect(schedules.map((schedule) => schedule.status)).toEqual([
      "planned",
      "rest",
      "planned",
      "planned",
      "rest",
      "planned",
    ]);

    const replaceTargets = selectWorkoutPlanSchedulesToReplace([
      schedules[0],
      { ...schedules[0], id: "other", sourceRoutineTitle: "其他计划" },
      { ...schedules[0], id: "outside", date: "2026-06-30" },
    ], draft, {
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      daysToImport: 6,
    });

    expect(replaceTargets.map((schedule) => schedule.id)).toEqual([schedules[0].id]);
  });

  it("converts routine draft sections and loop config to a saved workout routine", () => {
    const routineDraft = createWorkoutRoutineDraft({
      trainingLoopRounds: 4,
      trainingLoopRestSeconds: 75,
    });
    const routineExercises = [
      createExercise({ id: "warmup", nameZh: "肩部动态热身", categoryZh: "热身", primaryMusclesZh: ["肩部"] }),
      createExercise({ id: "push-up", nameZh: "俯卧撑", categoryZh: "力量", primaryMusclesZh: ["胸部"] }),
      createExercise({ id: "stretch", nameZh: "胸肩拉伸", categoryZh: "拉伸", primaryMusclesZh: ["胸部"] }),
    ];

    const routine = convertWorkoutRoutineDraftToWorkoutRoutine(routineDraft, routineExercises, {
      createId: () => "routine-item",
      id: "routine-1",
      updatedAt: new Date("2026-05-25T10:30:00.000Z"),
    });

    expect(routine).toMatchObject({
      id: "routine-1",
      title: "居家胸肌循环",
      trainingLoopRounds: 4,
      trainingLoopRestSeconds: 75,
    });
    expect(routine.items.map((item) => item.section)).toEqual(["warmup", "training", "stretch"]);
    expect(routine.items[1]).toMatchObject({
      exerciseId: "push-up",
      mode: "reps",
      sets: 3,
      target: 12,
      setRestSeconds: 45,
      transitionRestSeconds: 30,
    });
  });
});
