"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";

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
  mode: "duration" | "reps";
  target: number;
  sets: number;
  setRestSeconds: number;
  transitionRestSeconds: number;
  section?: WorkoutSection;
};

type SavedWorkout = {
  id: string;
  title: string;
  savedAt: string;
  items: WorkoutItem[];
  trainingLoopRounds?: number;
  trainingLoopRestSeconds?: number;
};

type WorkoutSection = "warmup" | "training" | "stretch";

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
  trainingLoopRounds?: number;
  trainingLoopRestSeconds?: number;
};

type CalendarCell = {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
};

const historyStorageKey = "fitmate.workoutHistory";
const scheduleStorageKey = "fitmate.trainingSchedule";
const defaultTrainingLoopRestSeconds = 45;
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const fallbackWorkouts: SavedWorkout[] = [
  {
    id: "fat-burn-circuit",
    title: "燃脂循环训练",
    savedAt: "模板",
    items: [
      createFallbackItem("jumping-jack", "开合跳", "Jumping Jack", "有氧", 30, "duration"),
      createFallbackItem("burpee", "波比跳", "Burpee", "力量", 15, "reps"),
      createFallbackItem("push-up", "俯卧撑", "Push-up", "力量", 20, "reps"),
    ],
  },
  {
    id: "upper-strength",
    title: "上肢力量",
    savedAt: "模板",
    items: [
      createFallbackItem("push-up", "俯卧撑", "Push-up", "力量", 15, "reps"),
      createFallbackItem("plank-shoulder-tap", "平板肩触", "Plank Shoulder Tap", "核心", 20, "reps"),
    ],
  },
  {
    id: "home-hiit",
    title: "居家HIIT",
    savedAt: "模板",
    items: [
      createFallbackItem("mountain-climber", "登山跑", "Mountain Climber", "有氧", 40, "duration"),
      createFallbackItem("squat", "深蹲", "Squat", "力量", 18, "reps"),
    ],
  },
  {
    id: "core-stability",
    title: "核心稳定",
    savedAt: "模板",
    items: [
      createFallbackItem("plank", "平板支撑", "Plank", "核心", 45, "duration"),
      createFallbackItem("dead-bug", "死虫式", "Dead Bug", "核心", 12, "reps"),
    ],
  },
];

function createFallbackItem(
  id: string,
  nameZh: string,
  nameEn: string,
  categoryZh: string,
  target: number,
  mode: WorkoutItem["mode"],
): WorkoutItem {
  return {
    id,
    exerciseId: id,
    nameZh,
    nameEn,
    categoryZh,
    equipmentZh: "自重",
    musclesZh: ["综合"],
    instructionsZh: [],
    imageUrl: "https://www.gstatic.com/labs-code/stitch/stitch-placeholder-300x300.svg",
    mode,
    target,
    sets: 3,
    setRestSeconds: 30,
    transitionRestSeconds: 45,
  };
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatMonth(date: Date) {
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function formatDayLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function expandWorkoutItems(items: WorkoutItem[], trainingLoopRounds = 1) {
  const warmupItems = items.filter((item) => (item.section ?? "training") === "warmup");
  const trainingItems = items.filter((item) => (item.section ?? "training") === "training");
  const stretchItems = items.filter((item) => (item.section ?? "training") === "stretch");
  const loopedTrainingItems = Array.from(
    { length: Math.max(1, Math.min(12, Math.round(trainingLoopRounds))) },
    () => trainingItems,
  ).flat();

  return [...warmupItems, ...loopedTrainingItems, ...stretchItems];
}

function getTrainingLoopRestTotalSeconds(
  items: WorkoutItem[],
  trainingLoopRounds: number,
  trainingLoopRestSeconds: number,
) {
  const trainingItems = items.filter((item) => (item.section ?? "training") === "training");

  if (!trainingItems.length) {
    return 0;
  }

  return Math.max(0, Math.min(12, Math.round(trainingLoopRounds)) - 1) * Math.max(0, trainingLoopRestSeconds);
}

function estimateMinutes(
  items: WorkoutItem[],
  trainingLoopRounds = 1,
  trainingLoopRestSeconds = defaultTrainingLoopRestSeconds,
) {
  const expandedItems = expandWorkoutItems(items, trainingLoopRounds);
  const seconds = expandedItems.reduce((total, item, index) => {
    const activeSeconds = item.mode === "duration" ? item.target : item.target * 4;
    const restBetweenSets = item.setRestSeconds * Math.max(0, item.sets - 1);
    const transitionRest = index < expandedItems.length - 1 ? item.transitionRestSeconds : 0;

    return total + activeSeconds * item.sets + restBetweenSets + transitionRest;
  }, getTrainingLoopRestTotalSeconds(items, trainingLoopRounds, trainingLoopRestSeconds));

  return Math.max(15, Math.round(seconds / 60));
}

function estimateCalories(
  items: WorkoutItem[],
  trainingLoopRounds = 1,
  trainingLoopRestSeconds = defaultTrainingLoopRestSeconds,
) {
  const expandedItems = expandWorkoutItems(items, trainingLoopRounds);
  return Math.max(
    80,
    Math.round(
      estimateMinutes(items, trainingLoopRounds, trainingLoopRestSeconds) * 7.2 +
        expandedItems.length * 12,
    ),
  );
}

function getCalendarCells(monthDate: Date): CalendarCell[] {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      dateKey: toDateKey(date),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
    };
  });
}

