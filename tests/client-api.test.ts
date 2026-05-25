import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestChatStream, requestExerciseRecommendations, requestWorkoutPlanDraft } from "@/features/chat/api/chat-client";
import {
  createScheduledWorkout as createScheduledWorkoutRequest,
  createWorkout,
  deleteScheduledWorkout,
  deleteWorkout,
  getSavedWorkout,
  getScheduledWorkout,
  listSavedWorkouts,
  listScheduledWorkouts,
  saveWorkout,
  updateScheduledWorkoutStatus,
} from "@/features/workouts/api/workout-data-client";
import { ClientRequestError } from "@/lib/client/http/client-request";

import {
  createApiChatMessages,
  createConversationContext,
  createSavedWorkout,
  createScheduledWorkout,
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
      .mockResolvedValueOnce(Response.json({ ok: true, draft: createWorkoutPlanDraft() }))
      .mockResolvedValueOnce(Response.json({ ok: false, message: "推荐失败" }));
    vi.stubGlobal("fetch", fetchMock);

    const messages = createApiChatMessages();
    const context = createConversationContext();
    const signal = new AbortController().signal;

    await expect(requestChatStream(messages, context, false, signal)).resolves.toBeInstanceOf(Response);
    await expect(requestWorkoutPlanDraft(messages, createWorkoutPlanIntent(), context, "trace-1")).resolves.toMatchObject({
      title: "居家胸肌训练",
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
    const savedWorkout = createSavedWorkout({ id: "workout-1" });
    const scheduledWorkout = createScheduledWorkout({ id: "session-1" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [savedWorkout] }))
        .mockResolvedValueOnce(Response.json({ item: savedWorkout }))
        .mockResolvedValueOnce(Response.json({ item: savedWorkout }))
        .mockResolvedValueOnce(Response.json({ item: savedWorkout }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ items: [scheduledWorkout] }))
        .mockResolvedValueOnce(Response.json({ item: scheduledWorkout }))
        .mockResolvedValueOnce(Response.json({ item: scheduledWorkout }))
        .mockResolvedValueOnce(Response.json({ item: { ...scheduledWorkout, status: "completed" } }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ message: "保存失败" }, { status: 500 })),
    );

    await expect(listSavedWorkouts()).resolves.toEqual([savedWorkout]);
    await expect(getSavedWorkout("workout-1")).resolves.toEqual(savedWorkout);
    await expect(saveWorkout(savedWorkout)).resolves.toEqual(savedWorkout);
    await expect(createWorkout(savedWorkout)).resolves.toEqual(savedWorkout);
    await expect(deleteWorkout("workout-1")).resolves.toBeUndefined();
    await expect(listScheduledWorkouts()).resolves.toEqual([scheduledWorkout]);
    await expect(getScheduledWorkout("session-1")).resolves.toEqual(scheduledWorkout);
    await expect(createScheduledWorkoutRequest(scheduledWorkout)).resolves.toEqual(scheduledWorkout);
    await expect(updateScheduledWorkoutStatus("session-1", "completed")).resolves.toMatchObject({ status: "completed" });
    await expect(deleteScheduledWorkout("session-1")).resolves.toBeUndefined();
    await expect(saveWorkout(savedWorkout)).rejects.toBeInstanceOf(ClientRequestError);
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
});
