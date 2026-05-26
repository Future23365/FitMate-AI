import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";
import {
  workoutVoiceBroadcastConfig,
  type WorkoutVoiceBroadcastConfig,
  type WorkoutVoiceCueType,
} from "@/lib/shared/workouts/voice-broadcast-config";
import {
  buildPreparationCountdownCue,
  buildRepetitionCountCue,
  buildWorkoutActionPreparationCue,
  buildWorkoutStepVoiceCue,
} from "@/lib/shared/workouts/voice-cues";

export type WorkoutVoiceBroadcastStatus =
  | "unsupported"
  | "off"
  | "needs-activation"
  | "activating"
  | "active"
  | "speaking"
  | "failed";

export type WorkoutVoiceBroadcastError =
  | "speech_unsupported"
  | "speech_blocked"
  | "speech_error"
  | "audio_context_unavailable";

export type WorkoutVoiceSpeechJobOptions = {
  jobId: number;
  onDone?: () => void;
  onError?: (reason: WorkoutVoiceBroadcastError) => void;
  onStart?: () => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
  reason: string;
};

export type WorkoutVoiceSessionState = {
  isActive: boolean;
  isSupported: boolean;
  lastError: WorkoutVoiceBroadcastError | null;
  status: WorkoutVoiceBroadcastStatus;
};

export type WorkoutVoiceDiagnosticEvent = {
  event: string;
  payload?: Record<string, unknown>;
};

type WindowWithWebKitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type SpeechJob = {
  cancel: (reason?: string) => void;
  id: number;
};

type WorkoutVoiceCue = {
  createdAt: number;
  dedupeKey: string;
  expiresAt: number;
  onDone?: () => void;
  onError?: (reason: WorkoutVoiceBroadcastError) => void;
  priority: number;
  stepKey: string;
  texts: string[];
  type: WorkoutVoiceCueType;
};

type ActiveWorkoutVoiceCue = {
  cue: WorkoutVoiceCue;
  job: SpeechJob;
  jobId: number;
};

type WorkoutVoiceContext = {
  activeStep?: WorkoutTimelineStep;
  activeStepKey: string;
  isFirstExerciseStep: boolean;
  isPaused: boolean;
  isPreparing: boolean;
  onPreparationIntroComplete: (stepKey: string) => void;
};

type WorkoutVoiceSessionOptions = {
  config?: WorkoutVoiceBroadcastConfig;
  onDiagnostic?: (event: WorkoutVoiceDiagnosticEvent) => void;
  onStateChange?: (state: WorkoutVoiceSessionState) => void;
};

type WorkoutVoiceActivationOptions = {
  includeActivationPrompt?: boolean;
  includeCurrentStepPrompt?: boolean;
};

let workoutAudioContext: AudioContext | null = null;

export class WorkoutVoiceSession {
  private activeCue: ActiveWorkoutVoiceCue | null = null;
  private config: WorkoutVoiceBroadcastConfig;
  private context: WorkoutVoiceContext | null = null;
  private hasActivated = false;
  private jobSequence = 0;
  private lastBeepAt = 0;
  private lastPreparationCountdownKey = "";
  private lastRepetitionCueAt = 0;
  private lastRepetitionCueKey = "";
  private lastStepCueKey = "";
  private onDiagnostic?: (event: WorkoutVoiceDiagnosticEvent) => void;
  private onStateChange?: (state: WorkoutVoiceSessionState) => void;
  private previousPaused = false;
  private preferenceEnabled = false;
  private queue: WorkoutVoiceCue[] = [];
  private state: WorkoutVoiceSessionState;

  constructor({
    config = workoutVoiceBroadcastConfig,
    onDiagnostic,
    onStateChange,
  }: WorkoutVoiceSessionOptions = {}) {
    this.config = config;
    this.onDiagnostic = onDiagnostic;
    this.onStateChange = onStateChange;
    this.state = {
      isActive: false,
      isSupported: canSpeak(),
      lastError: canSpeak() ? null : "speech_unsupported",
      status: canSpeak() ? "off" : "unsupported",
    };
  }

  getState() {
    return this.state;
  }

