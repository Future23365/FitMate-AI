"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ResponsiveRightSidebar } from "@/components/app/responsive-right-sidebar";
import { SymbolIcon } from "@/components/app/symbol-icon";
import { Button } from "@/components/ui/button";
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
  // 右侧栏模式承载当前日期详情和计划选择，避免顶部浮层覆盖月历主体。
  const [sidePanelMode, setSidePanelMode] = useState<"day" | "saved-plans">("day");
  const [toast, setToast] = useState("");

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
      setSidePanelMode("day");
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
    <div
      className="responsive-right-sidebar-scope right-sidebar-page-shell app-mesh-bg min-h-screen text-ink"
    >
      <main className="right-sidebar-page-main flex h-screen min-h-0 flex-col overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line bg-white p-md shadow-card xl:p-lg">
          <div className="mb-md shrink-0 space-y-md">
            {/* 顶部命令区拆分页面身份和月历控制，避免不同层级信息挤在同一行。 */}
            <div className="flex flex-wrap items-start justify-between gap-md">
              <div className="min-w-0 space-y-xs">
                <h1 className="font-headline-md text-headline-md font-extrabold">训练日历</h1>
                <p className="font-label-sm text-label-sm text-muted tabular-nums">
                  {formatMonth(monthDate)} · 已完成 {completedCount} 次 · {completedMinutes} min · 待完成 {plannedCount} 次
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-sm">
                <Button
                  className="h-10 rounded-xl border-line bg-white px-md font-label-md text-label-md font-bold text-primary shadow-card hover:border-primary/40 hover:bg-primary-soft"
                  onClick={goToToday}
                  type="button"
                  variant="outline"
                >
                  <SymbolIcon className="text-[18px]">today</SymbolIcon>
                  回到今天
                </Button>
                <Button
                  className="h-10 rounded-xl bg-primary px-md font-label-md text-label-md font-bold text-white shadow-card transition-all hover:bg-primary-deep hover:text-white hover:shadow-lift active:scale-[0.98]"
                  onClick={() => setSidePanelMode("saved-plans")}
                  type="button"
                >
                  <SymbolIcon className="text-[20px]">event_available</SymbolIcon>
                  添加安排
                </Button>
              </div>
            </div>

            <div className="grid items-center gap-sm rounded-2xl border border-line bg-panel-soft p-sm lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="hidden min-w-0 items-center gap-xs font-label-sm text-label-sm text-muted lg:flex">
                <SymbolIcon className="text-[18px] text-primary">event</SymbolIcon>
                <span className="truncate tabular-nums">选中 {formatDayLabel(selectedDateKey)}</span>
              </div>
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-xs rounded-xl border border-line bg-white p-xs shadow-sm">
                  <Button
                    aria-label="上个月"
                    className="h-8 w-8 rounded-lg p-0 text-secondary hover:bg-primary-soft hover:text-primary"
                    onClick={() => shiftMonth(-1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <SymbolIcon className="text-[20px]">chevron_left</SymbolIcon>
                  </Button>
                  <span className="min-w-36 text-center font-headline-md text-headline-md">
                    {formatMonth(monthDate)}
                  </span>
                  <Button
                    aria-label="下个月"
                    className="h-8 w-8 rounded-lg p-0 text-secondary hover:bg-primary-soft hover:text-primary"
                    onClick={() => shiftMonth(1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <SymbolIcon className="text-[20px]">chevron_right</SymbolIcon>
                  </Button>
                </div>
              </div>
              <div className="custom-scrollbar flex min-w-0 justify-start overflow-x-auto whitespace-nowrap lg:self-end lg:justify-end">
                <div className="flex shrink-0 items-center gap-xs rounded-lg bg-white/60 px-xs py-[3px] md:gap-sm">
                  <LegendDot className="bg-primary-container" label="已完成" />
                  <LegendDot className="border-2 border-primary-container" label="已安排" />
                  <LegendDot className="bg-error" label="未完成" />
                  <LegendDot className="bg-surface-container-highest" label="休息日" />
                </div>
              </div>
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
                    setSidePanelMode("day");
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

      <ResponsiveRightSidebar
        className="custom-scrollbar gap-lg overflow-y-auto p-md"
        label="训练日历侧边栏"
      >
        {sidePanelMode === "saved-plans" ? (
          <section className="training-side-panel-enter flex min-h-0 flex-1 flex-col gap-md">
            <div className="space-y-xs">
              <button
                className="flex items-center gap-xs font-label-sm text-label-sm font-bold text-secondary transition-colors hover:text-primary"
                onClick={() => setSidePanelMode("day")}
                type="button"
              >
                <SymbolIcon className="text-[18px]">arrow_back</SymbolIcon>
                返回当天安排
              </button>
              <div className="flex items-start justify-between gap-sm">
                <div>
                  <h2 className="font-title-md text-title-md font-extrabold">选择已保存编排</h2>
                  <p className="font-label-sm text-label-sm text-muted">
                    {filteredWorkouts.length} 个编排 · 安排到 {formatDayLabel(selectedDateKey)}
                  </p>
                </div>
                <Link
                  className="shrink-0 rounded-lg px-xs py-[2px] font-label-sm text-label-sm font-bold text-primary hover:bg-primary-soft"
                  href="/composer"
                >
                  管理全部
                </Link>
              </div>
            </div>

            {filteredWorkouts.length ? (
              <div className="training-saved-plan-list custom-scrollbar min-h-0 flex-1 space-y-sm overflow-y-auto rounded-2xl border border-line bg-panel-soft p-sm">
                {filteredWorkouts.map((workout) => (
                  <SavedPlanListItem
                    key={workout.id}
                    onSchedule={() => void scheduleWorkout(workout)}
                    workout={workout}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-white p-md text-center">
                <SymbolIcon className="mb-sm text-3xl text-outline">inventory_2</SymbolIcon>
                <p className="font-label-md text-label-md text-muted">还没有已保存编排</p>
                <Link
                  className="mt-sm inline-flex rounded-xl bg-primary px-md py-sm font-label-md text-label-md font-bold text-white"
                  href="/composer"
                >
                  去编排
                </Link>
              </div>
            )}
          </section>
        ) : (
          <section className="training-side-panel-enter space-y-md">
            <h2 className="flex items-center gap-xs font-label-md text-label-md font-bold text-secondary">
              <SymbolIcon className="text-[18px]">calendar_today</SymbolIcon>
              当天计划 ({formatDayLabel(selectedDateKey)})
            </h2>
            <button
              className="flex w-full items-center justify-between rounded-xl border border-line bg-white p-md text-left shadow-card transition-colors hover:border-primary/40 hover:bg-primary-soft"
              onClick={() => setSidePanelMode("saved-plans")}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <SymbolIcon className="text-[19px]">inventory_2</SymbolIcon>
                </span>
                <span className="min-w-0">
                  <span className="block font-label-md text-label-md font-bold text-ink">
                    从已保存编排添加
                  </span>
                  <span className="block font-label-sm text-label-sm text-muted">
                    {filteredWorkouts.length} 个可用编排
                  </span>
                </span>
              </span>
              <SymbolIcon className="shrink-0 text-[18px] text-secondary">chevron_right</SymbolIcon>
            </button>
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
                  onClick={() => setSidePanelMode("saved-plans")}
                  type="button"
                >
                  从已保存编排添加
                </button>
              </div>
            )}
          </section>
        )}

        {sidePanelMode === "day" ? (
          <>
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
          </>
        ) : null}
      </ResponsiveRightSidebar>

      {toast ? (
        <div className="fixed bottom-lg left-1/2 z-50 -translate-x-1/2 rounded-full bg-inverse-surface px-lg py-sm font-label-md text-label-md text-inverse-on-surface shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

// SavedPlanListItem 承载右侧栏中的排期素材，展示编排关键信息并保持添加动作明确。
function SavedPlanListItem({
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
  const metrics = [
    `${normalizedWorkout.items.length}动作`,
    `${timingConfig.trainingLoopRounds}轮`,
    `${minutes}min`,
  ];

  return (
    <div className="training-saved-plan-item-enter group rounded-xl border border-line bg-white p-sm shadow-sm transition-all hover:-translate-y-[1px] hover:border-primary/30 hover:shadow-card">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <SymbolIcon className="text-[21px]">assignment</SymbolIcon>
        </div>
        <div className="min-w-0 space-y-xs">
          <h3
            className="training-saved-plan-title font-label-md text-label-md font-bold leading-snug text-ink"
            title={workout.title}
          >
            {workout.title}
          </h3>
          <p className="font-label-sm text-label-sm text-muted">预计消耗 {calories} kcal</p>
          <div className="flex items-center justify-between gap-sm">
            <div className="flex min-w-0 flex-wrap gap-xs">
              {metrics.map((metric) => (
                <span
                  className="rounded-lg bg-surface-container-low px-xs py-[2px] text-[10px] font-bold leading-none text-secondary"
                  key={metric}
                >
                  {metric}
                </span>
              ))}
            </div>
            <button
              aria-label={`添加 ${workout.title}`}
              className="shrink-0 rounded-lg bg-primary px-sm py-xs font-label-sm text-label-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-deep"
              onClick={onSchedule}
              type="button"
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-[4px]">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      <span className="text-[10px] font-bold leading-none text-secondary">{label}</span>
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
