import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestChatStream,
} from "@/features/chat/api/chat-client";
import { saveChatConversation } from "@/features/chat/lib/chat-history";
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
  createChatConversation,
  createConversationContext,
  createWorkoutRoutine,
  createWorkoutSchedule,
  createWorkoutPlanIntent,
} from "./fixtures/domain";

describe("frontend API clients", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  it("passes chat stream payload without calling legacy AI routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("stream", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const messages = createApiChatMessages();
    const context = createConversationContext();
    const summary = { summary: context.summary };
    const signal = new AbortController().signal;

    await expect(
      requestChatStream("chat-1", "assistant-1", messages[0].content, summary.summary, context, false, signal),
    ).resolves.toBeInstanceOf(Response);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      responseMessageId: "assistant-1",
      thinkingEnabled: false,
      latestUserMessage: messages[0].content,
      conversationSummary: summary.summary,
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/chat"]);
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

  it("preserves chat message timestamps when saving chat history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        item: createChatConversation({ id: "conversation-1" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveChatConversation(
      "conversation-1",
      [
        {
          id: "message-1",
          role: "user",
          content: "今天在家练胸",
          createdAt: "2026-05-25T09:00:00.000Z",
        },
        {
          id: "message-2",
          role: "assistant",
          content: "可以。",
          createdAt: "2026-05-25T09:01:00.000Z",
        },
      ],
      {},
      {},
      {},
      {
        "message-2": createWorkoutPlanIntent(),
      },
      { summary: "用户想在家练胸肌。" },
      createConversationContext(),
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      id: "conversation-1",
      messages: [
        { id: "message-1", createdAt: "2026-05-25T09:00:00.000Z" },
        { id: "message-2", createdAt: "2026-05-25T09:01:00.000Z" },
      ],
      recommendationIntents: {
        "message-2": expect.objectContaining({ goal: "胸肌训练" }),
      },
      conversationSummary: { summary: "用户想在家练胸肌。" },
    });
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(Event));
  });
});