  setPreferenceEnabled(isEnabled: boolean) {
    this.preferenceEnabled = isEnabled;

    if (!this.state.isSupported) {
      this.setState("unsupported", "speech_unsupported");
      return;
    }

    if (!isEnabled) {
      this.disable("preference-off");
      return;
    }

    if (!this.hasActivated && !this.activeCue && this.state.status !== "failed") {
      this.setState("needs-activation");
    }
  }

  // 语音设置弹窗更新配置后，后续播报任务会从这里读取最新参数。
  updateConfig(config: WorkoutVoiceBroadcastConfig) {
    this.config = config;
  }

  setContext(nextContext: WorkoutVoiceContext) {
    const previousStepKey = this.context?.activeStepKey ?? "";
    const wasPaused = this.previousPaused;
    this.context = nextContext;
    this.previousPaused = nextContext.isPaused;

    if (previousStepKey && previousStepKey !== nextContext.activeStepKey) {
      this.cancelAll("step-change");
      this.lastPreparationCountdownKey = "";
      this.lastRepetitionCueAt = 0;
      this.lastRepetitionCueKey = "";
      this.lastStepCueKey = "";
    }

    if (nextContext.isPaused && !wasPaused) {
      this.pause();
    }
  }

  activateCurrentStep(
    forcePreferenceEnabled = false,
    { includeActivationPrompt = true, includeCurrentStepPrompt = true }: WorkoutVoiceActivationOptions = {},
  ) {
    if (!this.state.isSupported) {
      this.setState("unsupported", "speech_unsupported");
      return;
    }

    if (!this.preferenceEnabled && !forcePreferenceEnabled) {
      this.setState("off");
      return;
    }

    if (forcePreferenceEnabled) {
      this.preferenceEnabled = true;
    }

    this.diagnostic("activation retry", { activeStepKey: this.context?.activeStepKey ?? "" });
    unlockWebAudio(this.config, this.diagnostic);

    const context = this.context;
    const hasActivationText = !this.hasActivated && includeActivationPrompt;
    const introText = includeCurrentStepPrompt && context?.activeStep ? this.buildCurrentStepText(context) : "";
    const texts = [
      hasActivationText ? this.config.templates.activation : "",
      introText,
    ];
    const shouldCompletePreparationIntro =
      this.shouldCompletePreparationIntro(context) && (includeCurrentStepPrompt || hasActivationText);

    this.scheduleCue({
      dedupeKey: `activation:${context?.activeStepKey ?? "none"}`,
      onDone: shouldCompletePreparationIntro ? () => context?.onPreparationIntroComplete(context.activeStepKey) : undefined,
      stepKey: context?.activeStepKey ?? "",
      texts,
      type: "activation",
    }, { forceInterrupt: true });
  }

  handleStepChanged() {
    const context = this.context;

    if (!this.canScheduleWorkoutCue(context)) {
      return;
    }

    const type: WorkoutVoiceCueType =
      context.activeStep?.type === "exercise" && context.isPreparing ? "preparation-intro" : "step-intro";
    const stepCueKey = `${context.activeStepKey}:${type}`;
    if (this.lastStepCueKey === stepCueKey) {
      return;
    }

    this.lastStepCueKey = stepCueKey;
    this.scheduleCue({
      dedupeKey: stepCueKey,
      onDone: this.shouldCompletePreparationIntro(context) ? () => context.onPreparationIntroComplete(context.activeStepKey) : undefined,
      stepKey: context.activeStepKey,
      texts: [this.buildCurrentStepText(context)],
      type,
    });
  }

  handlePreparationCountdown(second: number) {
    const context = this.context;

    if (!this.canScheduleWorkoutCue(context) || !context.activeStepKey) {
      return;
    }

    const cueKey = `${context.activeStepKey}:preparation-countdown:${second}`;
    if (this.lastPreparationCountdownKey === cueKey) {
      return;
    }

    this.lastPreparationCountdownKey = cueKey;
    this.scheduleCue({
      dedupeKey: cueKey,
      stepKey: context.activeStepKey,
      texts: [buildPreparationCountdownCue(second, this.config)],
      type: "preparation-countdown",
    });
  }

