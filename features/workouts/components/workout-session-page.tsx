"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import {
  getWorkoutSchedule,
  saveWorkoutSessionResult,
} from "@/features/workouts/api/workout-data-client";
import {
  isWorkoutVoiceBroadcastSupported,
  readWorkoutVoiceBroadcastPreference,
  readWorkoutVoiceBroadcastSettings,
  readWorkoutVoiceBroadcastTipSeen,
  useWorkoutVoiceBroadcast,
  writeWorkoutVoiceBroadcastPreference,
  writeWorkoutVoiceBroadcastSettings,
  writeWorkoutVoiceBroadcastTipSeen,
} from "@/features/workouts/hooks/use-workout-voice-broadcast";
import {
  runWorkoutVoiceSelfCheck,
  type WorkoutVoiceSelfCheckResult,
  type WorkoutVoiceSelfCheckStepStatus,
} from "@/features/workouts/voice/workout-voice-self-check";
import {
  getWorkoutVoiceToggleLabel,
  resolveWorkoutVoiceToggleIntent,
} from "@/features/workouts/voice/workout-voice-toggle";
import {
  buildWorkoutTimeline,
  defaultSetRestSeconds,
  defaultTransitionRestSeconds,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getWorkoutItemImageUrls,
  getRepIntervalSeconds,
  getWorkoutLoopConfig,
  normalizeWorkoutItem,
  placeholderWorkoutImage,
  type WorkoutSchedule,
  type WorkoutItem,
  type WorkoutMode,
  type WorkoutSection,
  type WorkoutTimelineStep,
} from "@/lib/shared/workouts/composition";
import {
  buildWorkoutExecutionStepKey,
  canWorkoutExecutionRunStep,
  completeWorkoutExecution,
  createIdleWorkoutExecutionState,
  createWorkoutExecutionLoadError,
  createWorkoutStepExecutionState,
  isWorkoutExecutionPaused,
  isWorkoutExecutionPreparingForStep,
  isWorkoutPreparationCountdownActive,
  markWorkoutPreparationIntroComplete,
  pauseWorkoutExecution,
  resumeWorkoutExecution,
  tickWorkoutPreparationCountdown,
} from "@/lib/shared/workouts/session-execution";
import {
  buildWorkoutVoiceBroadcastConfig,
  defaultWorkoutVoiceBroadcastUserSettings,
  normalizeWorkoutVoiceBroadcastUserSettings,
  type WorkoutVoiceBroadcastUserSettings,
} from "@/lib/shared/workouts/voice-broadcast-config";
import {
  buildWorkoutSessionListView,
  getRelevantExerciseStep,
} from "@/lib/shared/workouts/session-flow";
import type { Exercise } from "@/lib/shared/exercises/types";

const voiceSettingsRanges = {
  beepVolume: { max: 1, min: 0, step: 0.05 },
  pitch: { max: 1.5, min: 0.5, step: 0.05 },
  rate: { max: 1.35, min: 0.65, step: 0.05 },
  volume: { max: 1, min: 0, step: 0.05 },
};

type VoiceApiBrowserKey = "chrome" | "edge" | "firefox" | "safari" | "iosSafari";

type VoiceApiBrowserSupport = {
  browser: VoiceApiBrowserKey;
  label: string;
  version: string;
};

type SessionSectionDividerMeta = {
  badgeClassName: string;
  icon: string;
  lineClassName: string;
  title: string;
};

type WorkoutCompletionConfettiPiece = {
  color: string;
  delay: string;
  duration: string;
  height: string;
  rotate: string;
  width: string;
  xEnd: string;
  xStart: string;
};

type WorkoutCompletionConfettiStyle = CSSProperties & Record<`--${string}`, string>;

const sessionSectionDividerMeta: Record<WorkoutSection, SessionSectionDividerMeta> = {
  warmup: {
    badgeClassName: "border-warning-text/15 bg-warning-soft text-warning-text",
    icon: "local_fire_department",
    lineClassName: "bg-warning-text/20",
    title: "热身",
  },
  training: {
    badgeClassName: "border-primary/15 bg-primary-soft text-primary",
    icon: "fitness_center",
    lineClassName: "bg-primary/20",
    title: "正式训练",
  },
  stretch: {
    badgeClassName: "border-success-text/15 bg-success-soft text-success-text",
    icon: "self_improvement",
    lineClassName: "bg-success-text/20",
    title: "拉伸",
  },
};

const workoutCompletionConfettiPieces: WorkoutCompletionConfettiPiece[] = [
  { color: "#2459E6", delay: "0s", duration: "1.55s", height: "12px", rotate: "180deg", width: "7px", xEnd: "-38vw", xStart: "-8vw" },
  { color: "#14B8A6", delay: "0.04s", duration: "1.68s", height: "10px", rotate: "-210deg", width: "10px", xEnd: "-28vw", xStart: "-4vw" },
  { color: "#F59E0B", delay: "0.08s", duration: "1.5s", height: "14px", rotate: "260deg", width: "6px", xEnd: "-18vw", xStart: "-2vw" },
  { color: "#E5484D", delay: "0.02s", duration: "1.72s", height: "9px", rotate: "-160deg", width: "9px", xEnd: "-10vw", xStart: "-1vw" },
  { color: "#8B5CF6", delay: "0.1s", duration: "1.62s", height: "13px", rotate: "220deg", width: "7px", xEnd: "0vw", xStart: "0vw" },
  { color: "#22C55E", delay: "0.06s", duration: "1.58s", height: "10px", rotate: "-240deg", width: "8px", xEnd: "11vw", xStart: "1vw" },
  { color: "#EC4899", delay: "0.12s", duration: "1.76s", height: "12px", rotate: "300deg", width: "6px", xEnd: "20vw", xStart: "3vw" },
  { color: "#0EA5E9", delay: "0.16s", duration: "1.66s", height: "8px", rotate: "-190deg", width: "11px", xEnd: "30vw", xStart: "5vw" },
  { color: "#F97316", delay: "0.2s", duration: "1.8s", height: "14px", rotate: "250deg", width: "7px", xEnd: "39vw", xStart: "8vw" },
  { color: "#84CC16", delay: "0.18s", duration: "1.52s", height: "9px", rotate: "-280deg", width: "9px", xEnd: "-34vw", xStart: "-6vw" },
  { color: "#06B6D4", delay: "0.24s", duration: "1.7s", height: "13px", rotate: "210deg", width: "6px", xEnd: "-22vw", xStart: "-3vw" },
  { color: "#F43F5E", delay: "0.28s", duration: "1.6s", height: "10px", rotate: "-230deg", width: "10px", xEnd: "26vw", xStart: "4vw" },
];

// 语音设置弹窗只展示 Web Speech 语音合成所需的最低浏览器版本。
const webSpeechMinimumBrowserRequirements: VoiceApiBrowserSupport[] = [
  { browser: "chrome", label: "Chrome", version: "33+" },
  { browser: "edge", label: "Edge", version: "14+" },
  { browser: "firefox", label: "Firefox", version: "49+" },
  { browser: "safari", label: "Safari", version: "7+" },
  { browser: "iosSafari", label: "iOS Safari", version: "7+" },
];

const fallbackPlan: WorkoutSchedule = {
  id: "session-fallback",
  date: "today",
  routineId: "fat-burn-circuit",
  title: "燃脂循环训练",
  status: "planned",
  minutes: 45,
  calories: 280,
  items: [
    createFallbackItem("jumping-jack", "开合跳", "Jumping Jack", "有氧", 45, "duration"),
    createFallbackItem("squat", "深蹲", "Squat", "力量", 45, "duration", ["股四头肌", "臀肌"]),
    createFallbackItem("push-up", "俯卧撑", "Push-up", "力量", 45, "duration", ["胸部", "肱三头肌"]),
    createFallbackItem("mountain-climber", "登山跑", "Mountain Climber", "有氧", 45, "duration", ["核心", "肩部"]),
    createFallbackItem("plank", "平板支撑", "Plank", "核心", 45, "duration", ["腹直肌", "腹横肌"]),
  ],
};

function createFallbackItem(
  id: string,
  nameZh: string,
  nameEn: string,
  categoryZh: string,
  target: number,
  mode: WorkoutMode,
  musclesZh = ["综合"],
): WorkoutItem {
  return {
    id,
    exerciseId: id,
    nameZh,
    nameEn,
    categoryZh,
    equipmentZh: "自重",
    musclesZh,
    instructionsZh: ["保持核心收紧，动作标准，注意呼吸节奏。"],
    imageUrl: placeholderWorkoutImage,
    mode,
    target,
    sets: 1,
    setRestSeconds: defaultSetRestSeconds,
    transitionRestSeconds: defaultTransitionRestSeconds,
  };
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getWorkoutDemoImageIndex(imageCount: number, elapsedSeconds: number, mode: WorkoutMode) {
  if (imageCount <= 1) {
    return 0;
  }

  if (mode === "duration") {
    return imageCount - 1;
  }

  return Math.floor(Math.max(0, elapsedSeconds)) % imageCount;
}

async function getScheduleFromDatabase(scheduleId: string) {
  const matchedPlan = await getWorkoutSchedule(scheduleId);

  if (matchedPlan && matchedPlan.items.length) {
    const loopConfig = getWorkoutLoopConfig(matchedPlan);
    return {
      ...matchedPlan,
      items: matchedPlan.items.map(normalizeWorkoutItem),
      trainingLoopRestSeconds: loopConfig.trainingLoopRestSeconds,
      trainingLoopRounds: loopConfig.trainingLoopRounds,
    };
  }

  throw new Error("Workout schedule has no items.");
}

function mapWorkoutItemToExercise(item: WorkoutItem): Exercise {
  const imageUrls = getWorkoutItemImageUrls(item);
  const primaryMusclesZh = item.musclesZh.filter(Boolean);

  return {
    id: item.exerciseId || item.id,
    source: "workout-session",
    sourceUrl: "",
    sourceId: item.exerciseId || item.id,
    license: "",
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    category: null,
    categoryZh: item.categoryZh || null,
    level: null,
    levelZh: null,
    force: null,
    forceZh: null,
    mechanic: null,
    mechanicZh: null,
    equipment: null,
    equipmentZh: item.equipmentZh || null,
    homeRequirement: "unknown",
    homeRequirementZh: "未标注",
    primaryMuscles: [],
    primaryMusclesZh,
    secondaryMuscles: [],
    secondaryMusclesZh: [],
    instructionsEn: [],
    instructionsZh: item.instructionsZh,
    images: imageUrls,
    imageUrls,
    riskTags: [],
    goalTags: [],
    reviewStatus: "fallback",
    isPublished: true,
  };
}

// 语音设置弹窗只重排展示顺序，保存和播报仍使用浏览器提供的 voiceURI。
function sortWorkoutVoiceOptions(voices: SpeechSynthesisVoice[]) {
  return voices
    .map((voice, index) => ({ index, priority: getWorkoutVoicePriority(voice), voice }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ voice }) => voice);
}

