"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

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
const speechRestartDelayMs = 80;

type UseWorkoutVoiceBroadcastOptions = {
  activeStepIndex: number;
  completedReps: number;
  isEnabled: boolean;
  isPreparationCountdownActive: boolean;
  isFirstExerciseStep: boolean;
  isPaused: boolean;
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
  cancel: () => void;
};

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
  if (typeof window === "undefined") {
    return;
  }

  if (canSpeak()) {
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(createSpeechUtterance("语音播报已开启"));
    } catch {
      // User-gesture audio unlock is best-effort; the session flow still handles timing.
    }
  }

  unlockWebAudio();
}

export function useWorkoutVoiceBroadcast({
  activeStepIndex,
  completedReps,
  isEnabled,
  isPreparationCountdownActive,
  isFirstExerciseStep,
  isPaused,
  onPreparationIntroComplete,
  preparationCountdown,
  remainingSeconds,
  sessionId,
  steps,
}: UseWorkoutVoiceBroadcastOptions) {
  const activeStep = steps[activeStepIndex];
  const activeStepKey = activeStep ? `${sessionId}:${activeStep.id}:${activeStepIndex}` : "";
  const isPreparing = preparationCountdown > 0;
  const startupSessionIdRef = useRef("");
  const currentStepKeyRef = useRef("");
  const preparationStepKeyRef = useRef("");
  const lastBeepElapsedRef = useRef(0);
  const lastCountRef = useRef(0);
  const lastPreparationSecondRef = useRef(0);
  const wasPausedRef = useRef(isPaused);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSpeechJobRef = useRef<SpeechJob | null>(null);

  const stopSpeech = useCallback(() => {
    activeSpeechJobRef.current?.cancel();
    activeSpeechJobRef.current = null;
    cancelSpeech();
  }, []);

  const stopSessionAudio = useCallback(() => {
    stopSpeech();
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }, [stopSpeech]);

  const startSpeech = useCallback((texts: string[], interrupt = false, onDone?: () => void) => {
    if (interrupt) {
      stopSpeech();
    }

    const speechJob = speakTexts(texts, onDone);
    activeSpeechJobRef.current = speechJob;
  }, [stopSpeech]);

  useEffect(() => {
    window.addEventListener("pagehide", stopSessionAudio);
    window.addEventListener("beforeunload", stopSessionAudio);

    return () => {
      window.removeEventListener("pagehide", stopSessionAudio);
      window.removeEventListener("beforeunload", stopSessionAudio);
      stopSessionAudio();
      currentStepKeyRef.current = "";
      preparationStepKeyRef.current = "";
      lastPreparationSecondRef.current = 0;
      resetRhythmRefs(lastBeepElapsedRef, lastCountRef);
    };
  }, [stopSessionAudio]);

  useEffect(() => {
    if (!isEnabled) {
      currentStepKeyRef.current = "";
      preparationStepKeyRef.current = "";
      lastPreparationSecondRef.current = 0;
      stopSpeech();
      return;
    }

    if (isPaused) {
      preparationStepKeyRef.current = "";
      lastPreparationSecondRef.current = 0;
      stopSpeech();
    }
  }, [isEnabled, isPaused, stopSpeech]);

  useEffect(() => {
    if (!activeStep || !isEnabled || isPaused) {
      return;
    }

    if (startupSessionIdRef.current !== sessionId) {
      startupSessionIdRef.current = sessionId;
      currentStepKeyRef.current = "";
      preparationStepKeyRef.current = "";
      lastPreparationSecondRef.current = 0;
      resetRhythmRefs(lastBeepElapsedRef, lastCountRef);
    }

    if (isPreparing) {
      if (preparationStepKeyRef.current !== activeStepKey) {
        preparationStepKeyRef.current = activeStepKey;
        currentStepKeyRef.current = activeStepKey;
        lastPreparationSecondRef.current = 0;
        resetRhythmRefs(lastBeepElapsedRef, lastCountRef);
        startSpeech([buildWorkoutActionPreparationCue(activeStep, isFirstExerciseStep)], true, () => {
          if (preparationStepKeyRef.current === activeStepKey) {
            onPreparationIntroComplete(activeStepKey);
          }
        });
      }

      return;
    }

    if (currentStepKeyRef.current !== activeStepKey) {
      currentStepKeyRef.current = activeStepKey;
      resetRhythmRefs(lastBeepElapsedRef, lastCountRef);
      startSpeech([buildWorkoutStepVoiceCue(activeStep)], true);
    }
  }, [activeStep, activeStepKey, isEnabled, isFirstExerciseStep, isPaused, isPreparing, onPreparationIntroComplete, sessionId, startSpeech]);

  useEffect(() => {
    if (!isEnabled || isPaused || !isPreparationCountdownActive || preparationCountdown <= 0) {
      return;
    }

    if (lastPreparationSecondRef.current === preparationCountdown) {
      return;
    }

    lastPreparationSecondRef.current = preparationCountdown;
    startSpeech([buildPreparationCountdownCue(preparationCountdown)]);
  }, [isEnabled, isPaused, isPreparationCountdownActive, preparationCountdown, startSpeech]);

  useEffect(() => {
    if (!activeStep || !isEnabled) {
      wasPausedRef.current = isPaused;
      return;
    }

    if (!wasPausedRef.current && isPaused) {
      stopSpeech();
    }

    if (wasPausedRef.current && !isPaused && !isPreparing) {
      startSpeech(["继续训练", buildWorkoutStepVoiceCue(activeStep)], true);
    }

    wasPausedRef.current = isPaused;
  }, [activeStep, isEnabled, isPaused, isPreparing, startSpeech, stopSpeech]);

  useEffect(() => {
    if (
      !activeStep ||
      !isEnabled ||
      isPaused ||
      isPreparing ||
      activeStep.type !== "exercise" ||
      activeStep.item.mode !== "duration"
    ) {
      return;
    }

    const elapsedSeconds = activeStep.durationSeconds - remainingSeconds;
    if (elapsedSeconds <= 0 || elapsedSeconds <= lastBeepElapsedRef.current) {
      return;
    }

    lastBeepElapsedRef.current = elapsedSeconds;
    playBeep(audioContextRef);
  }, [activeStep, isEnabled, isPaused, isPreparing, remainingSeconds]);

  useEffect(() => {
    if (
      !activeStep ||
      !isEnabled ||
      isPaused ||
      isPreparing ||
      activeStep.type !== "exercise" ||
      activeStep.item.mode !== "reps"
    ) {
      return;
    }

    if (completedReps <= 0 || completedReps <= lastCountRef.current || completedReps > activeStep.item.target) {
      return;
    }

    lastCountRef.current = completedReps;
    startSpeech([buildRepetitionCountCue(completedReps)], true);
  }, [activeStep, completedReps, isEnabled, isPaused, isPreparing, startSpeech]);
}