  handleRepetitionCount(count: number) {
    const context = this.context;

    if (
      !this.canScheduleWorkoutCue(context) ||
      !context.activeStep ||
      context.isPreparing ||
      context.activeStep.type !== "exercise" ||
      context.activeStep.item.mode !== "reps" ||
      count <= 0 ||
      count > context.activeStep.item.target
    ) {
      return;
    }

    const now = Date.now();
    const cueKey = `${context.activeStepKey}:rep-count:${count}`;
    if (
      this.lastRepetitionCueKey === cueKey ||
      now - this.lastRepetitionCueAt < this.config.timing.repetitionCueMinIntervalMs
    ) {
      return;
    }

    this.lastRepetitionCueAt = now;
    this.lastRepetitionCueKey = cueKey;
    this.scheduleCue({
      dedupeKey: cueKey,
      stepKey: context.activeStepKey,
      texts: [buildRepetitionCountCue(count, this.config)],
      type: "rep-count",
    });
  }

  playTimedBeep() {
    if (!this.preferenceEnabled || !this.hasActivated || this.context?.isPaused) {
      return;
    }

    const now = Date.now();
    if (now - this.lastBeepAt < this.config.beep.intervalMs * 0.75) {
      return;
    }

    this.lastBeepAt = now;
    playBeep(this.config, this.diagnostic);
  }

  pause() {
    this.cancelAll("paused");
    if (this.preferenceEnabled && this.hasActivated && this.state.isSupported) {
      this.setState("active");
    }
  }

  resume() {
    if (!this.preferenceEnabled || !this.state.isSupported) {
      return;
    }

    if (!this.hasActivated) {
      this.setState("needs-activation");
    }
  }

  disable(reason = "disabled") {
    this.preferenceEnabled = false;
    this.hasActivated = false;
    this.cancelAll(reason);
    this.setState(this.state.isSupported ? "off" : "unsupported");
  }

  destroy() {
    this.disable("destroy");
  }

  cancelAll(reason = "cancel") {
    this.queue = [];
    this.cancelCurrent(reason);
    this.diagnostic("cancel", { reason });
  }

  private scheduleCue(
    cueInput: Omit<WorkoutVoiceCue, "createdAt" | "expiresAt" | "priority">,
    { forceInterrupt = false }: { forceInterrupt?: boolean } = {},
  ) {
    if (!this.preferenceEnabled && !forceInterrupt) {
      return false;
    }

    if (!this.state.isSupported) {
      this.setState("unsupported", "speech_unsupported");
      this.completeCueWithoutSpeech(cueInput);
      return false;
    }

    const policy = this.config.cuePolicies[cueInput.type];
    const now = Date.now();
    const cue: WorkoutVoiceCue = {
      ...cueInput,
      createdAt: now,
      expiresAt: now + policy.staleAfterMs,
      priority: policy.priority,
      texts: cueInput.texts.map((text) => text.trim()).filter(Boolean),
    };

    if (cue.texts.length === 0) {
      cue.onDone?.();
      return false;
    }

    if (this.isDuplicateCue(cue)) {
      this.diagnostic("drop duplicate", { dedupeKey: cue.dedupeKey, type: cue.type });
      return false;
    }

    if (!this.activeCue) {
      this.startCue(cue, forceInterrupt);
      return true;
    }

    const currentCue = this.activeCue.cue;
    const canInterrupt =
      forceInterrupt ||
      (policy.interruptCurrent && cue.priority > currentCue.priority);

    if (canInterrupt) {
      this.cancelCurrent(`replace:${cue.type}`);
      this.startCue(cue, forceInterrupt);
      return true;
    }

    if (!policy.enqueue) {
      this.diagnostic("drop cue", {
        activeType: currentCue.type,
        dedupeKey: cue.dedupeKey,
        type: cue.type,
      });
      return false;
    }

    this.enqueueCue(cue);
    return true;
  }

  private startCue(cue: WorkoutVoiceCue, isActivationAttempt = false) {
    const jobId = this.jobSequence + 1;
    this.jobSequence = jobId;
    this.setState(this.hasActivated && !isActivationAttempt ? "speaking" : "activating");

    const job = createWorkoutVoiceSpeechJob(cue.texts, {
      jobId,
      onDiagnostic: this.diagnostic,
      onDone: () => this.completeActiveCue(jobId),
      onError: (reason) => this.failActiveCue(jobId, reason),
      onStart: () => {
        if (!this.isCurrentJob(jobId)) {
          this.diagnostic("stale start", { jobId });
          return;
        }

        this.hasActivated = true;
        this.setState("speaking");
      },
      reason: cue.type,
    }, this.config);

    this.activeCue = { cue, job, jobId };
  }

