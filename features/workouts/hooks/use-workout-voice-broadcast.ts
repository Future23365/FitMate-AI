"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";
import {
  createWorkoutVoiceSpeechJob,
  isWorkoutVoiceSpeechSupported,
  unlockWorkoutVoiceBroadcastAudio,
  WorkoutVoiceSession,
  type WorkoutVoiceBroadcastError,
  type WorkoutVoiceBroadcastStatus,
  type WorkoutVoiceSessionState,
  type WorkoutVoiceSpeechJobOptions,
} from "@/features/workouts/voice/workout-voice-session";

export { createWorkoutVoiceSpeechJob, unlockWorkoutVoiceBroadcastAudio };
export type { WorkoutVoiceBroadcastError, WorkoutVoiceBroadcastStatus, WorkoutVoiceSpeechJobOptions };

export const workoutVoiceBroadcastStorageKey = "fitmate.workoutVoiceBroadcast.enabled";
export const workoutVoiceBroadcastTipSeenStorageKey = "fitmate.workoutVoiceBroadcast.tipSeen";

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
  return isWorkoutVoiceSpeechSupported();
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
  const [voiceState, setVoiceState] = useState<WorkoutVoiceSessionState>(() => ({
    isActive: false,
    isSupported: false,
    lastError: null,
    status: "unsupported",
  }));
  const sessionRef = useRef<WorkoutVoiceSession | null>(null);

  const getSession = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current = new WorkoutVoiceSession({
        onDiagnostic: ({ event, payload }) => logVoiceDiagnostic(event, payload),
        onStateChange: setVoiceState,
      });
      setVoiceState(sessionRef.current.getState());
    }

    return sessionRef.current;
  }, []);

  useEffect(() => {
    const session = getSession();
    setVoiceState(session.getState());

    return () => session.destroy();
  }, [getSession]);

  useEffect(() => {
    const session = getSession();
    session.setPreferenceEnabled(isPreferenceEnabled);
  }, [getSession, isPreferenceEnabled]);

  useEffect(() => {
    const session = getSession();
    session.setContext({
      activeStep,
      activeStepKey,
      isFirstExerciseStep,
      isPaused,
      isPreparing,
      onPreparationIntroComplete,
    });
    session.setPreferenceEnabled(isPreferenceEnabled);
    session.handleStepChanged();
  }, [
    activeStep,
    activeStepKey,
    getSession,
    isFirstExerciseStep,
    isPaused,
    isPreferenceEnabled,
    isPreparing,
    onPreparationIntroComplete,
  ]);

  useEffect(() => {
    if (!isPreferenceEnabled || isPaused || !isPreparationCountdownActive || preparationCountdown <= 0) {
      return;
    }

    getSession().handlePreparationCountdown(preparationCountdown);
  }, [
    getSession,
    isPaused,
    isPreferenceEnabled,
    isPreparationCountdownActive,
    preparationCountdown,
  ]);

  useEffect(() => {
    if (!isPreferenceEnabled || isPaused) {
      return;
    }

    getSession().handleRepetitionCount(completedReps);
  }, [completedReps, getSession, isPaused, isPreferenceEnabled]);

  useEffect(() => {
    if (
      !activeStep ||
      !isPreferenceEnabled ||
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

    getSession().playTimedBeep();
  }, [activeStep, getSession, isPaused, isPreferenceEnabled, isPreparing, remainingSeconds]);

  const activateCurrentStep = useCallback((forcePreferenceEnabled = false) => {
    getSession().activateCurrentStep(forcePreferenceEnabled);
  }, [getSession]);

  const cancelCurrentVoice = useCallback((reason = "cancel") => {
    getSession().cancelAll(reason);
  }, [getSession]);

  const disableVoiceSession = useCallback(() => {
    getSession().disable("disabled");
  }, [getSession]);

  return useMemo(() => ({
    activateCurrentStep,
    cancelCurrentVoice,
    disableVoiceSession,
    isActive: voiceState.isActive,
    isSupported: voiceState.isSupported,
    lastError: voiceState.lastError,
    status: voiceState.status,
  }), [
    activateCurrentStep,
    cancelCurrentVoice,
    disableVoiceSession,
    voiceState.isActive,
    voiceState.isSupported,
    voiceState.lastError,
    voiceState.status,
  ]);
}

function logVoiceDiagnostic(event: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[WorkoutVoice]", event, payload ?? {});
}
