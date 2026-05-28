import type { WorkoutPlanDraft, WorkoutDayDraft } from "@/lib/shared/workout-plans/draft-schema";
import {
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getWorkoutTimingConfig,
  type WorkoutRoutine,
  type WorkoutSchedule,
} from "@/lib/shared/workouts/composition";

export type WorkoutPlanCycleRepeatCount = 1 | 2 | 4;

export type WorkoutPlanImportOption = {
  id: "cycle-1" | "cycle-2" | "cycle-4" | "calendar-horizon";
  label: string;
  repeatCount?: WorkoutPlanCycleRepeatCount;
  daysToImport: number;
};

export type WorkoutPlanRoutineForSchedule = {
  cycleDayIndex: number;
  routine: WorkoutRoutine;
};

// 计划导入选项只表达周期重复，不再把计划周期硬套成未来 1 周或 4 周。
export function getWorkoutPlanImportOptions(draft: WorkoutPlanDraft): WorkoutPlanImportOption[] {
  const options: WorkoutPlanImportOption[] = [
    {
      id: "cycle-1",
      label: "导入本周期",
      repeatCount: 1,
      daysToImport: draft.cycleLengthDays,
    },
    {
      id: "cycle-2",
      label: "重复 2 个周期",
      repeatCount: 2,
      daysToImport: draft.cycleLengthDays * 2,
    },
    {
      id: "cycle-4",
      label: "重复 4 个周期",
      repeatCount: 4,
      daysToImport: draft.cycleLengthDays * 4,
    },
  ];

  if (draft.calendarHorizonDays) {
    options.push({
      id: "calendar-horizon",
      label: `按未来 ${draft.calendarHorizonDays} 天导入`,
      daysToImport: draft.calendarHorizonDays,
    });
  }

  return options;
}

// 将周期日模板展开为日历 schedule，休息日只生成 rest schedule，不创建 routine。
export function buildWorkoutPlanSchedules(
  draft: WorkoutPlanDraft,
  routines: WorkoutPlanRoutineForSchedule[],
  options: {
    createId?: () => string;
    daysToImport: number;
    startDate: Date;
  },
): WorkoutSchedule[] {
  const routineByCycleDay = new Map(routines.map((entry) => [entry.cycleDayIndex, entry.routine]));
  const createId = options.createId ?? createScheduleId;
  const schedules: WorkoutSchedule[] = [];

  for (let offset = 0; offset < options.daysToImport; offset += 1) {
    const targetDate = new Date(
      options.startDate.getFullYear(),
      options.startDate.getMonth(),
      options.startDate.getDate() + offset,
    );
    const dateKey = toWorkoutPlanDateKey(targetDate);
    const cycleDayIndex = (offset % draft.cycleLengthDays) + 1;
    const day = draft.days.find((candidate) => candidate.cycleDayIndex === cycleDayIndex);

    if (!day || day.isRestDay) {
      schedules.push({
        id: `rest-${dateKey}-${createId()}`,
        date: dateKey,
        title: day?.title || `第 ${cycleDayIndex} 天恢复`,
        status: "rest",
        minutes: 0,
        calories: 0,
        items: [],
        sourceRoutineTitle: draft.title,
      });
      continue;
    }

    const workout = routineByCycleDay.get(cycleDayIndex);

    if (!workout) {
      throw new Error(`Missing routine for cycle day: ${cycleDayIndex}`);
    }

    const timingConfig = getWorkoutTimingConfig(workout);
    schedules.push({
      id: `${workout.id}-${dateKey}-${createId()}`,
      date: dateKey,
      routineId: workout.id,
      title: workout.title,
      status: "planned",
      minutes: estimateWorkoutMinutes(workout.items, {
        minimumMinutes: 15,
        ...timingConfig,
      }),
      calories: estimateWorkoutCalories(workout.items, {
        minimumCalories: 80,
        ...timingConfig,
      }),
      items: workout.items,
      ...timingConfig,
      sourceRoutineTitle: draft.title,
    });
  }

  return schedules;
}

// 重复导入只替换同一计划来源、同一导入区间内的旧 schedule。
export function selectWorkoutPlanSchedulesToReplace(
  existingSchedules: WorkoutSchedule[],
  draft: Pick<WorkoutPlanDraft, "title">,
  options: {
    daysToImport: number;
    startDate: Date;
  },
) {
  const startRangeKey = toWorkoutPlanDateKey(options.startDate);
  const endRangeDate = new Date(
    options.startDate.getFullYear(),
    options.startDate.getMonth(),
    options.startDate.getDate() + options.daysToImport - 1,
  );
  const endRangeKey = toWorkoutPlanDateKey(endRangeDate);

  return existingSchedules.filter((item) => {
    const isInRange = item.date >= startRangeKey && item.date <= endRangeKey;
    const isSameImportedPlan = item.sourceRoutineTitle === draft.title;

    return isInRange && isSameImportedPlan;
  });
}

// 训练日筛选是保存 routine 的唯一入口，避免休息日被误转换为训练编排。
export function getWorkoutPlanTrainingDays(draft: WorkoutPlanDraft): WorkoutDayDraft[] {
  return draft.days.filter((day) => !day.isRestDay);
}

export function toWorkoutPlanDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function createScheduleId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
