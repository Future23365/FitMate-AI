"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";
import {
  buildPreparationCountdownCue,
  buildRepetitionCountCue,
  buildWorkoutActionPreparationCue,
  buildWorkoutStepVoiceCue,
} from "@/lib/shared/workouts/voice-cues";

export const workoutVoiceBroadcastStorageKey = "fitmate.workoutVoiceBroadcast.enabled";
export const workoutVoiceBroadcastTipSeenStorageKey = "fitmate.workoutVoiceBroadcast.tipSeen";

const speechUnavailablePreparationDelayMs = 1200;
const speechCompletionFallbackMinMs = 1600;
const speechCompletionFallbackMaxMs = 8000;
const speechCompletionFallbackMsPerChar = 220;
let workoutAudioContext: AudioContext | null = null;

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

type UseWorkoutVoiceBroadcastOptions = {
  activeStepIndex: number;
  completedReps: number;
  isFirstExerciseStep: boolean;
  isPaused: boolean;
  isPreferenceEnabled: boolean;
  isPreparationCountdownActive: boolean;
  onPreparationIntroComplete: (stepKey: string) => void;
  preparationCountdown: number;
  remainingSeconds: number;
  sessionId: string;
  steps: WorkoutTimelineStep[];
};

type WindowWithWebKitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type SpeechJob = {
  cancel: (reason?: string) => void;
  id: number;
};

export type WorkoutVoiceSpeechJobOptions = {
  forcePreferenceEnabled?: boolean;
  jobId: number;
  onDone?: () => void;
  onError?: (reason: WorkoutVoiceBroadcastError) => void;
  onStart?: () => void;
  reason: string;
};

type SpeakTextsOptions = Omit<WorkoutVoiceSpeechJobOptions, "jobId">;

export function readWorkoutVoiceBroadcastPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(workoutVoiceBroadcastStorageKey) === "true";
  } catch {
    return false;
  }
}

export function writeWorkoutVoiceBroadcastPreference(isEnabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(workoutVoiceBroadcastStorageKey, String(isEnabled));
  } catch {
    // Local preference persistence is best-effort; audio controls keep working in memory.
  }
}

export function readWorkoutVoiceBroadcastTipSeen() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(workoutVoiceBroadcastTipSeenStorageKey) === "true";
  } catch {
    return false;
  }
}

export function writeWorkoutVoiceBroadcastTipSeen() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(workoutVoiceBroadcastTipSeenStorageKey, "true");
  } catch {
    // Local tip persistence is best-effort; the current page can still hide the tip in memory.
  }
}

export function isWorkoutVoiceBroadcastSupported() {
  return canSpeak();
}

export function unlockWorkoutVoiceBroadcastAudio() {
  return unlockWebAudio();
}

