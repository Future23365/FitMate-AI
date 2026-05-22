"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";

type WorkoutMode = "duration" | "reps";

type WorkoutItem = {
  id: string;
  exerciseId: string;
  nameZh: string;
  nameEn: string;
  categoryZh: string;
  equipmentZh: string;
  musclesZh: string[];
  instructionsZh: string[];
  imageUrl: string;
  mode: WorkoutMode;
  target: number;
  sets: number;
  setRestSeconds: number;
  transitionRestSeconds: number;
};

type ScheduleStatus = "completed" | "missed" | "planned" | "rest";

type ScheduledWorkout = {
  id: string;
  date: string;
  planId: string;
  title: string;
  status: ScheduleStatus;
  minutes: number;
  calories: number;
  items: WorkoutItem[];
};

type SessionStep = {
  id: string;
  item: WorkoutItem;
  setIndex: number;
  totalSets: number;
  durationSeconds: number;
};

const scheduleStorageKey = "fitmate.trainingSchedule";
const placeholderImage = "/images/exercise-placeholder.svg";

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
    imageUrl: placeholderImage,
    mode,
    target,
    sets: 1,
    setRestSeconds: 30,
    transitionRestSeconds: 45,
  };
}

function estimateMinutes(items: WorkoutItem[]) {
  const seconds = items.reduce((total, item, index) => {
    const activeSeconds = item.mode === "duration" ? item.target : item.target * 4;
    const setRestSeconds = item.setRestSeconds * Math.max(0, item.sets - 1);
    const transitionRestSeconds = index < items.length - 1 ? item.transitionRestSeconds : 0;

    return total + activeSeconds * item.sets + setRestSeconds + transitionRestSeconds;
  }, 0);

  return Math.max(1, Math.round(seconds / 60));
}

function estimateCalories(items: WorkoutItem[]) {
  return Math.max(0, Math.round(estimateMinutes(items) * 7.2 + items.length * 12));
}

function getStepDuration(item: WorkoutItem) {
  return Math.max(5, item.mode === "duration" ? item.target : item.target * 4);
}

