import { describe, expect, it } from "vitest";

import { createWorkoutItem } from "@/tests/fixtures/domain";
import {
  validateWorkoutVoiceBroadcastConfig,
  workoutVoiceBroadcastConfig,
} from "@/lib/shared/workouts/voice-broadcast-config";
import {
  buildPreparationCountdownCue,
  buildWorkoutActionPreparationCue,
} from "@/lib/shared/workouts/voice-cues";
import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

describe("workout voice broadcast config", () => {
  it("validates the default config and rejects invalid numeric values", () => {
    expect(validateWorkoutVoiceBroadcastConfig(workoutVoiceBroadcastConfig)).toBe(workoutVoiceBroadcastConfig);
    expect(() => validateWorkoutVoiceBroadcastConfig({
      ...workoutVoiceBroadcastConfig,
      speech: {
        ...workoutVoiceBroadcastConfig.speech,
        rate: -1,
      },
    })).toThrow("speech.rate");
    expect(() => validateWorkoutVoiceBroadcastConfig({
      ...workoutVoiceBroadcastConfig,
      queue: {
        ...workoutVoiceBroadcastConfig.queue,
        maxSize: 0,
      },
    })).toThrow("queue.maxSize");
  });

  it("lets developers adjust cue wording through config templates", () => {
    const item = createWorkoutItem({ nameZh: "深蹲", mode: "duration", target: 45 });
    const step: WorkoutTimelineStep = {
      durationSeconds: 45,
      id: "step-1",
      item,
      itemIndex: 0,
      setIndex: 1,
      totalSets: 1,
      type: "exercise",
    };
    const customConfig = validateWorkoutVoiceBroadcastConfig({
      ...workoutVoiceBroadcastConfig,
      templates: {
        ...workoutVoiceBroadcastConfig.templates,
        preparationCountdown: ({ second }) => `倒数 ${second}`,
        stepPreparation: (nextStep) => `请准备 ${nextStep.type === "exercise" ? nextStep.item.nameZh : "下一步"}`,
      },
    });

    expect(buildWorkoutActionPreparationCue(step, true, customConfig)).toBe("请准备 深蹲");
    expect(buildPreparationCountdownCue(2, customConfig)).toBe("倒数 2");
  });
});
