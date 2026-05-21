import type { Exercise } from "@/lib/shared/exercises/types";

import { workoutPlanDraftSchema, type WorkoutPlanDraft } from "@/lib/shared/workout-plans/draft-schema";

export type SavedWorkoutMode = "reps" | "duration";

export type SavedWorkoutItem = {
  id: string;
  exerciseId: string;
  nameZh: string;
  nameEn: string;
  categoryZh: string;
  equipmentZh: string;
  musclesZh: string[];
  instructionsZh: string[];
  imageUrl: string;
  mode: SavedWorkoutMode;
  target: number;
  sets: number;
  setRestSeconds: number;
  transitionRestSeconds: number;
};

export type SavedWorkout = {
  id: string;
  title: string;
  savedAt: string;
  items: SavedWorkoutItem[];
};

export type WorkoutPlanDraftConversionOptions = {
  id?: string;
  savedAt?: Date;
  createId?: () => string;
  dayIndex?: number;
};

const placeholderImage = "https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg";

export function convertWorkoutPlanDraftToSavedWorkout(
  draft: WorkoutPlanDraft,
  exercises: Exercise[],
  options: WorkoutPlanDraftConversionOptions = {},
): SavedWorkout {
  const parsedDraft = workoutPlanDraftSchema.parse(draft);
  const day = resolveDraftDay(parsedDraft, options.dayIndex);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const createId = options.createId ?? createLocalId;

  return {
    id: options.id ?? createId(),
    title: day.title || parsedDraft.title,
    savedAt: formatLocalDateTime(options.savedAt ?? new Date()),
    items: day.items.map((item) => {
      const exercise = exerciseById.get(item.exerciseId);

      if (!exercise) {
        throw new Error(`Invalid exerciseId: ${item.exerciseId}`);
      }

      return {
        id: createId(),
        exerciseId: exercise.id,
        nameZh: exercise.nameZh,
        nameEn: exercise.nameEn,
        categoryZh: exercise.categoryZh || "训练",
        equipmentZh: exercise.equipmentZh || "未标注器械",
        musclesZh: exercise.primaryMusclesZh.length ? exercise.primaryMusclesZh : ["综合"],
        instructionsZh: exercise.instructionsZh,
        imageUrl: exercise.imageUrls[0] || placeholderImage,
        mode: item.mode,
        target: item.target,
        sets: item.sets,
        setRestSeconds: item.setRestSeconds,
        transitionRestSeconds: item.transitionRestSeconds,
      };
    }),
  };
}

function resolveDraftDay(draft: WorkoutPlanDraft, dayIndex?: number) {
  if (dayIndex === undefined) {
    return draft.days[0];
  }

  const day = draft.days.find((candidate) => candidate.dayIndex === dayIndex);

  if (!day) {
    throw new Error(`Workout day not found: ${dayIndex}`);
  }

  return day;
}

function formatLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function createLocalId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