export function useWorkoutVoiceBroadcast({
  activeStepIndex,
  completedReps,
  isFirstExerciseStep,
  isPaused,
  isPreferenceEnabled,
  isPreparationCountdownActive,
  onPreparationIntroComplete,
  preparationCountdown,
  remainingSeconds,
  sessionId,
  steps,
}: UseWorkoutVoiceBroadcastOptions) {
  const activeStep = steps[activeStepIndex];
  const activeStepKey = activeStep ? `${sessionId}:${activeStep.id}:${activeStepIndex}` : "";
  const isPreparing = preparationCountdown > 0;
  const [isSupported, setIsSupported] = useState(false);
  const [status, setStatus] = useState<WorkoutVoiceBroadcastStatus>(() => {
    return "unsupported";
  });
  const [lastError, setLastError] = useState<WorkoutVoiceBroadcastError | null>(null);
  const activeSpeechJobRef = useRef<SpeechJob | null>(null);
  const jobSequenceRef = useRef(0);
  const activeJobIdRef = useRef(0);
  const hasActivatedRef = useRef(false);
  const lastRepetitionCueKeyRef = useRef("");

  const setVoiceState = useCallback((nextStatus: WorkoutVoiceBroadcastStatus, nextError: WorkoutVoiceBroadcastError | null = null) => {
    setStatus(nextStatus);
    setLastError(nextError);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSupported(canSpeak()), 0);

    return () => window.clearTimeout(timer);
  }, []);

  const cancelSpeech = useCallback((reason = "cancel") => {
    activeJobIdRef.current += 1;
    activeSpeechJobRef.current?.cancel(reason);
    activeSpeechJobRef.current = null;
    cancelBrowserSpeech();
    logVoiceDiagnostic("cancel", { reason });
  }, []);

  const finishPreparationIntro = useCallback(() => {
    if (activeStepKey) {
      onPreparationIntroComplete(activeStepKey);
    }
  }, [activeStepKey, onPreparationIntroComplete]);

  const handleSpeechFailure = useCallback((reason: WorkoutVoiceBroadcastError) => {
    hasActivatedRef.current = false;
    setVoiceState("failed", reason);
    logVoiceDiagnostic("speech error", { reason });
  }, [setVoiceState]);

  const startSpeech = useCallback((texts: string[], options: SpeakTextsOptions) => {
    cancelSpeech(`replace:${options.reason}`);

    if (!isPreferenceEnabled && !options.forcePreferenceEnabled) {
      return;
    }

    if (!canSpeak()) {
      setVoiceState("unsupported", "speech_unsupported");
      options.onDone?.();
      return;
    }

    setVoiceState(hasActivatedRef.current ? "speaking" : "activating");

    const jobId = jobSequenceRef.current + 1;
    jobSequenceRef.current = jobId;
    activeJobIdRef.current = jobId;

    activeSpeechJobRef.current = createWorkoutVoiceSpeechJob(texts, {
      jobId,
      onDone: () => {
        if (activeJobIdRef.current !== jobId) {
          logVoiceDiagnostic("stale end", { jobId });
          return;
        }

        activeSpeechJobRef.current = null;
        hasActivatedRef.current = true;
        setVoiceState("active");
        options.onDone?.();
      },
      onError: (reason) => {
        if (activeJobIdRef.current !== jobId) {
          logVoiceDiagnostic("stale error", { jobId, reason });
          return;
        }

        activeSpeechJobRef.current = null;
        handleSpeechFailure(reason);
        options.onDone?.();
      },
      onStart: () => {
        if (activeJobIdRef.current !== jobId) {
          logVoiceDiagnostic("stale start", { jobId });
          return;
        }

        hasActivatedRef.current = true;
        setVoiceState("speaking");
        options.onStart?.();
      },
      reason: options.reason,
    });
  }, [cancelSpeech, handleSpeechFailure, isPreferenceEnabled, setVoiceState]);

  const speakCurrentStep = useCallback((reason = "current-step", forcePreferenceEnabled = false) => {
    if (!activeStep || (!isPreferenceEnabled && !forcePreferenceEnabled) || isPaused) {
      return;
    }

    const introText =
      activeStep.type === "exercise" && isPreparing
        ? buildWorkoutActionPreparationCue(activeStep, isFirstExerciseStep)
        : buildWorkoutStepVoiceCue(activeStep);

    startSpeech([introText], {
      forcePreferenceEnabled,
      onDone: activeStep.type === "exercise" && isPreparing ? finishPreparationIntro : undefined,
      reason,
    });
  }, [
    activeStep,
    finishPreparationIntro,
    isFirstExerciseStep,
    isPaused,
    isPreferenceEnabled,
    isPreparing,
    startSpeech,
  ]);

  const activateCurrentStep = useCallback((forcePreferenceEnabled = false) => {
    if (!isSupported) {
      setVoiceState("unsupported", "speech_unsupported");
      return;
    }

    if (!isPreferenceEnabled && !forcePreferenceEnabled) {
      setVoiceState("off");
      return;
    }

    logVoiceDiagnostic("activation retry", { activeStepKey });
    unlockWorkoutVoiceBroadcastAudio();
    speakCurrentStep("activation", forcePreferenceEnabled);
  }, [activeStepKey, isPreferenceEnabled, isSupported, setVoiceState, speakCurrentStep]);

  const disableVoiceSession = useCallback(() => {
    hasActivatedRef.current = false;
    lastRepetitionCueKeyRef.current = "";
    cancelSpeech("disabled");
    setVoiceState(isSupported ? "off" : "unsupported");
  }, [cancelSpeech, isSupported, setVoiceState]);

  useEffect(() => {
    if (!isSupported) {
      const timer = window.setTimeout(() => setVoiceState("unsupported", "speech_unsupported"), 0);

      return () => window.clearTimeout(timer);
    }

    if (!isPreferenceEnabled) {
      const timer = window.setTimeout(disableVoiceSession, 0);

      return () => window.clearTimeout(timer);
    }

    if (!hasActivatedRef.current && status !== "activating" && status !== "failed") {
      const timer = window.setTimeout(() => setVoiceState("needs-activation"), 0);

      return () => window.clearTimeout(timer);
    }
  }, [disableVoiceSession, isPreferenceEnabled, isSupported, setVoiceState, status]);

  useEffect(() => {
    window.addEventListener("pagehide", disableVoiceSession);
    window.addEventListener("beforeunload", disableVoiceSession);

    return () => {
      window.removeEventListener("pagehide", disableVoiceSession);
      window.removeEventListener("beforeunload", disableVoiceSession);
      disableVoiceSession();
    };
  }, [disableVoiceSession]);

  useEffect(() => {
    if (!isPreferenceEnabled || isPaused) {
      cancelSpeech(isPaused ? "paused" : "preference-off");
      if (isPreferenceEnabled && isPaused && hasActivatedRef.current) {
        setVoiceState("active");
      }
    }
  }, [cancelSpeech, isPaused, isPreferenceEnabled, setVoiceState]);

  useEffect(() => {
    if (!activeStep || !isPreferenceEnabled || isPaused || !hasActivatedRef.current) {
      return;
    }

    speakCurrentStep("step-change");
  }, [activeStep, activeStepKey, isPaused, isPreferenceEnabled, speakCurrentStep]);

  useEffect(() => {
    if (!isPreferenceEnabled || isPaused || !hasActivatedRef.current || !isPreparationCountdownActive || preparationCountdown <= 0) {
      return;
    }

    startSpeech([buildPreparationCountdownCue(preparationCountdown)], {
      reason: "preparation-countdown",
    });
  }, [
    isPaused,
    isPreferenceEnabled,
    isPreparationCountdownActive,
    preparationCountdown,
    startSpeech,
  ]);

  useEffect(() => {
    if (
      !activeStep ||
      !isPreferenceEnabled ||
      !hasActivatedRef.current ||
      isPaused ||
      isPreparing ||
      activeStep.type !== "exercise" ||
      activeStep.item.mode !== "duration"
    ) {
      return;
    }

    const elapsedSeconds = activeStep.durationSeconds - remainingSeconds;
    if (elapsedSeconds <= 0) {
      return;
    }

    playBeep();
  }, [activeStep, isPaused, isPreferenceEnabled, isPreparing, remainingSeconds]);

  useEffect(() => {
    if (
      !activeStep ||
      !isPreferenceEnabled ||
      !hasActivatedRef.current ||
      isPaused ||
      isPreparing ||
      activeStep.type !== "exercise" ||
      activeStep.item.mode !== "reps"
    ) {
      return;
    }

    if (completedReps <= 0 || completedReps > activeStep.item.target) {
      return;
    }

    const cueKey = `${activeStepKey}:${completedReps}`;
    if (lastRepetitionCueKeyRef.current === cueKey) {
      return;
    }

    lastRepetitionCueKeyRef.current = cueKey;
    startSpeech([buildRepetitionCountCue(completedReps)], {
      reason: "repetition-count",
    });
  }, [
    activeStep,
    activeStepKey,
    completedReps,
    isPaused,
    isPreferenceEnabled,
    isPreparing,
    startSpeech,
  ]);

  useEffect(() => {
    lastRepetitionCueKeyRef.current = "";
  }, [activeStepKey]);

  return useMemo(() => ({
    activateCurrentStep,
    cancelCurrentVoice: cancelSpeech,
    disableVoiceSession,
    isActive: status === "active" || status === "speaking" || status === "activating",
    isSupported,
    lastError,
    status,
  }), [activateCurrentStep, cancelSpeech, disableVoiceSession, isSupported, lastError, status]);
}

