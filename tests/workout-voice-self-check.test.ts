import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runWorkoutVoiceSelfCheck,
  type WorkoutVoiceSelfCheckResult,
} from "@/features/workouts/voice/workout-voice-self-check";
import { workoutVoiceBroadcastConfig } from "@/lib/shared/workouts/voice-broadcast-config";

type MockUtterance = SpeechSynthesisUtterance & {
  text: string;
};

type MockSpeechEnvironment = {
  cancelCount: number;
  diagnostics: string[];
  resumeCount: number;
  spoken: MockUtterance[];
};

class MockSpeechSynthesisUtterance {
  lang = "";
  onend: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onstart: ((event?: unknown) => void) | null = null;
  pitch = 1;
  rate = 1;
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  volume = 1;

  constructor(text: string) {
    this.text = text;
  }
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalUtteranceDescriptor = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");

afterEach(() => {
  vi.useRealTimers();
  restoreDescriptor("window", originalWindowDescriptor);
  restoreDescriptor("SpeechSynthesisUtterance", originalUtteranceDescriptor);
});

describe("workout voice self-check", () => {
  it("reports unsupported speech synthesis without throwing", async () => {
    restoreDescriptor("window", undefined);
    restoreDescriptor("SpeechSynthesisUtterance", undefined);

    const result = await runWorkoutVoiceSelfCheck();

    expect(result).toMatchObject({
      reason: "speech_unsupported",
      status: "unsupported",
      supported: false,
      voices: 0,
    });
    expect(result.events).toEqual(["unsupported"]);
  });

  it("reports success when speech starts and ends", async () => {
    const environment = installMockSpeechEnvironment();
    const resultPromise = runSelfCheck(environment);

    expect(environment.spoken[0].text).toBe("语音自检");
    environment.spoken[0].onstart?.({} as SpeechSynthesisEvent);
    environment.spoken[0].onend?.({} as SpeechSynthesisEvent);

    const result = await resultPromise;
    expect(result).toMatchObject({
      ended: true,
      selectedVoice: "Chinese Mock Voice (zh-CN)",
      started: true,
      status: "ended",
      supported: true,
      voices: 1,
    });
    expect(result.events).toEqual(["speech-request", "speech-start", "speech-end"]);
    expect(environment.cancelCount).toBe(0);
    expect(environment.resumeCount).toBe(1);
  });

  it("reports blocked when speech never starts", async () => {
    vi.useFakeTimers();
    const environment = installMockSpeechEnvironment();
    const resultPromise = runSelfCheck(environment);

    await vi.advanceTimersByTimeAsync(6);
    const result = await resultPromise;

    expect(result).toMatchObject({
      reason: "speech_blocked",
      selectedVoice: "Chinese Mock Voice (zh-CN)",
      started: false,
      status: "blocked",
      voices: 1,
    });
    expect(result.events).toEqual(["speech-request", "speech-blocked"]);
  });

  it("reports utterance errors with diagnostic events", async () => {
    const environment = installMockSpeechEnvironment();
    const resultPromise = runSelfCheck(environment);

    environment.spoken[0].onerror?.({ error: "not-allowed" } as SpeechSynthesisErrorEvent);

    const result = await resultPromise;
    expect(result).toMatchObject({
      error: "not-allowed",
      reason: "speech_error",
      status: "error",
    });
    expect(result.events).toEqual(["speech-request", "speech-error"]);
    expect(environment.diagnostics).toContain("speech error");
  });
});

function runSelfCheck(environment: MockSpeechEnvironment) {
  return runWorkoutVoiceSelfCheck(
    {
      onDiagnostic: (event) => {
        environment.diagnostics.push(event);
      },
    },
    {
      ...workoutVoiceBroadcastConfig,
      fallback: {
        ...workoutVoiceBroadcastConfig.fallback,
        speechCompletionFallbackMinMs: 10,
        speechStartTimeoutMs: 5,
        speechVoiceLoadTimeoutMs: 5,
      },
    },
  );
}

function installMockSpeechEnvironment(): MockSpeechEnvironment {
  const environment: MockSpeechEnvironment = {
    cancelCount: 0,
    diagnostics: [],
    resumeCount: 0,
    spoken: [],
  };
  const speechSynthesis = {
    addEventListener: () => undefined,
    cancel: () => {
      environment.cancelCount += 1;
    },
    getVoices: () => [
      {
        lang: "zh-CN",
        name: "Chinese Mock Voice",
      } as SpeechSynthesisVoice,
    ],
    removeEventListener: () => undefined,
    resume: () => {
      environment.resumeCount += 1;
    },
    speak: (utterance: SpeechSynthesisUtterance) => {
      environment.spoken.push(utterance as MockUtterance);
    },
  };

  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    value: MockSpeechSynthesisUtterance,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
      speechSynthesis,
    },
  });

  return environment;
}

function restoreDescriptor(name: "window" | "SpeechSynthesisUtterance", descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, name);
}