function getDefaultSchedule(today: Date): ScheduledWorkout[] {
  const basePlans = fallbackWorkouts.slice(0, 3);
  const offsets: Array<[number, ScheduleStatus]> = [
    [-6, "completed"],
    [-4, "completed"],
    [-2, "missed"],
    [0, "planned"],
    [3, "rest"],
  ];

  return offsets.map(([offset, status], index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const plan = basePlans[index % basePlans.length];

    return status === "rest"
      ? {
          id: `seed-rest-${toDateKey(date)}`,
          date: toDateKey(date),
          planId: "rest",
          title: "休息日",
          status,
          minutes: 0,
          calories: 0,
          items: [],
        }
      : createScheduledWorkout(plan, toDateKey(date), status);
  });
}

function createScheduledWorkout(
  plan: SavedWorkout,
  dateKey: string,
  status: ScheduleStatus = "planned",
): ScheduledWorkout {
  const items = plan.items;
  const trainingLoopRounds = plan.trainingLoopRounds ?? 1;
  const trainingLoopRestSeconds = plan.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds;

  return {
    id: `${plan.id}-${dateKey}-${crypto.randomUUID()}`,
    date: dateKey,
    planId: plan.id,
    title: plan.title,
    status,
    minutes: estimateMinutes(items, trainingLoopRounds, trainingLoopRestSeconds),
    calories: estimateCalories(items, trainingLoopRounds, trainingLoopRestSeconds),
    items,
    trainingLoopRounds,
    trainingLoopRestSeconds,
  };
}

function getStatusConfig(status: ScheduleStatus) {
  switch (status) {
    case "completed":
      return {
        icon: "check_circle",
        label: "已完成",
        cellClass: "bg-white",
        badgeClass: "bg-primary-container text-white",
      };
    case "missed":
      return {
        icon: "error",
        label: "未完成",
        cellClass: "bg-white",
        badgeClass: "bg-error text-white",
      };
    case "rest":
      return {
        icon: "self_improvement",
        label: "休息日",
        cellClass: "bg-surface-container-low",
        badgeClass: "bg-surface-container-highest text-outline",
      };
    default:
      return {
        icon: "schedule",
        label: "待开始",
        cellClass: "bg-white",
        badgeClass: "border-2 border-primary-container bg-white text-primary",
      };
  }
}

