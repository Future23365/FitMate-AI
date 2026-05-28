"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import {
  createWorkoutSchedule,
  deleteWorkoutSchedule,
  listWorkoutRoutines,
  listWorkoutSchedules,
  updateWorkoutScheduleStatus,
} from "@/features/workouts/api/workout-data-client";
import {
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getWorkoutTimingConfig,
  normalizeWorkoutRoutine,
  type WorkoutRoutine,
  type WorkoutSchedule,
  type WorkoutScheduleStatus,
} from "@/lib/shared/workouts/composition";

type CalendarCell = {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
};

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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

function createScheduledEntry(
  routine: WorkoutRoutine,
  dateKey: string,
  status: WorkoutScheduleStatus = "planned",
): WorkoutSchedule {
  const normalizedRoutine = normalizeWorkoutRoutine(routine);
  const timingConfig = getWorkoutTimingConfig(normalizedRoutine);

  return {
    id: `${normalizedRoutine.id}-${dateKey}-${crypto.randomUUID()}`,
    date: dateKey,
    routineId: normalizedRoutine.id,
    title: normalizedRoutine.title,
    status,
    minutes: estimateWorkoutMinutes(normalizedRoutine.items, {
      minimumMinutes: 15,
      ...timingConfig,
    }),
    calories: estimateWorkoutCalories(normalizedRoutine.items, {
      minimumCalories: 80,
      ...timingConfig,
    }),
    items: normalizedRoutine.items,
    ...timingConfig,
  };
}

