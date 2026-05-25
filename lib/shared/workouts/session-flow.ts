import {
  clampLoopRounds,
  type WorkoutItem,
  type WorkoutSection,
  type WorkoutTimelineExerciseStep,
  type WorkoutTimelineStep,
} from "@/lib/shared/workouts/composition";

export type WorkoutSessionListItem = {
  displayIndex: number;
  isActive: boolean;
  isDone: boolean;
  isUpcomingFromRest: boolean;
  item: WorkoutItem;
  itemIndex: number;
  key: string;
  loopRound?: number;
  loopRounds?: number;
  section: WorkoutSection;
  stepIndexes: number[];
  targetStepIndex: number;
};

export type WorkoutSessionListView = {
  activeItemIndex: number | null;
  items: WorkoutSessionListItem[];
  nextExerciseStepIndex: number | null;
};

type BuildWorkoutSessionListViewOptions = {
  activeStepIndex: number;
  steps: WorkoutTimelineStep[];
  trainingLoopRounds?: number;
};

type ExerciseStepGroup = {
  item: WorkoutItem;
  itemIndex: number;
  stepIndexes: number[];
};

export function buildWorkoutSessionListView({
  activeStepIndex,
  steps,
  trainingLoopRounds = 1,
}: BuildWorkoutSessionListViewOptions): WorkoutSessionListView {
  const activeItemIndex = getRelevantExerciseItemIndex(steps, activeStepIndex);
  const groups = collectExerciseStepGroups(steps);
  const loopRounds = clampLoopRounds(trainingLoopRounds);
  const trainingGroups = groups.filter((group) => getWorkoutItemSection(group.item) === "training");
  const trainingItemsPerRound =
    loopRounds > 1 && trainingGroups.length > 0 ? Math.max(1, Math.round(trainingGroups.length / loopRounds)) : 0;
  let trainingGroupPosition = 0;

  return {
    activeItemIndex,
    items: groups.map((group, displayIndex) => {
      const section = getWorkoutItemSection(group.item);
      const isTrainingLoopItem = section === "training" && loopRounds > 1 && trainingItemsPerRound > 0;
      const loopRound = isTrainingLoopItem
        ? Math.min(loopRounds, Math.floor(trainingGroupPosition / trainingItemsPerRound) + 1)
        : undefined;

      if (section === "training") {
        trainingGroupPosition += 1;
      }

      return {
        displayIndex,
        isActive: group.itemIndex === activeItemIndex,
        isDone: group.stepIndexes.every((stepIndex) => stepIndex < activeStepIndex),
        isUpcomingFromRest: steps[activeStepIndex]?.type === "rest" && group.itemIndex === activeItemIndex,
        item: group.item,
        itemIndex: group.itemIndex,
        key: `${group.itemIndex}:${group.item.id}`,
        loopRound,
        loopRounds: loopRound ? loopRounds : undefined,
        section,
        stepIndexes: group.stepIndexes,
        targetStepIndex: getTargetStepIndex(group.stepIndexes, activeStepIndex),
      };
    }),
    nextExerciseStepIndex: getNextExerciseStepIndex(steps, activeStepIndex),
  };
}

export function getRelevantExerciseStep(
  steps: WorkoutTimelineStep[],
  activeStepIndex: number,
): { index: number; step: WorkoutTimelineExerciseStep } | null {
  const activeStep = steps[activeStepIndex];

  if (activeStep?.type === "exercise") {
    return { index: activeStepIndex, step: activeStep };
  }

  const nextExerciseStepIndex = getNextExerciseStepIndex(steps, activeStepIndex);
  if (nextExerciseStepIndex !== null) {
    const nextStep = steps[nextExerciseStepIndex];
    return nextStep?.type === "exercise" ? { index: nextExerciseStepIndex, step: nextStep } : null;
  }

  for (let index = activeStepIndex - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.type === "exercise") {
      return { index, step };
    }
  }

  return null;
}

export function getNextExerciseStepIndex(steps: WorkoutTimelineStep[], activeStepIndex: number) {
  for (let index = activeStepIndex + 1; index < steps.length; index += 1) {
    if (steps[index]?.type === "exercise") {
      return index;
    }
  }

  return null;
}

function collectExerciseStepGroups(steps: WorkoutTimelineStep[]) {
  const groupByItemIndex = new Map<number, ExerciseStepGroup>();

  steps.forEach((step, stepIndex) => {
    if (step.type !== "exercise") {
      return;
    }

    const existingGroup = groupByItemIndex.get(step.itemIndex);
    if (existingGroup) {
      existingGroup.stepIndexes.push(stepIndex);
      return;
    }

    groupByItemIndex.set(step.itemIndex, {
      item: step.item,
      itemIndex: step.itemIndex,
      stepIndexes: [stepIndex],
    });
  });

  return Array.from(groupByItemIndex.values()).sort((left, right) => left.itemIndex - right.itemIndex);
}

function getRelevantExerciseItemIndex(steps: WorkoutTimelineStep[], activeStepIndex: number) {
  return getRelevantExerciseStep(steps, activeStepIndex)?.step.itemIndex ?? null;
}

function getTargetStepIndex(stepIndexes: number[], activeStepIndex: number) {
  return stepIndexes.find((stepIndex) => stepIndex >= activeStepIndex) ?? stepIndexes[0] ?? 0;
}

function getWorkoutItemSection(item: WorkoutItem): WorkoutSection {
  return item.section ?? "training";
}