export function TrainingPlanPage() {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>(fallbackWorkouts);
  const [schedule, setSchedule] = useState<ScheduledWorkout[]>([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const rawHistory = window.localStorage.getItem(historyStorageKey);
        const history = rawHistory ? (JSON.parse(rawHistory) as SavedWorkout[]) : [];
        setSavedWorkouts(history.length ? history : fallbackWorkouts);
      } catch {
        setSavedWorkouts(fallbackWorkouts);
      }

      try {
        const rawSchedule = window.localStorage.getItem(scheduleStorageKey);
        const parsedSchedule = rawSchedule ? (JSON.parse(rawSchedule) as ScheduledWorkout[]) : [];
        setSchedule(parsedSchedule.length ? parsedSchedule : getDefaultSchedule(today));
      } catch {
        setSchedule(getDefaultSchedule(today));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [today]);

  useEffect(() => {
    if (!schedule.length) {
      return;
    }

    window.localStorage.setItem(scheduleStorageKey, JSON.stringify(schedule));
  }, [schedule]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredWorkouts = savedWorkouts;
  const cells = getCalendarCells(monthDate);
  const selectedDayPlans = schedule.filter((plan) => plan.date === selectedDateKey);
  const expandedPlanId = selectedDayPlans.some((plan) => plan.id === selectedPlanId)
    ? selectedPlanId
    : selectedDayPlans[0]?.id ?? "";
  const monthlyStats = schedule.filter(
    (plan) =>
      plan.date.startsWith(`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`) &&
      plan.status === "completed",
  );
  const completedCount = monthlyStats.length;
  const completedMinutes = monthlyStats.reduce((total, item) => total + item.minutes, 0);
  const completedCalories = monthlyStats.reduce((total, item) => total + item.calories, 0);
  const plannedCount = schedule.filter((plan) => plan.status === "planned").length;

  function shiftMonth(delta: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function scheduleWorkout(plan: SavedWorkout, dateKey = selectedDateKey) {
    const scheduledWorkout = createScheduledWorkout(plan, dateKey);

    setSchedule((current) => [
      ...current.filter((item) => !(item.date === dateKey && item.status === "rest")),
      scheduledWorkout,
    ]);
    setSelectedDateKey(dateKey);
    setSelectedPlanId(scheduledWorkout.id);
    setToast(`已安排：${plan.title} · ${formatDayLabel(dateKey)}`);
  }

  function addRestDay() {
    setSchedule((current) => [
      ...current.filter((item) => item.date !== selectedDateKey),
      {
        id: `rest-${selectedDateKey}-${crypto.randomUUID()}`,
        date: selectedDateKey,
        planId: "rest",
        title: "休息日",
        status: "rest",
        minutes: 0,
        calories: 0,
        items: [],
      },
    ]);
    setToast(`已设置休息日：${formatDayLabel(selectedDateKey)}`);
  }

  function updatePlanStatus(planId: string, status: ScheduleStatus) {
    setSchedule((current) => current.map((plan) => (plan.id === planId ? { ...plan, status } : plan)));
    setSelectedPlanId(planId);
    setToast(`状态已更新为：${getStatusConfig(status).label}`);
  }

  function removePlan(planId: string) {
    setSchedule((current) => current.filter((plan) => plan.id !== planId));
    if (selectedPlanId === planId) {
      setSelectedPlanId("");
    }
    setToast("已移除当天安排");
  }

  return (
    <div className="app-mesh-bg min-h-screen text-ink lg:pl-[260px] xl:pr-[320px]">
      <main className="custom-scrollbar h-screen overflow-y-auto overflow-x-hidden p-lg xl:p-xl">
        <section className="mb-xl flex flex-col gap-md md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-extrabold tracking-[-0.03em]">训练日历</h1>
            <p className="mt-xs font-body-md text-body-md text-muted">
              规划你的健身周，保持运动节奏。
            </p>
          </div>
          <button
            className="flex items-center justify-center gap-xs rounded-xl bg-primary px-lg py-md font-label-md text-label-md font-bold text-white shadow-card transition-all hover:bg-primary-deep hover:shadow-lift active:scale-[0.98]"
            onClick={() => {
              const plan = filteredWorkouts[0] ?? fallbackWorkouts[0];
              scheduleWorkout(plan);
            }}
            type="button"
          >
            <SymbolIcon className="text-[20px]">event_available</SymbolIcon>
            安排新训练
          </button>
        </section>

        <section className="mb-xl space-y-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-title-lg text-title-lg font-extrabold">已保存计划</h2>
            <Link className="font-label-sm text-label-sm font-bold text-primary hover:underline" href="/composer">
              管理全部
            </Link>
          </div>
          <div className="relative -mx-xs">
            <div className="scrollbar-none flex gap-md overflow-x-auto px-xs pb-1">
              {filteredWorkouts.map((workout) => (
                <SavedPlanCard
                  key={workout.id}
                  workout={workout}
                  onSchedule={() => scheduleWorkout(workout)}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#F6F8FB] to-transparent" />
          </div>
        </section>

        <section className="rounded-[20px] border border-line bg-white p-lg shadow-card">
          <div className="mb-xl flex items-center justify-between gap-md">
            <div className="flex shrink-0 items-center gap-sm rounded-xl bg-panel-soft px-md py-sm">
              <button
                aria-label="上个月"
                className="rounded-lg p-xs text-secondary transition-colors hover:bg-white hover:text-primary"
                onClick={() => shiftMonth(-1)}
                type="button"
              >
                <SymbolIcon>chevron_left</SymbolIcon>
              </button>
              <span className="min-w-36 text-center font-headline-md text-headline-md">
                {formatMonth(monthDate)}
              </span>
              <button
                aria-label="下个月"
                className="rounded-lg p-xs text-secondary transition-colors hover:bg-white hover:text-primary"
                onClick={() => shiftMonth(1)}
                type="button"
              >
                <SymbolIcon>chevron_right</SymbolIcon>
              </button>
            </div>
            <div className="custom-scrollbar ml-auto flex min-w-0 max-w-[min(520px,55%)] shrink overflow-x-auto whitespace-nowrap rounded-xl bg-panel-soft px-sm py-sm md:px-lg">
              <div className="flex shrink-0 items-center gap-sm md:gap-md">
              <LegendDot className="bg-primary-container" label="已完成" />
              <LegendDot className="border-2 border-primary-container" label="已安排" />
              <LegendDot className="bg-error" label="未完成" />
              <LegendDot className="bg-surface-container-highest" label="休息日" />
              </div>
            </div>
          </div>

          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-inner">
            {weekdays.map((weekday) => (
              <div
                className="border-b border-line bg-panel-soft p-md text-center font-label-md text-label-md font-bold text-secondary"
                key={weekday}
              >
                {weekday}
              </div>
            ))}
            {cells.map((cell) => {
              const plans = schedule.filter((plan) => plan.date === cell.dateKey);
              const isSelected = selectedDateKey === cell.dateKey;
              const isToday = todayKey === cell.dateKey;

              return (
                <button
                  className={`group min-h-[122px] p-sm text-left transition-all ${
                    cell.isCurrentMonth
                      ? "bg-white hover:bg-primary-soft/60"
                      : "bg-panel-soft text-muted/60"
                  } ${isSelected ? "relative z-10 bg-primary-soft ring-2 ring-primary ring-inset" : ""}`}
                  key={cell.dateKey}
                  onClick={() => {
                    setSelectedDateKey(cell.dateKey);
                    setSelectedPlanId("");
                  }}
                  type="button"
                >
                  <div className="mb-sm flex items-start justify-between">
                    <span
                      className={`flex h-8 min-w-8 items-center justify-center rounded-full px-xs font-title-lg text-title-lg transition-colors ${
                        isSelected
                            ? "bg-primary text-white shadow-sm"
                          : isToday
                            ? "bg-primary-container text-white"
                            : cell.isCurrentMonth
                              ? "bg-panel-soft text-ink group-hover:bg-white group-hover:text-primary"
                              : "bg-surface text-muted/60"
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {isToday ? (
                      <span className="rounded-full bg-primary/10 px-sm py-[2px] text-[10px] font-bold text-primary">
                        今天
                      </span>
                    ) : null}
                  </div>
                  <div className="min-h-12 space-y-xs">
                    {plans.slice(0, 2).map((plan) => (
                      <CalendarPlanBadge key={plan.id} plan={plan} />
                    ))}
                    {plans.length > 2 ? (
                      <span className="block rounded bg-surface-container-high px-sm py-xs text-[10px] text-secondary">
                        +{plans.length - 2} 项
                      </span>
                    ) : null}
                  </div>
                  {!plans.length && cell.isCurrentMonth ? (
                    <div className="mt-sm h-1 rounded-full bg-surface-container-low opacity-80 transition-colors group-hover:bg-primary-fixed" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <aside className="custom-scrollbar fixed right-0 top-0 z-30 hidden h-screen w-[320px] flex-col gap-lg overflow-y-auto border-l border-line/70 bg-white/68 p-md shadow-nav backdrop-blur-2xl xl:flex">
        <section className="space-y-md">
          <h2 className="flex items-center gap-xs font-label-md text-label-md font-bold text-secondary">
            <SymbolIcon className="text-[18px]">calendar_today</SymbolIcon>
            当天计划 ({formatDayLabel(selectedDateKey)})
          </h2>
          {selectedDayPlans.length ? (
            <div className="space-y-xs">
              {selectedDayPlans.map((plan) => {
                const isExpanded = plan.id === expandedPlanId;

                return (
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-out ${
                      isExpanded ? "rounded-2xl opacity-100" : "rounded-xl opacity-95"
                    }`}
                    key={plan.id}
                  >
                    {isExpanded ? (
                      <CurrentPlanCard
                        plan={plan}
                        onRemove={() => removePlan(plan.id)}
                        onStatusChange={(status) => updatePlanStatus(plan.id, status)}
                      />
                    ) : (
                      <CollapsedDayPlanButton
                        onClick={() => setSelectedPlanId(plan.id)}
                        plan={plan}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-line bg-white p-md text-center shadow-card">
              <SymbolIcon className="mb-sm text-4xl text-outline">event_busy</SymbolIcon>
              <p className="font-label-md text-label-md text-muted">当天还没有训练安排</p>
              <button
                className="mt-md rounded-xl bg-primary px-md py-sm font-label-md text-label-md font-bold text-white"
                onClick={() => {
                  const plan = filteredWorkouts[0] ?? fallbackWorkouts[0];
                  scheduleWorkout(plan);
                }}
                type="button"
              >
                快速安排
              </button>
            </div>
          )}
        </section>

        <section className="space-y-sm">
          <h2 className="font-label-md text-label-md font-bold text-secondary">本月统计</h2>
          <div className="grid grid-cols-2 gap-sm">
            <StatsTile label="完成训练/次" value={completedCount} />
            <StatsTile label="总时长/min" value={completedMinutes} />
            <StatsTile label="消耗/kcal" value={completedCalories} />
            <StatsTile label="待完成/次" value={plannedCount} />
          </div>
        </section>

        <section className="space-y-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-label-md text-label-md font-bold text-secondary">最近动态</h2>
            <span className="text-[12px] text-primary">详情</span>
          </div>
          <div className="space-y-xs">
            {schedule
              .filter((plan) => plan.status === "completed" || plan.status === "missed")
              .slice(-4)
              .reverse()
              .map((plan) => (
                <ActivityItem key={plan.id} plan={plan} />
              ))}
          </div>
        </section>

        <section className="space-y-sm">
          <h2 className="font-label-md text-label-md font-bold text-secondary">快速建议</h2>
          <button
            className="group flex w-full items-center justify-between rounded-xl border border-line bg-white p-md text-left shadow-card transition-colors hover:border-primary"
            onClick={addRestDay}
            type="button"
          >
            <span className="flex items-center gap-sm">
              <SymbolIcon className="text-secondary group-hover:text-primary">self_improvement</SymbolIcon>
              <span className="font-label-md text-label-md">设置为恢复休息日</span>
            </span>
            <SymbolIcon className="text-[18px] text-secondary">add</SymbolIcon>
          </button>
        </section>
      </aside>

      {toast ? (
        <div className="fixed bottom-lg left-1/2 z-50 -translate-x-1/2 rounded-full bg-inverse-surface px-lg py-sm font-label-md text-label-md text-inverse-on-surface shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function SavedPlanCard({
  onSchedule,
  workout,
}: {
  onSchedule: () => void;
  workout: SavedWorkout;
}) {
  const loopRounds = workout.trainingLoopRounds ?? 1;
  const loopRestSeconds = workout.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds;
  const minutes = estimateMinutes(workout.items, loopRounds, loopRestSeconds);
  const calories = estimateCalories(workout.items, loopRounds, loopRestSeconds);
  const icon = workout.title.includes("燃脂")
    ? "local_fire_department"
    : workout.title.includes("核心")
      ? "accessibility_new"
      : workout.title.includes("居家")
        ? "home"
        : "fitness_center";

  return (
    <div className="group flex w-56 shrink-0 cursor-pointer items-center gap-sm rounded-xl border border-line bg-white p-sm shadow-card transition-all hover:border-primary/40 hover:ring-1 hover:ring-primary/10">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <SymbolIcon className="text-[20px]">{icon}</SymbolIcon>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-label-md text-label-md font-bold">{workout.title}</h3>
        <p className="text-[10px] text-secondary">
          {workout.items.length}动作 · 训练{loopRounds}轮 · {calories}kcal · {minutes}min
        </p>
      </div>
      <button
        aria-label={`安排 ${workout.title}`}
        className="rounded-full p-xs text-primary opacity-100 transition-colors hover:bg-primary/10 md:opacity-0 md:group-hover:opacity-100"
        onClick={onSchedule}
        type="button"
      >
        <SymbolIcon className="text-[18px]">add</SymbolIcon>
      </button>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-xs">
      <span className={`h-4 w-4 rounded-full ${className}`} />
      <span className="font-label-sm text-label-sm text-on-surface">{label}</span>
    </div>
  );
}

function CalendarPlanBadge({ plan }: { plan: ScheduledWorkout }) {
  const status = getStatusConfig(plan.status);

  return (
    <div className={`flex items-center gap-xs rounded-lg px-sm py-xs text-[10px] shadow-sm ${status.badgeClass}`}>
      <SymbolIcon className="text-[14px]" filled={plan.status === "completed"}>
        {status.icon}
      </SymbolIcon>
      <span className="truncate">{plan.status === "missed" ? `${plan.title} (未完成)` : plan.title}</span>
    </div>
  );
}

function CollapsedDayPlanButton({
  onClick,
  plan,
}: {
  onClick: () => void;
  plan: ScheduledWorkout;
}) {
  const status = getStatusConfig(plan.status);

  return (
    <button
      className="group flex w-full items-center gap-sm rounded-xl border border-line bg-white p-sm text-left shadow-card transition-all duration-200 hover:border-primary/40 hover:bg-primary-soft/60 hover:shadow-lift"
      onClick={onClick}
      type="button"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${status.badgeClass}`}>
        <SymbolIcon className="text-[18px]" filled={plan.status === "completed"}>
          {status.icon}
        </SymbolIcon>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-label-md text-label-md font-bold">{plan.title}</span>
        <span className="block truncate text-[10px] text-secondary">
          {status.label} · {plan.minutes}min · {plan.calories}kcal
        </span>
      </span>
      <SymbolIcon className="text-primary transition-transform duration-200 group-hover:translate-y-0.5">
        expand_more
      </SymbolIcon>
    </button>
  );
}

function CurrentPlanCard({
  onRemove,
  onStatusChange,
  plan,
}: {
  onRemove: () => void;
  onStatusChange: (status: ScheduleStatus) => void;
  plan: ScheduledWorkout;
}) {
  const status = getStatusConfig(plan.status);

  if (plan.status === "rest") {
    return (
      <div className="rounded-[20px] border border-line bg-panel-soft p-md text-center">
        <SymbolIcon className="mb-sm text-4xl text-secondary">self_improvement</SymbolIcon>
        <h3 className="font-headline-md text-headline-md">恢复休息日</h3>
        <p className="mt-xs font-label-md text-label-md text-on-surface-variant">
          保持轻活动和睡眠，让训练恢复更充分。
        </p>
        <button
          className="mt-md rounded-xl bg-white px-md py-sm font-label-md text-label-md font-bold text-primary"
          onClick={onRemove}
          type="button"
        >
          取消休息日
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-md rounded-[20px] border border-line bg-[#F8FAFF] p-md text-ink shadow-card">
      <div className="flex items-start justify-between gap-sm">
        <div className="min-w-0">
          <h3 className="font-headline-md text-headline-md">{plan.title}</h3>
          <p className="font-label-sm text-label-sm text-muted">
            {status.label} · {plan.minutes}分钟 · {plan.calories}kcal
          </p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <SymbolIcon>{plan.title.includes("燃脂") ? "local_fire_department" : "fitness_center"}</SymbolIcon>
        </span>
      </div>
      <ul className="space-y-xs font-label-sm text-label-sm text-muted">
        {plan.items.slice(0, 4).map((item) => (
          <li className="flex items-center gap-xs" key={item.id}>
            <SymbolIcon className="text-[14px] text-primary">check</SymbolIcon>
            {item.nameZh} x {item.mode === "duration" ? `${item.target}s` : item.target}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-xs">
        <Link
          className="col-span-3 rounded-xl bg-primary px-sm py-sm text-center font-label-sm text-label-sm font-bold text-white shadow-card transition-colors hover:bg-primary-deep"
          href={`/training?planId=${encodeURIComponent(plan.id)}`}
        >
          开始训练
        </Link>
        <button
          className="rounded-xl border border-line bg-white px-sm py-sm font-label-sm text-label-sm font-bold text-primary"
          onClick={() => onStatusChange("completed")}
          type="button"
        >
          完成
        </button>
        <button
          className="rounded-xl border border-line bg-white px-sm py-sm font-label-sm text-label-sm font-bold text-muted"
          onClick={() => onStatusChange("missed")}
          type="button"
        >
          未完成
        </button>
        <button
          className="rounded-xl border border-line bg-white px-sm py-sm font-label-sm text-label-sm font-bold text-muted"
          onClick={onRemove}
          type="button"
        >
          移除
        </button>
      </div>
    </div>
  );
}

function StatsTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-white p-md text-center shadow-card">
      <p className="font-headline-md text-headline-md font-bold text-primary">{value}</p>
      <p className="text-[10px] text-secondary">{label}</p>
    </div>
  );
}

function ActivityItem({ plan }: { plan: ScheduledWorkout }) {
  const status = getStatusConfig(plan.status);

  return (
    <div className="flex items-center gap-md rounded-xl border border-line bg-white p-sm shadow-card">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <SymbolIcon className="text-[18px]">{status.icon}</SymbolIcon>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-label-sm text-label-sm font-bold">{plan.title}</p>
        <p className="text-[10px] text-secondary">
          {formatDayLabel(plan.date)} · {status.label} · {plan.minutes}min
        </p>
      </div>
    </div>
  );
}
