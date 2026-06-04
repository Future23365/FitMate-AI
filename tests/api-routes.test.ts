import { beforeEach, describe, expect, it, vi } from "vitest";

import { createChatConversation, createExercise, createWorkoutRoutine, createWorkoutSchedule } from "./fixtures/domain";

const traceMocks = vi.hoisted(() => ({
  startAiTrace: vi.fn(() => ({
    id: "trace-1",
    addStep: vi.fn(),
    finish: vi.fn(),
    update: vi.fn(),
  })),
  summarizeLatestUserMessage: vi.fn(() => "最新用户消息"),
}));
const exerciseServiceMocks = vi.hoisted(() => ({
  exerciseBodyRegionValues: ["upper_body", "lower_body", "core", "full_body"],
  getExerciseById: vi.fn(),
  getExerciseFacets: vi.fn(),
  listAllExercises: vi.fn(),
  listExercises: vi.fn(),
}));
const workoutPersistenceMocks = vi.hoisted(() => ({
  createWorkoutSchedule: vi.fn(),
  deleteWorkoutRoutine: vi.fn(),
  deleteWorkoutSchedule: vi.fn(),
  getWorkoutRoutineById: vi.fn(),
  getWorkoutScheduleById: vi.fn(),
  listWorkoutRoutines: vi.fn(),
  listWorkoutSchedules: vi.fn(),
  saveWorkoutSessionResult: vi.fn(),
  saveWorkoutRoutine: vi.fn(),
  updateWorkoutScheduleStatus: vi.fn(),
}));
const chatHistoryMocks = vi.hoisted(() => ({
  deleteChatConversation: vi.fn(),
  getChatConversationById: vi.fn(),
  listChatConversations: vi.fn(),
  saveChatConversation: vi.fn(),
}));
const artifactMocks = vi.hoisted(() => ({
  listRecentArtifactSummariesForCurrentUser: vi.fn(),
}));
const visibleTrainingProposalFactStoreMocks = vi.hoisted(() => ({
  listRecentVisibleTrainingProposalSummaries: vi.fn(async () => []),
  persistVisibleTrainingProposalFactsFromEvents: vi.fn(async () => ({ ok: true, savedCount: 0 })),
  readVisibleTrainingProposalFact: vi.fn(),
}));
const currentUserMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({
  authErrorToApiResponse: vi.fn(() => Response.json(
    { ok: false, code: "unauthenticated", error: "Authentication is required.", message: "Authentication is required." },
    { status: 401 },
  )),
  requireCurrentUser: vi.fn(async () => ({ id: "user-1", displayName: "匿名用户" })),
}));

vi.mock("@/lib/server/dev/ai-trace-logger", () => traceMocks);
vi.mock("@/lib/server/exercises/exercise-service", () => exerciseServiceMocks);
vi.mock("@/lib/server/workouts/workout-persistence-service", () => workoutPersistenceMocks);
vi.mock("@/lib/server/chat/chat-history-service", () => chatHistoryMocks);
vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactMocks);
vi.mock("@/lib/server/visible-training-proposals/visible-training-proposal-fact-store", () => ({
  listRecentVisibleTrainingProposalSummaries: visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries,
  persistVisibleTrainingProposalFactsFromEvents: visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents,
  readVisibleTrainingProposalFact: visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact,
  toJsonValue: (value: unknown) => JSON.parse(JSON.stringify(value)),
}));
vi.mock("@/lib/server/users/current-user", () => currentUserMocks);
vi.mock("@/lib/server/auth/local-anonymous-auth", () => authMocks);

const chatRoute = await import("@/app/api/chat/route");
const exercisesRoute = await import("@/app/api/exercises/route");
const exerciseDetailRoute = await import("@/app/api/exercises/[id]/route");
const workoutRoutinesRoute = await import("@/app/api/workout-routines/route");
const workoutRoutineDetailRoute = await import("@/app/api/workout-routines/[id]/route");
const workoutSchedulesRoute = await import("@/app/api/workout-schedules/route");
const workoutScheduleDetailRoute = await import("@/app/api/workout-schedules/[id]/route");
const workoutScheduleResultRoute = await import("@/app/api/workout-schedules/[id]/result/route");
const conversationsRoute = await import("@/app/api/chat/conversations/route");
const conversationDetailRoute = await import("@/app/api/chat/conversations/[id]/route");

