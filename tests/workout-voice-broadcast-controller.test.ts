import {
  createWorkoutVoiceSpeechJob,
  readWorkoutVoiceBroadcastPreference,
  readWorkoutVoiceBroadcastTipSeen,
  unlockWorkoutVoiceBroadcastAudio,
  writeWorkoutVoiceBroadcastPreference,
  writeWorkoutVoiceBroadcastTipSeen,
  type WorkoutVoiceBroadcastError,
} from "@/features/workouts/hooks/use-workout-voice-broadcast";

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

export async function runWorkoutVoiceBroadcastControllerTests() {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalUtteranceDescriptor = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");

  try {
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

    console.assert(environment.resumeCount === 1, "开启语音时应 resume speechSynthesis");
    console.assert(environment.spoken.length === 1, "开启语音时应立即 speak 当前步骤");
    (environment.spoken[0].onstart as (() => void) | null)?.();
    (environment.spoken[0].onend as (() => void) | null)?.();
    console.assert(started, "speech onstart 应更新播放状态");
    console.assert(completed, "speech onend 应完成当前任务");
    console.assert(failed === null, "成功播报不应产生错误状态");

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
    console.assert(delayedStartEnvironment.spoken.length === 1, "首次启动时应立即发起 speak 尝试");
    (delayedStartEnvironment.spoken[0].onend as (() => void) | null)?.();
    console.assert(delayedStartCompleted, "即使浏览器没有触发 onstart，onend 到达也应完成播报");
    console.assert(delayedStartReason === null, "未触发 onstart 不应被误判为 speech_blocked");

    const speechErrorEnvironment = installMockSpeechEnvironment();
    let speechErrorReason: WorkoutVoiceBroadcastError | null = null;
    createWorkoutVoiceSpeechJob(["下一组，深蹲，45 秒。"], {
      jobId: 5,
      onError: (reason) => {
        speechErrorReason = reason;
      },
      reason: "test-speech-error",
    });
    (speechErrorEnvironment.spoken[0].onerror as (() => void) | null)?.();
    console.assert(speechErrorReason === "speech_error", "真实 speechSynthesis onerror 应暴露 speech_error");

    const multiCueErrorEnvironment = installMockSpeechEnvironment();
    let multiCueErrorReason: WorkoutVoiceBroadcastError | null = null;
    createWorkoutVoiceSpeechJob(["语音播报已开启。", "第一组动作，俯卧撑，15 个。"], {
      jobId: 6,
      onError: (reason) => {
        multiCueErrorReason = reason;
      },
      reason: "test-multi-cue-error",
    });
    console.assert(multiCueErrorEnvironment.spoken.length === 2, "激活播报应支持先播短提示再播当前步骤");
    (multiCueErrorEnvironment.spoken[0].onerror as (() => void) | null)?.();
    console.assert(multiCueErrorReason === "speech_error", "多段播报中任意 utterance 出错都应暴露 speech_error");

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
    (staleEnvironment.spoken[0].onend as (() => void) | null)?.();
    console.assert(!staleCompleted, "取消后的迟到 onend 不应完成任务");

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
    console.assert(unsupportedCompleted, "speechSynthesis 不可用时应走无声降级完成任务");

    installUnavailableStorageEnvironment();
    console.assert(!readWorkoutVoiceBroadcastPreference(), "localStorage 不可用时语音偏好应安全降级为关闭");
    console.assert(!readWorkoutVoiceBroadcastTipSeen(), "localStorage 不可用时提示状态应安全降级为未看过");
    writeWorkoutVoiceBroadcastPreference(true);
    writeWorkoutVoiceBroadcastTipSeen();

    installMockSpeechEnvironment();
    console.assert(!unlockWorkoutVoiceBroadcastAudio(), "Web Audio 不可用时应返回失败且不影响语音控制器");
  } finally {
    restoreDescriptor("window", originalWindowDescriptor);
    restoreDescriptor("SpeechSynthesisUtterance", originalUtteranceDescriptor);
  }
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
