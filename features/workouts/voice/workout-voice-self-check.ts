import {
  workoutVoiceBroadcastConfig,
  type WorkoutVoiceBroadcastConfig,
} from "@/lib/shared/workouts/voice-broadcast-config";

export type WorkoutVoiceSelfCheckStatus =
  | "unsupported"
  | "started"
  | "ended"
  | "blocked"
  | "error";

export type WorkoutVoiceSelfCheckReason =
  | "speech_unsupported"
  | "speech_blocked"
  | "speech_error"
  | "speech_end_timeout";

export type WorkoutVoiceSelfCheckEvent =
  | "unsupported"
  | "voices-pending"
  | "speech-request"
  | "speech-start"
  | "speech-end"
  | "speech-error"
  | "speech-blocked"
  | "speech-end-timeout"
  | "audio-request"
  | "audio-start"
  | "audio-error";

export type WorkoutVoiceSelfCheckStepStatus = "pending" | "running" | "passed" | "warning" | "failed";

export type WorkoutVoiceSelfCheckStep = {
  detail: string;
  id: string;
  label: string;
  status: WorkoutVoiceSelfCheckStepStatus;
};

export type WorkoutVoiceSelfCheckResult = {
  elapsedMs: number;
  ended: boolean;
  error?: string;
  events: WorkoutVoiceSelfCheckEvent[];
  reason?: WorkoutVoiceSelfCheckReason;
  selectedVoice: string;
  started: boolean;
  status: WorkoutVoiceSelfCheckStatus;
  steps: WorkoutVoiceSelfCheckStep[];
  supported: boolean;
  text: string;
  voices: number;
};

type WorkoutVoiceSelfCheckOptions = {
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  text?: string;
};

type WindowWithWebKitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const defaultSelfCheckText = "语音自检";

const selfCheckStepTemplates: WorkoutVoiceSelfCheckStep[] = [
  { detail: "检测 window.speechSynthesis 和 SpeechSynthesisUtterance。", id: "speech-api", label: "Web Speech API", status: "pending" },
  { detail: "读取浏览器当前可用的系统 voice。", id: "voice-list", label: "Voice 列表", status: "pending" },
  { detail: "匹配用户选择的 voice，或回退到中文 / 默认 voice。", id: "voice-selection", label: "Voice 选择", status: "pending" },
  { detail: "创建 AudioContext 并播放一次短促节奏音。", id: "web-audio", label: "Web Audio", status: "pending" },
  { detail: "向浏览器提交一次 SpeechSynthesisUtterance。", id: "speech-request", label: "语音请求", status: "pending" },
  { detail: "等待 onstart，确认浏览器允许本次播放。", id: "speech-start", label: "播放启动", status: "pending" },
  { detail: "等待 onend 或兜底超时，确认播放链路完成。", id: "speech-end", label: "播放结束", status: "pending" },
];