function buildSessionSteps(items: WorkoutItem[]) {
  return items.flatMap((item) =>
    Array.from({ length: Math.max(1, item.sets) }, (_, index) => ({
      id: `${item.id}-${index}`,
      item,
      setIndex: index + 1,
      totalSets: Math.max(1, item.sets),
      durationSeconds: getStepDuration(item),
    })),
  );
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getPlanFromStorage(planId: string | null) {
  if (typeof window === "undefined") {
    return fallbackPlan;
  }

  try {
    const rawSchedule = window.localStorage.getItem(scheduleStorageKey);
    const schedule = rawSchedule ? (JSON.parse(rawSchedule) as ScheduledWorkout[]) : [];
    const matchedPlan = planId ? schedule.find((plan) => plan.id === planId) : schedule.find((plan) => plan.status === "planned");

    if (matchedPlan && matchedPlan.items.length) {
      return matchedPlan;
    }
  } catch {
    return fallbackPlan;
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

  const steps = useMemo(() => buildSessionSteps(plan.items), [plan.items]);
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const currentItem = activeStep?.item ?? fallbackPlan.items[0];
  const completedItems = new Set(steps.slice(0, activeStepIndex).map((step) => step.item.id));
  const currentExerciseIndex = plan.items.findIndex((item) => item.id === currentItem.id);
  const progress =
    activeStep && activeStep.durationSeconds > 0
      ? ((activeStep.durationSeconds - remainingSeconds) / activeStep.durationSeconds) * 100
      : 0;
  const trainedCalories = Math.min(
    estimateCalories(plan.items),
    Math.round(Math.max(0, elapsedSeconds / 60) * 7.2 + completedItems.size * 8),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const selectedPlan = getPlanFromStorage(planId);
      const selectedSteps = buildSessionSteps(selectedPlan.items);

      setPlan({
        ...selectedPlan,
        minutes: selectedPlan.minutes || estimateMinutes(selectedPlan.items),
        calories: selectedPlan.calories || estimateCalories(selectedPlan.items),
      });
      setActiveStepIndex(0);
      setElapsedSeconds(0);
      setRemainingSeconds(selectedSteps[0]?.durationSeconds ?? 45);
    }, 0);

    return () => window.clearTimeout(timer);
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

  function finishTraining() {
    setIsPaused(true);

    try {
      const rawSchedule = window.localStorage.getItem(scheduleStorageKey);
      const schedule = rawSchedule ? (JSON.parse(rawSchedule) as ScheduledWorkout[]) : [];
      const nextSchedule = schedule.map((item) =>
        item.id === plan.id ? { ...item, status: "completed" as const } : item,
      );
      window.localStorage.setItem(scheduleStorageKey, JSON.stringify(nextSchedule));
    } catch {
      // 结束训练的本地状态写入失败不影响当前页面展示。
    }
  }

  return (
    <main className="custom-scrollbar app-mesh-bg min-h-screen overflow-y-auto px-md py-lg text-ink md:px-xl lg:pl-[284px]">
      <header className="mb-lg flex items-center justify-between gap-md">
        <Link className="flex items-center gap-md font-headline-md text-headline-md font-bold" href="/plans">
          <span className="grid h-9 w-9 place-items-center rounded-full text-3xl leading-none transition-colors hover:bg-white">
            ←
          </span>
          训练中
        </Link>
        <div className="flex items-center gap-sm">
          <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted shadow-card transition-colors hover:text-primary" type="button">
            <SymbolIcon className="text-2xl">notifications</SymbolIcon>
            <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white">
              2
            </span>
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted shadow-card transition-colors hover:text-primary" type="button">
            <SymbolIcon className="text-2xl">settings</SymbolIcon>
          </button>
        </div>
      </header>

      <section className="mb-lg grid gap-lg rounded-[20px] border border-line bg-white/90 p-lg shadow-card backdrop-blur-md xl:grid-cols-[1.7fr_1fr_1fr_1fr]">
        <div className="flex items-center gap-md">
          <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[20px] bg-primary-soft text-primary shadow-[inset_0_0_0_1px_#dceafe]">
            <SymbolIcon className="text-4xl">directions_run</SymbolIcon>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-extrabold">{plan.title}</h1>
            <p className="mt-xs text-body-md text-slate-600">
              {plan.minutes || estimateMinutes(plan.items)} 分钟 · {plan.items.length} 个动作 · {plan.calories || estimateCalories(plan.items)} kcal
            </p>
          </div>
        </div>
        <Metric icon="schedule" label="已训练时间" value={formatClock(elapsedSeconds)} />
        <Metric icon="local_fire_department" label="消耗热量" suffix="kcal" value={trainedCalories} />
        <Metric icon="favorite" label="平均心率" suffix="bpm" value={Math.min(142, 118 + Math.floor(elapsedSeconds / 45))} />
      </section>

      <section className="grid items-start gap-lg xl:grid-cols-[340px_minmax(480px,1fr)_360px] 2xl:grid-cols-[390px_minmax(520px,1fr)_410px]">
        <aside className="rounded-[20px] border border-line bg-white/90 p-lg shadow-card">
          <span className="mb-md inline-flex h-10 items-center rounded-xl bg-primary px-lg text-body-md font-bold text-white shadow-card">
            当前动作 {Math.max(1, currentExerciseIndex + 1)} / {plan.items.length}
          </span>
          <div className="relative grid h-[320px] place-items-center overflow-hidden rounded-xl bg-panel-soft 2xl:h-[420px]">
            {currentItem.imageUrl && currentItem.imageUrl !== placeholderImage ? (
              <Image
                alt={`${currentItem.nameZh} 动作图`}
                className="object-contain"
                fill
                sizes="(min-width: 1536px) 390px, 340px"
                src={currentItem.imageUrl}
              />
            ) : (
              <SquatIllustration />
            )}
          </div>
        </aside>

        <section className="flex min-h-[380px] flex-col items-center justify-center px-md text-center 2xl:min-h-[500px]">
          <h2 className="text-[32px] font-black leading-tight text-slate-950 2xl:text-[42px]">{currentItem.nameZh}</h2>
          <p className="mb-lg mt-xs text-title-lg text-slate-700 2xl:mb-xl">
            锻炼部位：{currentItem.musclesZh.slice(0, 3).join("、") || currentItem.categoryZh}
          </p>
          <div className="mb-sm text-[clamp(78px,11vw,148px)] font-black leading-[0.9] tracking-[-0.08em] text-[#0f1b31] [font-variant-numeric:tabular-nums] 2xl:mb-lg 2xl:text-[clamp(128px,15vw,196px)]">
            {formatClock(remainingSeconds)}
          </div>
          <p className="mb-sm text-xl font-bold 2xl:mb-md 2xl:text-[23px]">
            目标：{currentItem.mode === "duration" ? `${currentItem.target} 秒` : `${currentItem.target} 次`} · 第 {activeStep?.setIndex ?? 1} / {activeStep?.totalSets ?? 1} 组
          </p>
          <div className="mb-md h-[9px] w-full max-w-[560px] overflow-hidden rounded-full bg-panel-soft 2xl:mb-xl">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(3, Math.min(100, progress))}%` }} />
          </div>
          <button
            className="mb-md flex h-[46px] w-full max-w-[540px] items-center justify-center gap-md rounded-xl border border-primary/20 bg-primary-soft px-lg text-body-md font-bold 2xl:mb-xl 2xl:h-[54px] 2xl:text-body-lg"
            onClick={() => setIsAudioOn((value) => !value)}
            type="button"
          >
            <SymbolIcon className="text-2xl text-blue-700">volume_up</SymbolIcon>
            每秒提示音：{isAudioOn ? "已开启" : "已关闭"}
            <AudioWave />
          </button>
          <div className="flex items-start justify-center gap-lg md:gap-xl 2xl:gap-[80px]">
            <SessionControl icon="skip_previous" label="上一个" onClick={() => goToStep(activeStepIndex - 1)} />
            <SessionControl
              icon={isPaused ? "play_arrow" : "pause"}
              label={isPaused ? "继续" : "暂停"}
              large
              onClick={() => setIsPaused((value) => !value)}
            />
            <SessionControl icon="skip_next" label="下一个" onClick={() => goToStep(activeStepIndex + 1)} />
          </div>
        </section>

        <aside className="flex flex-col gap-md">
          <section className="rounded-[20px] border border-line bg-white/90 p-lg shadow-card">
            <div className="mb-md flex items-center justify-between">
              <h2 className="text-title-lg font-extrabold">训练项目（{plan.items.length} / {plan.items.length}）</h2>
              <span className="text-label-md font-bold text-primary">收起⌃</span>
            </div>
            <div className="space-y-sm">
              {plan.items.map((item, index) => {
                const isActive = item.id === currentItem.id;
                const isDone = completedItems.has(item.id);

                return (
                  <button
                    className={`grid min-h-[78px] w-full grid-cols-[76px_1fr_36px] items-center gap-md rounded-xl p-sm text-left transition-colors ${
                      isActive ? "bg-primary-soft" : "hover:bg-panel-soft"
                    }`}
                    key={item.id}
                    onClick={() => {
                      const nextStepIndex = steps.findIndex((step) => step.item.id === item.id);
                      goToStep(nextStepIndex < 0 ? index : nextStepIndex);
                    }}
                    type="button"
                  >
                    <div className="grid h-[58px] w-[76px] place-items-center overflow-hidden rounded-[10px] bg-slate-100">
                      <MiniFigure variant={index} />
                    </div>
                    <div className="min-w-0">
                      <p className={`truncate text-body-lg font-extrabold ${isActive ? "text-primary" : ""}`}>{item.nameZh}</p>
                      <p className="text-label-md font-semibold text-slate-500">
                        {item.mode === "duration" ? `${item.target} 秒` : `${item.target} 次`} · {item.sets}组
                      </p>
                    </div>
                    <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${
                      isDone
                        ? "bg-green-500 text-white"
                        : isActive
                          ? "bg-blue-600 text-white"
                          : "border-2 border-slate-400 bg-white text-slate-500"
                    }`}>
                      {isDone ? "✓" : isActive ? "▶" : index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[20px] border border-line bg-white/90 p-lg shadow-card">
            <div className="mb-lg flex items-center justify-between">
              <h2 className="text-title-lg font-extrabold">训练控制</h2>
              <span className="flex items-center gap-xs text-label-sm font-bold text-slate-500">
                <SymbolIcon className="text-base">settings</SymbolIcon>
                设置
              </span>
            </div>
            <div className="grid grid-cols-2 gap-md">
              <button className="flex h-[54px] items-center justify-center gap-xs rounded-xl border border-red-300 bg-white text-body-md font-extrabold text-red-500" onClick={finishTraining} type="button">
                <SymbolIcon className="text-lg">stop</SymbolIcon>
                结束训练
              </button>
              <button className="flex h-[54px] items-center justify-center gap-xs rounded-xl border border-primary/30 bg-white text-body-md font-extrabold text-primary" onClick={() => goToStep(activeStepIndex + 1)} type="button">
                <SymbolIcon className="text-lg">skip_next</SymbolIcon>
                跳过本组
              </button>
            </div>
          </section>
        </aside>
      </section>

      {showTip ? (
        <section className="mt-xl flex min-h-[62px] items-center gap-md rounded-xl border border-primary/10 bg-primary-soft px-lg text-body-lg text-muted">
          <SymbolIcon className="text-2xl text-primary">tips_and_updates</SymbolIcon>
          <span className="font-extrabold text-primary">训练提示</span>
          <span className="min-w-0 flex-1 truncate">
            {currentItem.instructionsZh[0] || "保持核心收紧，动作标准，注意呼吸节奏，避免代偿。"}
          </span>
          <button aria-label="关闭提示" className="text-3xl leading-none" onClick={() => setShowTip(false)} type="button">
            ×
          </button>
        </section>
      ) : null}
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
    <div className="flex min-h-[74px] flex-col items-center justify-center border-[#e5eaf2] xl:border-l">
      <p className="mb-xs flex items-center gap-xs text-label-md text-slate-600">
        <SymbolIcon className="text-xl text-slate-600">{icon}</SymbolIcon>
        {label}
      </p>
      <p className="text-[31px] font-black tracking-[-0.03em]">
        {value} {suffix ? <span className="text-body-lg font-bold">{suffix}</span> : null}
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
    <div className="flex min-w-[82px] flex-col items-center gap-[6px] text-label-md font-bold text-slate-700 2xl:gap-sm 2xl:text-body-md">
      <button
        className={`grid place-items-center rounded-full ${
          large
            ? "h-16 w-16 border-0 bg-primary text-white shadow-lift 2xl:h-28 2xl:w-28"
            : "h-12 w-12 border border-line bg-white text-slate-800 shadow-card 2xl:h-[74px] 2xl:w-[74px]"
        }`}
        onClick={onClick}
        type="button"
      >
        <SymbolIcon className={large ? "text-3xl 2xl:text-5xl" : "text-2xl 2xl:text-3xl"} filled={large}>
          {icon}
        </SymbolIcon>
      </button>
      <span className="leading-none">{label}</span>
    </div>
  );
}

function AudioWave() {
  const heights = [10, 18, 24, 14, 22, 12, 26, 18, 9, 20, 25, 13, 21, 16, 24, 11];

  return (
    <span className="hidden h-7 items-center gap-1 sm:flex" aria-hidden="true">
      {heights.map((height, index) => (
        <span className="w-[3px] rounded-full bg-blue-500" key={`${height}-${index}`} style={{ height }} />
      ))}
    </span>
  );
}

function SquatIllustration() {
  return (
    <div className="relative h-[330px] w-[300px] scale-90 2xl:scale-100" aria-label="深蹲动作示意">
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
