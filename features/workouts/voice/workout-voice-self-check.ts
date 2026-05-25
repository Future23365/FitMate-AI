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
  | "speech-end-timeout";

export type WorkoutVoiceSelfCheckResult = {
  elapsedMs: number;
  ended: boolean;
  error?: string;
  events: WorkoutVoiceSelfCheckEvent[];
  reason?: WorkoutVoiceSelfCheckReason;
  selectedVoice: string;
  started: boolean;
  status: WorkoutVoiceSelfCheckStatus;
  supported: boolean;
  text: string;
  voices: number;
};

type WorkoutVoiceSelfCheckOptions = {
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  text?: string;
};

const defaultSelfCheckText = "语音自检";

export function runWorkoutVoiceSelfCheck(
  options: WorkoutVoiceSelfCheckOptions = {},
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
) {
  const text = options.text?.trim() || defaultSelfCheckText;
  const startedAt = getNow();
  const events: WorkoutVoiceSelfCheckEvent[] = [];

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
    supported: canSpeak(),
    text,
    voices: getVoiceCount(),
    ...overrides,
  });

  if (!canSpeak()) {
    events.push("unsupported");
    const result = buildResult("unsupported", {
      reason: "speech_unsupported",
      supported: false,
      voices: 0,
    });
    diagnostic("unsupported", result);
    return Promise.resolve(result);
  }

  return new Promise<WorkoutVoiceSelfCheckResult>((resolve) => {
    let hasCompleted = false;
    let hasStarted = false;
    let startTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let endTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let voiceLoadTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let voicesChangedListener: (() => void) | undefined;

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
      const result = buildResult(status, overrides);
      diagnostic("result", result);
      resolve(result);
    };

    const speak = () => {
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

      const voice = selectChineseVoice(config);
      const selectedVoice = voice ? `${voice.name} (${voice.lang})` : "default";
      const voices = getVoiceCount();
      events.push("speech-request");
      diagnostic("speech request", { selectedVoice, text, voices });

      const utterance = createSelfCheckUtterance(text, voice, config);
      startTimer = globalThis.setTimeout(() => {
        if (hasStarted) {
          return;
        }

        events.push("speech-blocked");
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
        diagnostic("speech start", { selectedVoice, text, voices });
        endTimer = globalThis.setTimeout(() => {
          if (hasCompleted) {
            return;
          }

          events.push("speech-end-timeout");
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
      diagnostic("voices pending", { text });
      voicesChangedListener = speak;
      window.speechSynthesis.addEventListener?.("voiceschanged", voicesChangedListener, { once: true });
      voiceLoadTimer = globalThis.setTimeout(speak, config.fallback.speechVoiceLoadTimeoutMs);
      return;
    }

    speak();
  });
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

function selectChineseVoice(config: WorkoutVoiceBroadcastConfig) {
  if (!canSpeak()) {
    return undefined;
  }

  return window.speechSynthesis
    .getVoices()
    .find((voice) => (
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
