"use client";

import { clientRequest } from "@/lib/client/http/client-request";
import type {
  WorkoutRoutine,
  WorkoutSchedule,
  WorkoutScheduleStatus,
  WorkoutSessionResult,
} from "@/lib/shared/workouts/composition";

type WorkoutRoutinesResponse = {
  items: WorkoutRoutine[];
};

type WorkoutRoutineResponse = {
  item: WorkoutRoutine;
};

type WorkoutSchedulesResponse = {
  items: WorkoutSchedule[];
};

type WorkoutScheduleResponse = {
  item: WorkoutSchedule;
};

type WorkoutSessionResultResponse = {
  item: WorkoutSessionResult;
};

type ArtifactSourceOptions = {
  sourceChatMessageId?: string;
  sourceArtifactKind?: "routine" | "plan";
};

export type WorkoutSessionResultInput = Omit<WorkoutSessionResult, "id" | "routineId" | "scheduleId">;

// 客户端 routine API 封装是动作编排页和日历选择的唯一入口。
export async function listWorkoutRoutines() {
  const data = await clientRequest<WorkoutRoutinesResponse>("/api/workout-routines", {
    errorMessage: "训练编排加载失败",
  });

  return data.items;
}

export async function getWorkoutRoutine(id: string) {
  const data = await clientRequest<WorkoutRoutineResponse>(`/api/workout-routines/${encodeURIComponent(id)}`, {
    errorMessage: "训练编排加载失败",
  });

  return data.item;
}

export async function saveWorkoutRoutine(routine: WorkoutRoutine, options: ArtifactSourceOptions = {}) {
  const data = await clientRequest<WorkoutRoutineResponse>(`/api/workout-routines/${encodeURIComponent(routine.id)}`, {
    method: "PUT",
    body: { ...routine, ...options },
    errorMessage: "保存训练编排失败",
  });

  window.dispatchEvent(new Event("fitmate:workouts-updated"));
  return data.item;
}

export async function createWorkoutRoutine(routine: WorkoutRoutine, options: ArtifactSourceOptions = {}) {
  const data = await clientRequest<WorkoutRoutineResponse>("/api/workout-routines", {
    method: "POST",
    body: { ...routine, ...options },
    errorMessage: "创建训练编排失败",
  });

  window.dispatchEvent(new Event("fitmate:workouts-updated"));
  return data.item;
}

export async function deleteWorkoutRoutine(id: string) {
  await clientRequest(`/api/workout-routines/${encodeURIComponent(id)}`, {
    method: "DELETE",
    responseType: "raw",
    errorMessage: "删除训练编排失败",
  });

  window.dispatchEvent(new Event("fitmate:workouts-updated"));
}

// 客户端 schedule API 封装是训练日历和训练执行页加载安排的唯一入口。
export async function listWorkoutSchedules() {
  const data = await clientRequest<WorkoutSchedulesResponse>("/api/workout-schedules", {
    errorMessage: "训练日历加载失败",
  });

  return data.items;
}

export async function getWorkoutSchedule(id: string) {
  const data = await clientRequest<WorkoutScheduleResponse>(
    `/api/workout-schedules/${encodeURIComponent(id)}`,
    { errorMessage: "训练安排加载失败" },
  );

  return data.item;
}

export async function createWorkoutSchedule(schedule: WorkoutSchedule, options: ArtifactSourceOptions = {}) {
  const data = await clientRequest<WorkoutScheduleResponse>("/api/workout-schedules", {
    method: "POST",
    body: { ...schedule, ...options },
    errorMessage: "安排训练失败",
  });

  window.dispatchEvent(new Event("fitmate:training-schedule-updated"));
  return data.item;
}

export async function updateWorkoutScheduleStatus(id: string, status: WorkoutScheduleStatus) {
  const data = await clientRequest<WorkoutScheduleResponse>(
    `/api/workout-schedules/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: { status },
      errorMessage: "训练状态更新失败",
    },
  );

  window.dispatchEvent(new Event("fitmate:training-schedule-updated"));
  return data.item;
}

export async function deleteWorkoutSchedule(id: string) {
  await clientRequest(`/api/workout-schedules/${encodeURIComponent(id)}`, {
    method: "DELETE",
    responseType: "raw",
    errorMessage: "移除训练安排失败",
  });

  window.dispatchEvent(new Event("fitmate:training-schedule-updated"));
}

export async function saveWorkoutSessionResult(scheduleId: string, result: WorkoutSessionResultInput) {
  const data = await clientRequest<WorkoutSessionResultResponse>(
    `/api/workout-schedules/${encodeURIComponent(scheduleId)}/result`,
    {
      method: "PUT",
      body: result,
      errorMessage: "训练结果保存失败",
    },
  );

  window.dispatchEvent(new Event("fitmate:training-schedule-updated"));
  return data.item;
}
