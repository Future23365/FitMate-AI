import type { WorkoutItem, WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

const defaultOverviewLimit = 5;

export function buildWorkoutStartupCues(items: WorkoutItem[]) {
  return [buildWorkoutOverviewCue(items), "3，2，1开始"];
}

export function buildWorkoutOverviewCue(items: WorkoutItem[], limit = defaultOverviewLimit) {
  if (items.length === 0) {
    return "准备开始训练。";
  }

  const names = items.map((item) => item.nameZh).filter(Boolean);
  const visibleNames = names.slice(0, Math.max(1, limit));
  const suffix = names.length > visibleNames.length ? "等" : "";

  return `本次训练 ${items.length} 个动作：${visibleNames.join("、")}${suffix}。准备开始。`;
}

export function buildWorkoutStepVoiceCue(step: WorkoutTimelineStep) {
  if (step.type === "rest") {
    const nextActionText = step.nextItem ? `，下一组动作 ${step.nextItem.nameZh}` : "";
    return `${step.label} ${step.durationSeconds} 秒${nextActionText}。`;
  }

  const targetText = step.item.mode === "duration" ? `${step.item.target} 秒` : `${step.item.target} 次`;

  return `开始 ${step.item.nameZh}，第 ${step.setIndex} 组，共 ${step.totalSets} 组，目标 ${targetText}。`;
}

export function buildRepetitionCountCue(count: number) {
  return String(Math.max(1, Math.floor(count)));
}
