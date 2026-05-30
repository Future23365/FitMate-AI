import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestChatStream,
  requestExerciseRecommendations,
  requestWorkoutPlanDraft,
  WorkoutPlanGenerationRecoveryError,
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
  createExercise,
  createWorkoutRoutine,
  createWorkoutSchedule,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
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
          kind: "plan",
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
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          kind: "routine",
          draft: createWorkoutRoutineDraft(),
          candidates: {
            primaryCandidates: [
              { exercise: createExercise({ id: "push-up", nameZh: "俯卧撑" }) },
            ],
            supplementaryCandidates: [
              { exercise: createExercise({ id: "warmup", nameZh: "肩部动态热身" }) },
              { exercise: createExercise({ id: "stretch", nameZh: "胸肩拉伸" }) },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: false, message: "推荐失败" }));
    vi.stubGlobal("fetch", fetchMock);

    const messages = createApiChatMessages();
    const context = createConversationContext();
    const summary = { summary: context.summary };
    const signal = new AbortController().signal;

    await expect(requestChatStream("chat-1", "assistant-1", messages[0].content, summary.summary, false, signal)).resolves.toBeInstanceOf(Response);
    await expect(requestWorkoutPlanDraft(messages[0].content, createWorkoutPlanIntent(), summary, "trace-1")).resolves.toMatchObject({
      kind: "plan",
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
      requestWorkoutPlanDraft(messages[0].content, createWorkoutPlanIntent({ intentType: "routine" }), summary, "trace-2"),
    ).resolves.toMatchObject({
      kind: "routine",
      draft: {
        kind: "routine",
        trainingLoopRounds: 3,
      },
      exercises: expect.arrayContaining([
        expect.objectContaining({ id: "warmup" }),
        expect.objectContaining({ id: "push-up" }),
        expect.objectContaining({ id: "stretch" }),
      ]),
    });
    await expect(
      requestExerciseRecommendations(messages[0].content, createWorkoutPlanIntent(), summary, "trace-1", {
        excludeExerciseIds: ["push-up"],
      }),
    ).rejects.toThrow("推荐失败");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      responseMessageId: "assistant-1",
      thinkingEnabled: false,
      latestUserMessage: messages[0].content,
      conversationSummary: summary.summary,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      parentTraceId: "trace-1",
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).toMatchObject({
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

  it("preserves recoverable workout plan generation failures for chat guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            ok: false,
            code: "plan_validation_failed",
            message: "AI 生成的单次训练编排没有通过服务端校验。",
            recoverable: true,
            guidanceMessage: "这版训练估算约 49 分钟，超过你原本的 30 分钟。",
            suggestedReplies: ["压缩到 30 分钟", "保留完整训练量"],
            validation: {
              errors: [{ code: "session_too_long" }],
              warnings: [],
            },
          },
          { status: 422 },
        ),
      ),
    );

    await expect(
      requestWorkoutPlanDraft("今天在家练胸", createWorkoutPlanIntent(), { summary: "" }, "trace-1"),
    ).rejects.toMatchObject({
      name: "WorkoutPlanGenerationRecoveryError",
      recoverable: true,
      guidanceMessage: "这版训练估算约 49 分钟，超过你原本的 30 分钟。",
      suggestedReplies: ["压缩到 30 分钟", "保留完整训练量"],
    } satisfies Partial<WorkoutPlanGenerationRecoveryError>);
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
      { summary: "用户想在家练胸肌。" },
      createConversationContext(),
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      id: "conversation-1",
      messages: [
        { id: "message-1", createdAt: "2026-05-25T09:00:00.000Z" },
        { id: "message-2", createdAt: "2026-05-25T09:01:00.000Z" },
      ],
      conversationSummary: { summary: "用户想在家练胸肌。" },
    });
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(Event));
  });
});
