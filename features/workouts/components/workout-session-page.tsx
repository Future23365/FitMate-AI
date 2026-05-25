"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExercisePreviewSheet } from "@/features/exercises/components/exercise-preview-sheet";
import {
  getScheduledWorkout,
  listScheduledWorkouts,
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
  buildWorkoutTimeline,
  defaultSetRestSeconds,
  defaultTransitionRestSeconds,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  expandWorkoutItems,
  getWorkoutItemImageUrls,
  getRepIntervalSeconds,
  getWorkoutLoopConfig,
  normalizeWorkoutItem,
  placeholderWorkoutImage,
  type ScheduledWorkout,
  type WorkoutItem,
  type WorkoutMode,
} from "@/lib/shared/workouts/composition";
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

async function getPlanFromDatabase(planId: string | null) {
  const matchedPlan = planId
    ? await getScheduledWorkout(planId)
    : (await listScheduledWorkouts()).find((plan) => plan.status === "planned");

  if (matchedPlan && matchedPlan.items.length) {
    const loopConfig = getWorkoutLoopConfig(matchedPlan);
    return {
      ...matchedPlan,
      items: matchedPlan.items.map(normalizeWorkoutItem),
      trainingLoopRestSeconds: loopConfig.trainingLoopRestSeconds,
      trainingLoopRounds: loopConfig.trainingLoopRounds,
    };
  }

  return fallbackPlan;
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

function getVoiceStatusText(status: WorkoutVoiceBroadcastStatus) {
  switch (status) {
    case "needs-activation":
      return "点击任意训练控制可恢复语音";
    case "activating":
      return "正在启动语音";
    case "speaking":
      return "正在播报";
    case "failed":
      return "语音未启动，可重试";
    case "unsupported":
      return "当前浏览器不支持语音播报";
    case "active":
      return "语音已开启";
    case "off":
    default:
      return "语音已关闭";
  }
}

export function WorkoutSessionPage() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const [plan, setPlan] = useState<ScheduledWorkout>(fallbackPlan);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(45);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [preparationCountdown, setPreparationCountdown] = useState(0);
  const [preparedStepKey, setPreparedStepKey] = useState("");
  const [preparationCountdownStepKey, setPreparationCountdownStepKey] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [loadedPlanKey, setLoadedPlanKey] = useState("");
  const [isVoicePreferenceLoaded, setIsVoicePreferenceLoaded] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [showVoiceTip, setShowVoiceTip] = useState(false);
  const [isExerciseDetailOpen, setIsExerciseDetailOpen] = useState(false);

  const loopConfig = useMemo(() => getWorkoutLoopConfig(plan), [plan]);
  const orderedItems = useMemo(
    () => expandWorkoutItems(plan.items, loopConfig.trainingLoopRounds),
    [plan.items, loopConfig.trainingLoopRounds],
  );
  const steps = useMemo(
    () => buildWorkoutTimeline(plan.items, loopConfig),
    [loopConfig, plan.items],
  );
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const activeExerciseStep = activeStep?.type === "exercise" ? activeStep : null;
  const activeRestStep = activeStep?.type === "rest" ? activeStep : null;
  const currentItem =
    activeExerciseStep
      ? activeExerciseStep.item
      : activeRestStep?.nextItem ?? activeRestStep?.afterItem ?? fallbackPlan.items[0];
  const isRestStep = Boolean(activeRestStep);
  const isTimedStep = currentItem.mode === "duration";
  const repIntervalSeconds = getRepIntervalSeconds(currentItem);
  const stepElapsedSeconds = activeStep ? activeStep.durationSeconds - remainingSeconds : 0;
  const completedReps = isRestStep || isTimedStep
    ? 0
    : Math.min(currentItem.target, Math.floor(Math.max(0, stepElapsedSeconds) / repIntervalSeconds));
  const completedStepIds = new Set(steps.slice(0, activeStepIndex).map((step) => step.id));
  const currentExerciseIndex =
    activeExerciseStep
      ? activeExerciseStep.itemIndex
      : Math.max(0, orderedItems.findIndex((item) => item.id === activeRestStep?.nextItem?.id));
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
  const nextItem = orderedItems[currentExerciseIndex + 1];
  const remainingSteps = Math.max(0, steps.length - activeStepIndex - 1);
  const requestedPlanKey = planId ?? "default";
  const sessionVoiceId = `${plan.id}:${plan.date}:${plan.planId}`;
  const activeStepKey = activeStep ? `${sessionVoiceId}:${activeStep.id}:${activeStepIndex}` : "";
  const isPlanReady = loadedPlanKey === requestedPlanKey;
  const needsExercisePreparation = activeStep?.type === "exercise" && preparedStepKey !== activeStepKey;
  const isPreparationCountdownActive = preparationCountdownStepKey === activeStepKey;
  const isPreparing = Boolean(needsExercisePreparation && preparationCountdown > 0);

  useEffect(() => {
    let cancelled = false;
    const requestKey = planId ?? "default";

    void getPlanFromDatabase(planId).then((selectedPlan) => {
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
      setActiveStepIndex(0);
      setElapsedSeconds(0);
      setRemainingSeconds(selectedSteps[0]?.durationSeconds ?? 45);
      setPreparedStepKey("");
      setPreparationCountdownStepKey("");
      setPreparationCountdown(selectedSteps[0]?.type === "exercise" ? preparationCountdownStart : 0);
      setLoadedPlanKey(requestKey);
      setIsExerciseDetailOpen(false);
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
    isPreferenceEnabled: isAudioOn && loadedPlanKey === requestedPlanKey && isVoicePreferenceLoaded,
    isPreparationCountdownActive,
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

  useEffect(() => {
    if (!shouldRetryVoiceActivation) {
      return;
    }

    const activateOnUserGesture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-workout-voice-button]")) {
        return;
      }

      voiceSession.activateCurrentStep();
    };

    window.addEventListener("pointerdown", activateOnUserGesture, { capture: true, once: true });
    window.addEventListener("keydown", activateOnUserGesture, { capture: true, once: true });

    return () => {
      window.removeEventListener("pointerdown", activateOnUserGesture, true);
      window.removeEventListener("keydown", activateOnUserGesture, true);
    };
  }, [shouldRetryVoiceActivation, voiceSession]);

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
      voiceSession.activateCurrentStep();
      return;
    }

    voiceSession.disableVoiceSession();
    setIsAudioOn(false);
    setShowVoiceTip(false);
    writeWorkoutVoiceBroadcastPreference(false);
  }, [isVoicePreferenceOn, isVoiceSupported, shouldRetryVoiceActivation, voiceSession]);

  useEffect(() => {
    if (
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
    isAudioOn,
    isPlanReady,
    isVoicePreferenceLoaded,
    isVoicePreferenceOn,
    markPreparationIntroComplete,
    needsExercisePreparation,
  ]);

  useEffect(() => {
    if (
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
    isPaused,
    isPlanReady,
    isPreparationCountdownActive,
    needsExercisePreparation,
    preparationCountdown,
  ]);

  useEffect(() => {
    if (isPaused || needsExercisePreparation || !activeStep) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      setRemainingSeconds((value) => {
        if (value <= 1) {
          const nextIndex = Math.min(activeStepIndex + 1, steps.length - 1);
          const nextStep = steps[nextIndex];
          setActiveStepIndex(nextIndex);
          if (nextIndex === activeStepIndex) {
            setIsPaused(true);
          }

          setPreparationCountdown(nextStep?.type === "exercise" && nextIndex !== activeStepIndex ? preparationCountdownStart : 0);
          return nextIndex === activeStepIndex ? 0 : steps[nextIndex]?.durationSeconds ?? 0;
        }

        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeStep, activeStepIndex, isPaused, needsExercisePreparation, steps]);

  const openCurrentExerciseDetail = useCallback(() => {
    setIsPaused(true);
    setIsExerciseDetailOpen(true);
  }, []);

  function goToStep(nextIndex: number) {
    const boundedIndex = Math.min(Math.max(0, nextIndex), steps.length - 1);
    setPreparedStepKey("");
    setPreparationCountdownStepKey("");
    setPreparationCountdown(steps[boundedIndex]?.type === "exercise" ? preparationCountdownStart : 0);
    setActiveStepIndex(boundedIndex);
    setRemainingSeconds(steps[boundedIndex]?.durationSeconds ?? 45);
  }

  function completeCurrentStep() {
    const isLastStep = activeStepIndex >= steps.length - 1;

    if (isLastStep) {
      setIsPaused(true);
      setPreparedStepKey("");
      setPreparationCountdownStepKey("");
      setPreparationCountdown(0);
      setRemainingSeconds(0);
      return;
    }

    goToStep(activeStepIndex + 1);
  }

  function finishTraining() {
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
              {isVoicePreferenceLoaded && showVoiceTip && !isVoicePreferenceOn ? (
                <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[244px] rounded-xl border border-primary/35 bg-primary-soft p-md text-left shadow-lift ring-1 ring-primary/10">
                  <span
                    aria-hidden="true"
                    className="absolute -top-[8px] right-5 h-4 w-4 bg-primary-soft [clip-path:polygon(50%_0,0_100%,100%_100%)]"
                  />
                  <div className="flex items-start gap-sm">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-white shadow-card">
                      <SymbolIcon className="text-xl">campaign</SymbolIcon>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-md font-extrabold text-ink">语音播报开关</p>
                      <p className="mt-xs text-label-md font-bold leading-snug text-primary">
                        点上方按钮即可开启或关闭。
                      </p>
                    </div>
                    <button
                      aria-label="关闭语音提示"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-primary transition-colors hover:bg-white hover:text-ink"
                      onClick={() => setShowVoiceTip(false)}
                      type="button"
                    >
                      <SymbolIcon className="text-lg">close</SymbolIcon>
                    </button>
                  </div>
                </div>
              ) : null}
              {isVoicePreferenceLoaded && isVoicePreferenceOn && !isVoiceBroadcastActive ? (
                <div className="absolute right-0 top-[calc(100%+12px)] z-30 w-[228px] rounded-xl border border-line bg-white p-sm text-left shadow-lift">
                  <p className="text-label-md font-extrabold text-ink">{getVoiceStatusText(voiceStatus)}</p>
                  <p className="mt-1 text-label-sm font-semibold text-muted">
                    {voiceStatus === "failed" ? "请再次点击语音按钮，或检查系统语音设置。" : "刷新后需要一次用户手势。"}
                  </p>
                </div>
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
                  {plan.status === "completed" ? "已完成" : isPreparing ? "准备中" : "进行中"}
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
                    {Math.max(1, currentExerciseIndex + 1)}/{orderedItems.length}
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
                {isPreparing ? "timer" : isRestStep ? "timer" : isTimedStep ? "timer" : "format_list_numbered"}
              </SymbolIcon>
              {isPreparing
                ? "准备开始"
                : isRestStep
                ? activeRestStep?.label
                : `${isTimedStep ? "计时步骤" : "计次步骤"} · 第 ${activeExerciseStep?.setIndex ?? 1} / ${
                    activeExerciseStep?.totalSets ?? 1
                  } 组`}
            </span>
            <h2 className="max-w-[680px] text-[30px] font-extrabold leading-tight text-ink md:text-[38px]">
              {isPreparing
                ? `${activeStepIndex === 0 ? "第一个动作" : "准备动作"}：${currentItem.nameZh}`
                : isRestStep
                ? activeRestStep?.label
                : currentItem.nameZh}
            </h2>
            <p className="mt-sm text-body-lg font-semibold text-muted">
              {isPreparing
                ? "倒计时结束后开始训练"
                : isRestStep
                ? activeRestStep?.nextItem
                  ? `下一个动作：${activeRestStep.nextItem.nameZh}`
                  : "准备进入下一步"
                : currentItem.musclesZh.slice(0, 3).join("、") || currentItem.categoryZh}
            </p>
            {isPreparing ? (
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
              <SessionControl
                icon={isPaused ? "play_arrow" : "pause"}
                label={isPaused ? "继续" : "暂停"}
                large
                onClick={() => setIsPaused((value) => !value)}
              />
              <SessionControl icon="skip_next" label="下一个" onClick={completeCurrentStep} />
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-sm">
            <section className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line bg-white p-md shadow-card">
              <div className="mb-sm flex items-center justify-between gap-md">
                <div>
                  <p className="text-label-md font-bold text-primary">训练项目</p>
                  <h2 className="text-title-lg font-extrabold">{orderedItems.length} 个动作</h2>
                </div>
                <SymbolIcon className="text-2xl text-muted">expand_less</SymbolIcon>
              </div>
              <div className="custom-scrollbar min-h-0 flex-1 space-y-sm overflow-y-auto pr-xs">
                {orderedItems.map((item, index) => {
                  const isActive = index === currentExerciseIndex;
                  const isDone = steps
                    .filter((step) => step.type === "exercise" && step.itemIndex === index)
                    .every((step) => completedStepIds.has(step.id));

                  return (
                    <button
                      className={`grid min-h-[64px] w-full grid-cols-[56px_1fr_32px] items-center gap-sm rounded-xl border p-xs text-left transition-colors ${
                        isActive
                          ? "border-primary/25 bg-primary-soft text-primary"
                          : "border-transparent bg-white hover:border-line hover:bg-panel-soft"
                      }`}
                      key={`${item.id}-${index}`}
                      onClick={() => {
                        const nextStepIndex = steps.findIndex(
                          (step) => step.type === "exercise" && step.itemIndex === index,
                        );
                        goToStep(nextStepIndex < 0 ? index : nextStepIndex);
                      }}
                      type="button"
                    >
                      <ExerciseThumb item={item} index={index} />
                      <div className="min-w-0">
                        <p className="truncate text-body-md font-extrabold">{item.nameZh}</p>
                        <p className="truncate text-label-md font-semibold text-muted">
                          {item.mode === "duration" ? `${item.target} 秒` : `${item.target} 次`} · {item.sets}组
                        </p>
                      </div>
                      <StepStatus index={index} isActive={isActive} isDone={isDone} />
                    </button>
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
                  onClick={() => goToStep(activeStepIndex + 1)}
                  type="button"
                >
                  <SymbolIcon className="text-lg">skip_next</SymbolIcon>
                  跳过
                </button>
              </div>
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
