import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestChatStream, requestExerciseRecommendations, requestWorkoutPlanDraft } from "@/features/chat/api/chat-client";
import {
  createWorkoutSchedule as createWorkoutScheduleRequest,
  createWorkoutRoutine as createWorkoutRoutineRequest,
  deleteWorkoutSchedule,
  deleteWorkoutRoutine,
  getWorkoutRoutine,
  getWorkoutSchedule,
  listWorkoutRoutines,
  listWorkoutSchedules,
  saveWorkoutSessionResult,
  saveWorkoutRoutine,
  updateWorkoutScheduleStatus,
} from "@/features/workouts/api/workout-data-client";
import { ClientRequestError } from "@/lib/client/http/client-request";

import {
  createApiChatMessages,
  createConversationContext,
  createExercise,
  createWorkoutRoutine,
  createWorkoutSchedule,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
} from "./fixtures/domain";

describe("frontend API clients", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  it("passes chat stream, workout plan, and recommendation request payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("stream", { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          draft: createWorkoutPlanDraft(),
          candidates: {
            primaryCandidates: [
              { exercise: createExercise({ id: "push-up", nameZh: "俯卧撑" }) },
              { exercise: createExercise({ id: "unused", nameZh: "未使用动作" }) },
            ],
            supplementaryCandidates: [],
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: false, message: "推荐失败" }));
    vi.stubGlobal("fetch", fetchMock);

    const messages = createApiChatMessages();
    const context = createConversationContext();
    const signal = new AbortController().signal;

    await expect(requestChatStream(messages, context, false, signal)).resolves.toBeInstanceOf(Response);
    await expect(requestWorkoutPlanDraft(messages, createWorkoutPlanIntent(), context, "trace-1")).resolves.toMatchObject({
      draft: {
        title: "居家胸肌训练",
      },
      exercises: [
        {
          id: "push-up",
          nameZh: "俯卧撑",
        },
      ],
    });
    await expect(
      requestExerciseRecommendations(messages, createWorkoutPlanIntent(), context, "trace-1", {
        excludeExerciseIds: ["push-up"],
      }),
    ).rejects.toThrow("推荐失败");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      thinkingEnabled: false,
      conversationContext: context,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      parentTraceId: "trace-1",
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toMatchObject({
      excludeExerciseIds: ["push-up"],
    });
  });

  it("maps workout data requests, errors, and update events", async () => {
    const workoutRoutine = createWorkoutRoutine({ id: "workout-1" });
    const workoutSchedule = createWorkoutSchedule({ id: "session-1" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [workoutRoutine] }))
        .mockResolvedValueOnce(Response.json({ item: workoutRoutine }))
        .mockResolvedValueOnce(Response.json({ item: workoutRoutine }))
        .mockResolvedValueOnce(Response.json({ item: workoutRoutine }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ items: [workoutSchedule] }))
        .mockResolvedValueOnce(Response.json({ item: workoutSchedule }))
        .mockResolvedValueOnce(Response.json({ item: workoutSchedule }))
        .mockResolvedValueOnce(Response.json({ item: { ...workoutSchedule, status: "completed" } }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ item: { id: "result-1", status: "completed" } }))
        .mockResolvedValueOnce(Response.json({ message: "保存失败" }, { status: 500 })),
    );

    await expect(listWorkoutRoutines()).resolves.toEqual([workoutRoutine]);
    await expect(getWorkoutRoutine("workout-1")).resolves.toEqual(workoutRoutine);
    await expect(saveWorkoutRoutine(workoutRoutine)).resolves.toEqual(workoutRoutine);
    await expect(createWorkoutRoutineRequest(workoutRoutine)).resolves.toEqual(workoutRoutine);
    await expect(deleteWorkoutRoutine("workout-1")).resolves.toBeUndefined();
    await expect(listWorkoutSchedules()).resolves.toEqual([workoutSchedule]);
    await expect(getWorkoutSchedule("session-1")).resolves.toEqual(workoutSchedule);
    await expect(createWorkoutScheduleRequest(workoutSchedule)).resolves.toEqual(workoutSchedule);
    await expect(updateWorkoutScheduleStatus("session-1", "completed")).resolves.toMatchObject({ status: "completed" });
    await expect(deleteWorkoutSchedule("session-1")).resolves.toBeUndefined();
    await expect(saveWorkoutSessionResult("session-1", {
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      status: "completed",
      totalExerciseCount: 1,
      totalStepCount: 2,
    })).resolves.toMatchObject({ id: "result-1" });
    await expect(saveWorkoutRoutine(workoutRoutine)).rejects.toBeInstanceOf(ClientRequestError);
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
});
