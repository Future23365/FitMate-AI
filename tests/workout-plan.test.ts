import exercisesData from "@/data/exercises.zh.json";
import { describe, expect, it } from "vitest";

import {
  convertWorkoutPlanDraftToWorkoutRoutine,
  convertWorkoutRoutineDraftToWorkoutRoutine,
} from "@/features/workout-plans/lib/workout-routine-conversion";
import { selectExerciseCandidates } from "@/lib/server/workout-plans/exercise-candidate-service";
import type { Exercise } from "@/lib/shared/exercises/types";
import { workoutPlanIntentSchema } from "@/lib/shared/workout-plans/draft-schema";
import { normalizeWorkoutItem } from "@/lib/shared/workouts/composition";

import {
  createExercise,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

const exercises = exercisesData as Exercise[];

function hasHighRiskHealthCondition(text: string): boolean {
  return /(胸痛|心脏病|心梗|中风|晕厥|昏厥|怀孕|孕期|产后|骨折|术后|手术后|高血压|糖尿病|癌症|肿瘤)/.test(
    text,
  );
}

describe("workout plan core logic", () => {
  it("validates workout plan intent schema and high-risk health terms", () => {
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
    expect(hasHighRiskHealthCondition("我是一个健康的上班族，想减脂。")).toBe(false);
    expect(hasHighRiskHealthCondition("我刚做完手术，术后恢复期，心脏不太舒服，胸痛。")).toBe(true);
    expect(hasHighRiskHealthCondition("我是孕妇，目前处于孕期，想做点轻量拉伸。")).toBe(true);
  });

  it("selects safe and relevant exercise candidates from real seed data", () => {
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

    const injuryResult = selectExerciseCandidates(
      createWorkoutPlanIntent({
        goal: "提升心肺",
        weeklyFrequency: 3,
        equipment: ["自重"],
        preferences: [],
        injuryLimitations: ["膝盖疼痛，有半月板旧伤"],
      }),
      exercises,
    );
    expect(injuryResult.primaryCandidates.some((candidate) => candidate.exercise.riskTags.includes("high_impact"))).toBe(
      false,
    );

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
        {
          title: "Day 1 核心激活",
          focus: "核心与下肢",
          dayIndex: 1,
          estimatedMinutes: 25,
          safetyNotes: ["训练前后注意拉伸"],
          items: [
            {
              exerciseId: exerciseIds[0],
              mode: "reps",
              sets: 3,
              target: 15,
              setRestSeconds: 45,
              transitionRestSeconds: 60,
              notes: "注意核心收紧",
            },
            {
              exerciseId: exerciseIds[1],
              mode: "duration",
              sets: 3,
              target: 30,
              setRestSeconds: 45,
              transitionRestSeconds: 60,
              notes: "平稳呼吸",
            },
          ],
        },
      ],
    });

    const workoutRoutine = convertWorkoutPlanDraftToWorkoutRoutine(draft, exercises, {
      createId: () => "fixture-id",
      dayIndex: 1,
      id: "workout-1",
      updatedAt: new Date("2026-05-25T10:30:00"),
    });

    expect(workoutRoutine).toMatchObject({
      id: "workout-1",
      title: "Day 1 核心激活",
      updatedAt: "2026-05-25 10:30",
    });
    expect(workoutRoutine.items).toHaveLength(2);
    expect(workoutRoutine.items[0]).toMatchObject({
      exerciseId: exerciseIds[0],
      sets: 3,
      target: 15,
      setRestSeconds: 45,
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
        {
          title: "Day 1 上肢",
          focus: "上肢",
          dayIndex: 1,
          estimatedMinutes: 20,
          safetyNotes: [],
          items: [
            {
              exerciseId: exerciseIds[0],
              mode: "reps",
              sets: 2,
              target: 12,
              setRestSeconds: 30,
              transitionRestSeconds: 30,
            },
          ],
        },
        {
          title: "Day 2 下肢",
          focus: "下肢",
          dayIndex: 2,
          estimatedMinutes: 20,
          safetyNotes: [],
          items: [
            {
              exerciseId: exerciseIds[1],
              mode: "duration",
              sets: 2,
              target: 30,
              setRestSeconds: 30,
              transitionRestSeconds: 30,
            },
          ],
        },
      ],
    });

    const routines = [1, 2].map((dayIndex) =>
      convertWorkoutPlanDraftToWorkoutRoutine(draft, exercises, {
        createId: () => `routine-${dayIndex}`,
        dayIndex,
        id: `routine-${dayIndex}`,
        updatedAt: new Date("2026-05-25T10:30:00"),
      }),
    );

    expect(routines).toHaveLength(2);
    expect(routines.map((routine) => routine.title)).toEqual(["Day 1 上肢", "Day 2 下肢"]);
    expect(routines[0].items[0].exerciseId).not.toBe(routines[1].items[0].exerciseId);
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
      updatedAt: new Date("2026-05-25T10:30:00"),
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
