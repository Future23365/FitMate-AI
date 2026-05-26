import { afterEach, describe, expect, it } from "vitest";

import {
  createWorkoutVoiceSpeechJob,
  readWorkoutVoiceBroadcastPreference,
  readWorkoutVoiceBroadcastSettings,
  readWorkoutVoiceBroadcastTipSeen,
  unlockWorkoutVoiceBroadcastAudio,
  writeWorkoutVoiceBroadcastPreference,
  writeWorkoutVoiceBroadcastSettings,
  writeWorkoutVoiceBroadcastTipSeen,
  workoutVoiceBroadcastSettingsStorageKey,
  type WorkoutVoiceBroadcastError,
} from "@/features/workouts/hooks/use-workout-voice-broadcast";
import { workoutVoiceBroadcastConfig } from "@/lib/shared/workouts/voice-broadcast-config";

type MockUtterance = SpeechSynthesisUtterance & {
  text: string;
};

type MockSpeechEnvironment = {
  cancelCount: number;
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
  restoreDescriptor("window", originalWindowDescriptor);
  restoreDescriptor("SpeechSynthesisUtterance", originalUtteranceDescriptor);
});

describe("workout voice broadcast controller", () => {
  it("speaks queued cues and reports success from speech events", () => {
    const environment = installMockSpeechEnvironment();
    let started = false;
    let completed = false;
    let failed: WorkoutVoiceBroadcastError | null = null;

    createWorkoutVoiceSpeechJob(["第一组动作，开合跳，45 秒。"], {
      jobId: 1,
      onDone: () => {
        completed = true;
      },
      onError: (reason) => {
        failed = reason;
      },
      onStart: () => {
        started = true;
      },
      reason: "test-success",
    });

    expect(environment.resumeCount).toBe(1);
    expect(environment.cancelCount).toBe(0);
    expect(environment.spoken).toHaveLength(1);
    environment.spoken[0].onstart?.({} as SpeechSynthesisEvent);
    environment.spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(started).toBe(true);
    expect(completed).toBe(true);
    expect(failed).toBeNull();
  });

  it("handles delayed start, speech errors, multi-cue errors, and stale callbacks", () => {
    const delayedStartEnvironment = installMockSpeechEnvironment();
    let delayedStartCompleted = false;
    let delayedStartReason: WorkoutVoiceBroadcastError | null = null;
    createWorkoutVoiceSpeechJob(["下一组，深蹲，45 秒。"], {
      jobId: 2,
      onDone: () => {
        delayedStartCompleted = true;
      },
      onError: (reason) => {
        delayedStartReason = reason;
      },
      reason: "test-delayed-start",
    });
    expect(delayedStartEnvironment.spoken).toHaveLength(1);
    delayedStartEnvironment.spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(delayedStartCompleted).toBe(true);
    expect(delayedStartReason).toBeNull();

    const speechErrorEnvironment = installMockSpeechEnvironment();
    let speechErrorReason: WorkoutVoiceBroadcastError | null = null;
    createWorkoutVoiceSpeechJob(["下一组，深蹲，45 秒。"], {
      jobId: 5,
      onError: (reason) => {
        speechErrorReason = reason;
      },
      reason: "test-speech-error",
    });
    speechErrorEnvironment.spoken[0].onerror?.({} as SpeechSynthesisErrorEvent);
    expect(speechErrorReason).toBe("speech_error");

    const multiCueErrorEnvironment = installMockSpeechEnvironment();
    let multiCueErrorReason: WorkoutVoiceBroadcastError | null = null;
    createWorkoutVoiceSpeechJob(["语音播报已开启。", "第一组动作，俯卧撑，15 个。"], {
      jobId: 6,
      onError: (reason) => {
        multiCueErrorReason = reason;
      },
      reason: "test-multi-cue-error",
    });
    expect(multiCueErrorEnvironment.spoken).toHaveLength(2);
    multiCueErrorEnvironment.spoken[0].onerror?.({} as SpeechSynthesisErrorEvent);
    expect(multiCueErrorReason).toBe("speech_error");

    const staleEnvironment = installMockSpeechEnvironment();
    let staleCompleted = false;
    const staleJob = createWorkoutVoiceSpeechJob(["3"], {
      jobId: 3,
      onDone: () => {
        staleCompleted = true;
      },
      reason: "test-stale",
    });
    staleJob.cancel("test-cancel");
    staleEnvironment.spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(staleCompleted).toBe(false);
  });

  it("marks speech as blocked when speak never starts", async () => {
    installMockSpeechEnvironment();
    let completed = false;
    let failed: WorkoutVoiceBroadcastError | null = null;

    createWorkoutVoiceSpeechJob(["第一组动作，俯卧撑，15 个。"], {
      jobId: 7,
      onDone: () => {
        completed = true;
      },
      onError: (reason) => {
        failed = reason;
      },
      reason: "test-blocked",
    }, {
      ...workoutVoiceBroadcastConfig,
      fallback: {
        ...workoutVoiceBroadcastConfig.fallback,
        speechCompletionFallbackMinMs: 60,
        speechStartTimeoutMs: 20,
      },
    });

    await wait(40);
    expect(completed).toBe(false);
    expect(failed).toBe("speech_blocked");
  });

  it("falls back when speech or localStorage is unavailable", async () => {
    installUnsupportedSpeechEnvironment();
    let unsupportedCompleted = false;
    createWorkoutVoiceSpeechJob(["1，开始"], {
      jobId: 4,
      onDone: () => {
        unsupportedCompleted = true;
      },
      reason: "test-unsupported",
    });
    await wait(1250);
    expect(unsupportedCompleted).toBe(true);

    installUnavailableStorageEnvironment();
    expect(readWorkoutVoiceBroadcastPreference()).toBe(false);
    expect(readWorkoutVoiceBroadcastTipSeen()).toBe(false);
    expect(() => writeWorkoutVoiceBroadcastPreference(true)).not.toThrow();
    expect(() => writeWorkoutVoiceBroadcastTipSeen()).not.toThrow();

    installMockSpeechEnvironment();
    expect(unlockWorkoutVoiceBroadcastAudio()).toBe(false);
  });

  it("persists and normalizes workout voice settings from localStorage", () => {
    const storage = installStorageEnvironment();

    storage.setItem(workoutVoiceBroadcastSettingsStorageKey, JSON.stringify({
      beepVolume: 2,
      pitch: 0.2,
      rate: 3,
      voiceURI: "mock-voice",
      volume: -1,
    }));
    expect(readWorkoutVoiceBroadcastSettings()).toEqual({
      beepVolume: 1,
      pitch: 0.5,
      rate: 1.35,
      voiceURI: "mock-voice",
      volume: 0,
    });

    writeWorkoutVoiceBroadcastSettings({
      beepVolume: 0.3,
      pitch: 1.1,
      rate: 0.9,
      voiceURI: "stable-voice",
      volume: 0.7,
    });
    expect(JSON.parse(storage.getItem(workoutVoiceBroadcastSettingsStorageKey) ?? "{}")).toEqual({
      beepVolume: 0.3,
      pitch: 1.1,
      rate: 0.9,
      voiceURI: "stable-voice",
      volume: 0.7,
    });
  });
});

function installMockSpeechEnvironment(): MockSpeechEnvironment {
  const environment: MockSpeechEnvironment = {
    cancelCount: 0,
    resumeCount: 0,
    spoken: [],
  };
  const speechSynthesis = {
    cancel: () => {
      environment.cancelCount += 1;
    },
    getVoices: () => [
      {
        lang: "zh-CN",
        name: "Chinese Mock Voice",
      } as SpeechSynthesisVoice,
    ],
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

function installUnsupportedSpeechEnvironment() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
}

function installUnavailableStorageEnvironment() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get localStorage() {
        throw new Error("localStorage unavailable");
      },
    },
  });
}

function installStorageEnvironment() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
    },
  });

  return localStorage;
}

function restoreDescriptor(name: "window" | "SpeechSynthesisUtterance", descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, name);
}

function wait(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