function resetRhythmRefs(
  lastBeepElapsedRef: MutableRefObject<number>,
  lastCountRef: MutableRefObject<number>,
) {
  lastBeepElapsedRef.current = 0;
  lastCountRef.current = 0;
}

function speakTexts(texts: string[], onDone?: () => void): SpeechJob {
  let completionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let startTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let isCancelled = false;
  const utterances: SpeechSynthesisUtterance[] = [];

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

    utterances.forEach((utterance) => {
      utterance.onend = null;
      utterance.onerror = null;
    });
  };

  if (!canSpeak()) {
    completionTimer = globalThis.setTimeout(() => {
      if (!isCancelled) {
        onDone?.();
      }
    }, speechUnavailablePreparationDelayMs);
    return { cancel: cancelJob };
  }

  const normalizedTexts = texts
    .map((text) => text.trim())
    .filter(Boolean);

  if (normalizedTexts.length === 0) {
    completionTimer = globalThis.setTimeout(() => {
      if (!isCancelled) {
        onDone?.();
      }
    }, 0);
    return { cancel: cancelJob };
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

    onDone?.();
  };

  startTimer = globalThis.setTimeout(() => {
    if (isCancelled) {
      return;
    }

    window.speechSynthesis.resume();

    const voice = selectChineseVoice();

    if (onDone) {
      completionTimer = globalThis.setTimeout(completeOnce, estimateSpeechCompletionFallbackMs(normalizedTexts));
    }

    normalizedTexts.forEach((text, index) => {
      const utterance = createSpeechUtterance(text, voice);

      if (index === normalizedTexts.length - 1 && onDone) {
        utterance.onend = completeOnce;
        utterance.onerror = completeOnce;
      }

      utterances.push(utterance);
      window.speechSynthesis.speak(utterance);
    });
  }, speechRestartDelayMs);

  return { cancel: cancelJob };
}

function estimateSpeechCompletionFallbackMs(texts: string[]) {
  const estimatedMs = texts.join("").length * speechCompletionFallbackMsPerChar + speechUnavailablePreparationDelayMs;

  return Math.min(
    speechCompletionFallbackMaxMs,
    Math.max(speechCompletionFallbackMinMs, estimatedMs),
  );
}

function cancelSpeech() {
  if (!canSpeak()) {
    return;
  }

  window.speechSynthesis.cancel();
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
      return;
    }

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    gain.gain.setValueAtTime(0.0001, now);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.02);
    void audioContext.resume().catch(() => undefined);
    globalThis.setTimeout(() => {
      void audioContext.close().catch(() => undefined);
    }, 120);
  } catch {
    // Web Audio unlock is optional; speech prompts remain the primary voice path.
  }
}

function playBeep(audioContextRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const AudioContextClass = getAudioContextClass();

    if (!AudioContextClass) {
      return;
    }

    const audioContext = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = audioContext;

    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }

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
    // Beep cues are optional; workout timing and speech prompts must keep running.
  }
}
