"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import {
  getScheduledWorkout,
  updateScheduledWorkoutStatus,
} from "@/features/workouts/api/workout-data-client";
import {
  isWorkoutVoiceBroadcastSupported,
  readWorkoutVoiceBroadcastPreference,
  readWorkoutVoiceBroadcastTipSeen,
  useWorkoutVoiceBroadcast,
  writeWorkoutVoiceBroadcastPreference,
  writeWorkoutVoiceBroadcastTipSeen,
  type WorkoutVoiceBroadcastStatus,
} from "@/features/workouts/hooks/use-workout-voice-broadcast";
import {
  runWorkoutVoiceSelfCheck,
  type WorkoutVoiceSelfCheckResult,
} from "@/features/workouts/voice/workout-voice-self-check";
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
  type ScheduledWorkout,
  type WorkoutItem,
  type WorkoutMode,
} from "@/lib/shared/workouts/composition";
import {
  buildWorkoutSessionListView,
  getRelevantExerciseStep,
} from "@/lib/shared/workouts/session-flow";
import type { Exercise } from "@/lib/shared/exercises/types";

const preparationCountdownStart = 3;

const fallbackPlan: ScheduledWorkout = {
  id: "session-fallback",
  date: "today",
  planId: "fat-burn-circuit",
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

async function getPlanFromDatabase(planId: string) {
  const matchedPlan = await getScheduledWorkout(planId);

  if (matchedPlan && matchedPlan.items.length) {
    const loopConfig = getWorkoutLoopConfig(matchedPlan);
    return {
      ...matchedPlan,
      items: matchedPlan.items.map(normalizeWorkoutItem),
      trainingLoopRestSeconds: loopConfig.trainingLoopRestSeconds,
      trainingLoopRounds: loopConfig.trainingLoopRounds,
    };
  }

  throw new Error("Workout plan has no items.");
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

function getVoiceButtonLabel(
  isSupported: boolean,
  isPreferenceOn: boolean,
  status: WorkoutVoiceBroadcastStatus,
) {
  if (!isSupported) {
    return "当前浏览器不支持语音播报";
  }

  if (isPreferenceOn && (status === "needs-activation" || status === "failed")) {
    return "启动语音播报";
  }

  return isPreferenceOn ? "关闭语音播报" : "开启语音播报";
}

export function WorkoutSessionPage() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId")?.trim() ?? "";
  const [plan, setPlan] = useState<ScheduledWorkout>(fallbackPlan);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(45);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [preparationCountdown, setPreparationCountdown] = useState(0);
  const [preparedStepKey, setPreparedStepKey] = useState("");
  const [preparationCountdownStepKey, setPreparationCountdownStepKey] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [loadedPlanKey, setLoadedPlanKey] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isVoicePreferenceLoaded, setIsVoicePreferenceLoaded] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [showVoiceTip, setShowVoiceTip] = useState(false);
  const [isExerciseDetailOpen, setIsExerciseDetailOpen] = useState(false);
  const [isVoiceSelfChecking, setIsVoiceSelfChecking] = useState(false);
  const [voiceSelfCheckResult, setVoiceSelfCheckResult] = useState<WorkoutVoiceSelfCheckResult | null>(null);

  const loopConfig = useMemo(() => getWorkoutLoopConfig(plan), [plan]);
  const steps = useMemo(
    () => buildWorkoutTimeline(plan.items, loopConfig),
    [loopConfig, plan.items],
  );
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const activeExerciseStep = activeStep?.type === "exercise" ? activeStep : null;
  const activeRestStep = activeStep?.type === "rest" ? activeStep : null;
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
  const isRestStep = Boolean(activeRestStep);
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
  const demoImageUrls = getWorkoutItemImageUrls(currentItem);
  const demoImageIndex = getWorkoutDemoImageIndex(demoImageUrls.length, stepElapsedSeconds, currentItem.mode);
  const activeDemoImageUrl = demoImageUrls[demoImageIndex] ?? placeholderWorkoutImage;
  const currentExerciseDetail = useMemo(() => mapWorkoutItemToExercise(currentItem), [currentItem]);
  const trainedCalories = Math.min(
    estimateWorkoutCalories(plan.items, loopConfig),
    Math.round(Math.max(0, elapsedSeconds / 60) * 7.2 + completedStepIds.size * 8),
  );
  const sessionProgress = steps.length
    ? ((activeStepIndex + Math.max(0, Math.min(1, progress / 100))) / steps.length) * 100
    : 0;
  const nextExerciseStep =
    sessionListView.nextExerciseStepIndex === null ? null : steps[sessionListView.nextExerciseStepIndex];
  const nextItem = nextExerciseStep?.type === "exercise" ? nextExerciseStep.item : null;
  const remainingSteps = Math.max(0, steps.length - activeStepIndex - 1);
  const requestedPlanKey = planId;
  const sessionVoiceId = `${plan.id}:${plan.date}:${plan.planId}`;
  const activeStepKey = activeStep ? `${sessionVoiceId}:${activeStep.id}:${activeStepIndex}` : "";
  const isPlanReady = Boolean(planId && !loadError && loadedPlanKey === requestedPlanKey);
  const needsExercisePreparation = activeStep?.type === "exercise" && preparedStepKey !== activeStepKey;
  const isPreparationCountdownActive = preparationCountdownStepKey === activeStepKey;
  const isPreparing = Boolean(hasStarted && needsExercisePreparation && preparationCountdown > 0);
  const isAwaitingStart = isPlanReady && !hasStarted;

  useEffect(() => {
    let cancelled = false;
    let resetTimer: number | undefined;
    const requestKey = planId;

    if (!requestKey) {
      resetTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setLoadedPlanKey("");
        setLoadError("缺少训练计划参数，请从训练计划页面进入训练。");
        setHasStarted(false);
        setIsPaused(false);
        setPreparedStepKey("");
        setPreparationCountdownStepKey("");
        setPreparationCountdown(0);
        setElapsedSeconds(0);
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

    void getPlanFromDatabase(requestKey).then((selectedPlan) => {
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
      setRemainingSeconds(selectedSteps[0]?.durationSeconds ?? 45);
      setPreparedStepKey("");
      setPreparationCountdownStepKey("");
      setPreparationCountdown(selectedSteps[0]?.type === "exercise" ? preparationCountdownStart : 0);
      setHasStarted(false);
      setIsPaused(false);
      setLoadedPlanKey(requestKey);
      setIsExerciseDetailOpen(false);
    }).catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      console.error("[WorkoutSession] Load failed:", error);
      setLoadedPlanKey("");
      setLoadError("训练安排加载失败，请从训练计划页面重新进入。");
    });

    return () => {
      cancelled = true;
    };
  }, [planId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canUseVoiceBroadcast = isWorkoutVoiceBroadcastSupported();
      const savedAudioPreference = canUseVoiceBroadcast && readWorkoutVoiceBroadcastPreference();
      const hasSeenVoiceTip = readWorkoutVoiceBroadcastTipSeen();

      setIsAudioOn(savedAudioPreference);
      if (canUseVoiceBroadcast && !savedAudioPreference && !hasSeenVoiceTip) {
        setShowVoiceTip(true);
        writeWorkoutVoiceBroadcastTipSeen();
      }
      setIsVoicePreferenceLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const markPreparationIntroComplete = useCallback((stepKey: string) => {
    setPreparationCountdownStepKey(stepKey);
  }, []);

  const voiceSession = useWorkoutVoiceBroadcast({
    activeStepIndex,
    completedReps,
    isFirstExerciseStep: activeStepIndex === 0,
    isPaused,
    isPreferenceEnabled: isPlanReady && isAudioOn && isVoicePreferenceLoaded,
    isPreparationCountdownActive,
    isSessionStarted: hasStarted,
    onPreparationIntroComplete: markPreparationIntroComplete,
    preparationCountdown,
    remainingSeconds,
    sessionId: sessionVoiceId,
    steps,
  });
  const isVoiceSupported = voiceSession.isSupported;
  const isVoicePreferenceOn = isVoiceSupported && isAudioOn;
  const voiceStatus = isVoiceSupported ? voiceSession.status : "unsupported";
  const isVoiceBroadcastActive =
    isVoicePreferenceOn && (voiceStatus === "active" || voiceStatus === "speaking" || voiceStatus === "activating");
  const shouldRetryVoiceActivation =
    isVoicePreferenceOn && (voiceStatus === "needs-activation" || voiceStatus === "failed");
  const shouldShowVoiceFirstTip = isVoicePreferenceLoaded && showVoiceTip && !isVoicePreferenceOn;

  const handleVoiceButtonClick = useCallback(() => {
    if (!isVoiceSupported) {
      return;
    }

    if (!isVoicePreferenceOn) {
      setIsAudioOn(true);
      setShowVoiceTip(false);
      writeWorkoutVoiceBroadcastPreference(true);
      voiceSession.activateCurrentStep(true);
      return;
    }

    if (shouldRetryVoiceActivation) {
      voiceSession.activateCurrentStep(false, { includeActivationPrompt: false });
      return;
    }

    voiceSession.disableVoiceSession();
    setIsAudioOn(false);
    setShowVoiceTip(false);
    writeWorkoutVoiceBroadcastPreference(false);
  }, [isVoicePreferenceOn, isVoiceSupported, shouldRetryVoiceActivation, voiceSession]);

  const runVoiceSelfCheck = useCallback(() => {
    setIsVoiceSelfChecking(true);
    setVoiceSelfCheckResult(null);

    void runWorkoutVoiceSelfCheck({
      onDiagnostic: logVoiceSelfCheckDiagnostic,
    }).then((result) => {
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
        supported: isWorkoutVoiceBroadcastSupported(),
        text: "语音自检",
        voices: 0,
      });
    }).finally(() => {
      setIsVoiceSelfChecking(false);
    });
  }, []);

  const goToStep = useCallback((nextIndex: number, { cancelVoice = true }: { cancelVoice?: boolean } = {}) => {
    if (!steps.length) {
      return;
    }

    const boundedIndex = Math.min(Math.max(0, nextIndex), steps.length - 1);
    const nextStep = steps[boundedIndex];

    if (cancelVoice) {
      voiceSession.cancelCurrentVoice("step-change");
    }

    setPreparedStepKey("");
    setPreparationCountdownStepKey("");
    setPreparationCountdown(nextStep?.type === "exercise" ? preparationCountdownStart : 0);
    setActiveStepIndex(boundedIndex);
    setRemainingSeconds(nextStep?.durationSeconds ?? 45);
  }, [steps, voiceSession]);

  const startTraining = useCallback(() => {
    setHasStarted(true);
    setIsPaused(false);

    if (isVoicePreferenceOn && isVoiceSupported && !isVoiceBroadcastActive) {
      voiceSession.activateCurrentStep(false, { includeActivationPrompt: false });
    }
  }, [isVoiceBroadcastActive, isVoicePreferenceOn, isVoiceSupported, voiceSession]);

  const completeCurrentStep = useCallback(({ cancelVoice = true }: { cancelVoice?: boolean } = {}) => {
    const isLastStep = activeStepIndex >= steps.length - 1;

    if (isLastStep) {
      setHasStarted(false);
      setIsPaused(true);
      setPreparedStepKey("");
      setPreparationCountdownStepKey("");
      setPreparationCountdown(0);
      setRemainingSeconds(0);
      return;
    }

    goToStep(activeStepIndex + 1, { cancelVoice });
  }, [activeStepIndex, goToStep, steps.length]);

  useEffect(() => {
    if (
      !hasStarted ||
      !isPlanReady ||
      !isVoicePreferenceLoaded ||
      isVoicePreferenceOn ||
      !needsExercisePreparation ||
      !activeStepKey
    ) {
      return;
    }

    const timer = window.setTimeout(() => markPreparationIntroComplete(activeStepKey), 0);

    return () => window.clearTimeout(timer);
  }, [
    activeStepKey,
    hasStarted,
    isAudioOn,
    isPlanReady,
    isVoicePreferenceLoaded,
    isVoicePreferenceOn,
    markPreparationIntroComplete,
    needsExercisePreparation,
  ]);

  useEffect(() => {
    if (
      !hasStarted ||
      !isPlanReady ||
      isPaused ||
      !needsExercisePreparation ||
      !isPreparationCountdownActive ||
      preparationCountdown <= 0
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPreparationCountdown((value) => Math.max(0, value - 1));
      if (preparationCountdown <= 1 && activeStepKey) {
        setPreparedStepKey(activeStepKey);
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [
    activeStepKey,
    hasStarted,
    isPaused,
    isPlanReady,
    isPreparationCountdownActive,
    needsExercisePreparation,
    preparationCountdown,
  ]);

  useEffect(() => {
    if (!hasStarted || isPaused || needsExercisePreparation || !activeStep) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      if (remainingSeconds <= 1) {
        completeCurrentStep({ cancelVoice: false });
        return;
      }

      setRemainingSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeStep, completeCurrentStep, hasStarted, isPaused, needsExercisePreparation, remainingSeconds]);

  const openCurrentExerciseDetail = useCallback(() => {
    setIsPaused(true);
    setIsExerciseDetailOpen(true);
  }, []);

  function finishTraining() {
    setHasStarted(false);
    setIsPaused(true);
    setPreparedStepKey("");
    setPreparationCountdownStepKey("");
    setPreparationCountdown(0);

    void updateScheduledWorkoutStatus(plan.id, "completed")
      .then((updatedPlan) => {
        setPlan(updatedPlan);
      })
      .catch((error: unknown) => {
        console.error("[WorkoutSession] Finish failed:", error);
      });
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
    <main className="custom-scrollbar h-dvh overflow-y-auto bg-canvas text-ink xl:overflow-hidden">
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
              {activeStepIndex + 1}/{Math.max(1, steps.length)}
            </span>
          </div>
          <div className="flex items-center gap-sm">
            <div className="relative">
              <button
                aria-label={getVoiceButtonLabel(isVoiceSupported, isVoicePreferenceOn, voiceStatus)}
                className={`grid h-11 w-11 place-items-center rounded-xl border transition-colors ${
                  !isVoiceSupported
                    ? "cursor-not-allowed border-line bg-panel-soft text-muted"
                    : isVoiceBroadcastActive
                    ? "border-primary/20 bg-primary-soft text-primary"
                    : voiceStatus === "failed"
                    ? "border-red-200 bg-red-50 text-danger shadow-lift ring-4 ring-red-100"
                    : voiceStatus === "needs-activation"
                    ? "border-primary bg-primary-soft text-primary shadow-lift ring-4 ring-primary/15"
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
            <button
              aria-label="结束训练"
              className="grid h-11 w-11 place-items-center rounded-xl border border-red-200 bg-white text-danger transition-colors hover:bg-red-50"
              onClick={finishTraining}
              type="button"
            >
              <SymbolIcon className="text-2xl">stop</SymbolIcon>
            </button>
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
                  {isAwaitingStart
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
                  <p className="text-label-md font-bold text-primary">动作示范</p>
                  <h2 className="text-title-lg font-extrabold">{currentItem.nameZh}</h2>
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
                      alt={`${currentItem.nameZh} 动作图`}
                      className="object-contain p-md"
                      fill
                      key={`${currentItem.id}-${demoImageIndex}-${activeDemoImageUrl}`}
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

          <section className="flex min-h-0 flex-col items-center justify-center rounded-[20px] border border-line bg-white px-lg py-lg text-center shadow-card">
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
            {isAwaitingStart ? (
              <>
                <p className="my-md text-body-lg font-extrabold text-ink">
                  训练尚未开始，计时和语音会在点击开始后启动
                </p>
              </>
            ) : isPreparing ? (
              <>
                <div className="my-md text-[clamp(92px,14vw,148px)] font-black leading-none text-primary [font-variant-numeric:tabular-nums]">
                  {isPreparationCountdownActive ? preparationCountdown : "准备"}
                </div>
                <p className="text-body-lg font-extrabold text-ink">
                  {isPreparationCountdownActive ? "保持姿势，准备开始动作" : "先听动作提示，再开始倒计时"}
                </p>
              </>
            ) : isRestStep ? (
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
            ) : isTimedStep ? (
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
            ) : (
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
            )}
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
                  onClick={() => setIsPaused((value) => !value)}
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
                  const shouldShowLoopDivider =
                    Boolean(listItem.loopRound && listItem.loopRounds) &&
                    listItem.loopRound !== previousItem?.loopRound;

                  return (
                    <div className="space-y-xs" key={listItem.key}>
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
              <VoiceSelfCheckPanel
                isRunning={isVoiceSelfChecking}
                onRun={runVoiceSelfCheck}
                result={voiceSelfCheckResult}
              />
              {nextItem ? (
                <div className="mt-sm rounded-xl bg-panel-soft p-sm">
                  <p className="text-label-md font-bold text-muted">下一个动作</p>
                  <p className="mt-xs truncate text-body-md font-extrabold">{nextItem.nameZh}</p>
                </div>
              ) : null}
            </section>
          </aside>
        </section>

        {showTip ? (
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
    <main className="grid min-h-dvh place-items-center bg-canvas px-md text-ink">
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

function VoiceSelfCheckPanel({
  isRunning,
  onRun,
  result,
}: {
  isRunning: boolean;
  onRun: () => void;
  result: WorkoutVoiceSelfCheckResult | null;
}) {
  const summary = getVoiceSelfCheckSummary(isRunning, result);

  return (
    <div className="mt-sm rounded-xl border border-line bg-panel-soft p-sm">
      <div className="flex items-center justify-between gap-sm">
        <div className="min-w-0">
          <p className="text-label-md font-extrabold text-ink">语音自检</p>
          <p className={`mt-[2px] text-label-md font-semibold ${summary.className}`}>{summary.text}</p>
        </div>
        <button
          className="flex h-9 shrink-0 items-center justify-center gap-xs rounded-xl border border-primary/30 bg-white px-sm text-label-md font-extrabold text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
          disabled={isRunning}
          onClick={onRun}
          type="button"
        >
          <SymbolIcon className="text-lg">{isRunning ? "hourglass_empty" : "record_voice_over"}</SymbolIcon>
          {isRunning ? "检测中" : "自检"}
        </button>
      </div>
      {result ? (
        <dl className="mt-sm grid grid-cols-2 gap-x-sm gap-y-xs text-label-md font-semibold text-muted">
          <div className="min-w-0">
            <dt className="text-muted">voices</dt>
            <dd className="truncate text-ink">{result.voices}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">voice</dt>
            <dd className="truncate text-ink">{result.selectedVoice}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">events</dt>
            <dd className="truncate text-ink">{result.events.join(", ") || "-"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">reason</dt>
            <dd className="truncate text-ink">{result.reason ?? "-"}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function getVoiceSelfCheckSummary(
  isRunning: boolean,
  result: WorkoutVoiceSelfCheckResult | null,
) {
  if (isRunning) {
    return { className: "text-primary", text: "正在直接检测浏览器语音合成" };
  }

  if (!result) {
    return { className: "text-muted", text: "不影响训练状态和语音开关" };
  }

  if (result.status === "ended" || result.status === "started") {
    return { className: "text-success-text", text: result.status === "ended" ? "语音自检通过" : "语音已启动，未收到结束事件" };
  }

  if (result.status === "unsupported") {
    return { className: "text-danger", text: "当前浏览器不支持语音合成" };
  }

  if (result.status === "blocked") {
    return { className: "text-danger", text: "语音未启动，浏览器阻止了 Web Speech" };
  }

  return { className: "text-danger", text: "语音自检失败" };
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