// 全流程自检只在用户点击后运行，不修改训练状态，只暴露浏览器能力和播放链路结果。
export function runWorkoutVoiceSelfCheck(
  options: WorkoutVoiceSelfCheckOptions = {},
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  const text = options.text?.trim() || defaultSelfCheckText;
  const startedAt = getNow();
  const events: WorkoutVoiceSelfCheckEvent[] = [];
  const steps = createSelfCheckSteps();

  const diagnostic = (event: string, payload?: Record<string, unknown>) => {
    options.onDiagnostic?.(event, payload);
  };

  const buildResult = (
    status: WorkoutVoiceSelfCheckStatus,
    overrides: Partial<WorkoutVoiceSelfCheckResult> = {},
  ): WorkoutVoiceSelfCheckResult => ({
    elapsedMs: Math.round(getNow() - startedAt),
    ended: false,
    events: [...events],
    selectedVoice: "default",
    started: false,
    status,
    steps: cloneSteps(steps),
    supported: canSpeak(),
    text,
    voices: getVoiceCount(),
    ...overrides,
  });

  if (!canSpeak()) {
    events.push("unsupported");
    updateStep(steps, "speech-api", "failed", "当前浏览器缺少 window.speechSynthesis 或 SpeechSynthesisUtterance。");
    updateStep(steps, "voice-list", "failed", "无法读取 voice 列表。");
    updateStep(steps, "voice-selection", "failed", "无法选择 voice。");
    updateStep(steps, "speech-request", "failed", "无法提交语音请求。");
    updateStep(steps, "speech-start", "failed", "播放无法启动。");
    updateStep(steps, "speech-end", "failed", "播放无法完成。");

    return runAudioContextSelfCheck(config, events, diagnostic).then((audioResult) => {
      applyAudioResult(steps, audioResult);
      const result = buildResult("unsupported", {
        reason: "speech_unsupported",
        supported: false,
        voices: 0,
      });
      diagnostic("unsupported", result);

      return result;
    });
  }

  updateStep(steps, "speech-api", "passed", "当前浏览器提供 Web Speech 语音合成入口。");

  return new Promise<WorkoutVoiceSelfCheckResult>((resolve) => {
    let hasCompleted = false;
    let hasStarted = false;
    let startTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let endTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let voiceLoadTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let voicesChangedListener: (() => void) | undefined;
    let audioCheckPromise: Promise<unknown> = Promise.resolve();

    const cleanup = () => {
      if (startTimer) {
        globalThis.clearTimeout(startTimer);
      }
      if (endTimer) {
        globalThis.clearTimeout(endTimer);
      }
      if (voiceLoadTimer) {
        globalThis.clearTimeout(voiceLoadTimer);
      }
      if (voicesChangedListener) {
        window.speechSynthesis.removeEventListener?.("voiceschanged", voicesChangedListener);
      }
    };

    const complete = (
      status: WorkoutVoiceSelfCheckStatus,
      overrides: Partial<WorkoutVoiceSelfCheckResult> = {},
    ) => {
      if (hasCompleted) {
        return;
      }

      hasCompleted = true;
      cleanup();
      void audioCheckPromise.finally(() => {
        const result = buildResult(status, overrides);
        diagnostic("result", result);
        resolve(result);
      });
    };

    const speak = async () => {
      if (hasCompleted) {
        return;
      }

      if (voiceLoadTimer) {
        globalThis.clearTimeout(voiceLoadTimer);
        voiceLoadTimer = undefined;
      }
      if (voicesChangedListener) {
        window.speechSynthesis.removeEventListener?.("voiceschanged", voicesChangedListener);
        voicesChangedListener = undefined;
      }

      const voice = selectConfiguredVoice(config);
      const selectedVoice = voice ? `${voice.name} (${voice.lang})` : "default";
      const voices = getVoiceCount();
      updateVoiceSteps(steps, voice, voices, config);

      audioCheckPromise = runAudioContextSelfCheck(config, events, diagnostic)
        .then((audioResult) => applyAudioResult(steps, audioResult));

      events.push("speech-request");
      updateStep(steps, "speech-request", "passed", `已提交测试文本：${text}`);
      diagnostic("speech request", { selectedVoice, text, voices });

      const utterance = createSelfCheckUtterance(text, voice, config);
      startTimer = globalThis.setTimeout(() => {
        if (hasStarted) {
          return;
        }

        events.push("speech-blocked");
        updateStep(steps, "speech-start", "failed", "浏览器未触发 onstart，可能需要用户手势或被策略阻止。");
        updateStep(steps, "speech-end", "failed", "播放未启动，因此没有结束事件。");
        diagnostic("speech blocked", { selectedVoice, voices });
        complete("blocked", {
          reason: "speech_blocked",
          selectedVoice,
          voices,
        });
      }, config.fallback.speechStartTimeoutMs);

      utterance.onstart = () => {
        if (hasCompleted) {
          return;
        }

        hasStarted = true;
        if (startTimer) {
          globalThis.clearTimeout(startTimer);
          startTimer = undefined;
        }
        events.push("speech-start");
        updateStep(steps, "speech-start", "passed", "浏览器已触发 onstart，语音播放开始。");
        diagnostic("speech start", { selectedVoice, text, voices });
        endTimer = globalThis.setTimeout(() => {
          if (hasCompleted) {
            return;
          }

          events.push("speech-end-timeout");
          updateStep(steps, "speech-end", "warning", "语音已启动，但未在兜底时间内收到 onend。");
          diagnostic("speech end timeout", { selectedVoice, text, voices });
          complete("started", {
            reason: "speech_end_timeout",
            selectedVoice,
            started: true,
            voices,
          });
        }, config.fallback.speechCompletionFallbackMinMs);
      };

      utterance.onend = () => {
        events.push("speech-end");
        updateStep(steps, "speech-end", "passed", "浏览器已触发 onend，语音播放链路完成。");
        diagnostic("speech end", { selectedVoice, text, voices });
        complete("ended", {
          ended: true,
          selectedVoice,
          started: hasStarted,
          voices,
        });
      };

      utterance.onerror = (event) => {
        const error = "error" in event ? String(event.error) : undefined;
        events.push("speech-error");
        updateStep(steps, "speech-start", hasStarted ? "passed" : "failed", hasStarted ? "语音曾启动，但随后报错。" : "语音未能启动。");
        updateStep(steps, "speech-end", "failed", error ? `浏览器返回错误：${error}` : "浏览器返回语音播放错误。");
        diagnostic("speech error", { error, selectedVoice, text, voices });
        complete("error", {
          error,
          reason: "speech_error",
          selectedVoice,
          started: hasStarted,
          voices,
        });
      };

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch {
        events.push("speech-error");
        updateStep(steps, "speech-start", "failed", "调用 speechSynthesis.speak() 时抛出异常。");
        updateStep(steps, "speech-end", "failed", "语音请求异常中止。");
        complete("error", {
          reason: "speech_error",
          selectedVoice,
          started: hasStarted,
          voices,
        });
      }
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      events.push("voices-pending");
      updateStep(steps, "voice-list", "running", "正在等待 voiceschanged 或兜底超时。");
      diagnostic("voices pending", { text });
      voicesChangedListener = speak;
      window.speechSynthesis.addEventListener?.("voiceschanged", voicesChangedListener, { once: true });
      voiceLoadTimer = globalThis.setTimeout(speak, config.fallback.speechVoiceLoadTimeoutMs);
      return;
    }

    void speak();
  });
}

