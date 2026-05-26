import { afterEach, describe, expect, it } from "vitest";

import {
  createWorkoutVoiceSpeechJob,
  WorkoutVoiceSession,
  type WorkoutVoiceBroadcastError,
} from "@/features/workouts/voice/workout-voice-session";
import { workoutVoiceBroadcastConfig } from "@/lib/shared/workouts/voice-broadcast-config";
import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";

import { createWorkoutItem } from "./fixtures/domain";

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

describe("workout voice session scheduler", () => {
  it("does not let repetition cues interrupt activation and action preparation", () => {
    const environment = installMockSpeechEnvironment();
    const step = createExerciseStep({ mode: "reps", target: 12 });
    let preparationCompleted = false;
    const session = new WorkoutVoiceSession();

    session.setContext({
      activeStep: step,
      activeStepKey: "session:push-up:0",
      isFirstExerciseStep: true,
      isPaused: false,
      executionPhase: "preparing_intro",
      onPreparationIntroComplete: () => {
        preparationCompleted = true;
      },
    });
    session.setPreferenceEnabled(true);
    session.activateCurrentStep(true);

    expect(environment.spoken.map((utterance) => utterance.text)).toEqual([
      "语音播报已开启。",
      "第一组动作，俯卧撑，12 个。",
    ]);
    environment.spoken[0].onstart?.({} as SpeechSynthesisEvent);
    session.handleRepetitionCount(1);
    expect(environment.spoken.map((utterance) => utterance.text)).toEqual([
      "语音播报已开启。",
      "第一组动作，俯卧撑，12 个。",
    ]);
    environment.spoken[1].onend?.({} as SpeechSynthesisEvent);
    expect(preparationCompleted).toBe(true);

    session.handlePreparationCountdown(3);
    expect(environment.spoken.at(-1)?.text).toBe("3");
  });

  it("can activate voice without announcing the current workout step", () => {
    const environment = installMockSpeechEnvironment();
    const step = createExerciseStep({ mode: "reps", target: 12 });
    let preparationCompleted = false;
    const session = new WorkoutVoiceSession();

    session.setContext({
      activeStep: step,
      activeStepKey: "session:push-up:0",
      isFirstExerciseStep: true,
      isPaused: false,
      executionPhase: "preparing_intro",
      onPreparationIntroComplete: () => {
        preparationCompleted = true;
      },
    });
    session.setPreferenceEnabled(true);
    session.activateCurrentStep(true, { includeCurrentStepPrompt: false });

    expect(environment.spoken.map((utterance) => utterance.text)).toEqual([
      "语音播报已开启。",
    ]);
    environment.spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(preparationCompleted).toBe(true);
  });

  it("cancels old step speech and ignores stale callbacks after step changes", () => {
    const environment = installMockSpeechEnvironment();
    const firstStep = createExerciseStep({ id: "push-up-step", nameZh: "俯卧撑" });
    const secondStep = createExerciseStep({ id: "plank-step", mode: "duration", nameZh: "平板支撑", target: 45 });
    let firstPreparationCompleted = false;
    let secondPreparationCompleted = false;
    const session = new WorkoutVoiceSession();

    session.setContext({
      activeStep: firstStep,
      activeStepKey: "session:first",
      isFirstExerciseStep: true,
      isPaused: false,
      executionPhase: "preparing_intro",
      onPreparationIntroComplete: () => {
        firstPreparationCompleted = true;
      },
    });
    session.setPreferenceEnabled(true);
    session.activateCurrentStep(true);
    environment.spoken[0].onstart?.({} as SpeechSynthesisEvent);

    session.setContext({
      activeStep: secondStep,
      activeStepKey: "session:second",
      isFirstExerciseStep: false,
      isPaused: false,
      executionPhase: "preparing_intro",
      onPreparationIntroComplete: () => {
        secondPreparationCompleted = true;
      },
    });
    expect(environment.cancelCount).toBe(1);
    environment.spoken[1].onend?.({} as SpeechSynthesisEvent);
    expect(firstPreparationCompleted).toBe(false);

    session.handleStepChanged();
    expect(environment.spoken.at(-1)?.text).toBe("下一组，平板支撑，45 秒。");
    environment.spoken.at(-1)?.onend?.({} as SpeechSynthesisEvent);
    expect(secondPreparationCompleted).toBe(true);
  });

  it("applies speech config and reports errors through the speech adapter", () => {
    const environment = installMockSpeechEnvironment();
    let failed: WorkoutVoiceBroadcastError | null = null;
    const customConfig = {
      ...workoutVoiceBroadcastConfig,
      speech: {
        ...workoutVoiceBroadcastConfig.speech,
        rate: 1.25,
        volume: 0.75,
      },
    };

    createWorkoutVoiceSpeechJob(["测试播报"], {
      jobId: 1,
      onError: (reason) => {
        failed = reason;
      },
      reason: "test-config",
    }, customConfig);

    expect(environment.spoken[0].rate).toBe(1.25);
    expect(environment.spoken[0].volume).toBe(0.75);
    environment.spoken[0].onerror?.({} as SpeechSynthesisErrorEvent);
    expect(failed).toBe("speech_error");
  });

  it("allows voice activation while the workout is already paused", () => {
    const environment = installMockSpeechEnvironment();
    const step = createExerciseStep({ mode: "reps", target: 12 });
    const session = new WorkoutVoiceSession();

    session.setContext({
      activeStep: step,
      activeStepKey: "session:paused",
      isFirstExerciseStep: true,
      isPaused: true,
      executionPhase: "preparing_intro",
      onPreparationIntroComplete: () => undefined,
    });
    session.setPreferenceEnabled(false);
    session.activateCurrentStep(true);
    session.setPreferenceEnabled(true);
    session.setContext({
      activeStep: step,
      activeStepKey: "session:paused",
      isFirstExerciseStep: true,
      isPaused: true,
      executionPhase: "preparing_intro",
      onPreparationIntroComplete: () => undefined,
    });

    expect(environment.spoken.map((utterance) => utterance.text)).toEqual([
      "语音播报已开启。",
      "第一组动作，俯卧撑，12 个。",
    ]);
    expect(environment.cancelCount).toBe(0);
  });

  it("completes preparation intro when start control activates current step speech", () => {
    const environment = installMockSpeechEnvironment();
    const step = createExerciseStep({ mode: "reps", target: 15 });
    let completedStepKey = "";
    const session = new WorkoutVoiceSession();

    session.setContext({
      activeStep: step,
      activeStepKey: "session:start-control",
      isFirstExerciseStep: true,
      isPaused: false,
      executionPhase: "preparing_intro",
      onPreparationIntroComplete: (stepKey) => {
        completedStepKey = stepKey;
      },
    });
    session.setPreferenceEnabled(true);
    session.activateCurrentStep(false, { includeActivationPrompt: false });

    expect(environment.spoken.map((utterance) => utterance.text)).toEqual([
      "第一组动作，俯卧撑，15 个。",
    ]);

    environment.spoken[0].onstart?.({} as SpeechSynthesisEvent);
    environment.spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(completedStepKey).toBe("session:start-control");
  });

  it("does not let preparation callbacks fire after the page marks the exercise running", () => {
    const environment = installMockSpeechEnvironment();
    const step = createExerciseStep({ mode: "duration", target: 30 });
    let completedStepKey = "";
    const session = new WorkoutVoiceSession();

    session.setContext({
      activeStep: step,
      activeStepKey: "session:running",
      executionPhase: "running_exercise",
      isFirstExerciseStep: true,
      isPaused: false,
      onPreparationIntroComplete: (stepKey) => {
        completedStepKey = stepKey;
      },
    });
    session.setPreferenceEnabled(true);
    session.activateCurrentStep(true, { includeActivationPrompt: false });

    expect(environment.spoken.map((utterance) => utterance.text)).toEqual([]);
    expect(completedStepKey).toBe("");
  });

  it("plays repetition cues only when the page execution state is running exercise", () => {
    const environment = installMockSpeechEnvironment();
    const step = createExerciseStep({ mode: "reps", target: 12 });
    const session = new WorkoutVoiceSession();

    session.setContext({
      activeStep: step,
      activeStepKey: "session:reps",
      executionPhase: "preparing_countdown",
      isFirstExerciseStep: true,
      isPaused: false,
      onPreparationIntroComplete: () => undefined,
    });
    session.setPreferenceEnabled(true);
    session.activateCurrentStep(true, { includeCurrentStepPrompt: false });
    environment.spoken[0].onstart?.({} as SpeechSynthesisEvent);
    environment.spoken[0].onend?.({} as SpeechSynthesisEvent);

    session.handleRepetitionCount(1);
    expect(environment.spoken.map((utterance) => utterance.text)).toEqual(["语音播报已开启。"]);

    session.setContext({
      activeStep: step,
      activeStepKey: "session:reps",
      executionPhase: "running_exercise",
      isFirstExerciseStep: true,
      isPaused: false,
      onPreparationIntroComplete: () => undefined,
    });
    session.handleRepetitionCount(1);

    expect(environment.spoken.at(-1)?.text).toBe("1");
  });
});

function createExerciseStep({
  id = "step-1",
  mode = "reps",
  nameZh = "俯卧撑",
  target = 12,
}: {
  id?: string;
  mode?: "duration" | "reps";
  nameZh?: string;
  target?: number;
} = {}): WorkoutTimelineStep {
  const item = createWorkoutItem({ id: `${id}-item`, mode, nameZh, target });

  return {
    durationSeconds: mode === "duration" ? target : target * 2,
    id,
    item,
    itemIndex: 0,
    setIndex: 1,
    totalSets: 1,
    type: "exercise",
  };
}

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

function restoreDescriptor(name: "window" | "SpeechSynthesisUtterance", descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, name);
}
