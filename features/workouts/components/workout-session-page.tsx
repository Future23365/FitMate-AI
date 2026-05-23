"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import {
  getScheduledWorkout,
  listScheduledWorkouts,
  updateScheduledWorkoutStatus,
} from "@/features/workouts/api/workout-data-client";
import {
  buildWorkoutTimeline,
  defaultSetRestSeconds,
  defaultTransitionRestSeconds,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  expandWorkoutItems,
  getRepIntervalSeconds,
  getWorkoutLoopConfig,
  normalizeWorkoutItem,
  placeholderWorkoutImage,
  type ScheduledWorkout,
  type WorkoutItem,
  type WorkoutMode,
} from "@/lib/shared/workouts/composition";

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

export function WorkoutSessionPage() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const [plan, setPlan] = useState<ScheduledWorkout>(fallbackPlan);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(45);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [showTip, setShowTip] = useState(true);

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
  const trainedCalories = Math.min(
    estimateWorkoutCalories(plan.items, loopConfig),
    Math.round(Math.max(0, elapsedSeconds / 60) * 7.2 + completedStepIds.size * 8),
  );
  const sessionProgress = steps.length
    ? ((activeStepIndex + Math.max(0, Math.min(1, progress / 100))) / steps.length) * 100
    : 0;
  const nextItem = orderedItems[currentExerciseIndex + 1];
  const remainingSteps = Math.max(0, steps.length - activeStepIndex - 1);

  useEffect(() => {
    let cancelled = false;

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
    });

    return () => {
      cancelled = true;
    };
  }, [planId]);

  useEffect(() => {
    if (isPaused || !activeStep) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      setRemainingSeconds((value) => {
        if (value <= 1) {
          const nextIndex = Math.min(activeStepIndex + 1, steps.length - 1);
          setActiveStepIndex(nextIndex);
          if (nextIndex === activeStepIndex) {
            setIsPaused(true);
          }

          return nextIndex === activeStepIndex ? 0 : steps[nextIndex]?.durationSeconds ?? 0;
        }

        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeStep, activeStepIndex, isPaused, steps]);

  function goToStep(nextIndex: number) {
    const boundedIndex = Math.min(Math.max(0, nextIndex), steps.length - 1);
    setActiveStepIndex(boundedIndex);
    setRemainingSeconds(steps[boundedIndex]?.durationSeconds ?? 45);
  }

  function completeCurrentStep() {
    const isLastStep = activeStepIndex >= steps.length - 1;

    if (isLastStep) {
      setIsPaused(true);
      setRemainingSeconds(0);
      return;
    }

    goToStep(activeStepIndex + 1);
  }

  function finishTraining() {
    setIsPaused(true);

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
            <button
              aria-label="切换提示音"
              className={`grid h-11 w-11 place-items-center rounded-xl border transition-colors ${
                isAudioOn
                  ? "border-primary/20 bg-primary-soft text-primary"
                  : "border-line bg-white text-muted hover:text-primary"
              }`}
              onClick={() => setIsAudioOn((value) => !value)}
              type="button"
            >
              <SymbolIcon className="text-2xl">{isAudioOn ? "volume_up" : "volume_off"}</SymbolIcon>
            </button>
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
                  {plan.status === "completed" ? "已完成" : "进行中"}
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
                <span className="rounded-xl bg-panel-soft px-sm py-xs text-label-md font-bold text-muted">
                  {Math.max(1, currentExerciseIndex + 1)}/{orderedItems.length}
                </span>
              </div>
              <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl bg-panel-soft">
                {currentItem.imageUrl && currentItem.imageUrl !== placeholderWorkoutImage ? (
                  <Image
                    alt={`${currentItem.nameZh} 动作图`}
                    className="object-contain p-md"
                    fill
                    sizes="(min-width: 1280px) 30vw, 100vw"
                    src={currentItem.imageUrl}
                  />
                ) : (
                  <SquatIllustration />
                )}
              </div>
            </section>
          </aside>

          <section className="flex min-h-0 flex-col items-center justify-center rounded-[20px] border border-line bg-white px-lg py-lg text-center shadow-card">
            <span className="mb-sm inline-flex items-center gap-xs rounded-full bg-primary-soft px-md py-xs text-label-md font-bold text-primary">
              <SymbolIcon className="text-lg">
                {isRestStep ? "timer" : isTimedStep ? "timer" : "format_list_numbered"}
              </SymbolIcon>
              {isRestStep
                ? activeRestStep?.label
                : `${isTimedStep ? "计时步骤" : "计次步骤"} · 第 ${activeExerciseStep?.setIndex ?? 1} / ${
                    activeExerciseStep?.totalSets ?? 1
                  } 组`}
            </span>
            <h2 className="max-w-[680px] text-[30px] font-extrabold leading-tight text-ink md:text-[38px]">
              {isRestStep ? activeRestStep?.label : currentItem.nameZh}
            </h2>
            <p className="mt-sm text-body-lg font-semibold text-muted">
              {isRestStep
                ? activeRestStep?.nextItem
                  ? `下一个动作：${activeRestStep.nextItem.nameZh}`
                  : "准备进入下一步"
                : currentItem.musclesZh.slice(0, 3).join("、") || currentItem.categoryZh}
            </p>
            {isRestStep ? (
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