function getStatusConfig(status: WorkoutScheduleStatus) {
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
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [workoutRoutines, setWorkoutRoutines] = useState<WorkoutRoutine[]>([]);
  const [schedule, setSchedule] = useState<WorkoutSchedule[]>([]);
  const [isSavedPlansOpen, setIsSavedPlansOpen] = useState(false);
  const [toast, setToast] = useState("");
  const savedPlansMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function syncData() {
      try {
        const [nextWorkouts, nextSchedule] = await Promise.all([
          listWorkoutRoutines(),
          listWorkoutSchedules(),
        ]);
        setWorkoutRoutines(nextWorkouts.map(normalizeWorkoutRoutine));
        setSchedule(nextSchedule);
      } catch {
        setToast("训练数据加载失败");
      }
    }

    void syncData();
    window.addEventListener("fitmate:workouts-updated", syncData);
    window.addEventListener("fitmate:training-schedule-updated", syncData);

    return () => {
      window.removeEventListener("fitmate:workouts-updated", syncData);
      window.removeEventListener("fitmate:training-schedule-updated", syncData);
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isSavedPlansOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (savedPlansMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsSavedPlansOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isSavedPlansOpen]);

  const filteredWorkouts = workoutRoutines;
  const cells = getCalendarCells(monthDate);
  const selectedDayPlans = schedule.filter((plan) => plan.date === selectedDateKey);
  const expandedPlanId = selectedDayPlans.some((plan) => plan.id === selectedScheduleId)
    ? selectedScheduleId
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

  function goToToday() {
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDateKey(todayKey);
    setSelectedScheduleId("");
  }

  async function scheduleWorkout(plan: WorkoutRoutine, dateKey = selectedDateKey) {
    const scheduledWorkout = createScheduledEntry(plan, dateKey);

    try {
      const persistedWorkout = await createWorkoutSchedule(scheduledWorkout);
      setSchedule((current) => [
        ...current.filter((item) => !(item.date === dateKey && item.status === "rest")),
        persistedWorkout,
      ]);
      setSelectedDateKey(dateKey);
      setSelectedScheduleId(persistedWorkout.id);
      setToast(`已安排：${plan.title} · ${formatDayLabel(dateKey)}`);
    } catch {
      setToast("安排训练失败");
    }
  }

  async function addRestDay() {
    const restDay: WorkoutSchedule = {
      id: `rest-${selectedDateKey}-${crypto.randomUUID()}`,
      date: selectedDateKey,
      title: "休息日",
      status: "rest",
      minutes: 0,
      calories: 0,
      items: [],
    };

    try {
      await Promise.all(schedule.filter((item) => item.date === selectedDateKey).map((item) => deleteWorkoutSchedule(item.id)));
      const persistedRestDay = await createWorkoutSchedule(restDay);
      setSchedule((current) => [
        ...current.filter((item) => item.date !== selectedDateKey),
        persistedRestDay,
      ]);
      setSelectedScheduleId(persistedRestDay.id);
      setToast(`已设置休息日：${formatDayLabel(selectedDateKey)}`);
    } catch {
      setToast("设置休息日失败");
    }
  }

  async function updatePlanStatus(scheduleId: string, status: WorkoutScheduleStatus) {
    try {
      const persistedPlan = await updateWorkoutScheduleStatus(scheduleId, status);
      setSchedule((current) => current.map((plan) => (plan.id === scheduleId ? persistedPlan : plan)));
      setSelectedScheduleId(scheduleId);
      setToast(`状态已更新为：${getStatusConfig(status).label}`);
    } catch {
      setToast("训练状态更新失败");
    }
  }

  async function removePlan(scheduleId: string) {
    try {
      await deleteWorkoutSchedule(scheduleId);
      setSchedule((current) => current.filter((plan) => plan.id !== scheduleId));
      if (selectedScheduleId === scheduleId) {
        setSelectedScheduleId("");
      }
      setToast("已移除当天安排");
    } catch {
      setToast("移除当天安排失败");
    }
  }

  return (
    <div className="app-mesh-bg min-h-screen text-ink md:pl-[260px] xl:pr-[320px]">
      <main className="flex h-screen min-h-0 flex-col overflow-hidden p-lg xl:p-xl">
        <section className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line bg-white p-md shadow-card xl:p-lg">
          <div className="mb-md flex shrink-0 flex-wrap items-center justify-between gap-md">
            <div className="flex min-w-0 flex-wrap items-center gap-md">
              <div className="w-40 shrink-0">
                <h1 className="font-headline-md text-headline-md font-extrabold">训练日历</h1>
                <p className="font-label-sm text-label-sm text-muted tabular-nums">
                  当前选中：{formatDayLabel(selectedDateKey)}
                </p>
              </div>
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
              <button
                className="flex items-center gap-xs rounded-xl border border-line bg-white px-md py-sm font-label-md text-label-md font-bold text-primary shadow-card transition-colors hover:border-primary/40 hover:bg-primary-soft"
                onClick={goToToday}
                type="button"
              >
                <SymbolIcon className="text-[18px]">today</SymbolIcon>
                回到今天
              </button>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-end gap-sm">
              <div className="custom-scrollbar flex max-w-[360px] shrink overflow-x-auto whitespace-nowrap rounded-xl bg-panel-soft px-sm py-sm">
                <div className="flex shrink-0 items-center gap-sm md:gap-md">
                  <LegendDot className="bg-primary-container" label="已完成" />
                  <LegendDot className="border-2 border-primary-container" label="已安排" />
                  <LegendDot className="bg-error" label="未完成" />
                  <LegendDot className="bg-surface-container-highest" label="休息日" />
                </div>
              </div>
              <div className="relative" ref={savedPlansMenuRef}>
                <button
                  aria-expanded={isSavedPlansOpen}
                  className="flex items-center gap-xs rounded-xl border border-line bg-white px-md py-sm font-label-md text-label-md font-bold text-primary shadow-card transition-colors hover:border-primary/40 hover:bg-primary-soft"
                  onClick={() => setIsSavedPlansOpen((current) => !current)}
                  type="button"
                >
                  <SymbolIcon className="text-[18px]">inventory_2</SymbolIcon>
                  已保存计划
                  <span className="rounded-full bg-primary-soft px-xs text-[10px] text-primary">
                    {filteredWorkouts.length}
                  </span>
                </button>
                {isSavedPlansOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[360px] overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
                    <div className="flex items-center justify-between border-b border-line bg-panel-soft px-md py-sm">
                      <span className="font-label-md text-label-md font-bold">选择计划安排到 {formatDayLabel(selectedDateKey)}</span>
                      <Link
                        className="font-label-sm text-label-sm font-bold text-primary hover:underline"
                        href="/composer"
                        onClick={() => setIsSavedPlansOpen(false)}
                      >
                        管理全部
                      </Link>
                    </div>
                    <div className="custom-scrollbar max-h-[420px] space-y-xs overflow-y-auto p-sm">
                      {filteredWorkouts.length ? (
                        filteredWorkouts.map((workout) => (
                          <SavedPlanMenuItem
                            key={workout.id}
                            workout={workout}
                            onSchedule={() => {
                              setIsSavedPlansOpen(false);
                              void scheduleWorkout(workout);
                            }}
                          />
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-line p-md text-center">
                          <p className="font-label-md text-label-md text-muted">还没有已保存计划</p>
                          <Link
                            className="mt-sm inline-flex rounded-xl bg-primary px-md py-sm font-label-md text-label-md font-bold text-white"
                            href="/composer"
                            onClick={() => setIsSavedPlansOpen(false)}
                          >
                            去编排
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                className="flex items-center justify-center gap-xs rounded-xl bg-primary px-md py-sm font-label-md text-label-md font-bold text-white shadow-card transition-all hover:bg-primary-deep hover:shadow-lift active:scale-[0.98]"
                onClick={() => {
                  const plan = filteredWorkouts[0];
                  if (plan) {
                    void scheduleWorkout(plan);
                  }
                }}
                type="button"
              >
                <SymbolIcon className="text-[20px]">event_available</SymbolIcon>
                快速安排
              </button>
            </div>
          </div>

          <div className="grid min-h-0 min-w-[760px] flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border border-line bg-line shadow-inner">
            {weekdays.map((weekday) => (
              <div
                className="border-b border-line bg-panel-soft px-md py-sm text-center font-label-md text-label-md font-bold text-secondary"
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
                  className={`group min-h-0 overflow-hidden p-sm text-left transition-all ${
                    cell.isCurrentMonth
                      ? "bg-white hover:bg-primary-soft/60"
                      : "bg-panel-soft text-muted/60"
                  } ${isSelected ? "relative z-10 bg-primary-soft ring-2 ring-primary ring-inset" : ""}`}
                  key={cell.dateKey}
                  onClick={() => {
                    setSelectedDateKey(cell.dateKey);
                    setSelectedScheduleId("");
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
                  <div className="flex min-h-6 min-w-0 items-center gap-xs">
                    {plans[0] ? <CalendarPlanBadge plan={plans[0]} /> : null}
                    {plans.length > 1 ? (
                      <span className="flex h-6 shrink-0 items-center justify-center rounded-lg bg-surface-container-high px-xs text-[10px] font-bold leading-none text-secondary">
                        +{plans.length - 1} 项
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

      <aside className="app-shell-glass custom-scrollbar fixed right-0 top-0 z-30 hidden h-screen w-[320px] flex-col gap-lg overflow-y-auto border-l border-line/70 p-md shadow-nav xl:flex">
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
                        onRemove={() => void removePlan(plan.id)}
                        onStatusChange={(status) => void updatePlanStatus(plan.id, status)}
                      />
                    ) : (
                      <CollapsedDayPlanButton
                        onClick={() => setSelectedScheduleId(plan.id)}
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
                  const plan = filteredWorkouts[0];
                  if (plan) {
                    void scheduleWorkout(plan);
                  }
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
            onClick={() => void addRestDay()}
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

// SavedPlanMenuItem 承载训练日历页的排期素材，避免已保存计划常驻占用月历空间。
function SavedPlanMenuItem({
  onSchedule,
  workout,
}: {
  onSchedule: () => void;
  workout: WorkoutRoutine;
}) {
  const normalizedWorkout = normalizeWorkoutRoutine(workout);
  const timingConfig = getWorkoutTimingConfig(normalizedWorkout);
  const minutes = estimateWorkoutMinutes(normalizedWorkout.items, {
    minimumMinutes: 15,
    ...timingConfig,
  });
  const calories = estimateWorkoutCalories(normalizedWorkout.items, {
    minimumCalories: 80,
    ...timingConfig,
  });
  const icon = workout.title.includes("燃脂")
    ? "local_fire_department"
    : workout.title.includes("核心")
      ? "accessibility_new"
      : workout.title.includes("居家")
        ? "home"
        : "fitness_center";

  return (
    <div className="group flex w-full items-center gap-sm rounded-xl border border-line bg-white p-sm shadow-card transition-all hover:border-primary/40 hover:ring-1 hover:ring-primary/10">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <SymbolIcon className="text-[20px]">{icon}</SymbolIcon>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-label-md text-label-md font-bold">{workout.title}</h3>
        <p className="text-[10px] text-secondary">
          {normalizedWorkout.items.length}动作 · 训练{timingConfig.trainingLoopRounds}轮 · {calories}kcal · {minutes}min
        </p>
      </div>
      <button
        aria-label={`安排 ${workout.title}`}
        className="rounded-full p-xs text-primary transition-colors hover:bg-primary/10"
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

function CalendarPlanBadge({ plan }: { plan: WorkoutSchedule }) {
  const status = getStatusConfig(plan.status);

  return (
    <div
      className={`flex h-6 min-w-0 flex-1 items-center gap-xs rounded-lg px-sm text-[10px] leading-none shadow-sm ${status.badgeClass}`}
    >
      <SymbolIcon className="shrink-0 text-[14px]" filled={plan.status === "completed"}>
        {status.icon}
      </SymbolIcon>
      <span className="min-w-0 flex-1 truncate">
        {plan.status === "missed" ? `${plan.title} (未完成)` : plan.title}
      </span>
    </div>
  );
}

function CollapsedDayPlanButton({
  onClick,
  plan,
}: {
  onClick: () => void;
  plan: WorkoutSchedule;
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
  onStatusChange: (status: WorkoutScheduleStatus) => void;
  plan: WorkoutSchedule;
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
          href={`/training?scheduleId=${encodeURIComponent(plan.id)}`}
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

function ActivityItem({ plan }: { plan: WorkoutSchedule }) {
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
