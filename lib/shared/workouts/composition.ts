export type WorkoutMode = "duration" | "reps";
export type WorkoutSection = "warmup" | "training" | "stretch";

export type WorkoutItem = {
  id: string;
  exerciseId: string;
  nameZh: string;
  nameEn: string;
  categoryZh: string;
  equipmentZh: string;
  musclesZh: string[];
  instructionsZh: string[];
  imageUrl: string;
  mode: WorkoutMode;
  target: number;
  sets: number;
  setRestSeconds: number;
  transitionRestSeconds: number;
  restSeconds?: number;
  section?: WorkoutSection;
};

export type SavedWorkout = {
  id: string;
  title: string;
  savedAt: string;
  items: WorkoutItem[];
  trainingLoopRounds?: number;
  trainingLoopRestSeconds?: number;
};

export type ScheduleStatus = "completed" | "missed" | "planned" | "rest";

export type ScheduledWorkout = {
  id: string;
  date: string;
  planId: string;
  title: string;
  status: ScheduleStatus;
  minutes: number;
  calories: number;
  items: WorkoutItem[];
  trainingLoopRounds?: number;
  trainingLoopRestSeconds?: number;
  sourcePlanTitle?: string;
};

export type WorkoutTimelineExerciseStep = {
  id: string;
  type: "exercise";
  item: WorkoutItem;
  itemIndex: number;
  setIndex: number;
  totalSets: number;
  durationSeconds: number;
};

export type WorkoutTimelineRestStep = {
  id: string;
  type: "rest";
  reason: "between_exercises" | "between_loops" | "between_sets";
  durationSeconds: number;
  label: string;
  afterItem?: WorkoutItem;
  nextItem?: WorkoutItem;
};

export type WorkoutTimelineStep = WorkoutTimelineExerciseStep | WorkoutTimelineRestStep;

export type WorkoutSectionConfig = {
  id: WorkoutSection;
  title: string;
  subtitle: string;
  icon: string;
};

export const workoutSectionConfigs: WorkoutSectionConfig[] = [
  {
    id: "warmup",
    title: "热身",
    subtitle: "激活关节、提升心率，为主训练做准备",
    icon: "local_fire_department",
  },
  {
    id: "training",
    title: "训练",
    subtitle: "主训练动作，可按循环次数重复执行",
    icon: "fitness_center",
  },
  {
    id: "stretch",
    title: "拉伸",
    subtitle: "降低心率、放松目标肌群",
    icon: "self_improvement",
  },
];

export const restOptions = [15, 20, 30, 45, 60, 90, 120];
export const loopRoundOptions = [1, 2, 3, 4, 5, 6];
export const defaultSetRestSeconds = 30;
export const defaultTransitionRestSeconds = 20;
export const defaultTrainingLoopRounds = 3;
export const defaultTrainingLoopRestSeconds = 120;
export const defaultRepIntervalSeconds = 2;
export const placeholderWorkoutImage = "/images/exercise-placeholder.svg";

export function inferWorkoutSection(item: Pick<WorkoutItem, "categoryZh" | "nameZh">): WorkoutSection {
  const text = `${item.categoryZh} ${item.nameZh}`;

  if (/拉伸|伸展|放松/.test(text)) {
    return "stretch";
  }

  if (/热身|激活|动态/.test(text)) {
    return "warmup";
  }

  return "training";
}

export function normalizeWorkoutItem(item: WorkoutItem): WorkoutItem {
  const legacyRestSeconds = item.restSeconds ?? defaultSetRestSeconds;

  return {
    ...item,
    setRestSeconds: item.setRestSeconds ?? legacyRestSeconds,
    transitionRestSeconds: item.transitionRestSeconds ?? item.restSeconds ?? defaultTransitionRestSeconds,
    section: item.section ?? inferWorkoutSection(item),
  };
}

export function normalizeSavedWorkout(workout: SavedWorkout): SavedWorkout {
  return {
    ...workout,
    items: workout.items.map(normalizeWorkoutItem),
    trainingLoopRounds: clampLoopRounds(workout.trainingLoopRounds ?? 1),
    trainingLoopRestSeconds: workout.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds,
  };
}

export function getSectionItems(items: WorkoutItem[], section: WorkoutSection) {
  return items.filter((item) => (item.section ?? inferWorkoutSection(item)) === section);
}

export function clampLoopRounds(value: number) {
  return Math.min(12, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1));
}

export function getWorkoutLoopConfig(workout: Pick<SavedWorkout, "trainingLoopRestSeconds" | "trainingLoopRounds">) {
  return {
    trainingLoopRounds: clampLoopRounds(workout.trainingLoopRounds ?? 1),
    trainingLoopRestSeconds: workout.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds,
  };
}

