import { describe, expect, it } from "vitest";

import {
  buildWorkoutTimeline,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  expandWorkoutItems,
  getTotalWorkoutSets,
} from "@/lib/shared/workouts/composition";

import { createWorkoutItem } from "./fixtures/domain";

describe("workout composition", () => {
  it("builds timeline with sections, reps, duration, set rest, transition rest, and loop rest", () => {
    const items = [
      createWorkoutItem({
        id: "warmup",
        nameZh: "动态热身",
        categoryZh: "热身",
        mode: "duration",
        target: 30,
        sets: 1,
        transitionRestSeconds: 10,
        section: "warmup",
      }),
      createWorkoutItem({
        id: "squat",
        nameZh: "深蹲",
        mode: "reps",
        target: 12,
        sets: 2,
        setRestSeconds: 20,
        transitionRestSeconds: 15,
        section: "training",
      }),
      createWorkoutItem({
        id: "plank",
        nameZh: "平板支撑",
        mode: "duration",
        target: 40,
        sets: 1,
        transitionRestSeconds: 15,
        section: "training",
      }),
      createWorkoutItem({
        id: "stretch",
        nameZh: "胸部拉伸",
        categoryZh: "拉伸",
        mode: "duration",
        target: 35,
        sets: 1,
        transitionRestSeconds: 0,
        section: "stretch",
      }),
    ];

    const expanded = expandWorkoutItems(items, 2);
    const timeline = buildWorkoutTimeline(items, {
      trainingLoopRounds: 2,
      trainingLoopRestSeconds: 90,
    });

    expect(expanded.map((item) => item.id)).toEqual([
      "warmup",
      "squat",
      "plank",
      "squat",
      "plank",
      "stretch",
    ]);
    expect(timeline.filter((step) => step.type === "exercise")).toHaveLength(8);
    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "rest", reason: "between_sets", label: "组间休息", durationSeconds: 20 }),
        expect.objectContaining({ type: "rest", reason: "between_exercises", label: "动作间休息", durationSeconds: 10 }),
        expect.objectContaining({ type: "rest", reason: "between_loops", label: "循环间隙", durationSeconds: 90 }),
      ]),
    );
    expect(
      timeline.find((step) => step.type === "exercise" && step.item.id === "squat"),
    ).toMatchObject({ durationSeconds: 24 });
    expect(getTotalWorkoutSets(items, 2)).toBe(8);
    expect(estimateWorkoutMinutes(items, { trainingLoopRounds: 2, trainingLoopRestSeconds: 90 })).toBeGreaterThan(1);
    expect(estimateWorkoutCalories(items, { minimumCalories: 80, trainingLoopRounds: 2 })).toBeGreaterThanOrEqual(80);
  });
});