function getWorkoutVoicePriority(voice: SpeechSynthesisVoice) {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();

  if (lang === "zh-cn") {
    return 0;
  }

  if (
    lang.startsWith("zh-") ||
    lang === "zh" ||
    name.includes("chinese") ||
    name.includes("mandarin") ||
    voice.name.includes("中文") ||
    voice.name.includes("普通话")
  ) {
    return 1;
  }

  return 2;
}

// 语音设置弹窗沿用动作详情抽屉的全局背景缩放类，但由弹窗自己的打开/关闭时序控制。
function setVoiceSettingsBackdropActive(isActive: boolean) {
  if (isActive) {
    document.body.style.overflow = "hidden";
    document.body.classList.add("drawer-open");
    return;
  }

  document.body.style.overflow = "";
  document.body.classList.remove("drawer-open");
}

export function WorkoutSessionPage() {
  const searchParams = useSearchParams();
  const scheduleId = searchParams.get("scheduleId")?.trim() ?? "";
  const [plan, setPlan] = useState<WorkoutSchedule>(fallbackPlan);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(45);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [executionState, setExecutionState] = useState(() => createIdleWorkoutExecutionState());
  const [hasStarted, setHasStarted] = useState(false);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [isElapsedTimerManuallyPaused, setIsElapsedTimerManuallyPaused] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [loadedPlanKey, setLoadedPlanKey] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isVoicePreferenceLoaded, setIsVoicePreferenceLoaded] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [showVoiceTip, setShowVoiceTip] = useState(false);
  const [isExerciseDetailOpen, setIsExerciseDetailOpen] = useState(false);
  const [isVoiceSelfChecking, setIsVoiceSelfChecking] = useState(false);
  const [voiceSelfCheckResult, setVoiceSelfCheckResult] = useState<WorkoutVoiceSelfCheckResult | null>(null);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<WorkoutVoiceBroadcastUserSettings>(
    defaultWorkoutVoiceBroadcastUserSettings,
  );
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isVoiceSettingsClosing, setIsVoiceSettingsClosing] = useState(false);
  const voiceSettingsCloseTimerRef = useRef<number | null>(null);
  const voiceSettingsOpenFrameRef = useRef<number | null>(null);
  const voiceSettingsOpenNextFrameRef = useRef<number | null>(null);

  const loopConfig = useMemo(() => getWorkoutLoopConfig(plan), [plan]);
  const voiceBroadcastConfig = useMemo(
    () => buildWorkoutVoiceBroadcastConfig(voiceSettings),
    [voiceSettings],
  );
  const sortedAvailableVoices = useMemo(
    () => sortWorkoutVoiceOptions(availableVoices),
    [availableVoices],
  );
  const steps = useMemo(
    () => buildWorkoutTimeline(plan.items, loopConfig),
    [loopConfig, plan.items],
  );
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const activeExerciseStep = activeStep?.type === "exercise" ? activeStep : null;
  const activeRestStep = activeStep?.type === "rest" ? activeStep : null;
  const isRestStep = Boolean(activeRestStep);
  const sessionListView = useMemo(
    () => buildWorkoutSessionListView({ activeStepIndex, steps, trainingLoopRounds: loopConfig.trainingLoopRounds }),
    [activeStepIndex, loopConfig.trainingLoopRounds, steps],
  );
  const currentListItem = sessionListView.items.find((item) => item.isActive) ?? sessionListView.items[0];
  const relevantExerciseStep = getRelevantExerciseStep(steps, activeStepIndex);
  const currentItem =
    activeExerciseStep
      ? activeExerciseStep.item
      : relevantExerciseStep?.step.item ?? activeRestStep?.afterItem ?? fallbackPlan.items[0];
  // 休息态的示范图是准备提示，不跟随休息倒计时轮换。
  const demoItem = activeRestStep?.nextItem ?? currentItem;
  const demoHeading = isRestStep && activeRestStep?.nextItem ? "下一组动作" : "动作示范";
  const isTimedStep = currentItem.mode === "duration";
  const repIntervalSeconds = getRepIntervalSeconds(currentItem);
  const stepElapsedSeconds = activeStep ? activeStep.durationSeconds - remainingSeconds : 0;
  const completedReps = isRestStep || isTimedStep
    ? 0
    : Math.min(currentItem.target, Math.floor(Math.max(0, stepElapsedSeconds) / repIntervalSeconds));
  const completedStepIds = new Set(steps.slice(0, activeStepIndex).map((step) => step.id));
  const currentExerciseIndex = currentListItem?.displayIndex ?? relevantExerciseStep?.step.itemIndex ?? 0;
  const progress =
    activeStep && activeStep.durationSeconds > 0
      ? ((activeStep.durationSeconds - remainingSeconds) / activeStep.durationSeconds) * 100
      : 0;
  const demoImageUrls = getWorkoutItemImageUrls(demoItem);
  const demoImageIndex = isRestStep ? 0 : getWorkoutDemoImageIndex(demoImageUrls.length, stepElapsedSeconds, demoItem.mode);
  const activeDemoImageUrl = demoImageUrls[demoImageIndex] ?? placeholderWorkoutImage;
  const currentExerciseDetail = useMemo(() => mapWorkoutItemToExercise(demoItem), [demoItem]);
  const trainedCalories = Math.min(
    estimateWorkoutCalories(plan.items, loopConfig),
    Math.round(Math.max(0, elapsedSeconds / 60) * 7.2 + completedStepIds.size * 8),
  );
  const sessionResultSnapshotRef = useRef({
    elapsedSeconds: 0,
    planId: fallbackPlan.id,
    sessionStartedAt: null as Date | null,
    steps: [] as WorkoutTimelineStep[],
    trainedCalories: 0,
  });
  const sessionProgress = isSessionComplete
    ? 100
    : steps.length
      ? ((activeStepIndex + Math.max(0, Math.min(1, progress / 100))) / steps.length) * 100
      : 0;
  const nextExerciseStep =
    sessionListView.nextExerciseStepIndex === null ? null : steps[sessionListView.nextExerciseStepIndex];
  const nextItem = nextExerciseStep?.type === "exercise" ? nextExerciseStep.item : null;
  const remainingSteps = Math.max(0, steps.length - activeStepIndex - 1);
  const requestedPlanKey = scheduleId;
  const sessionVoiceId = `${plan.id}:${plan.date}:${plan.routineId ?? "rest"}`;
  const activeStepKey = buildWorkoutExecutionStepKey(sessionVoiceId, activeStep, activeStepIndex);
  const isPlanReady = Boolean(scheduleId && !loadError && loadedPlanKey === requestedPlanKey);
  const preparationCountdown = executionState.stepKey === activeStepKey ? executionState.preparationCountdown : 0;
  const isPaused = isWorkoutExecutionPaused(executionState);
  const isPreparationCountdownActive = isWorkoutPreparationCountdownActive(executionState, activeStepKey);
  const isPreparing = Boolean(
    hasStarted &&
    activeStep?.type === "exercise" &&
    isWorkoutExecutionPreparingForStep(executionState, activeStepKey),
  );
  const canRunActiveStep = canWorkoutExecutionRunStep(executionState, activeStepKey, activeStep?.type);
  const isAwaitingStart = isPlanReady && !hasStarted && !isSessionComplete;
  const displayedStepCount = Math.max(1, steps.length);
  const displayedStepIndex = isSessionComplete ? displayedStepCount : activeStepIndex + 1;

  useEffect(() => {
    sessionResultSnapshotRef.current = {
      elapsedSeconds,
      planId: plan.id,
      sessionStartedAt,
      steps,
      trainedCalories,
    };
  }, [elapsedSeconds, plan.id, sessionStartedAt, steps, trainedCalories]);

  useEffect(() => {
    let cancelled = false;
    let resetTimer: number | undefined;
    const requestKey = scheduleId;

    if (!requestKey) {
      resetTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setLoadedPlanKey("");
        setLoadError("缺少训练安排参数，请从训练计划页面进入训练。");
        setHasStarted(false);
        setIsSessionComplete(false);
        setIsElapsedTimerManuallyPaused(false);
        setExecutionState(createWorkoutExecutionLoadError("missing schedule id"));
        setElapsedSeconds(0);
        setSessionStartedAt(null);
        setActiveStepIndex(0);
        setRemainingSeconds(0);
        setIsExerciseDetailOpen(false);
      }, 0);

      return () => {
        cancelled = true;
        if (resetTimer) {
          window.clearTimeout(resetTimer);
        }
      };
    }

    void getScheduleFromDatabase(requestKey).then((selectedPlan) => {
      if (cancelled) {
        return;
      }

      const selectedLoopConfig = getWorkoutLoopConfig(selectedPlan);
      const selectedSteps = buildWorkoutTimeline(selectedPlan.items, selectedLoopConfig);

      setPlan({
        ...selectedPlan,
        minutes:
          selectedPlan.minutes ||
          estimateWorkoutMinutes(selectedPlan.items, selectedLoopConfig),
        calories:
          selectedPlan.calories ||
          estimateWorkoutCalories(selectedPlan.items, selectedLoopConfig),
      });
      setLoadError("");
      setActiveStepIndex(0);
      setElapsedSeconds(0);
      setSessionStartedAt(null);
      setRemainingSeconds(selectedSteps[0]?.durationSeconds ?? 45);
      setExecutionState((current) => createIdleWorkoutExecutionState(current.version + 1));
      setHasStarted(false);
      setIsSessionComplete(false);
      setIsElapsedTimerManuallyPaused(false);
      setLoadedPlanKey(requestKey);
      setIsExerciseDetailOpen(false);
    }).catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      console.error("[TrainingSession] Load failed:", error);
      setLoadedPlanKey("");
      setLoadError("训练安排加载失败，请从训练计划页面重新进入。");
      setExecutionState(createWorkoutExecutionLoadError("load failed"));
      setIsSessionComplete(false);
    });

    return () => {
      cancelled = true;
    };
  }, [scheduleId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canUseVoiceBroadcast = isWorkoutVoiceBroadcastSupported();
      const savedAudioPreference = canUseVoiceBroadcast && readWorkoutVoiceBroadcastPreference();
      const hasSeenVoiceTip = readWorkoutVoiceBroadcastTipSeen();

      setIsAudioOn(savedAudioPreference);
      setVoiceSettings(readWorkoutVoiceBroadcastSettings());
      if (canUseVoiceBroadcast && !savedAudioPreference && !hasSeenVoiceTip) {
        setShowVoiceTip(true);
        writeWorkoutVoiceBroadcastTipSeen();
      }
      setIsVoicePreferenceLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isWorkoutVoiceBroadcastSupported()) {
      return;
    }

    const loadVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    const refreshTimer = window.setTimeout(loadVoices, 500);
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);

    return () => {
      window.clearTimeout(refreshTimer);
      window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (voiceSettingsCloseTimerRef.current !== null) {
        window.clearTimeout(voiceSettingsCloseTimerRef.current);
      }
      if (voiceSettingsOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(voiceSettingsOpenFrameRef.current);
      }
      if (voiceSettingsOpenNextFrameRef.current !== null) {
        window.cancelAnimationFrame(voiceSettingsOpenNextFrameRef.current);
      }
      setVoiceSettingsBackdropActive(false);
    };
  }, []);

  const openVoiceSettings = useCallback(() => {
    if (voiceSettingsCloseTimerRef.current !== null) {
      window.clearTimeout(voiceSettingsCloseTimerRef.current);
      voiceSettingsCloseTimerRef.current = null;
    }
    if (voiceSettingsOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceSettingsOpenFrameRef.current);
      voiceSettingsOpenFrameRef.current = null;
    }
    if (voiceSettingsOpenNextFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceSettingsOpenNextFrameRef.current);
      voiceSettingsOpenNextFrameRef.current = null;
    }

    setIsVoiceSettingsClosing(true);
    setIsVoiceSettingsOpen(true);
    document.body.style.overflow = "hidden";
    voiceSettingsOpenFrameRef.current = window.requestAnimationFrame(() => {
      setVoiceSettingsBackdropActive(true);
      voiceSettingsOpenNextFrameRef.current = window.requestAnimationFrame(() => {
        setIsVoiceSettingsClosing(false);
        voiceSettingsOpenFrameRef.current = null;
        voiceSettingsOpenNextFrameRef.current = null;
      });
    });
  }, []);

  const closeVoiceSettings = useCallback(() => {
    if (voiceSettingsCloseTimerRef.current !== null) {
      window.clearTimeout(voiceSettingsCloseTimerRef.current);
    }
    if (voiceSettingsOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceSettingsOpenFrameRef.current);
      voiceSettingsOpenFrameRef.current = null;
    }
    if (voiceSettingsOpenNextFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceSettingsOpenNextFrameRef.current);
      voiceSettingsOpenNextFrameRef.current = null;
    }

    setIsVoiceSettingsClosing(true);
    setVoiceSettingsBackdropActive(false);
    voiceSettingsCloseTimerRef.current = window.setTimeout(() => {
      setIsVoiceSettingsOpen(false);
      setIsVoiceSettingsClosing(false);
      voiceSettingsCloseTimerRef.current = null;
    }, 500);
  }, []);

  const markPreparationIntroComplete = useCallback((stepKey: string) => {
    if (!stepKey || stepKey !== activeStepKey) {
      return;
    }

    setExecutionState((current) => markWorkoutPreparationIntroComplete(current, stepKey));
  }, [activeStepKey]);

  const voiceSession = useWorkoutVoiceBroadcast({
    activeStepIndex,
    completedReps,
    config: voiceBroadcastConfig,
    isFirstExerciseStep: activeStepIndex === 0,
    isPaused,
    isPreferenceEnabled: isPlanReady && isAudioOn && isVoicePreferenceLoaded,
    isSessionStarted: hasStarted && !isSessionComplete,
    onPreparationIntroComplete: markPreparationIntroComplete,
    executionState,
    remainingSeconds,
    sessionId: sessionVoiceId,
    steps,
  });
  const isVoiceSupported = voiceSession.isSupported;
  const isVoicePreferenceOn = isVoiceSupported && isAudioOn;
  const voiceStatus = isVoiceSupported ? voiceSession.status : "unsupported";
  const isVoiceBroadcastActive =
    isVoicePreferenceOn && (voiceStatus === "active" || voiceStatus === "speaking" || voiceStatus === "activating");
  const shouldShowVoiceFirstTip = isVoicePreferenceLoaded && showVoiceTip && !isVoicePreferenceOn;

  const handleVoiceButtonClick = useCallback(() => {
    const toggleIntent = resolveWorkoutVoiceToggleIntent({
      isPreferenceOn: isVoicePreferenceOn,
      isSupported: isVoiceSupported,
    });

    if (toggleIntent === "unavailable") {
      return;
    }

    if (toggleIntent === "enable") {
      setIsAudioOn(true);
      setShowVoiceTip(false);
      writeWorkoutVoiceBroadcastPreference(true);
      voiceSession.activateCurrentStep(true, { includeCurrentStepPrompt: false });
      return;
    }

    voiceSession.disableVoiceSession();
    setIsAudioOn(false);
    setShowVoiceTip(false);
    writeWorkoutVoiceBroadcastPreference(false);
  }, [isVoicePreferenceOn, isVoiceSupported, voiceSession]);

  const updateVoiceSetting = useCallback((patch: Partial<WorkoutVoiceBroadcastUserSettings>) => {
    setVoiceSettings((current) => {
      const nextSettings = normalizeWorkoutVoiceBroadcastUserSettings({ ...current, ...patch });
      writeWorkoutVoiceBroadcastSettings(nextSettings);

      return nextSettings;
    });
  }, []);

  const resetVoiceSettings = useCallback(() => {
    setVoiceSettings(defaultWorkoutVoiceBroadcastUserSettings);
    writeWorkoutVoiceBroadcastSettings(defaultWorkoutVoiceBroadcastUserSettings);
    setVoiceSelfCheckResult(null);
  }, []);

  const runVoiceSelfCheck = useCallback(() => {
    setIsVoiceSelfChecking(true);
    setVoiceSelfCheckResult(null);

    void runWorkoutVoiceSelfCheck({
      onDiagnostic: logVoiceSelfCheckDiagnostic,
    }, voiceBroadcastConfig).then((result) => {
      setVoiceSelfCheckResult(result);
    }).catch((error: unknown) => {
      console.error("[WorkoutVoiceCheck] failed", error);
      setVoiceSelfCheckResult({
        elapsedMs: 0,
        ended: false,
        error: error instanceof Error ? error.message : "unknown",
        events: ["speech-error"],
        reason: "speech_error",
        selectedVoice: "default",
        started: false,
        status: "error",
        steps: createFailedVoiceSelfCheckSteps(error),
        supported: isWorkoutVoiceBroadcastSupported(),
        text: "语音自检",
        voices: 0,
      });
    }).finally(() => {
      setIsVoiceSelfChecking(false);
    });
  }, [voiceBroadcastConfig]);

  // 每次进入新步骤时只在事件入口初始化准备阶段，避免 effect 根据派生状态再同步写 state。
  const prepareStepForSession = useCallback((step: WorkoutTimelineStep | undefined, stepIndex: number) => {
    setExecutionState((current) => createWorkoutStepExecutionState({
      sessionId: sessionVoiceId,
      step,
      stepIndex,
      version: current.version + 1,
    }));
  }, [sessionVoiceId]);

  const goToStep = useCallback((nextIndex: number, { cancelVoice = true }: { cancelVoice?: boolean } = {}) => {
    if (!steps.length) {
      return;
    }

    const boundedIndex = Math.min(Math.max(0, nextIndex), steps.length - 1);
    const nextStep = steps[boundedIndex];

    if (cancelVoice) {
      voiceSession.cancelCurrentVoice("step-change");
    }

    setIsSessionComplete(false);
    if (hasStarted) {
      prepareStepForSession(nextStep, boundedIndex);
    } else {
      setExecutionState((current) => createIdleWorkoutExecutionState(current.version + 1));
    }
    setActiveStepIndex(boundedIndex);
    setRemainingSeconds(nextStep?.durationSeconds ?? 45);
  }, [hasStarted, prepareStepForSession, steps, voiceSession]);

  const startTraining = useCallback(() => {
    setIsSessionComplete(false);
    prepareStepForSession(activeStep, activeStepIndex);
    setHasStarted(true);
    setIsElapsedTimerManuallyPaused(false);
    setSessionStartedAt((current) => current ?? new Date());

    if (isVoicePreferenceOn && isVoiceSupported && !isVoiceBroadcastActive) {
      voiceSession.activateCurrentStep(false, {
        executionPhase: activeStep?.type === "exercise" ? "preparing_intro" : "running_rest",
        includeActivationPrompt: false,
      });
    }
  }, [
    activeStep,
    activeStepIndex,
    isVoiceBroadcastActive,
    isVoicePreferenceOn,
    isVoiceSupported,
    prepareStepForSession,
    voiceSession,
  ]);

  // 页面完成态先于服务端记录完成，避免持久化失败影响本次训练的结束反馈。
  const completeWorkoutSession = useCallback(() => {
    const {
      elapsedSeconds: latestElapsedSeconds,
      planId,
      sessionStartedAt: latestSessionStartedAt,
      steps: latestSteps,
      trainedCalories: latestTrainedCalories,
    } = sessionResultSnapshotRef.current;

    voiceSession.cancelCurrentVoice("session-complete");
    setIsSessionComplete(true);
    setHasStarted(false);
    setIsElapsedTimerManuallyPaused(false);
    setExecutionState((current) => completeWorkoutExecution(current));
    setRemainingSeconds(0);

    const endedAt = new Date();
    const startedAt = latestSessionStartedAt ?? new Date(endedAt.getTime() - Math.max(0, latestElapsedSeconds) * 1000);
    const totalExerciseCount = latestSteps.filter((step) => step.type === "exercise").length;

    void saveWorkoutSessionResult(planId, {
      actualCalories: undefined,
      completedExerciseCount: totalExerciseCount,
      completedStepCount: latestSteps.length,
      durationSeconds: Math.max(0, latestElapsedSeconds),
      endedAt: endedAt.toISOString(),
      estimatedCalories: latestTrainedCalories,
      startedAt: startedAt.toISOString(),
      status: "completed",
      totalExerciseCount,
      totalStepCount: latestSteps.length,
    })
      .then(() => {
        setPlan((current) => ({ ...current, status: "completed" }));
      })
      .catch((error: unknown) => {
        console.error("[TrainingSession] Finish failed:", error);
      });
  }, [voiceSession]);

  const completeCurrentStep = useCallback(({ cancelVoice = true }: { cancelVoice?: boolean } = {}) => {
    const isLastStep = activeStepIndex >= steps.length - 1;

    if (isLastStep) {
      completeWorkoutSession();
      return;
    }

    goToStep(activeStepIndex + 1, { cancelVoice });
  }, [activeStepIndex, completeWorkoutSession, goToStep, steps.length]);

  const toggleManualPause = useCallback(() => {
    const nextPaused = !isPaused;

    setExecutionState((current) => (
      nextPaused ? pauseWorkoutExecution(current) : resumeWorkoutExecution(current)
    ));
    setIsElapsedTimerManuallyPaused(nextPaused);
  }, [isPaused]);

  useEffect(() => {
    if (
      !hasStarted ||
      !isPlanReady ||
      !isVoicePreferenceLoaded ||
      isPaused ||
      executionState.status !== "preparing_intro" ||
      executionState.stepKey !== activeStepKey ||
      !activeStepKey
    ) {
      return;
    }

    const fallbackDelay =
      isVoicePreferenceOn && voiceStatus !== "failed" && voiceStatus !== "unsupported"
        ? voiceBroadcastConfig.fallback.speechCompletionFallbackMaxMs + 250
        : voiceBroadcastConfig.fallback.silentPreparationDelayMs;
    const timer = window.setTimeout(() => markPreparationIntroComplete(activeStepKey), fallbackDelay);

    return () => window.clearTimeout(timer);
  }, [
    activeStepKey,
    executionState.status,
    executionState.stepKey,
    hasStarted,
    isPaused,
    isPlanReady,
    isVoicePreferenceLoaded,
    isVoicePreferenceOn,
    markPreparationIntroComplete,
    voiceBroadcastConfig.fallback.silentPreparationDelayMs,
    voiceBroadcastConfig.fallback.speechCompletionFallbackMaxMs,
    voiceStatus,
  ]);

  useEffect(() => {
    if (
      !hasStarted ||
      !isPlanReady ||
      isPaused ||
      executionState.status !== "preparing_countdown" ||
      executionState.stepKey !== activeStepKey ||
      preparationCountdown <= 0
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setExecutionState((current) => tickWorkoutPreparationCountdown(current, activeStepKey));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [
    activeStepKey,
    executionState.status,
    executionState.stepKey,
    hasStarted,
    isPaused,
    isPlanReady,
    preparationCountdown,
  ]);

  useEffect(() => {
    if (!hasStarted || !isPlanReady || isElapsedTimerManuallyPaused) {
      return;
    }

    // 总训练时长独立于步骤状态，只有用户手动暂停时才停止。
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasStarted, isElapsedTimerManuallyPaused, isPlanReady]);

  useEffect(() => {
    if (!hasStarted || isPaused || !canRunActiveStep || !activeStep) {
      return;
    }

    const timer = window.setInterval(() => {
      if (remainingSeconds <= 1) {
        completeCurrentStep({ cancelVoice: false });
        return;
      }

      setRemainingSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeStep, canRunActiveStep, completeCurrentStep, hasStarted, isPaused, remainingSeconds]);

  const openCurrentExerciseDetail = useCallback(() => {
    setExecutionState((current) => pauseWorkoutExecution(current));
    setIsExerciseDetailOpen(true);
  }, []);

  function finishTraining() {
    completeWorkoutSession();
  }

  if (loadError) {
    return (
      <TrainingSessionMessage
        actionHref="/plans"
        actionLabel="返回训练计划"
        icon="error"
        title="无法开始训练"
        description={loadError}
      />
    );
  }

  if (!isPlanReady) {
    return (
      <TrainingSessionMessage
        actionHref="/plans"
        actionLabel="返回训练计划"
        icon="hourglass_empty"
        title="正在加载训练"
        description="正在读取训练安排。"
      />
    );
  }

  return (
    <main className="custom-scrollbar app-mesh-bg h-dvh overflow-y-auto text-ink xl:overflow-hidden">
      <div className="flex min-h-dvh flex-col gap-sm px-md py-sm md:px-lg md:py-md xl:h-dvh xl:min-h-0 2xl:px-xl">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-sm rounded-[20px] border border-line bg-white px-md py-xs shadow-card md:px-lg">
          <Link
            className="flex min-h-11 items-center gap-sm rounded-xl px-sm text-body-md font-extrabold text-ink transition-colors hover:bg-panel-soft hover:text-primary"
            href="/plans"
          >
            <SymbolIcon className="text-2xl">arrow_back</SymbolIcon>
            训练中
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-md md:max-w-[520px]">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-soft">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.max(2, Math.min(100, sessionProgress))}%` }}
              />
            </div>
            <span className="shrink-0 text-label-md font-bold text-muted">
              {displayedStepIndex}/{displayedStepCount}
            </span>
          </div>
          <div className="flex items-center gap-sm">
            <button
              aria-label="打开语音设置"
              className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-muted transition-colors hover:bg-panel-soft hover:text-primary"
              onClick={openVoiceSettings}
              type="button"
            >
              <SymbolIcon className="text-2xl">settings</SymbolIcon>
            </button>
            <div className="relative">
              <button
                aria-label={getWorkoutVoiceToggleLabel({
                  isPreferenceOn: isVoicePreferenceOn,
                  isSupported: isVoiceSupported,
                })}
                className={`grid h-11 w-11 place-items-center rounded-xl border transition-colors ${
                  !isVoiceSupported
                    ? "cursor-not-allowed border-line bg-panel-soft text-muted"
                    : isVoicePreferenceOn
                    ? "border-primary/20 bg-primary-soft text-primary"
                    : showVoiceTip
                      ? "border-primary bg-primary-soft text-primary shadow-lift ring-4 ring-primary/15"
                    : "border-line bg-white text-muted hover:text-primary"
                }`}
                data-workout-voice-button
                disabled={!isVoiceSupported}
                onClick={handleVoiceButtonClick}
                type="button"
              >
                <SymbolIcon className="text-2xl">
                  {isVoiceSupported && isVoicePreferenceOn ? "volume_up" : "volume_off"}
                </SymbolIcon>
              </button>
              {shouldShowVoiceFirstTip ? (
                <VoiceTipBubble
                  actionLabel="开启"
                  description="点这里开启动作播报、倒计时和计次提示。"
                  icon="campaign"
                  onDismiss={() => setShowVoiceTip(false)}
                  onPrimaryAction={handleVoiceButtonClick}
                  title="语音播报"
                  tone="primary"
                />
              ) : null}
            </div>
            {!isSessionComplete ? (
              <button
                aria-label="结束训练"
                className="grid h-11 w-11 place-items-center rounded-xl border border-red-200 bg-white text-danger transition-colors hover:bg-red-50"
                onClick={finishTraining}
                type="button"
              >
                <SymbolIcon className="text-2xl">stop</SymbolIcon>
              </button>
            ) : null}
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-sm xl:grid-cols-[minmax(260px,0.86fr)_minmax(390px,1.28fr)_minmax(280px,0.82fr)]">
          <aside className="flex min-h-0 flex-col gap-sm">
            <section className="rounded-[20px] border border-line bg-white p-md shadow-card">
              <div className="mb-sm flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="text-label-md font-bold text-primary">当前计划</p>
                  <h1 className="mt-xs truncate text-[20px] font-extrabold leading-tight">{plan.title}</h1>
                </div>
                <span className="rounded-full bg-primary-soft px-md py-xs text-label-md font-bold text-primary">
                  {isSessionComplete
                    ? "已完成"
                    : isAwaitingStart
                    ? "待开始"
                    : isPaused
                    ? "已暂停"
                    : isPreparing
                    ? "准备中"
                    : "进行中"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-sm">
                <Metric icon="schedule" label="已训练" value={formatClock(elapsedSeconds)} />
                <Metric icon="local_fire_department" label="热量" suffix="kcal" value={trainedCalories} />
                <Metric icon="repeat" label="剩余" suffix="步" value={remainingSteps} />
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line bg-white p-md shadow-card">
              <div className="mb-sm flex items-center justify-between gap-md">
                <div>
                  <p className="text-label-md font-bold text-primary">{demoHeading}</p>
                  <h2 className="text-title-lg font-extrabold">{demoItem.nameZh}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-xs">
                  <button
                    className="flex h-9 items-center gap-xs rounded-xl border border-primary/20 bg-white px-sm text-label-md font-extrabold text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
                    onClick={openCurrentExerciseDetail}
                    type="button"
                  >
                    <SymbolIcon className="text-lg">info</SymbolIcon>
                    动作详情
                  </button>
                  <span className="rounded-xl bg-panel-soft px-sm py-xs text-label-md font-bold text-muted">
                    {Math.max(1, currentExerciseIndex + 1)}/{sessionListView.items.length}
                  </span>
                </div>
              </div>
              <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl bg-panel-soft">
                {activeDemoImageUrl && activeDemoImageUrl !== placeholderWorkoutImage ? (
                  <>
                    <Image
                      alt={`${demoItem.nameZh} 动作图`}
                      className="object-contain p-md"
                      fill
                      key={`${demoItem.id}-${demoImageIndex}-${activeDemoImageUrl}`}
                      priority={activeStepIndex === 0}
                      sizes="(min-width: 1280px) 30vw, 100vw"
                      src={activeDemoImageUrl}
                    />
                    {demoImageUrls.length > 1 ? (
                      <div className="absolute bottom-sm right-sm rounded-full border border-white/80 bg-white/90 px-sm py-xs text-label-md font-extrabold text-muted shadow-sm">
                        {demoImageIndex + 1}/{demoImageUrls.length}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <SquatIllustration />
                )}
              </div>
            </section>
          </aside>

          <section className="relative isolate flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-[20px] border border-line bg-white px-lg py-lg text-center shadow-card">
            {isSessionComplete ? (
              <>
                <WorkoutCompletionConfetti />
                <span className="relative z-10 mb-md grid h-20 w-20 place-items-center rounded-full bg-success-soft text-success-text ring-1 ring-success-text/15">
                  <SymbolIcon className="text-5xl" filled>
                    check
                  </SymbolIcon>
                </span>
                <h2 className="relative z-10 max-w-[680px] text-[30px] font-extrabold leading-tight text-ink md:text-[38px]">
                  恭喜，已完成本次训练
                </h2>
              </>
            ) : (
              <>
                <span className="mb-sm inline-flex items-center gap-xs rounded-full bg-primary-soft px-md py-xs text-label-md font-bold text-primary">
                  <SymbolIcon className="text-lg">
                    {isAwaitingStart ? "play_arrow" : isPreparing ? "timer" : isRestStep ? "timer" : isTimedStep ? "timer" : "format_list_numbered"}
                  </SymbolIcon>
                  {isAwaitingStart
                    ? "点击开始后训练"
                    : isPreparing
                    ? "准备开始"
                    : isRestStep
                    ? activeRestStep?.label
                    : `${isTimedStep ? "计时步骤" : "计次步骤"} · 第 ${activeExerciseStep?.setIndex ?? 1} / ${
                        activeExerciseStep?.totalSets ?? 1
                      } 组`}
                </span>
                <h2 className="max-w-[680px] text-[30px] font-extrabold leading-tight text-ink md:text-[38px]">
                  {isAwaitingStart
                    ? currentItem.nameZh
                    : isPreparing
                    ? `${activeStepIndex === 0 ? "第一个动作" : "准备动作"}：${currentItem.nameZh}`
                    : isRestStep
                    ? activeRestStep?.label
                    : currentItem.nameZh}
                </h2>
                <p className="mt-sm text-body-lg font-semibold text-muted">
                  {isAwaitingStart
                    ? "准备好后点击开始"
                    : isPreparing
                    ? "倒计时结束后开始训练"
                    : isRestStep
                    ? nextItem
                      ? `下一个动作：${nextItem.nameZh}`
                      : "准备进入下一步"
                    : currentItem.musclesZh.slice(0, 3).join("、") || currentItem.categoryZh}
                </p>
              </>
            )}
            {!isSessionComplete && isAwaitingStart ? (
              <>
                <p className="my-md text-body-lg font-extrabold text-ink">
                  训练尚未开始，计时和语音会在点击开始后启动
                </p>
              </>
            ) : !isSessionComplete && isPreparing ? (
              <>
                <div className="my-md text-[clamp(92px,14vw,148px)] font-black leading-none text-primary [font-variant-numeric:tabular-nums]">
                  {isPreparationCountdownActive ? preparationCountdown : "准备"}
                </div>
                <p className="text-body-lg font-extrabold text-ink">
                  {isPreparationCountdownActive ? "保持姿势，准备开始动作" : "先听动作提示，再开始倒计时"}
                </p>
              </>
            ) : !isSessionComplete && isRestStep ? (
              <>
                <div className="my-md text-[clamp(76px,12vw,132px)] font-black leading-none text-ink [font-variant-numeric:tabular-nums]">
                  {formatClock(remainingSeconds)}
                </div>
                <p className="text-body-lg font-extrabold text-ink">
                  休息结束后自动进入下一步
                </p>
                <div className="mt-sm h-2.5 w-full max-w-[620px] overflow-hidden rounded-full bg-panel-soft">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
                  />
                </div>
              </>
            ) : !isSessionComplete && isTimedStep ? (
              <>
                <div className="my-md text-[clamp(76px,12vw,132px)] font-black leading-none text-ink [font-variant-numeric:tabular-nums]">
                  {formatClock(remainingSeconds)}
                </div>
                <p className="text-body-lg font-extrabold text-ink">
                  目标 {currentItem.target} 秒 · 倒计时结束后自动进入下一组
                </p>
                <div className="mt-sm h-2.5 w-full max-w-[620px] overflow-hidden rounded-full bg-panel-soft">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
                  />
                </div>
              </>
            ) : !isSessionComplete ? (
              <>
                <div className="my-md flex items-end justify-center gap-sm text-ink">
                  <span className="text-[clamp(92px,14vw,148px)] font-black leading-none [font-variant-numeric:tabular-nums]">
                    {completedReps}
                  </span>
                  <span className="pb-sm text-[34px] font-extrabold leading-none text-muted">
                    / {currentItem.target} 次
                  </span>
                </div>
                <p className="text-body-lg font-extrabold text-ink">
                  系统按每 {repIntervalSeconds} 秒 1 次自动计次，达到目标后进入下一组
                </p>
                <div className="mt-sm h-2.5 w-full max-w-[620px] overflow-hidden rounded-full bg-panel-soft">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
                  />
                </div>
              </>
            ) : null}
            {!isSessionComplete ? (
              <div className="mt-lg flex items-start justify-center gap-lg md:gap-xl">
                <SessionControl icon="skip_previous" label="上一个" onClick={() => goToStep(activeStepIndex - 1)} />
                {isAwaitingStart ? (
                  <SessionControl
                    icon="play_arrow"
                    label="开始"
                    large
                    onClick={startTraining}
                  />
                ) : (
                  <SessionControl
                    icon={isPaused ? "play_arrow" : "pause"}
                    label={isPaused ? "继续" : "暂停"}
                    large
                    onClick={toggleManualPause}
                  />
                )}
                <SessionControl
                  icon="skip_next"
                  label={isRestStep ? "跳过休息" : "下一个"}
                  onClick={() => {
                    if (hasStarted) {
                      completeCurrentStep();
                      return;
                    }

                    goToStep(activeStepIndex + 1);
                  }}
                />
              </div>
            ) : null}
          </section>

          <aside className="flex min-h-0 flex-col gap-sm">
            <section className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line bg-white p-md shadow-card">
              <div className="mb-sm flex items-center justify-between gap-md">
                <div>
                  <p className="text-label-md font-bold text-primary">训练项目</p>
                  <h2 className="text-title-lg font-extrabold">{sessionListView.items.length} 个动作</h2>
                </div>
                <SymbolIcon className="text-2xl text-muted">expand_less</SymbolIcon>
              </div>
              <div className="custom-scrollbar min-h-0 flex-1 space-y-sm overflow-y-auto pr-xs">
                {sessionListView.items.map((listItem, index) => {
                  const item = listItem.item;
                  const previousItem = sessionListView.items[index - 1];
                  const shouldShowSectionDivider = listItem.section !== previousItem?.section;
                  const sectionLoopLabel =
                    listItem.section === "training" && listItem.loopRound && listItem.loopRounds
                      ? `第 ${listItem.loopRound}/${listItem.loopRounds} 轮`
                      : undefined;
                  const shouldShowLoopDivider =
                    Boolean(listItem.loopRound && listItem.loopRounds) &&
                    listItem.loopRound !== previousItem?.loopRound &&
                    !shouldShowSectionDivider;

                  return (
                    <div className="space-y-xs" key={listItem.key}>
                      {shouldShowSectionDivider ? (
                        <SessionSectionDivider loopLabel={sectionLoopLabel} section={listItem.section} />
                      ) : null}
                      {shouldShowLoopDivider ? (
                        <div className="flex items-center gap-xs px-xs py-xs text-label-md font-extrabold text-primary">
                          <span className="h-px flex-1 bg-primary/20" />
                          <span className="rounded-full bg-primary-soft px-sm py-[3px] ring-1 ring-primary/15">
                            第 {listItem.loopRound}/{listItem.loopRounds} 轮
                          </span>
                          <span className="h-px flex-1 bg-primary/20" />
                        </div>
                      ) : null}
                      <button
                        className={`grid min-h-[64px] w-full grid-cols-[56px_1fr_32px] items-center gap-sm rounded-xl border p-xs text-left transition-colors ${
                          listItem.isActive
                            ? "border-primary/25 bg-primary-soft text-primary"
                            : "border-transparent bg-white hover:border-line hover:bg-panel-soft"
                        }`}
                        onClick={() => goToStep(listItem.targetStepIndex)}
                        type="button"
                      >
                        <ExerciseThumb item={item} index={listItem.displayIndex} />
                        <div className="min-w-0">
                          <p className="truncate text-body-md font-extrabold">{item.nameZh}</p>
                          <p className="truncate text-label-md font-semibold text-muted">
                            {item.mode === "duration" ? `${item.target} 秒` : `${item.target} 次`} · {item.sets}组
                            {listItem.isUpcomingFromRest ? " · 休息后进入" : ""}
                          </p>
                        </div>
                        <StepStatus
                          index={listItem.displayIndex}
                          isActive={listItem.isActive}
                          isDone={listItem.isDone}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {!isSessionComplete ? (
              <section className="shrink-0 rounded-[20px] border border-line bg-white p-md shadow-card">
                <div className="mb-sm flex items-center justify-between">
                  <h2 className="text-title-lg font-extrabold">训练控制</h2>
                  <span className="flex items-center gap-xs text-label-md font-bold text-muted">
                    <SymbolIcon className="text-lg">timer</SymbolIcon>
                    {plan.minutes || estimateWorkoutMinutes(plan.items, loopConfig)} 分钟
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-sm">
                  <button
                    className="flex h-11 items-center justify-center gap-xs rounded-xl border border-red-200 bg-white text-body-md font-extrabold text-danger transition-colors hover:bg-red-50"
                    onClick={finishTraining}
                    type="button"
                  >
                    <SymbolIcon className="text-lg">stop</SymbolIcon>
                    结束
                  </button>
                  <button
                    className="flex h-11 items-center justify-center gap-xs rounded-xl border border-primary/30 bg-white text-body-md font-extrabold text-primary transition-colors hover:bg-primary-soft"
                    onClick={() => {
                      if (hasStarted) {
                        completeCurrentStep();
                        return;
                      }

                      goToStep(activeStepIndex + 1);
                    }}
                    type="button"
                  >
                    <SymbolIcon className="text-lg">skip_next</SymbolIcon>
                    {isRestStep ? "跳过休息" : "下一个"}
                  </button>
                </div>
                {nextItem ? (
                  <div className="mt-sm rounded-xl bg-panel-soft p-sm">
                    <p className="text-label-md font-bold text-muted">下一个动作</p>
                    <p className="mt-xs truncate text-body-md font-extrabold">{nextItem.nameZh}</p>
                  </div>
                ) : null}
              </section>
            ) : null}
          </aside>
        </section>

        {showTip && !isSessionComplete ? (
          <section className="flex h-12 shrink-0 items-center gap-md overflow-hidden rounded-[20px] border border-primary/10 bg-primary-soft px-md text-body-md text-muted">
            <SymbolIcon className="text-2xl text-primary">tips_and_updates</SymbolIcon>
            <span className="font-extrabold text-primary">训练提示</span>
            <span className="min-w-0 flex-1 truncate">
              {currentItem.instructionsZh[0] || "保持核心收紧，动作标准，注意呼吸节奏，避免代偿。"}
            </span>
            <button
              aria-label="关闭提示"
              className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-white hover:text-ink"
              onClick={() => setShowTip(false)}
              type="button"
            >
              <SymbolIcon className="text-xl">close</SymbolIcon>
            </button>
          </section>
        ) : null}
      </div>
      <ExercisePreviewSheet
        exercise={currentExerciseDetail}
        isOpen={isExerciseDetailOpen}
        onClose={() => setIsExerciseDetailOpen(false)}
      />
      <VoiceSettingsDialog
        availableVoices={sortedAvailableVoices}
        isClosing={isVoiceSettingsClosing}
        isOpen={isVoiceSettingsOpen}
        isRunningSelfCheck={isVoiceSelfChecking}
        onClose={closeVoiceSettings}
        onResetSettings={resetVoiceSettings}
        onRunSelfCheck={runVoiceSelfCheck}
        onUpdateSettings={updateVoiceSetting}
        selfCheckResult={voiceSelfCheckResult}
        settings={voiceSettings}
      />
    </main>
  );
}

function Metric({
  icon,
  label,
  suffix,
  value,
}: {
  icon: string;
  label: string;
  suffix?: string;
  value: number | string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel-soft px-sm py-md">
      <p className="mb-xs flex items-center justify-center gap-xs text-label-sm font-semibold text-muted">
        <SymbolIcon className="text-lg text-muted">{icon}</SymbolIcon>
        {label}
      </p>
      <p className="truncate text-center text-[20px] font-black leading-tight text-ink [font-variant-numeric:tabular-nums]">
        {value} {suffix ? <span className="text-label-md font-bold">{suffix}</span> : null}
      </p>
    </div>
  );
}

// 完成态纸屑只表达本次页面训练结束，不参与训练流程状态计算。
function WorkoutCompletionConfetti() {
  return (
    <div aria-hidden className="workout-completion-confetti pointer-events-none absolute inset-0 z-0">
      {workoutCompletionConfettiPieces.map((piece, index) => (
        <span
          className="workout-completion-confetti-piece"
          key={`${piece.color}-${index}`}
          style={getWorkoutCompletionConfettiStyle(piece)}
        />
      ))}
    </div>
  );
}

function getWorkoutCompletionConfettiStyle(
  piece: WorkoutCompletionConfettiPiece,
): WorkoutCompletionConfettiStyle {
  return {
    "--confetti-color": piece.color,
    "--confetti-delay": piece.delay,
    "--confetti-duration": piece.duration,
    "--confetti-height": piece.height,
    "--confetti-rotate": piece.rotate,
    "--confetti-width": piece.width,
    "--confetti-x-end": piece.xEnd,
    "--confetti-x-start": piece.xStart,
  } as WorkoutCompletionConfettiStyle;
}

// 训练列表阶段分隔条用于把热身、正式训练和拉伸从视觉上拆开。
function SessionSectionDivider({ loopLabel, section }: { loopLabel?: string; section: WorkoutSection }) {
  const meta = sessionSectionDividerMeta[section];

  return (
    <div className="flex items-center gap-xs px-xs py-xs text-label-md font-extrabold">
      <span className={`h-px flex-1 ${meta.lineClassName}`} />
      <span
        className={`inline-flex items-center gap-[5px] rounded-full border px-sm py-[3px] ${meta.badgeClassName}`}
      >
        <SymbolIcon className="text-base">{meta.icon}</SymbolIcon>
        {meta.title}
        {loopLabel ? <span className="opacity-75">· {loopLabel}</span> : null}
      </span>
      <span className={`h-px flex-1 ${meta.lineClassName}`} />
    </div>
  );
}

function TrainingSessionMessage({
  actionHref,
  actionLabel,
  description,
  icon,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  description: string;
  icon: string;
  title: string;
}) {
  return (
    <main className="app-mesh-bg grid min-h-dvh place-items-center px-md text-ink">
      <section className="w-full max-w-[440px] rounded-[20px] border border-line bg-white p-lg text-center shadow-card">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
          <SymbolIcon className="text-3xl">{icon}</SymbolIcon>
        </span>
        <h1 className="mt-md text-title-lg font-extrabold">{title}</h1>
        <p className="mt-sm text-body-md font-semibold text-muted">{description}</p>
        <Link
          className="mt-lg inline-flex h-11 items-center justify-center rounded-xl bg-primary px-lg text-body-md font-extrabold text-white transition-colors hover:bg-primary-deep"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      </section>
    </main>
  );
}

function VoiceTipBubble({
  actionLabel,
  description,
  icon,
  onDismiss,
  onPrimaryAction,
  title,
  tone,
}: {
  actionLabel: string;
  description: string;
  icon: string;
  onDismiss?: () => void;
  onPrimaryAction: () => void;
  title: string;
  tone: "danger" | "primary";
}) {
  const isDanger = tone === "danger";

  return (
    <div
      className={`absolute right-0 top-[calc(100%+12px)] z-30 w-[268px] rounded-xl border p-md text-left shadow-lift ring-1 ${
        isDanger
          ? "border-red-200 bg-red-50 text-danger ring-red-100"
          : "border-primary/35 bg-primary-soft text-primary ring-primary/10"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute -top-[8px] right-5 h-4 w-4 [clip-path:polygon(50%_0,0_100%,100%_100%)] ${
          isDanger ? "bg-red-50" : "bg-primary-soft"
        }`}
      />
      <div className="flex items-start gap-sm">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white shadow-card ${
            isDanger ? "bg-danger" : "bg-primary"
          }`}
        >
          <SymbolIcon className="text-xl">{icon}</SymbolIcon>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-md font-extrabold text-ink">{title}</p>
          <p className={`mt-xs text-label-md font-semibold leading-snug ${isDanger ? "text-danger" : "text-primary"}`}>
            {description}
          </p>
        </div>
        {onDismiss ? (
          <button
            aria-label="关闭语音提示"
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
              isDanger ? "text-danger hover:bg-white hover:text-ink" : "text-primary hover:bg-white hover:text-ink"
            }`}
            onClick={onDismiss}
            type="button"
          >
            <SymbolIcon className="text-lg">close</SymbolIcon>
          </button>
        ) : null}
      </div>
      <button
        className={`mt-sm flex h-9 w-full items-center justify-center gap-xs rounded-xl text-label-md font-extrabold text-white transition-colors ${
          isDanger ? "bg-danger hover:bg-red-600" : "bg-primary hover:bg-primary-deep"
        }`}
        onClick={onPrimaryAction}
        type="button"
      >
        <SymbolIcon className="text-lg">volume_up</SymbolIcon>
        {actionLabel}
      </button>
    </div>
  );
}

function VoiceSettingsDialog({
  availableVoices,
  isClosing,
  isOpen,
  isRunningSelfCheck,
  onClose,
  onResetSettings,
  onRunSelfCheck,
  onUpdateSettings,
  selfCheckResult,
  settings,
}: {
  availableVoices: SpeechSynthesisVoice[];
  isClosing: boolean;
  isOpen: boolean;
  isRunningSelfCheck: boolean;
  onClose: () => void;
  onResetSettings: () => void;
  onRunSelfCheck: () => void;
  onUpdateSettings: (patch: Partial<WorkoutVoiceBroadcastUserSettings>) => void;
  selfCheckResult: WorkoutVoiceSelfCheckResult | null;
  settings: WorkoutVoiceBroadcastUserSettings;
}) {
  if (!isOpen) {
    return null;
  }

  const selfCheckSummary = getVoiceSelfCheckSummary(isRunningSelfCheck, selfCheckResult);
  const visibleSteps = selfCheckResult?.steps ?? createPendingVoiceSelfCheckSteps();
  const selectedVoiceExists = settings.voiceURI
    ? availableVoices.some((voice) => voice.voiceURI === settings.voiceURI)
    : true;
  const showRestartAdvice = shouldShowVoiceRestartAdvice(selfCheckResult);

  return createPortal(
    <div
      aria-modal="true"
      className={`fixed inset-0 z-50 grid place-items-center bg-black/20 px-md py-lg backdrop-blur-[1px] drawer-backdrop-transition ${
        isClosing ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"
      }`}
      onClick={onClose}
      role="dialog"
    >
      <section
        className={`custom-scrollbar max-h-[min(760px,calc(100dvh-40px))] w-full max-w-[920px] origin-center overflow-y-auto rounded-[20px] border border-line bg-white p-md text-ink shadow-lift drawer-panel-transition md:p-lg ${
          isClosing ? "translate-y-8 scale-[0.96]" : "translate-y-0 scale-100"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-md">
          <div>
            <p className="text-label-md font-bold text-primary">训练语音</p>
            <h2 className="mt-xs text-[24px] font-extrabold leading-tight">播报设置</h2>
          </div>
          <button
            aria-label="关闭语音设置"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-muted transition-colors hover:bg-panel-soft hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <SymbolIcon className="text-2xl">close</SymbolIcon>
          </button>
        </div>

        <div className="mt-md grid gap-md lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section className="rounded-xl border border-line bg-panel-soft p-md">
            <div className="flex items-center justify-between gap-sm">
              <div>
                <p className="text-body-md font-extrabold text-ink">Voice</p>
                <p className="mt-xs text-label-md font-semibold text-muted">
                  {availableVoices.length ? `${availableVoices.length} 个可用 voice` : "使用默认 voice"}
                </p>
              </div>
              <button
                className="flex h-9 items-center gap-xs rounded-xl border border-line bg-white px-sm text-label-md font-extrabold text-muted transition-colors hover:bg-white hover:text-primary"
                onClick={onResetSettings}
                type="button"
              >
                <SymbolIcon className="text-lg">restart_alt</SymbolIcon>
                重置
              </button>
            </div>
            <label className="mt-sm block" htmlFor="workout-voice-setting-voice">
              <span className="mb-xs block text-label-md font-bold text-muted">选择 voice</span>
              <select
                className="h-11 w-full rounded-xl border border-line bg-white px-sm text-body-md font-bold text-ink outline-none transition-colors focus:border-primary"
                id="workout-voice-setting-voice"
                name="workout-voice-setting-voice"
                onChange={(event) => onUpdateSettings({ voiceURI: event.target.value })}
                value={selectedVoiceExists ? settings.voiceURI : ""}
              >
                <option value="">自动选择中文 / 默认 voice</option>
                {availableVoices.map((voice) => (
                  <option key={voice.voiceURI || `${voice.name}-${voice.lang}`} value={voice.voiceURI}>
                    {voice.name} ({voice.lang}){voice.default ? " · default" : ""}
                  </option>
                ))}
              </select>
            </label>
            {!selectedVoiceExists ? (
              <p className="mt-xs text-label-md font-bold text-danger">
                上次选择的 voice 当前不可用，实际播报会自动回退。
              </p>
            ) : null}
            <div className="mt-md space-y-sm">
              <VoiceRangeControl
                id="workout-voice-setting-rate"
                label="语速"
                max={voiceSettingsRanges.rate.max}
                min={voiceSettingsRanges.rate.min}
                onChange={(value) => onUpdateSettings({ rate: value })}
                step={voiceSettingsRanges.rate.step}
                value={settings.rate}
              />
              <VoiceRangeControl
                id="workout-voice-setting-volume"
                label="音量"
                max={voiceSettingsRanges.volume.max}
                min={voiceSettingsRanges.volume.min}
                onChange={(value) => onUpdateSettings({ volume: value })}
                step={voiceSettingsRanges.volume.step}
                value={settings.volume}
              />
              <VoiceRangeControl
                id="workout-voice-setting-pitch"
                label="音调"
                max={voiceSettingsRanges.pitch.max}
                min={voiceSettingsRanges.pitch.min}
                onChange={(value) => onUpdateSettings({ pitch: value })}
                step={voiceSettingsRanges.pitch.step}
                value={settings.pitch}
              />
              <VoiceRangeControl
                id="workout-voice-setting-beep-volume"
                label="节奏音量"
                max={voiceSettingsRanges.beepVolume.max}
                min={voiceSettingsRanges.beepVolume.min}
                onChange={(value) => onUpdateSettings({ beepVolume: value })}
                step={voiceSettingsRanges.beepVolume.step}
                value={settings.beepVolume}
              />
            </div>
          </section>

          <section className="rounded-xl border border-line bg-white p-md">
            <div className="flex items-start justify-between gap-md">
              <div>
                <p className="text-body-md font-extrabold text-ink">全流程自检</p>
                <p className={`mt-xs text-label-md font-semibold ${selfCheckSummary.className}`}>
                  {selfCheckSummary.text}
                </p>
              </div>
              <button
                className="flex h-10 shrink-0 items-center justify-center gap-xs rounded-xl bg-primary px-md text-label-md font-extrabold text-white transition-colors hover:bg-primary-deep disabled:cursor-not-allowed disabled:bg-muted"
                disabled={isRunningSelfCheck}
                onClick={onRunSelfCheck}
                type="button"
              >
                <SymbolIcon className="text-lg">{isRunningSelfCheck ? "hourglass_empty" : "fact_check"}</SymbolIcon>
                {isRunningSelfCheck ? "检测中" : "开始自检"}
              </button>
            </div>
            <div className="mt-md space-y-xs">
              {visibleSteps.map((step) => (
                <VoiceSelfCheckStepRow key={step.id} step={step} />
              ))}
            </div>
            {showRestartAdvice ? (
              <div className="mt-sm flex items-start gap-sm rounded-xl border border-[#FFD8A8] bg-[#FFF7E6] p-sm text-label-md font-bold text-[#B54708]">
                <SymbolIcon className="mt-[1px] text-lg">restart_alt</SymbolIcon>
                <p>浏览器语音 API 可用但本次自检未完整通过，可尝试重启浏览器后再检测。</p>
              </div>
            ) : null}
            {selfCheckResult ? (
              <dl className="mt-md grid grid-cols-2 gap-sm rounded-xl bg-panel-soft p-sm text-label-md font-semibold text-muted">
                <div className="min-w-0">
                  <dt>耗时</dt>
                  <dd className="truncate font-extrabold text-ink">{selfCheckResult.elapsedMs} ms</dd>
                </div>
                <div className="min-w-0">
                  <dt>voices</dt>
                  <dd className="truncate font-extrabold text-ink">{selfCheckResult.voices}</dd>
                </div>
                <div className="min-w-0">
                  <dt>voice</dt>
                  <dd className="truncate font-extrabold text-ink">{selfCheckResult.selectedVoice}</dd>
                </div>
                <div className="min-w-0">
                  <dt>reason</dt>
                  <dd className="truncate font-extrabold text-ink">{selfCheckResult.reason ?? "-"}</dd>
                </div>
              </dl>
            ) : null}
          </section>
        </div>

        <section className="mt-md rounded-xl border border-line bg-panel-soft p-md">
          <div className="mb-sm flex items-center gap-xs text-body-md font-extrabold text-ink">
            <SymbolIcon className="text-xl text-primary">travel_explore</SymbolIcon>
            浏览器 API 版本
          </div>
          <div className="rounded-xl border border-line bg-white p-sm">
            <p className="text-label-md font-extrabold text-ink">Web Speech API</p>
            <p className="mt-xs text-label-md font-semibold text-muted">训练口令、倒计时和计次播报所需的最低版本</p>
            <div className="mt-sm flex flex-wrap gap-xs">
              {webSpeechMinimumBrowserRequirements.map((browser) => (
                <div
                  className="flex min-h-9 min-w-[104px] flex-1 items-center gap-[3px] rounded-lg border border-line bg-panel-soft px-xs py-[3px] sm:flex-none"
                  key={browser.browser}
                >
                  <BrowserApiIcon browser={browser.browser} />
                  <p className="min-w-0 truncate text-label-md font-extrabold text-ink">
                    {browser.label} <span className="font-bold text-primary">{browser.version}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-sm text-label-md font-semibold text-muted">
            版本范围参考 MDN / Can I Use 当前兼容数据；最终是否可用以本机自检和浏览器运行时能力为准。
          </p>
        </section>
      </section>
    </div>,
    document.body,
  );
}

function VoiceRangeControl({
  id,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  id: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="block rounded-xl border border-line bg-white p-sm" htmlFor={id}>
      <span className="mb-xs flex items-center justify-between gap-sm text-label-md font-bold text-muted">
        <span>{label}</span>
        <span className="font-extrabold text-ink">{value.toFixed(2)}</span>
      </span>
      <input
        className="w-full accent-primary"
        id={id}
        max={max}
        min={min}
        name={id}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function VoiceSelfCheckStepRow({
  step,
}: {
  step: {
    detail: string;
    id: string;
    label: string;
    status: WorkoutVoiceSelfCheckStepStatus;
  };
}) {
  const meta = getVoiceSelfCheckStepMeta(step.status);

  return (
    <div className="grid min-h-[58px] grid-cols-[36px_1fr] items-center gap-sm rounded-xl border border-line bg-panel-soft px-sm py-xs">
      <span className={`grid h-8 w-8 place-items-center rounded-full ${meta.className}`}>
        <SymbolIcon className="text-lg" filled={step.status === "passed"}>
          {meta.icon}
        </SymbolIcon>
      </span>
      <div className="min-w-0">
        <p className="truncate text-label-md font-extrabold text-ink">{step.label}</p>
        <p className="truncate text-label-md font-semibold text-muted">{step.detail}</p>
      </div>
    </div>
  );
}

function BrowserApiIcon({ browser }: { browser: VoiceApiBrowserKey }) {
  const iconMeta: Record<VoiceApiBrowserKey, { alt: string; src: string }> = {
    chrome: { alt: "Chrome", src: "/browser-logos/chrome.svg" },
    edge: { alt: "Edge", src: "/browser-logos/edge.svg" },
    firefox: { alt: "Firefox", src: "/browser-logos/firefox.svg" },
    safari: { alt: "Safari", src: "/browser-logos/safari.svg" },
    iosSafari: { alt: "iOS Safari", src: "/browser-logos/safari-ios.svg" },
  };
  const meta = iconMeta[browser];

  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-line/70">
      <Image alt={`${meta.alt} logo`} className="h-6 w-6 object-contain" height={24} src={meta.src} width={24} />
    </span>
  );
}

function shouldShowVoiceRestartAdvice(result: WorkoutVoiceSelfCheckResult | null) {
  if (!result) {
    return false;
  }

  const apiLooksAvailable =
    result.supported ||
    result.steps.some((step) => step.id === "speech-api" && step.status === "passed");
  const hasRuntimeFailure =
    result.status === "blocked" ||
    result.status === "error" ||
    result.reason === "speech_end_timeout" ||
    result.steps.some((step) => step.status === "failed" || step.status === "warning");

  return apiLooksAvailable && hasRuntimeFailure;
}

function getVoiceSelfCheckSummary(
  isRunning: boolean,
  result: WorkoutVoiceSelfCheckResult | null,
) {
  if (isRunning) {
    return { className: "text-primary", text: "正在检测语音合成、voice 和节奏音" };
  }

  if (!result) {
    return { className: "text-muted", text: "点击后会播放一次测试语音和短促节奏音" };
  }

  if (result.status === "ended" || result.status === "started") {
    return { className: "text-success-text", text: result.status === "ended" ? "全流程自检通过" : "语音已启动，未收到结束事件" };
  }

  if (result.status === "unsupported") {
    return { className: "text-danger", text: "当前浏览器不支持语音合成" };
  }

  if (result.status === "blocked") {
    return { className: "text-danger", text: "语音未启动，浏览器阻止了 Web Speech" };
  }

  return { className: "text-danger", text: "语音自检失败" };
}

function getVoiceSelfCheckStepMeta(status: WorkoutVoiceSelfCheckStepStatus) {
  if (status === "passed") {
    return { className: "bg-success-soft text-success-text", icon: "check" };
  }

  if (status === "failed") {
    return { className: "bg-red-50 text-danger", icon: "close" };
  }

  if (status === "warning") {
    return { className: "bg-[#FFF7E6] text-[#B54708]", icon: "priority_high" };
  }

  if (status === "running") {
    return { className: "bg-primary-soft text-primary", icon: "hourglass_empty" };
  }

  return { className: "bg-white text-muted", icon: "radio_button_unchecked" };
}

function createPendingVoiceSelfCheckSteps() {
  return [
    { detail: "等待点击开始自检。", id: "speech-api", label: "Web Speech API", status: "pending" as const },
    { detail: "等待读取浏览器 voice。", id: "voice-list", label: "Voice 列表", status: "pending" as const },
    { detail: "等待匹配 voice。", id: "voice-selection", label: "Voice 选择", status: "pending" as const },
    { detail: "等待测试节奏音。", id: "web-audio", label: "Web Audio", status: "pending" as const },
    { detail: "等待提交语音请求。", id: "speech-request", label: "语音请求", status: "pending" as const },
    { detail: "等待播放启动。", id: "speech-start", label: "播放启动", status: "pending" as const },
    { detail: "等待播放结束。", id: "speech-end", label: "播放结束", status: "pending" as const },
  ];
}

function createFailedVoiceSelfCheckSteps(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown";

  return createPendingVoiceSelfCheckSteps().map((step, index) => ({
    ...step,
    detail: index === 0 ? `自检异常：${message}` : "自检异常中止。",
    status: "failed" as const,
  }));
}

function SessionControl({
  icon,
  label,
  large = false,
  onClick,
}: {
  icon: string;
  label: string;
  large?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex min-w-[76px] flex-col items-center gap-xs text-label-md font-bold text-muted">
      <button
        className={`grid place-items-center rounded-full transition-transform active:scale-95 ${
          large
            ? "h-[72px] w-[72px] border-0 bg-primary text-white shadow-lift md:h-20 md:w-20"
            : "h-12 w-12 border border-line bg-white text-ink shadow-card hover:bg-panel-soft"
        }`}
        onClick={onClick}
        type="button"
      >
        <SymbolIcon className={large ? "text-4xl" : "text-2xl"} filled={large}>
          {icon}
        </SymbolIcon>
      </button>
      <span className="leading-none">{label}</span>
    </div>
  );
}

function ExerciseThumb({ index, item }: { index: number; item: WorkoutItem }) {
  return (
    <div className="relative grid h-12 w-14 place-items-center overflow-hidden rounded-[8px] bg-panel-soft">
      {item.imageUrl && item.imageUrl !== placeholderWorkoutImage ? (
        <Image
          alt={`${item.nameZh} 缩略图`}
          className="object-contain p-xs"
          fill
          sizes="56px"
          src={item.imageUrl}
        />
      ) : (
        <MiniFigure variant={index} />
      )}
    </div>
  );
}

function StepStatus({
  index,
  isActive,
  isDone,
}: {
  index: number;
  isActive: boolean;
  isDone: boolean;
}) {
  if (isDone) {
    return (
      <span className="grid h-7 w-7 place-items-center rounded-full bg-success-soft text-success-text">
        <SymbolIcon className="text-lg" filled>
          check
        </SymbolIcon>
      </span>
    );
  }

  if (isActive) {
    return (
      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-white">
        <SymbolIcon className="text-lg" filled>
          play_arrow
        </SymbolIcon>
      </span>
    );
  }

  return (
    <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-label-md font-extrabold text-muted">
      {index + 1}
    </span>
  );
}

function SquatIllustration() {
  return (
    <div className="relative h-[330px] w-[300px] scale-[0.76] 2xl:scale-90" aria-label="深蹲动作示意">
      <span className="absolute left-[151px] top-[5px] h-[38px] w-[70px] -rotate-[8deg] rounded-[55%_55%_45%_45%] bg-slate-950" />
      <span className="absolute left-[160px] top-[18px] h-[62px] w-[54px] rounded-[42%_42%_48%_48%] bg-[#f2c7a8] shadow-[inset_-8px_0_0_rgba(0,0,0,0.05)]" />
      <span className="absolute left-[173px] top-[72px] h-[28px] w-[24px] rounded-lg bg-[#eebc9c]" />
      <span className="absolute left-[115px] top-[92px] h-[120px] w-[88px] -rotate-12 rounded-[30px_30px_22px_22px] bg-slate-950" />
      <span className="absolute left-[182px] top-[112px] h-5 w-[128px] rounded-full bg-[#f0c1a0]" />
      <span className="absolute left-[180px] top-[142px] h-5 w-[122px] rotate-[2deg] rounded-full bg-[#f0c1a0]" />
      <span className="absolute left-[88px] top-[190px] h-[58px] w-[110px] -rotate-[6deg] rounded-[20px] bg-slate-950" />
      <span className="absolute left-[53px] top-[230px] h-[27px] w-[112px] rotate-[22deg] rounded-full bg-[#f0c1a0]" />
      <span className="absolute left-[49px] top-[256px] h-[88px] w-[29px] -rotate-12 rounded-full bg-[#f0c1a0]" />
      <span className="absolute left-[135px] top-[236px] h-[27px] w-[105px] -rotate-[7deg] rounded-full bg-[#f0c1a0]" />
      <span className="absolute left-[219px] top-[248px] h-[82px] w-[28px] -rotate-12 rounded-full bg-[#f0c1a0]" />
      <span className="absolute left-[24px] top-[330px] h-[28px] w-[70px] -rotate-[6deg] rounded-[18px_24px_12px_12px] border-2 border-slate-300 bg-white shadow-[0_4px_10px_rgba(15,23,42,0.08)]" />
      <span className="absolute left-[202px] top-[322px] h-[28px] w-[70px] rotate-[4deg] rounded-[18px_24px_12px_12px] border-2 border-slate-300 bg-white shadow-[0_4px_10px_rgba(15,23,42,0.08)]" />
    </div>
  );
}

function MiniFigure({ variant }: { variant: number }) {
  const styles = [
    "before:h-9 before:w-3 before:left-[22px] before:top-1 after:h-1 after:w-14 after:left-0 after:top-3 after:-rotate-[28deg]",
    "before:h-[18px] before:w-9 before:left-[10px] before:top-4 before:-rotate-12 after:h-1 after:w-12 after:left-1 after:top-2",
    "before:h-2 before:w-[50px] before:left-1 before:top-5 after:h-[22px] after:w-1.5 after:left-[42px] after:top-4",
    "before:h-2 before:w-[50px] before:left-1 before:top-4 before:rotate-[8deg] after:h-1.5 after:w-9 after:left-4 after:top-8 after:-rotate-[18deg]",
    "before:h-2 before:w-[54px] before:left-0.5 before:top-5 after:h-[22px] after:w-2 after:left-3 after:top-[18px]",
  ];

  return (
    <span
      className={`relative block h-[42px] w-[58px] before:absolute before:rounded-full before:bg-slate-950 after:absolute after:rounded-full after:bg-slate-950 ${styles[variant % styles.length]}`}
    />
  );
}

function logVoiceSelfCheckDiagnostic(event: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[WorkoutVoiceCheck]", event, payload ?? {});
}