  private completeActiveCue(jobId: number) {
    if (!this.isCurrentJob(jobId)) {
      this.diagnostic("stale end", { jobId });
      return;
    }

    const completedCue = this.activeCue?.cue;
    this.activeCue = null;
    this.hasActivated = true;
    this.setState("active");
    completedCue?.onDone?.();
    this.startNextQueuedCue();
  }

  private failActiveCue(jobId: number, reason: WorkoutVoiceBroadcastError) {
    if (!this.isCurrentJob(jobId)) {
      this.diagnostic("stale error", { jobId, reason });
      return;
    }

    const failedCue = this.activeCue?.cue;
    this.activeCue = null;
    this.hasActivated = false;
    this.setState("failed", reason);
    failedCue?.onError?.(reason);
    this.diagnostic("speech error", { reason, type: failedCue?.type });

    if (failedCue?.onDone) {
      globalThis.setTimeout(() => failedCue.onDone?.(), this.config.fallback.silentPreparationDelayMs);
    }
  }

  private enqueueCue(cue: WorkoutVoiceCue) {
    this.queue = this.queue.filter((queuedCue) => !this.isExpired(queuedCue));

    if (this.queue.length >= this.config.queue.maxSize) {
      this.applyOverflowPolicy(cue);
    }

    if (this.queue.length >= this.config.queue.maxSize) {
      this.diagnostic("drop queue-full", { dedupeKey: cue.dedupeKey, type: cue.type });
      return;
    }

    this.queue.push(cue);
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  }

  private startNextQueuedCue() {
    this.queue = this.queue.filter((queuedCue) => !this.isExpired(queuedCue));
    const nextCue = this.queue.shift();

    if (nextCue) {
      this.startCue(nextCue);
    }
  }

  private applyOverflowPolicy(nextCue: WorkoutVoiceCue) {
    if (this.config.queue.overflowPolicy === "drop-newest") {
      return;
    }

    const lowestPriorityIndex = this.queue.reduce((lowestIndex, queuedCue, index, queue) => {
      return queuedCue.priority < queue[lowestIndex].priority ? index : lowestIndex;
    }, 0);

    if (this.queue[lowestPriorityIndex] && this.queue[lowestPriorityIndex].priority <= nextCue.priority) {
      this.queue.splice(lowestPriorityIndex, 1);
    }
  }

  private cancelCurrent(reason: string) {
    if (!this.activeCue) {
      return;
    }

    this.activeCue.job.cancel(reason);
    this.activeCue = null;
    cancelBrowserSpeech();
  }

  private completeCueWithoutSpeech(cue: Pick<WorkoutVoiceCue, "onDone">) {
    globalThis.setTimeout(() => cue.onDone?.(), this.config.fallback.speechUnavailablePreparationDelayMs);
  }

  private buildCurrentStepText(context: WorkoutVoiceContext) {
    if (!context.activeStep) {
      return "";
    }

    if (context.activeStep.type === "exercise" && context.isPreparing) {
      return buildWorkoutActionPreparationCue(context.activeStep, context.isFirstExerciseStep, this.config);
    }

    return buildWorkoutStepVoiceCue(context.activeStep, this.config);
  }

  private shouldCompletePreparationIntro(context: WorkoutVoiceContext | null | undefined) {
    return Boolean(context?.activeStep?.type === "exercise" && context.isPreparing);
  }

  private canScheduleWorkoutCue(context: WorkoutVoiceContext | null): context is WorkoutVoiceContext {
    return Boolean(
      context?.activeStep &&
      !context.isPaused &&
      this.preferenceEnabled &&
      this.hasActivated &&
      this.state.isSupported,
    );
  }

  private isCurrentJob(jobId: number) {
    return this.activeCue?.jobId === jobId;
  }

  private isDuplicateCue(cue: WorkoutVoiceCue) {
    return this.activeCue?.cue.dedupeKey === cue.dedupeKey ||
      this.queue.some((queuedCue) => queuedCue.dedupeKey === cue.dedupeKey);
  }

