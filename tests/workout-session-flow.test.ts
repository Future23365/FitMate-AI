import { describe, expect, it } from "vitest";

import { buildWorkoutTimeline } from "@/lib/shared/workouts/composition";
import {
  buildWorkoutSessionListView,
  getNextExerciseStepIndex,
  getRelevantExerciseStep,
} from "@/lib/shared/workouts/session-flow";

import { createWorkoutItem } from "./fixtures/domain";

describe("workout session flow", () => {
  it("keeps looped duplicate exercises aligned to the timeline item index", () => {
    const timeline = buildWorkoutTimeline(createLoopWorkoutItems(), {
      trainingLoopRestSeconds: 90,
      trainingLoopRounds: 2,
    });
    const loopRestIndex = timeline.findIndex((step) => step.type === "rest" && step.reason === "between_loops");
    const view = buildWorkoutSessionListView({
      activeStepIndex: loopRestIndex,
      steps: timeline,
      trainingLoopRounds: 2,
    });

    const activeItem = view.items.find((item) => item.isActive);

    expect(loopRestIndex).toBeGreaterThan(0);
    expect(view.nextExerciseStepIndex).toBe(loopRestIndex + 1);
    expect(activeItem).toMatchObject({
      itemIndex: 3,
      isUpcomingFromRest: true,
      loopRound: 2,
      loopRounds: 2,
    });
    expect(activeItem?.item.id).toBe("squat");
    expect(view.items.filter((item) => item.item.id === "squat").map((item) => item.itemIndex)).toEqual([1, 3]);
  });

  it("targets the first unfinished set for a selected list item", () => {
    const timeline = buildWorkoutTimeline(createLoopWorkoutItems(), {
      trainingLoopRestSeconds: 90,
      trainingLoopRounds: 2,
    });
    const firstSquatSetRestIndex = timeline.findIndex(
      (step) => step.type === "rest" && step.reason === "between_sets",
    );
    const viewDuringSetRest = buildWorkoutSessionListView({
      activeStepIndex: firstSquatSetRestIndex,
      steps: timeline,
      trainingLoopRounds: 2,
    });
    const firstSquat = viewDuringSetRest.items.find((item) => item.itemIndex === 1);

    expect(firstSquat?.targetStepIndex).toBe(firstSquatSetRestIndex + 1);
    expect(firstSquat?.isDone).toBe(false);

    const viewAfterFirstSquat = buildWorkoutSessionListView({
      activeStepIndex: firstSquatSetRestIndex + 2,
      steps: timeline,
      trainingLoopRounds: 2,
    });
    const completedFirstSquat = viewAfterFirstSquat.items.find((item) => item.itemIndex === 1);

    expect(completedFirstSquat?.isDone).toBe(true);
    expect(completedFirstSquat?.targetStepIndex).toBe(firstSquat?.stepIndexes[0]);
  });

  it("resolves relevant and next exercise steps from timeline order instead of exercise id", () => {
    const timeline = buildWorkoutTimeline(createLoopWorkoutItems(), {
      trainingLoopRestSeconds: 90,
      trainingLoopRounds: 2,
    });
    const loopRestIndex = timeline.findIndex((step) => step.type === "rest" && step.reason === "between_loops");

    expect(getNextExerciseStepIndex(timeline, loopRestIndex)).toBe(loopRestIndex + 1);
    expect(getRelevantExerciseStep(timeline, loopRestIndex)?.step).toMatchObject({
      item: expect.objectContaining({ id: "squat" }),
      itemIndex: 3,
    });
  });
});

function createLoopWorkoutItems() {
  return [
    createWorkoutItem({
      id: "warmup",
      nameZh: "动态热身",
      categoryZh: "热身",
      mode: "duration",
      target: 20,
      sets: 1,
      section: "warmup",
      transitionRestSeconds: 10,
    }),
    createWorkoutItem({
      id: "squat",
      nameZh: "深蹲",
      mode: "reps",
      target: 8,
      sets: 2,
      section: "training",
      setRestSeconds: 15,
      transitionRestSeconds: 20,
    }),
    createWorkoutItem({
      id: "plank",
      nameZh: "平板支撑",
      mode: "duration",
      target: 30,
      sets: 1,
      section: "training",
      transitionRestSeconds: 0,
    }),
    createWorkoutItem({
      id: "stretch",
      nameZh: "拉伸",
      categoryZh: "拉伸",
      mode: "duration",
      target: 25,
      sets: 1,
      section: "stretch",
      transitionRestSeconds: 0,
    }),
  ];
}
