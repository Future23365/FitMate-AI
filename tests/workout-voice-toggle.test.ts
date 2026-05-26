import { describe, expect, it } from "vitest";

import {
  getWorkoutVoiceToggleLabel,
  resolveWorkoutVoiceToggleIntent,
} from "@/features/workouts/voice/workout-voice-toggle";

describe("workout voice toggle", () => {
  it("keeps the top voice button as a two-state preference switch", () => {
    expect(resolveWorkoutVoiceToggleIntent({
      isPreferenceOn: false,
      isSupported: true,
    })).toBe("enable");
    expect(getWorkoutVoiceToggleLabel({
      isPreferenceOn: false,
      isSupported: true,
    })).toBe("开启语音播报");

    expect(resolveWorkoutVoiceToggleIntent({
      isPreferenceOn: true,
      isSupported: true,
    })).toBe("disable");
    expect(getWorkoutVoiceToggleLabel({
      isPreferenceOn: true,
      isSupported: true,
    })).toBe("关闭语音播报");
  });

  it("does not expose retry activation as a voice button action", () => {
    expect(resolveWorkoutVoiceToggleIntent({
      isPreferenceOn: true,
      isSupported: true,
    })).not.toBe("enable");
    expect(getWorkoutVoiceToggleLabel({
      isPreferenceOn: true,
      isSupported: true,
    })).not.toBe("启动语音播报");
  });

  it("keeps unsupported browsers unavailable", () => {
    expect(resolveWorkoutVoiceToggleIntent({
      isPreferenceOn: true,
      isSupported: false,
    })).toBe("unavailable");
    expect(getWorkoutVoiceToggleLabel({
      isPreferenceOn: true,
      isSupported: false,
    })).toBe("当前浏览器不支持语音播报");
  });
});