  private isExpired(cue: WorkoutVoiceCue) {
    return cue.expiresAt <= Date.now() || (cue.stepKey && cue.stepKey !== this.context?.activeStepKey);
  }

  private setState(status: WorkoutVoiceBroadcastStatus, lastError: WorkoutVoiceBroadcastError | null = null) {
    this.state = {
      isActive: status === "active" || status === "speaking" || status === "activating",
      isSupported: canSpeak(),
      lastError,
      status,
    };
    this.onStateChange?.(this.state);
  }

  private diagnostic = (event: string, payload?: Record<string, unknown>) => {
    this.onDiagnostic?.({ event, payload });
  };
}

export function createWorkoutVoiceSpeechJob(
  texts: string[],
  {
    jobId,
    onDiagnostic,
    onDone,
    onError,
    onStart,
    reason,
  }: WorkoutVoiceSpeechJobOptions,
  config: WorkoutVoiceBroadcastConfig = workoutVoiceBroadcastConfig,
): SpeechJob {
  let completionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let startTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let voiceLoadTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let voicesChangedListener: (() => void) | undefined;
  let isCancelled = false;
  const utterances: SpeechSynthesisUtterance[] = [];
  const normalizedTexts = texts.map((text) => text.trim()).filter(Boolean);

  const cancelJob = () => {
    isCancelled = true;
    if (completionTimer) {
      globalThis.clearTimeout(completionTimer);
      completionTimer = undefined;
    }
    if (startTimer) {
      globalThis.clearTimeout(startTimer);
      startTimer = undefined;
    }
    if (voiceLoadTimer) {
      globalThis.clearTimeout(voiceLoadTimer);
      voiceLoadTimer = undefined;
    }
    if (voicesChangedListener) {
      window.speechSynthesis.removeEventListener?.("voiceschanged", voicesChangedListener);
      voicesChangedListener = undefined;
    }
    utterances.forEach((utterance) => {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    });
  };

  if (!canSpeak()) {
    completionTimer = globalThis.setTimeout(() => {
      if (!isCancelled) {
        onDone?.();
      }
    }, config.fallback.speechUnavailablePreparationDelayMs);
    return { cancel: cancelJob, id: jobId };
  }

  if (normalizedTexts.length === 0) {
    completionTimer = globalThis.setTimeout(() => {
      if (!isCancelled) {
        onDone?.();
      }
    }, 0);
    return { cancel: cancelJob, id: jobId };
  }

  let hasCompleted = false;
  let hasStarted = false;
  const completeOnce = () => {
    if (hasCompleted || isCancelled) {
      return;
    }

    hasCompleted = true;
    if (completionTimer) {
      globalThis.clearTimeout(completionTimer);
    }
    if (startTimer) {
      globalThis.clearTimeout(startTimer);
    }
    if (voiceLoadTimer) {
      globalThis.clearTimeout(voiceLoadTimer);
    }
    if (voicesChangedListener) {
      window.speechSynthesis.removeEventListener?.("voiceschanged", voicesChangedListener);
      voicesChangedListener = undefined;
    }
    onDiagnostic?.("speech end", { jobId, reason, started: hasStarted });
    onDone?.();
  };

  const errorOnce = (errorReason: WorkoutVoiceBroadcastError) => {
    if (hasCompleted || isCancelled) {
      return;
    }

    hasCompleted = true;
    if (completionTimer) {
      globalThis.clearTimeout(completionTimer);
    }
    if (startTimer) {
      globalThis.clearTimeout(startTimer);
    }
    if (voiceLoadTimer) {
      globalThis.clearTimeout(voiceLoadTimer);
    }
    if (voicesChangedListener) {
      window.speechSynthesis.removeEventListener?.("voiceschanged", voicesChangedListener);
      voicesChangedListener = undefined;
    }
    onDiagnostic?.("speech error", { jobId, reason, errorReason, started: hasStarted });
    onError?.(errorReason);
  };

  try {
    window.speechSynthesis.resume();

    const speakTexts = () => {
      if (isCancelled || hasCompleted) {
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
      onDiagnostic?.("speech request", {
        jobId,
        reason,
        textCount: normalizedTexts.length,
        voice: voice ? `${voice.name} (${voice.lang})` : "default",
        voices: window.speechSynthesis.getVoices().length,
      });

      startTimer = globalThis.setTimeout(() => {
        if (!hasStarted) {
          errorOnce("speech_blocked");
        }
      }, config.fallback.speechStartTimeoutMs);

      completionTimer = globalThis.setTimeout(
        () => {
          if (hasStarted) {
            completeOnce();
            return;
          }

          errorOnce("speech_blocked");
        },
        estimateSpeechCompletionFallbackMs(normalizedTexts, config),
      );

      normalizedTexts.forEach((text, index) => {
        const utterance = createSpeechUtterance(text, voice, config);

        if (index === 0) {
          utterance.onstart = () => {
            if (!isCancelled) {
              hasStarted = true;
              if (startTimer) {
                globalThis.clearTimeout(startTimer);
                startTimer = undefined;
              }
              onDiagnostic?.("speech start", { jobId, reason, text });
              onStart?.();
            }
          };
        }

        utterance.onerror = (event) => {
          onDiagnostic?.("speech utterance error", {
            error: "error" in event ? event.error : undefined,
            jobId,
            reason,
            text,
          });
          errorOnce("speech_error");
        };

        if (index === normalizedTexts.length - 1) {
          utterance.onend = completeOnce;
        }

        utterances.push(utterance);
        window.speechSynthesis.speak(utterance);
      });
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      onDiagnostic?.("speech voices pending", { jobId, reason });
      voicesChangedListener = speakTexts;
      window.speechSynthesis.addEventListener?.("voiceschanged", voicesChangedListener, { once: true });
      voiceLoadTimer = globalThis.setTimeout(speakTexts, config.fallback.speechVoiceLoadTimeoutMs);
    } else {
      speakTexts();
    }
  } catch {
    errorOnce("speech_error");
  }

  void reason;
  return { cancel: cancelJob, id: jobId };
}

export function isWorkoutVoiceSpeechSupported() {
  return canSpeak();
}

export function unlockWorkoutVoiceBroadcastAudio(config = workoutVoiceBroadcastConfig) {
  return unlockWebAudio(config);
}

function estimateSpeechCompletionFallbackMs(texts: string[], config: WorkoutVoiceBroadcastConfig) {
  const estimatedMs = texts.join("").length * config.fallback.speechCompletionFallbackMsPerChar +
    config.fallback.speechUnavailablePreparationDelayMs;

  return Math.min(
    config.fallback.speechCompletionFallbackMaxMs,
    Math.max(config.fallback.speechCompletionFallbackMinMs, estimatedMs),
  );
}

function cancelBrowserSpeech() {
  if (!canSpeak()) {
    return;
  }

  try {
    window.speechSynthesis.cancel();
  } catch {
    // Browser speech cancellation is best-effort.
  }
}

function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function selectChineseVoice(config: WorkoutVoiceBroadcastConfig) {
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

function createSpeechUtterance(
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

function getAudioContextClass() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.AudioContext ?? (window as WindowWithWebKitAudioContext).webkitAudioContext;
}

function unlockWebAudio(
  config: WorkoutVoiceBroadcastConfig,
  diagnostic?: (event: string, payload?: Record<string, unknown>) => void,
) {
  try {
    const AudioContextClass = getAudioContextClass();

    if (!AudioContextClass) {
      diagnostic?.("audio unavailable", { reason: "missing AudioContext" });
      return false;
    }

    if (!workoutAudioContext || workoutAudioContext.state === "closed") {
      workoutAudioContext = new AudioContextClass();
    }

    const audioContext = workoutAudioContext;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    gain.gain.setValueAtTime(0.0001, now);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + config.beep.unlockDurationMs / 1000);
    void audioContext.resume().catch(() => undefined);
    return true;
  } catch {
    diagnostic?.("audio unavailable", { reason: "unlock failed" });
    return false;
  }
}

function playBeep(
  config: WorkoutVoiceBroadcastConfig,
  diagnostic?: (event: string, payload?: Record<string, unknown>) => void,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!workoutAudioContext || workoutAudioContext.state !== "running") {
      return;
    }

    const audioContext = workoutAudioContext;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(config.beep.frequencyHz, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(config.beep.volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + config.beep.durationMs / 1000);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + config.beep.durationMs / 1000);
  } catch {
    diagnostic?.("audio unavailable", { reason: "beep failed" });
  }
}