describe("API route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue([createExercise({ id: "push-up" })]);
    exerciseServiceMocks.listExercises.mockResolvedValue({ items: [], total: 0 });
    exerciseServiceMocks.getExerciseFacets.mockResolvedValue({ categories: [] });
    exerciseServiceMocks.getExerciseById.mockResolvedValue(createExercise({ id: "push-up" }));
    workoutPersistenceMocks.listWorkoutRoutines.mockResolvedValue([createWorkoutRoutine()]);
    workoutPersistenceMocks.getWorkoutRoutineById.mockResolvedValue(createWorkoutRoutine({ id: "workout-1" }));
    workoutPersistenceMocks.saveWorkoutRoutine.mockImplementation(async (workout) => workout);
    workoutPersistenceMocks.listWorkoutSchedules.mockResolvedValue([createWorkoutSchedule()]);
    workoutPersistenceMocks.getWorkoutScheduleById.mockResolvedValue(createWorkoutSchedule({ id: "session-1" }));
    workoutPersistenceMocks.createWorkoutSchedule.mockImplementation(async (session) => session);
    workoutPersistenceMocks.updateWorkoutScheduleStatus.mockResolvedValue(createWorkoutSchedule({ status: "completed" }));
    workoutPersistenceMocks.saveWorkoutSessionResult.mockResolvedValue({ id: "result-1", status: "completed" });
    chatHistoryMocks.listChatConversations.mockResolvedValue([createChatConversation()]);
    chatHistoryMocks.getChatConversationById.mockResolvedValue(createChatConversation({ id: "conversation-1" }));
    chatHistoryMocks.saveChatConversation.mockImplementation(async (conversation) => conversation);
    artifactMocks.listRecentArtifactSummariesForCurrentUser.mockResolvedValue([]);
    currentUserMocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    authMocks.requireCurrentUser.mockResolvedValue({ id: "user-1", displayName: "匿名用户" });
  });

  it("validates /api/chat body and returns stable configuration errors without model configuration", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const invalid = await chatRoute.POST(jsonRequest("/api/chat", { latestUserMessage: "" }));
    await expect(invalid.json()).resolves.toMatchObject({ code: "validation_failed" });

    const valid = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "练胸",
      conversationSummary: "用户想练胸。",
    }));
    expect(valid.status).toBe(503);
    const events = parseNdjson(await valid.text());

    expect(events).toMatchObject([
      { type: "error", error: { code: "chat_ai_not_configured" } },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("chat_ai_disabled");
    expect(traceMocks.startAiTrace).toHaveBeenCalledTimes(1);
    expect(traceMocks.startAiTrace).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/chat",
      userId: "user-1",
      input: expect.objectContaining({
        latestUserMessage: "练胸",
        registry: {
          manifestHash: expect.any(String),
          toolCount: 2,
          toolNames: ["readRecentVisibleTrainingProposal", "searchExerciseResources"],
        },
      }),
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "模型配置错误",
      type: "error",
      status: "failed",
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.finish).toHaveBeenCalledWith(
      "failed",
      expect.objectContaining({ code: "chat_ai_not_configured", responseType: "error" }),
    );
  });

  it("streams /api/chat final answers from the production text Agent flow", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      model: "deepseek-chat",
      choices: [
        {
          message: {
            content: JSON.stringify({
              type: "final_answer",
              content: "可以，今天先做低强度胸部训练。",
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 8,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "练胸",
      conversationSummary: "用户想练胸。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-1",
    }));
    const events = parseNdjson(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(events).toEqual([
      { type: "content", content: "可以，今天先做低强度胸部训练。" },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("assistant_action");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const modelRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(modelRequest).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining("\"name\":\"searchExerciseResources\""),
        }),
      ]),
    });
    expect(JSON.stringify(modelRequest)).not.toContain("readFixture");
    expect(JSON.stringify(modelRequest)).not.toContain("m1ResourceProducer");
    expect(traceMocks.startAiTrace).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/chat",
      userId: "user-1",
      sessionId: "conversation-1",
      messageId: "assistant-1",
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "model_request",
      output: expect.objectContaining({
        plannerCallIndex: 1,
        runtimeStep: 1,
        model: "deepseek-chat",
      }),
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "model_response",
      status: "success",
      output: expect.objectContaining({
        parseStatus: "parsed",
        actionType: "final_answer",
        tokenUsage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      }),
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "response_write",
      output: expect.objectContaining({ eventTypes: ["content", "done"] }),
      metadata: expect.objectContaining({
        plannerModelCallCount: 1,
        tokenUsageSummary: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      }),
    }));
  });

  it("handles exercise resource routes", async () => {
    const badList = await exercisesRoute.GET(new Request("http://localhost/api/exercises?page=0"));
    expect(badList.status).toBe(400);

    const list = await exercisesRoute.GET(new Request("http://localhost/api/exercises?q=push&page=1&suitability=stretch"));
    await expect(list.json()).resolves.toMatchObject({ items: [], facets: { categories: [] } });
    expect(exerciseServiceMocks.listExercises).toHaveBeenCalledWith(expect.objectContaining({ q: "push", page: 1, suitability: "stretch" }));
    expect(exerciseServiceMocks.getExerciseFacets).toHaveBeenCalledWith(expect.objectContaining({ suitability: "stretch" }));

    const detail = await exerciseDetailRoute.GET(new Request("http://localhost/api/exercises/push-up"), params("push-up"));
    await expect(detail.json()).resolves.toMatchObject({ item: { id: "push-up" } });

    exerciseServiceMocks.getExerciseById.mockResolvedValueOnce(null);
    const missing = await exerciseDetailRoute.GET(new Request("http://localhost/api/exercises/missing"), params("missing"));
    expect(missing.status).toBe(404);
  });

  it("handles workout and workout session resource routes", async () => {
    await expect((await workoutRoutinesRoute.GET(new Request("http://localhost/api/workout-routines"))).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await workoutRoutinesRoute.POST(jsonRequest("/api/workout-routines", createWorkoutRoutine()))).json()).resolves.toMatchObject({
      item: { id: "workout-routine-1" },
    });
    await expect((await workoutRoutineDetailRoute.GET(new Request("http://localhost"), params("workout-1"))).json()).resolves.toMatchObject({
      item: { id: "workout-1" },
    });
    await workoutRoutineDetailRoute.PUT(jsonRequest("/api/workout-routines/workout-1", createWorkoutRoutine({ id: "ignored" })), params("workout-1"));
    expect(workoutPersistenceMocks.saveWorkoutRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "workout-1" }),
      expect.objectContaining({ id: "user-1" }),
    );
    expect((await workoutRoutineDetailRoute.DELETE(new Request("http://localhost"), params("workout-1"))).status).toBe(204);

    await expect((await workoutSchedulesRoute.GET(new Request("http://localhost/api/workout-schedules"))).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await workoutSchedulesRoute.POST(jsonRequest("/api/workout-schedules", createWorkoutSchedule()))).json()).resolves.toMatchObject({
      item: { id: "schedule-1" },
    });
    await expect((await workoutScheduleDetailRoute.PATCH(jsonRequest("/api/workout-schedules/session-1", { status: "completed" }), params("session-1"))).json()).resolves.toMatchObject({
      item: { status: "completed" },
    });
    await expect(
      (await workoutScheduleResultRoute.PUT(jsonRequest("/api/workout-schedules/session-1/result", {
        completedExerciseCount: 1,
        completedStepCount: 2,
        durationSeconds: 120,
        endedAt: "2026-05-25T10:02:00.000Z",
        estimatedCalories: 20,
        startedAt: "2026-05-25T10:00:00.000Z",
        totalExerciseCount: 1,
        totalStepCount: 2,
      }), params("session-1"))).json(),
    ).resolves.toMatchObject({ item: { id: "result-1" } });
    expect((await workoutScheduleDetailRoute.DELETE(new Request("http://localhost"), params("session-1"))).status).toBe(204);
  });

  it("handles chat conversation resource routes", async () => {
    await expect((await conversationsRoute.GET(new Request("http://localhost/api/chat/conversations"))).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await conversationsRoute.POST(jsonRequest("/api/chat/conversations", createChatConversation()))).json()).resolves.toMatchObject({
      item: { id: "conversation-1" },
    });
    await expect((await conversationDetailRoute.GET(new Request("http://localhost"), params("conversation-1"))).json()).resolves.toMatchObject({
      item: { id: "conversation-1" },
    });
    await conversationDetailRoute.PUT(
      jsonRequest("/api/chat/conversations/conversation-1", createChatConversation({ id: "ignored" })),
      params("conversation-1"),
    );
    expect(chatHistoryMocks.saveChatConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
      expect.objectContaining({ id: "user-1" }),
    );
    expect((await conversationDetailRoute.DELETE(new Request("http://localhost"), params("conversation-1"))).status).toBe(204);
  });

  it("rejects private API routes before calling business services when unauthenticated", async () => {
    authMocks.requireCurrentUser.mockRejectedValueOnce(new Error("Authentication is required."));

    const response = await conversationsRoute.GET(new Request("http://localhost/api/chat/conversations"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "unauthenticated" });
    expect(chatHistoryMocks.listChatConversations).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function params(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}

function parseNdjson(text: string) {
  return text.trim().split("\n").map((line) => JSON.parse(line));
}