export function createWorkoutVoiceSpeechJob(
  texts: string[],
  {
    jobId,
    onDone,
    onError,
    onStart,
    reason,
  }: WorkoutVoiceSpeechJobOptions,
): SpeechJob {
  let completionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let isCancelled = false;
  const utterances: SpeechSynthesisUtterance[] = [];
  const normalizedTexts = texts.map((text) => text.trim()).filter(Boolean);

  const cancelJob = (cancelReason = "cancel") => {
    isCancelled = true;
    if (completionTimer) {
      globalThis.clearTimeout(completionTimer);
      completionTimer = undefined;
    }
    utterances.forEach((utterance) => {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    });
    logVoiceDiagnostic("cancel job", { cancelReason, jobId, reason });
  };

  if (!canSpeak()) {
    completionTimer = globalThis.setTimeout(() => {
      if (!isCancelled) {
        onDone?.();
      }
    }, speechUnavailablePreparationDelayMs);
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
  const completeOnce = () => {
    if (hasCompleted || isCancelled) {
      return;
    }

    hasCompleted = true;
    if (completionTimer) {
      globalThis.clearTimeout(completionTimer);
    }
    logVoiceDiagnostic("end", { jobId, reason });
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
    logVoiceDiagnostic("error", { errorReason, jobId, reason });
    onError?.(errorReason);
  };

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const voice = selectChineseVoice();

    completionTimer = globalThis.setTimeout(completeOnce, estimateSpeechCompletionFallbackMs(normalizedTexts));

    normalizedTexts.forEach((text, index) => {
      const utterance = createSpeechUtterance(text, voice);

      if (index === 0) {
        utterance.onstart = () => {
          if (isCancelled) {
            return;
          }

          logVoiceDiagnostic("start", { jobId, reason, text });
          onStart?.();
        };
      }

      if (index === normalizedTexts.length - 1) {
        utterance.onend = completeOnce;
        utterance.onerror = () => errorOnce("speech_error");
      }

      utterances.push(utterance);
      window.speechSynthesis.speak(utterance);
    });
  } catch {
    errorOnce("speech_error");
  }

  return { cancel: cancelJob, id: jobId };
}