export function getStepDuration(item: WorkoutItem) {
  return Math.max(5, item.mode === "duration" ? item.target : item.target * getRepIntervalSeconds(item));
}

export function getRepIntervalSeconds(item: WorkoutItem) {
  return item.mode === "duration" ? 1 : defaultRepIntervalSeconds;
}

export function expandWorkoutItems(
  items: WorkoutItem[],
  trainingLoopRounds = 1,
): WorkoutItem[] {
  const normalizedItems = items.map(normalizeWorkoutItem);
  const warmupItems = getSectionItems(normalizedItems, "warmup");
  const trainingItems = getSectionItems(normalizedItems, "training");
  const stretchItems = getSectionItems(normalizedItems, "stretch");
  const loopedTrainingItems = Array.from({ length: clampLoopRounds(trainingLoopRounds) }, () => trainingItems).flat();

  return [...warmupItems, ...loopedTrainingItems, ...stretchItems];
}

export function buildWorkoutTimeline(
  items: WorkoutItem[],
  options: {
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
  } = {},
): WorkoutTimelineStep[] {
  const normalizedItems = items.map(normalizeWorkoutItem);
  const warmupItems = getSectionItems(normalizedItems, "warmup");
  const trainingItems = getSectionItems(normalizedItems, "training");
  const stretchItems = getSectionItems(normalizedItems, "stretch");
  const rounds = clampLoopRounds(options.trainingLoopRounds ?? 1);
  const loopRestSeconds = options.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds;
  const sequence = [
    ...warmupItems,
    ...Array.from({ length: rounds }, () => trainingItems).flat(),
    ...stretchItems,
  ];
  const steps: WorkoutTimelineStep[] = [];
  let exerciseIndex = 0;

  // Build the executable timeline once so estimates, previews, and training execution stay aligned.
  sequence.forEach((item, index) => {
    const totalSets = Math.max(1, item.sets);

    Array.from({ length: totalSets }, (_, setIndex) => {
      steps.push({
        id: `${item.id}-${index}-set-${setIndex + 1}`,
        type: "exercise",
        item,
        itemIndex: exerciseIndex,
        setIndex: setIndex + 1,
        totalSets,
        durationSeconds: getStepDuration(item),
      });

      if (setIndex < totalSets - 1 && item.setRestSeconds > 0) {
        steps.push({
          id: `${item.id}-${index}-set-rest-${setIndex + 1}`,
          type: "rest",
          reason: "between_sets",
          durationSeconds: item.setRestSeconds,
          label: "组间休息",
          afterItem: item,
          nextItem: item,
        });
      }
    });

    const nextItem = sequence[index + 1];

    if (nextItem) {
      const isLoopBoundary =
        (item.section ?? "training") === "training" &&
        (nextItem.section ?? "training") === "training" &&
        trainingItems.length > 0 &&
        (exerciseIndex + 1) % trainingItems.length === 0;
      const restSeconds = isLoopBoundary ? loopRestSeconds : item.transitionRestSeconds;

      if (restSeconds > 0) {
        steps.push({
          id: `${item.id}-${index}-${isLoopBoundary ? "loop-rest" : "transition-rest"}`,
          type: "rest",
          reason: isLoopBoundary ? "between_loops" : "between_exercises",
          durationSeconds: restSeconds,
          label: isLoopBoundary ? "循环间隙" : "动作间休息",
          afterItem: item,
          nextItem,
        });
      }
    }

    exerciseIndex += 1;
  });

  return steps;
}

export function estimateWorkoutSeconds(
  items: WorkoutItem[],
  options: {
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
  } = {},
) {
  return buildWorkoutTimeline(items, options).reduce((total, step) => total + step.durationSeconds, 0);
}

export function estimateWorkoutMinutes(
  items: WorkoutItem[],
  options: {
    minimumMinutes?: number;
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
  } = {},
) {
  const minimumMinutes = options.minimumMinutes ?? 1;
  return Math.max(minimumMinutes, Math.round(estimateWorkoutSeconds(items, options) / 60));
}

export function estimateWorkoutCalories(
  items: WorkoutItem[],
  options: {
    minimumCalories?: number;
    trainingLoopRestSeconds?: number;
    trainingLoopRounds?: number;
  } = {},
) {
  const expandedItems = expandWorkoutItems(items, options.trainingLoopRounds ?? 1);
  const minimumCalories = options.minimumCalories ?? 0;

  return Math.max(
    minimumCalories,
    Math.round(estimateWorkoutMinutes(items, options) * 7.2 + expandedItems.length * 12),
  );
}

export function getTotalWorkoutSets(items: WorkoutItem[], trainingLoopRounds = 1) {
  return expandWorkoutItems(items, trainingLoopRounds).reduce((total, item) => total + Math.max(1, item.sets), 0);
}
