"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";
import {
  buildPreparationCountdownCue,
  buildRepetitionCountCue,
  buildWorkoutActionPreparationCue,
  buildWorkoutStepVoiceCue,
} from "@/lib/shared/workouts/voice-cues";

export const workoutVoiceBroadcastStorageKey = "fitmate.workoutVoiceBroadcast.enabled";
const speechUnavailablePreparationDelayMs = 1200;
const speechCompletionFallbackMinMs = 1600;
const speechCompletionFallbackMaxMs = 8000;
const speechCompletionFallbackMsPerChar = 220;

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

export function readWorkoutVoiceBroadcastPreference() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(workoutVoiceBroadcastStorageKey) !== "false";
  } catch {
    return true;
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

  useEffect(() => {
    if (!isEnabled) {
      preparationStepKeyRef.current = "";
      lastPreparationSecondRef.current = 0;
      cancelSpeech();
      return;
    }

    if (isPaused) {
      preparationStepKeyRef.current = "";
      lastPreparationSecondRef.current = 0;
      cancelSpeech();
    }
  }, [isEnabled, isPaused]);

  useEffect(() => {
    return () => {
      cancelSpeech();
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!activeStep || !isEnabled || isPaused) {
      return;
    }

    if (startupSessionIdRef.current !== sessionId) {
      startupSessionIdRef.current = sessionId;
      currentStepKeyRef.current = "";
      preparationStepKeyRef.current = "";
      resetRhythmRefs(lastBeepElapsedRef, lastCountRef);
      lastPreparationSecondRef.current = 0;
    }

    if (isPreparing) {
      if (preparationStepKeyRef.current !== activeStepKey) {
        preparationStepKeyRef.current = activeStepKey;
        currentStepKeyRef.current = activeStepKey;
        resetRhythmRefs(lastBeepElapsedRef, lastCountRef);
        lastPreparationSecondRef.current = 0;
        speakTexts([buildWorkoutActionPreparationCue(activeStep, isFirstExerciseStep)], true, () => {
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
      speakTexts([buildWorkoutStepVoiceCue(activeStep)], true);
    }
  }, [activeStep, activeStepKey, isEnabled, isFirstExerciseStep, isPaused, isPreparing, onPreparationIntroComplete, sessionId]);

  useEffect(() => {
    if (!isEnabled || isPaused || !isPreparationCountdownActive || preparationCountdown <= 0) {
      return;
    }

    if (lastPreparationSecondRef.current === preparationCountdown) {
      return;
    }

    lastPreparationSecondRef.current = preparationCountdown;
    speakTexts([buildPreparationCountdownCue(preparationCountdown)]);
  }, [isEnabled, isPaused, isPreparationCountdownActive, preparationCountdown]);

  useEffect(() => {
    if (!activeStep || !isEnabled) {
      wasPausedRef.current = isPaused;
      return;
    }

    if (!wasPausedRef.current && isPaused) {
      cancelSpeech();
    }

    if (wasPausedRef.current && !isPaused && !isPreparing) {
      speakTexts(["继续训练", buildWorkoutStepVoiceCue(activeStep)], true);
    }

    wasPausedRef.current = isPaused;
  }, [activeStep, isEnabled, isPaused, isPreparing]);

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
    speakTexts([buildRepetitionCountCue(completedReps)], true);
  }, [activeStep, completedReps, isEnabled, isPaused, isPreparing]);
}

function resetRhythmRefs(
  lastBeepElapsedRef: MutableRefObject<number>,
  lastCountRef: MutableRefObject<number>,
) {
  lastBeepElapsedRef.current = 0;
  lastCountRef.current = 0;
}

function speakTexts(texts: string[], interrupt = false, onDone?: () => void) {
  if (!canSpeak()) {
    globalThis.setTimeout(() => onDone?.(), speechUnavailablePreparationDelayMs);
    return;
  }

  if (interrupt) {
    cancelSpeech();
  }

  const normalizedTexts = texts
    .map((text) => text.trim())
    .filter(Boolean);

  if (normalizedTexts.length === 0) {
    globalThis.setTimeout(() => onDone?.(), 0);
    return;
  }

  const voice = selectChineseVoice();
  let completionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let hasCompleted = false;
  const completeOnce = () => {
    if (hasCompleted) {
      return;
    }

    hasCompleted = true;
    if (completionTimer) {
      globalThis.clearTimeout(completionTimer);
    }

    onDone?.();
  };

  if (onDone) {
    completionTimer = globalThis.setTimeout(completeOnce, estimateSpeechCompletionFallbackMs(normalizedTexts));
  }

  normalizedTexts.forEach((text, index) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    if (voice) {
      utterance.voice = voice;
    }

    if (index === normalizedTexts.length - 1 && onDone) {
      utterance.onend = completeOnce;
      utterance.onerror = completeOnce;
    }

    window.speechSynthesis.speak(utterance);
  });
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

function playBeep(audioContextRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const AudioContextClass =
      window.AudioContext ?? (window as WindowWithWebKitAudioContext).webkitAudioContext;

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
