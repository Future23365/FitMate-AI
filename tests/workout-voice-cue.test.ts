import { describe, expect, it } from "vitest";

import {
  buildFirstWorkoutActionCue,
  buildPreparationCountdownCue,
  buildRepetitionCountCue,
  buildWorkoutActionPreparationCue,
  buildWorkoutOverviewCue,
  buildWorkoutStartupCues,
  buildWorkoutStepVoiceCue,
} from "@/lib/shared/workouts/voice-cues";
import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

import { createWorkoutItem } from "./fixtures/domain";

describe("workout voice cues", () => {
  it("builds exercise and rest cues for duration, reps, set rest, and loop rest", () => {
    const timedItem = createWorkoutItem({
      id: "squat-1",
      exerciseId: "squat",
      nameZh: "深蹲",
      mode: "duration",
      target: 45,
      sets: 3,
    });
    const repsItem = createWorkoutItem({
      id: "push-up-1",
      exerciseId: "push-up",
      nameZh: "俯卧撑",
      mode: "reps",
      target: 12,
      sets: 2,
    });
    const durationStep: WorkoutTimelineStep = {
      id: "duration-step",
      type: "exercise",
      item: timedItem,
      itemIndex: 0,
      setIndex: 2,
      totalSets: 3,
      durationSeconds: 45,
    };
    const repsStep: WorkoutTimelineStep = {
      id: "reps-step",
      type: "exercise",
      item: repsItem,
      itemIndex: 1,
      setIndex: 1,
      totalSets: 2,
      durationSeconds: 24,
    };
    const restStep: WorkoutTimelineStep = {
      id: "rest-step",
      type: "rest",
      reason: "between_sets",
      label: "组间休息",
      durationSeconds: 30,
      afterItem: repsItem,
      nextItem: repsItem,
    };
    const loopRestStep: WorkoutTimelineStep = {
      id: "loop-rest-step",
      type: "rest",
      reason: "between_loops",
      label: "循环间隙",
      durationSeconds: 90,
      afterItem: repsItem,
      nextItem: timedItem,
    };

    expect(buildWorkoutStepVoiceCue(durationStep)).toBe("");
    expect(buildWorkoutStepVoiceCue(repsStep)).toBe("");
    expect(buildWorkoutStepVoiceCue(restStep)).toBe("组间休息 30 秒，下一组动作 俯卧撑。");
    expect(buildWorkoutStepVoiceCue(loopRestStep)).toBe("循环间隙 90 秒，下一组动作 深蹲。");
    expect(buildRepetitionCountCue(3)).toBe("3");
    expect(buildFirstWorkoutActionCue(timedItem)).toBe("第一组动作，深蹲，45 秒。");
    expect(buildPreparationCountdownCue(2)).toBe("2");
    expect(buildPreparationCountdownCue(1)).toBe("1，开始");
    expect(buildWorkoutActionPreparationCue(durationStep, true)).toBe("第一组动作，深蹲，45 秒。");
    expect(buildWorkoutActionPreparationCue(repsStep, false)).toBe("下一组，俯卧撑，12 个。");
  });

  it("limits overview names and builds startup cues", () => {
    const longOverview = buildWorkoutOverviewCue(
      [
        createWorkoutItem({ id: "1", nameZh: "开合跳" }),
        createWorkoutItem({ id: "2", nameZh: "深蹲" }),
        createWorkoutItem({ id: "3", nameZh: "俯卧撑" }),
        createWorkoutItem({ id: "4", nameZh: "登山跑" }),
        createWorkoutItem({ id: "5", nameZh: "平板支撑" }),
        createWorkoutItem({ id: "6", nameZh: "拉伸" }),
      ],
      3,
    );
    const startupCues = buildWorkoutStartupCues([
      createWorkoutItem({ nameZh: "深蹲", mode: "duration", target: 45 }),
      createWorkoutItem({ nameZh: "俯卧撑", mode: "reps", target: 12 }),
    ]);

    expect(longOverview).toBe("本次训练 6 个动作：开合跳、深蹲、俯卧撑等。准备开始。");
    expect(startupCues).toEqual([
      "本次训练 2 个动作：深蹲、俯卧撑。准备开始。",
      "第一组动作，深蹲，45 秒。",
      "3",
      "2",
      "1，开始",
    ]);
  });
});
