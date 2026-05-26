"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkoutTimelineStep } from "@/lib/shared/workouts/composition";
import {
  defaultWorkoutVoiceBroadcastUserSettings,
  normalizeWorkoutVoiceBroadcastUserSettings,
  type WorkoutVoiceBroadcastConfig,
  type WorkoutVoiceBroadcastUserSettings,
} from "@/lib/shared/workouts/voice-broadcast-config";
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

// 训练语音使用 localStorage 保存本机偏好；这些键只代表当前浏览器，不写入服务端用户数据。
export const workoutVoiceBroadcastStorageKey = "fitmate.workoutVoiceBroadcast.enabled";
export const workoutVoiceBroadcastTipSeenStorageKey = "fitmate.workoutVoiceBroadcast.tipSeen";
export const workoutVoiceBroadcastSettingsStorageKey = "fitmate.workoutVoiceBroadcast.settings";

type UseWorkoutVoiceBroadcastOptions = {
  activeStepIndex: number;
  completedReps: number;
  config: WorkoutVoiceBroadcastConfig;
  isFirstExerciseStep: boolean;
  isPaused: boolean;
  isPreferenceEnabled: boolean;
  isPreparationCountdownActive: boolean;
  isSessionStarted: boolean;
  onPreparationIntroComplete: (stepKey: string) => void;
  preparationCountdown: number;
  remainingSeconds: number;
  sessionId: string;
  steps: WorkoutTimelineStep[];
};

// 读取训练页语音总开关；不可用或异常时默认关闭，避免刷新后假装已经可播放。
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

// 写入训练页语音总开关，后续进入 /training 时会用它恢复到关闭或等待激活状态。
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

// 读取首进提示展示标记；它只控制提示是否重复出现，不影响语音是否开启。
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

// 写入首进提示展示标记，避免每次进入训练执行页都打断用户。
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

// 读取本机语音调节项，并统一归一化，防止旧版本或手写 localStorage 数据越界。
export function readWorkoutVoiceBroadcastSettings(): WorkoutVoiceBroadcastUserSettings {
  if (typeof window === "undefined") {
    return defaultWorkoutVoiceBroadcastUserSettings;
  }

  try {
    const storedValue = window.localStorage.getItem(workoutVoiceBroadcastSettingsStorageKey);

    return normalizeWorkoutVoiceBroadcastUserSettings(
      storedValue ? JSON.parse(storedValue) as Partial<WorkoutVoiceBroadcastUserSettings> : undefined,
    );
  } catch {
    return defaultWorkoutVoiceBroadcastUserSettings;
  }
}

// 保存语音调节项；运行中的页面会立即用内存状态生效，localStorage 负责下次进入恢复。
export function writeWorkoutVoiceBroadcastSettings(settings: WorkoutVoiceBroadcastUserSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      workoutVoiceBroadcastSettingsStorageKey,
      JSON.stringify(normalizeWorkoutVoiceBroadcastUserSettings(settings)),
    );
  } catch {
    // Local voice tuning is best-effort; the current in-memory settings still apply.
  }
}

// 判断当前浏览器是否具备 Web Speech 播报入口；Web Audio beep 会在自检里单独验证。
export function isWorkoutVoiceBroadcastSupported() {
  return isWorkoutVoiceSpeechSupported();
}

// 将训练流程状态转换为语音会话事件，页面只传入当前步骤、倒计时和配置，不直接操作 speechSynthesis。
export function useWorkoutVoiceBroadcast({
  activeStepIndex,
  completedReps,
  config,
  isFirstExerciseStep,
  isPaused,
  isPreferenceEnabled,
  isPreparationCountdownActive,
  isSessionStarted,
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
  const configRef = useRef(config);
  const sessionRef = useRef<WorkoutVoiceSession | null>(null);

  const getSession = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current = new WorkoutVoiceSession({
        config: configRef.current,
        onDiagnostic: ({ event, payload }) => logVoiceDiagnostic(event, payload),
        onStateChange: setVoiceState,
      });
      setVoiceState(sessionRef.current.getState());
    }

    return sessionRef.current;
  }, []);

  useEffect(() => {
    configRef.current = config;
    getSession().updateConfig(config);
  }, [config, getSession]);

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
    if (isSessionStarted) {
      session.handleStepChanged();
    }
  }, [
    activeStep,
    activeStepKey,
    getSession,
    isFirstExerciseStep,
    isPaused,
    isPreferenceEnabled,
    isPreparing,
    isSessionStarted,
    onPreparationIntroComplete,
  ]);

  useEffect(() => {
    if (!isSessionStarted || !isPreferenceEnabled || isPaused || !isPreparationCountdownActive || preparationCountdown <= 0) {
      return;
    }

    getSession().handlePreparationCountdown(preparationCountdown);
  }, [
    getSession,
    isPaused,
    isPreferenceEnabled,
    isPreparationCountdownActive,
    isSessionStarted,
    preparationCountdown,
  ]);

  useEffect(() => {
    if (!isSessionStarted || !isPreferenceEnabled || isPaused) {
      return;
    }

    getSession().handleRepetitionCount(completedReps);
  }, [completedReps, getSession, isPaused, isPreferenceEnabled, isSessionStarted]);

  useEffect(() => {
    if (
      !activeStep ||
      !isSessionStarted ||
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
  }, [activeStep, getSession, isPaused, isPreferenceEnabled, isPreparing, isSessionStarted, remainingSeconds]);

  const activateCurrentStep = useCallback((
    forcePreferenceEnabled = false,
    options?: { includeActivationPrompt?: boolean; includeCurrentStepPrompt?: boolean },
  ) => {
    getSession().activateCurrentStep(forcePreferenceEnabled, options);
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
