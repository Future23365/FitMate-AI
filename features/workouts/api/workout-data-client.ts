"use client";

import { clientRequest } from "@/lib/client/http/client-request";
import type { SavedWorkout, ScheduledWorkout, ScheduleStatus } from "@/lib/shared/workouts/composition";

type SavedWorkoutsResponse = {
  items: SavedWorkout[];
};

type SavedWorkoutResponse = {
  item: SavedWorkout;
};

type ScheduledWorkoutsResponse = {
  items: ScheduledWorkout[];
};

type ScheduledWorkoutResponse = {
  item: ScheduledWorkout;
};

export async function listSavedWorkouts() {
  const data = await clientRequest<SavedWorkoutsResponse>("/api/workouts", {
    errorMessage: "已保存计划加载失败",
  });

  return data.items;
}

export async function getSavedWorkout(id: string) {
  const data = await clientRequest<SavedWorkoutResponse>(`/api/workouts/${encodeURIComponent(id)}`, {
    errorMessage: "训练编排加载失败",
  });

  return data.item;
}

export async function saveWorkout(workout: SavedWorkout) {
  const data = await clientRequest<SavedWorkoutResponse>(`/api/workouts/${encodeURIComponent(workout.id)}`, {
    method: "PUT",
    body: workout,
    errorMessage: "保存训练编排失败",
  });

  window.dispatchEvent(new Event("fitmate:workouts-updated"));
  return data.item;
}

export async function createWorkout(workout: SavedWorkout) {
  const data = await clientRequest<SavedWorkoutResponse>("/api/workouts", {
    method: "POST",
    body: workout,
    errorMessage: "创建训练编排失败",
  });

  window.dispatchEvent(new Event("fitmate:workouts-updated"));
  return data.item;
}

export async function deleteWorkout(id: string) {
  await clientRequest(`/api/workouts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    responseType: "raw",
    errorMessage: "删除训练编排失败",
  });

  window.dispatchEvent(new Event("fitmate:workouts-updated"));
}

export async function listScheduledWorkouts() {
  const data = await clientRequest<ScheduledWorkoutsResponse>("/api/workout-sessions", {
    errorMessage: "训练日历加载失败",
  });

  return data.items;
}

export async function getScheduledWorkout(id: string) {
  const data = await clientRequest<ScheduledWorkoutResponse>(
    `/api/workout-sessions/${encodeURIComponent(id)}`,
    { errorMessage: "训练安排加载失败" },
  );

  return data.item;
}

export async function createScheduledWorkout(workout: ScheduledWorkout) {
  const data = await clientRequest<ScheduledWorkoutResponse>("/api/workout-sessions", {
    method: "POST",
    body: workout,
    errorMessage: "安排训练失败",
  });

  window.dispatchEvent(new Event("fitmate:training-schedule-updated"));
  return data.item;
}

export async function updateScheduledWorkoutStatus(id: string, status: ScheduleStatus) {
  const data = await clientRequest<ScheduledWorkoutResponse>(
    `/api/workout-sessions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: { status },
      errorMessage: "训练状态更新失败",
    },
  );

  window.dispatchEvent(new Event("fitmate:training-schedule-updated"));
  return data.item;
}

export async function deleteScheduledWorkout(id: string) {
  await clientRequest(`/api/workout-sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    responseType: "raw",
    errorMessage: "移除训练安排失败",
  });

  window.dispatchEvent(new Event("fitmate:training-schedule-updated"));
}