function createSelfCheckSteps() {
  return selfCheckStepTemplates.map((step) => ({ ...step }));
}

function cloneSteps(steps: WorkoutVoiceSelfCheckStep[]) {
  return steps.map((step) => ({ ...step }));
}

function updateStep(
  steps: WorkoutVoiceSelfCheckStep[],
  id: string,
  status: WorkoutVoiceSelfCheckStepStatus,
  detail: string,
) {
  const step = steps.find((item) => item.id === id);

  if (step) {
    step.status = status;
    step.detail = detail;
  }
}

function updateVoiceSteps(
  steps: WorkoutVoiceSelfCheckStep[],
  voice: SpeechSynthesisVoice | undefined,
  voices: number,
  config: WorkoutVoiceBroadcastConfig,
) {
  if (voices > 0) {
    updateStep(steps, "voice-list", "passed", `已读取 ${voices} 个 voice。`);
  } else {
    updateStep(steps, "voice-list", "warning", "浏览器暂未返回 voice，继续使用默认 voice 尝试。");
  }

  if (voice) {
    updateStep(steps, "voice-selection", "passed", `当前 voice：${voice.name} (${voice.lang})。`);
    return;
  }

  updateStep(
    steps,
    "voice-selection",
    config.speech.voiceURI ? "warning" : "passed",
    config.speech.voiceURI ? "用户选择的 voice 当前不可用，已回退到默认 voice。" : "未指定 voice，使用浏览器默认 voice。",
  );
}

async function runAudioContextSelfCheck(
  config: WorkoutVoiceBroadcastConfig,
  events: WorkoutVoiceSelfCheckEvent[],
  diagnostic: (event: string, payload?: Record<string, unknown>) => void,
) {
  events.push("audio-request");

  if (typeof window === "undefined") {
    events.push("audio-error");
    return { detail: "当前环境没有 window，无法创建 AudioContext。", ok: false };
  }

  const AudioContextClass = window.AudioContext ?? (window as WindowWithWebKitAudioContext).webkitAudioContext;
  if (!AudioContextClass) {
    events.push("audio-error");
    return { detail: "当前浏览器不支持 AudioContext。", ok: false };
  }

  try {
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    gain.gain.setValueAtTime(0.0001, now);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(config.beep.frequencyHz, now);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + Math.max(20, config.beep.durationMs) / 1000);
    await audioContext.resume();
    events.push("audio-start");
    diagnostic("audio start", { state: audioContext.state });
    globalThis.setTimeout(() => {
      void audioContext.close().catch(() => undefined);
    }, Math.max(80, config.beep.durationMs + 40));

    return { detail: `AudioContext 已启动，state=${audioContext.state}。`, ok: true };
  } catch {
    events.push("audio-error");
    return { detail: "AudioContext 创建、resume 或播放测试音失败。", ok: false };
  }
}

function applyAudioResult(
  steps: WorkoutVoiceSelfCheckStep[],
  result: { detail: string; ok: boolean },
) {
  updateStep(steps, "web-audio", result.ok ? "passed" : "warning", result.detail);
}

function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function getVoiceCount() {
  if (!canSpeak()) {
    return 0;
  }

  return window.speechSynthesis.getVoices().length;
}

function selectConfiguredVoice(config: WorkoutVoiceBroadcastConfig) {
  if (!canSpeak()) {
    return undefined;
  }

  const voices = window.speechSynthesis.getVoices();
  const configuredVoice = config.speech.voiceURI
    ? voices.find((voice) => voice.voiceURI === config.speech.voiceURI)
    : undefined;

  return configuredVoice ?? voices.find((voice) => (
    voice.lang.toLowerCase().startsWith(config.speech.lang.toLowerCase().slice(0, 2)) ||
    /chinese|mandarin|中文|普通话/i.test(voice.name)
  ));
}

function createSelfCheckUtterance(
  text: string,
  voice: SpeechSynthesisVoice | undefined,
  config: WorkoutVoiceBroadcastConfig,
) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = config.speech.lang;
  utterance.rate = config.speech.rate;
  utterance.pitch = config.speech.pitch;
  utterance.volume = config.speech.volume;

  if (voice) {
    utterance.voice = voice;
  }

  return utterance;
}

function getNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