function estimateSpeechCompletionFallbackMs(texts: string[]) {
  const estimatedMs = texts.join("").length * speechCompletionFallbackMsPerChar + speechUnavailablePreparationDelayMs;

  return Math.min(
    speechCompletionFallbackMaxMs,
    Math.max(speechCompletionFallbackMinMs, estimatedMs),
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

function selectChineseVoice() {
  if (!canSpeak()) {
    return undefined;
  }

  return window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith("zh") || /chinese|mandarin|中文|普通话/i.test(voice.name));
}

function createSpeechUtterance(text: string, voice = selectChineseVoice()) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

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

function unlockWebAudio() {
  try {
    const AudioContextClass = getAudioContextClass();

    if (!AudioContextClass) {
      logVoiceDiagnostic("audio unavailable", { reason: "missing AudioContext" });
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
    oscillator.stop(now + 0.02);
    void audioContext.resume().catch(() => undefined);
    return true;
  } catch {
    logVoiceDiagnostic("audio unavailable", { reason: "unlock failed" });
    return false;
  }
}

function playBeep() {
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
    oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.14);
  } catch {
    logVoiceDiagnostic("audio unavailable", { reason: "beep failed" });
  }
}

function logVoiceDiagnostic(event: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[WorkoutVoice]", event, payload ?? {});
}
