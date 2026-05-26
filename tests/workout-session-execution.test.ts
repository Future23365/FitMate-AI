import { describe, expect, it } from "vitest";

import {
  buildWorkoutExecutionStepKey,
  canWorkoutExecutionRunStep,
  createWorkoutStepExecutionState,
  isWorkoutExecutionPreparingForStep,
  markWorkoutPreparationIntroComplete,
  pauseWorkoutExecution,
  resumeWorkoutExecution,
  tickWorkoutPreparationCountdown,
} from "@/lib/shared/workouts/session-execution";
import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

import { createWorkoutItem } from "./fixtures/domain";

describe("workout session execution state", () => {
  it("moves from preparation intro to countdown and running by page state only", () => {
    const step = createExerciseStep({ id: "push-up-step" });
    const stepKey = buildWorkoutExecutionStepKey("session-a", step, 0);
    let state = createWorkoutStepExecutionState({
      sessionId: "session-a",
      step,
      stepIndex: 0,
      version: 1,
    });

    expect(state.status).toBe("preparing_intro");
    expect(isWorkoutExecutionPreparingForStep(state, stepKey)).toBe(true);
    state = markWorkoutPreparationIntroComplete(state, stepKey);
    expect(state.status).toBe("preparing_countdown");

    state = tickWorkoutPreparationCountdown(state, stepKey);
    state = tickWorkoutPreparationCountdown(state, stepKey);
    state = tickWorkoutPreparationCountdown(state, stepKey);

    expect(state).toMatchObject({
      preparationCountdown: 0,
      status: "running_exercise",
    });
    expect(canWorkoutExecutionRunStep(state, stepKey, "exercise")).toBe(true);
  });

  it("keeps resume on the previous running phase instead of recreating preparation", () => {
    const step = createExerciseStep({ id: "squat-step" });
    const stepKey = buildWorkoutExecutionStepKey("session-a", step, 0);
    let state = createWorkoutStepExecutionState({
      sessionId: "session-a",
      step,
      stepIndex: 0,
      version: 1,
    });

    state = markWorkoutPreparationIntroComplete(state, stepKey);
    state = tickWorkoutPreparationCountdown(state, stepKey);
    state = tickWorkoutPreparationCountdown(state, stepKey);
    state = tickWorkoutPreparationCountdown(state, stepKey);

    const paused = pauseWorkoutExecution(state);
    const resumed = resumeWorkoutExecution(paused);

    expect(paused.status).toBe("paused");
    expect(paused.pausedFromStatus).toBe("running_exercise");
    expect(resumed.status).toBe("running_exercise");
    expect(resumed.stepKey).toBe(stepKey);
  });

  it("ignores stale preparation callbacks from an old step key", () => {
    const firstStep = createExerciseStep({ id: "first-step" });
    const secondStep = createExerciseStep({ id: "second-step" });
    const firstKey = buildWorkoutExecutionStepKey("session-a", firstStep, 0);
    const secondKey = buildWorkoutExecutionStepKey("session-a", secondStep, 1);
    const state = createWorkoutStepExecutionState({
      sessionId: "session-a",
      step: secondStep,
      stepIndex: 1,
      version: 2,
    });

    expect(markWorkoutPreparationIntroComplete(state, firstKey)).toBe(state);
    expect(tickWorkoutPreparationCountdown(state, firstKey)).toBe(state);
    expect(markWorkoutPreparationIntroComplete(state, secondKey).status).toBe("preparing_countdown");
  });

  it("runs rest steps immediately without action preparation", () => {
    const step: WorkoutTimelineStep = {
      durationSeconds: 20,
      id: "rest-step",
      label: "动作间休息",
      reason: "between_exercises",
      type: "rest",
    };
    const stepKey = buildWorkoutExecutionStepKey("session-a", step, 2);
    const state = createWorkoutStepExecutionState({
      sessionId: "session-a",
      step,
      stepIndex: 2,
      version: 3,
    });

    expect(state.status).toBe("running_rest");
    expect(canWorkoutExecutionRunStep(state, stepKey, "rest")).toBe(true);
  });
});

function createExerciseStep({
  id,
}: {
  id: string;
}): WorkoutTimelineStep {
  const item = createWorkoutItem({ id: `${id}-item`, mode: "duration", target: 30 });

  return {
    durationSeconds: 30,
    id,
    item,
    itemIndex: 0,
    setIndex: 1,
    totalSets: 1,
    type: "exercise",
  };
}
