import type { Exercise } from "@/lib/shared/exercises/types";
import {
  defaultTrainingLoopRestSeconds,
  placeholderWorkoutImage,
  type WorkoutItem,
  type WorkoutMode,
  type WorkoutRoutine,
  type WorkoutSection,
} from "@/lib/shared/workouts/composition";

import {
  workoutPlanDraftSchema,
  workoutRoutineDraftSchema,
  type WorkoutPlanDraft,
  type WorkoutRoutineDraft,
} from "@/lib/shared/workout-plans/draft-schema";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";

export type WorkoutRoutineMode = WorkoutMode;
export type WorkoutRoutineSection = WorkoutSection;
export type WorkoutRoutineItem = WorkoutItem;
export type { WorkoutRoutine };

export type WorkoutPlanDraftConversionOptions = {
  id?: string;
  updatedAt?: Date;
  createId?: () => string;
  dayIndex?: number;
};

export type WorkoutRoutineDraftConversionOptions = {
  id?: string;
  updatedAt?: Date;
  createId?: () => string;
};

// 将 AI 长期计划中的某个非休息周期日转换成独立 routine，并保留三段式 section。
export function convertWorkoutPlanDraftToWorkoutRoutine(
  draft: WorkoutPlanDraft,
  exercises: Exercise[],
  options: WorkoutPlanDraftConversionOptions = {},
): WorkoutRoutine {
  const parsedDraft = workoutPlanDraftSchema.parse(draft);
  const day = resolveDraftDay(parsedDraft, options.dayIndex);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const createId = options.createId ?? createLocalId;
  const orderedSections = (["warmup", "training", "stretch"] as const)
    .map((section) => day.sections.find((candidate) => candidate.section === section))
    .filter((section): section is NonNullable<typeof section> => Boolean(section));

  if (day.isRestDay) {
    throw new Error(`Workout day is a rest day: ${day.cycleDayIndex}`);
  }

  return {
    id: options.id ?? createId(),
    title: day.title || parsedDraft.title,
    updatedAt: toUtcISOString(options.updatedAt ?? new Date()),
    trainingLoopRounds: 1,
    trainingLoopRestSeconds: defaultTrainingLoopRestSeconds,
    items: orderedSections.flatMap((section) =>
      section.items.map((item) => {
        const exercise = exerciseById.get(item.exerciseId);

        if (!exercise) {
          throw new Error(`Invalid exerciseId: ${item.exerciseId}`);
        }

        const imageUrls = exercise.imageUrls.length ? exercise.imageUrls : [placeholderWorkoutImage];

        return {
          id: createId(),
          exerciseId: exercise.id,
          nameZh: exercise.nameZh,
          nameEn: exercise.nameEn,
          categoryZh: exercise.categoryZh || "训练",
          equipmentZh: exercise.equipmentZh || "未标注器械",
          musclesZh: exercise.primaryMusclesZh.length ? exercise.primaryMusclesZh : ["综合"],
          instructionsZh: exercise.instructionsZh,
          imageUrl: imageUrls[0],
          imageUrls,
          mode: item.mode,
          target: item.target,
          sets: item.sets,
          setRestSeconds: item.setRestSeconds,
          transitionRestSeconds: item.transitionRestSeconds,
          section: section.section,
        } satisfies WorkoutItem;
      }),
    ),
  };
}

// 将聊天推送的三段式 routine 草稿转换为持久化 routine，保留阶段和循环配置。
export function convertWorkoutRoutineDraftToWorkoutRoutine(
  draft: WorkoutRoutineDraft,
  exercises: Exercise[],
  options: WorkoutRoutineDraftConversionOptions = {},
): WorkoutRoutine {
  const parsedDraft = workoutRoutineDraftSchema.parse(draft);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const createId = options.createId ?? createLocalId;
  const orderedSections = (["warmup", "training", "stretch"] as const)
    .map((section) => parsedDraft.sections.find((candidate) => candidate.section === section))
    .filter((section): section is NonNullable<typeof section> => Boolean(section));

  return {
    id: options.id ?? createId(),
    title: parsedDraft.title,
    updatedAt: toUtcISOString(options.updatedAt ?? new Date()),
    trainingLoopRounds: parsedDraft.trainingLoopRounds,
    trainingLoopRestSeconds: parsedDraft.trainingLoopRestSeconds,
    items: orderedSections.flatMap((section) =>
      section.items.map((item) => {
        const exercise = exerciseById.get(item.exerciseId);

        if (!exercise) {
          throw new Error(`Invalid exerciseId: ${item.exerciseId}`);
        }

        const imageUrls = exercise.imageUrls.length ? exercise.imageUrls : [placeholderWorkoutImage];

        return {
          id: createId(),
          exerciseId: exercise.id,
          nameZh: exercise.nameZh,
          nameEn: exercise.nameEn,
          categoryZh: exercise.categoryZh || "训练",
          equipmentZh: exercise.equipmentZh || "未标注器械",
          musclesZh: exercise.primaryMusclesZh.length ? exercise.primaryMusclesZh : ["综合"],
          instructionsZh: exercise.instructionsZh,
          imageUrl: imageUrls[0],
          imageUrls,
          mode: item.mode,
          target: item.target,
          sets: item.sets,
          setRestSeconds: item.setRestSeconds,
          transitionRestSeconds: item.transitionRestSeconds,
          section: section.section,
        } satisfies WorkoutItem;
      }),
    ),
  };
}

function resolveDraftDay(draft: WorkoutPlanDraft, dayIndex?: number) {
  if (dayIndex === undefined) {
    return draft.days.find((day) => !day.isRestDay) ?? draft.days[0];
  }

  const day = draft.days.find((candidate) => candidate.cycleDayIndex === dayIndex);

  if (!day) {
    throw new Error(`Workout day not found: ${dayIndex}`);
  }

  return day;
}

function createLocalId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
