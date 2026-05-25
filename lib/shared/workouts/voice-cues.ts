import type { WorkoutItem, WorkoutTimelineStep } from "@/lib/shared/workouts/composition";
import {
  workoutVoiceBroadcastConfig,
  type WorkoutVoiceBroadcastConfig,
} from "@/lib/shared/workouts/voice-broadcast-config";

export function buildWorkoutStartupCues(
  items: WorkoutItem[],
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  return [
    buildWorkoutOverviewCue(items, undefined, config),
    buildFirstWorkoutActionCue(items[0], config),
    buildPreparationCountdownCue(3, config),
    buildPreparationCountdownCue(2, config),
    buildPreparationCountdownCue(1, config),
  ];
}

export function buildWorkoutOverviewCue(
  items: WorkoutItem[],
  limit?: number,
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  if (items.length === 0) {
    return config.templates.emptyOverview;
  }

  return config.templates.overview(items, { overviewLimit: limit, totalItems: items.length });
}

export function buildWorkoutStepVoiceCue(
  step: WorkoutTimelineStep,
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  return config.templates.stepVoice(step);
}

export function buildFirstWorkoutActionCue(
  item?: WorkoutItem,
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  return item
    ? `第一组动作，${item.nameZh}，${config.templates.preparationTarget(item)}。`
    : config.templates.firstActionFallback;
}

export function buildWorkoutActionPreparationCue(
  step: WorkoutTimelineStep,
  isFirstExercise: boolean,
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  return config.templates.stepPreparation(step, { isFirstExercise, step });
}

export function buildPreparationCountdownCue(
  second: number,
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  return config.templates.preparationCountdown({ second });
}

export function buildRepetitionCountCue(
  count: number,
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  return config.templates.repetitionCount(count);
}
