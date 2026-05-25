import { beforeEach, describe, expect, it, vi } from "vitest";

import { createChatConversation, createExercise, createSavedWorkout, createScheduledWorkout, createWorkoutPlanIntent } from "./fixtures/domain";

const traceMocks = vi.hoisted(() => ({
  startAiTrace: vi.fn(() => ({
    id: "trace-1",
    addStep: vi.fn(),
    finish: vi.fn(),
    update: vi.fn(),
  })),
  summarizeLatestUserMessage: vi.fn(() => "最新用户消息"),
}));
const chatServiceMocks = vi.hoisted(() => ({
  createAiChatResponse: vi.fn(),
}));
const workoutPlanMocks = vi.hoisted(() => ({
  generateAiWorkoutPlanDraft: vi.fn(),
  selectExerciseCandidates: vi.fn(),
}));
const recommendationMocks = vi.hoisted(() => ({
  generateAiExerciseRecommendations: vi.fn(),
}));
const exerciseServiceMocks = vi.hoisted(() => ({
  getExerciseById: vi.fn(),
  getExerciseFacets: vi.fn(),
  listAllExercises: vi.fn(),
  listExercises: vi.fn(),
}));
const workoutPersistenceMocks = vi.hoisted(() => ({
  createScheduledWorkout: vi.fn(),
  deleteSavedWorkout: vi.fn(),
  deleteScheduledWorkout: vi.fn(),
  getSavedWorkoutById: vi.fn(),
  getScheduledWorkoutById: vi.fn(),
  listSavedWorkouts: vi.fn(),
  listScheduledWorkouts: vi.fn(),
  saveWorkout: vi.fn(),
  updateScheduledWorkoutStatus: vi.fn(),
}));
const chatHistoryMocks = vi.hoisted(() => ({
  deleteChatConversation: vi.fn(),
  getChatConversationById: vi.fn(),
  listChatConversations: vi.fn(),
  saveChatConversation: vi.fn(),
}));

vi.mock("@/lib/server/dev/ai-trace-logger", () => traceMocks);
vi.mock("@/lib/server/chat/chat-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/chat/chat-service")>();

  return {
    ...actual,
    createAiChatResponse: chatServiceMocks.createAiChatResponse,
  };
});
vi.mock("@/lib/server/workout-plans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/workout-plans")>();

  return {
    ...actual,
    generateAiWorkoutPlanDraft: workoutPlanMocks.generateAiWorkoutPlanDraft,
    selectExerciseCandidates: workoutPlanMocks.selectExerciseCandidates,
  };
});
vi.mock("@/lib/server/exercise-recommendations/ai-exercise-recommendation-service", () => recommendationMocks);
vi.mock("@/lib/server/exercises/exercise-service", () => exerciseServiceMocks);
vi.mock("@/lib/server/workouts/workout-persistence-service", () => workoutPersistenceMocks);
vi.mock("@/lib/server/chat/chat-history-service", () => chatHistoryMocks);

const chatRoute = await import("@/app/api/chat/route");
const workoutPlanRoute = await import("@/app/api/ai/workout-plan/route");
const exerciseRecommendationRoute = await import("@/app/api/ai/exercise-recommendations/route");
const exercisesRoute = await import("@/app/api/exercises/route");
const exerciseDetailRoute = await import("@/app/api/exercises/[id]/route");
const workoutsRoute = await import("@/app/api/workouts/route");
const workoutDetailRoute = await import("@/app/api/workouts/[id]/route");
const sessionsRoute = await import("@/app/api/workout-sessions/route");
const sessionDetailRoute = await import("@/app/api/workout-sessions/[id]/route");
const conversationsRoute = await import("@/app/api/chat/conversations/route");
const conversationDetailRoute = await import("@/app/api/chat/conversations/[id]/route");

describe("API route boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    chatServiceMocks.createAiChatResponse.mockResolvedValue(new Response("stream", { status: 200 }));
    workoutPlanMocks.generateAiWorkoutPlanDraft.mockResolvedValue({ ok: true, draft: { title: "计划" } });
    workoutPlanMocks.selectExerciseCandidates.mockReturnValue({
      primaryCandidates: [{ exercise: createExercise({ id: "push-up" }), score: 90, reasons: [], source: "primary" }],
      supplementaryCandidates: [],
      excluded: [],
      warnings: [],
      candidateStatus: "enough",
      relevantCandidateCount: 1,
      requiredRelevantCandidateCount: 1,
      isEnoughCandidates: true,
      intent: createWorkoutPlanIntent(),
    });
    recommendationMocks.generateAiExerciseRecommendations.mockResolvedValue({
      ok: true,
      card: {
        title: "推荐动作",
        goal: "胸肌",
        items: [
          {
            exerciseId: "push-up",
            nameZh: "俯卧撑",
            categoryZh: "力量",
            levelZh: "新手",
            equipmentZh: "自重",
            primaryMusclesZh: ["胸部"],
            secondaryMusclesZh: [],
            reasons: ["匹配目标"],
          },
        ],
      },
    });
    exerciseServiceMocks.listAllExercises.mockResolvedValue([createExercise({ id: "push-up" })]);
    exerciseServiceMocks.listExercises.mockResolvedValue({ items: [], total: 0 });
    exerciseServiceMocks.getExerciseFacets.mockResolvedValue({ categories: [] });
    exerciseServiceMocks.getExerciseById.mockResolvedValue(createExercise({ id: "push-up" }));
    workoutPersistenceMocks.listSavedWorkouts.mockResolvedValue([createSavedWorkout()]);
    workoutPersistenceMocks.getSavedWorkoutById.mockResolvedValue(createSavedWorkout({ id: "workout-1" }));
    workoutPersistenceMocks.saveWorkout.mockImplementation(async (workout) => workout);
    workoutPersistenceMocks.listScheduledWorkouts.mockResolvedValue([createScheduledWorkout()]);
    workoutPersistenceMocks.getScheduledWorkoutById.mockResolvedValue(createScheduledWorkout({ id: "session-1" }));
    workoutPersistenceMocks.createScheduledWorkout.mockImplementation(async (session) => session);
    workoutPersistenceMocks.updateScheduledWorkoutStatus.mockResolvedValue(createScheduledWorkout({ status: "completed" }));
    chatHistoryMocks.listChatConversations.mockResolvedValue([createChatConversation()]);
    chatHistoryMocks.getChatConversationById.mockResolvedValue(createChatConversation({ id: "conversation-1" }));
    chatHistoryMocks.saveChatConversation.mockImplementation(async (conversation) => conversation);
  });

  it("validates /api/chat body and returns stream response for legal requests", async () => {
    const invalid = await chatRoute.POST(jsonRequest("/api/chat", { messages: [{ role: "user", content: "" }] }));
    await expect(invalid.json()).resolves.toMatchObject({ code: "validation_failed" });

    const valid = await chatRoute.POST(jsonRequest("/api/chat", { messages: [{ role: "user", content: "练胸" }] }));
    expect(valid.status).toBe(200);
    expect(chatServiceMocks.createAiChatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        request: expect.objectContaining({ rawMessages: [expect.objectContaining({ content: "练胸" })] }),
      }),
    );
  });

  it("maps AI workout plan and recommendation request boundaries", async () => {
    const badPlan = await workoutPlanRoute.POST(jsonRequest("/api/ai/workout-plan", { messages: [] }));
    expect(badPlan.status).toBe(400);

    workoutPlanMocks.generateAiWorkoutPlanDraft.mockResolvedValueOnce({
      ok: false,
      code: "candidate_actions_insufficient",
      message: "候选不足",
    });
    const failedPlan = await workoutPlanRoute.POST(
      jsonRequest("/api/ai/workout-plan", {
        messages: [{ role: "user", content: "练胸" }],
        intent: createWorkoutPlanIntent(),
        parentTraceId: "trace-parent",
      }),
    );
    expect(failedPlan.status).toBe(422);
    expect(traceMocks.startAiTrace).toHaveBeenCalledWith(expect.objectContaining({ existingTraceId: "trace-parent" }));

    const recommendation = await exerciseRecommendationRoute.POST(
      jsonRequest("/api/ai/exercise-recommendations", {
        messages: [{ role: "user", content: "推荐动作" }],
        intent: createWorkoutPlanIntent(),
        parentTraceId: "trace-parent",
        excludeExerciseIds: ["old"],
      }),
    );
    await expect(recommendation.json()).resolves.toMatchObject({ ok: true, card: { title: "推荐动作" } });
    expect(recommendationMocks.generateAiExerciseRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        excludeExerciseIds: ["old"],
      }),
    );
  });

  it("handles exercise resource routes", async () => {
    const badList = await exercisesRoute.GET(new Request("http://localhost/api/exercises?page=0"));
    expect(badList.status).toBe(400);

    const list = await exercisesRoute.GET(new Request("http://localhost/api/exercises?q=push&page=1"));
    await expect(list.json()).resolves.toMatchObject({ items: [], facets: { categories: [] } });
    expect(exerciseServiceMocks.listExercises).toHaveBeenCalledWith(expect.objectContaining({ q: "push", page: 1 }));

    const detail = await exerciseDetailRoute.GET(new Request("http://localhost/api/exercises/push-up"), params("push-up"));
    await expect(detail.json()).resolves.toMatchObject({ item: { id: "push-up" } });

    exerciseServiceMocks.getExerciseById.mockResolvedValueOnce(null);
    const missing = await exerciseDetailRoute.GET(new Request("http://localhost/api/exercises/missing"), params("missing"));
    expect(missing.status).toBe(404);
  });

  it("handles workout and workout session resource routes", async () => {
    await expect((await workoutsRoute.GET()).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await workoutsRoute.POST(jsonRequest("/api/workouts", createSavedWorkout()))).json()).resolves.toMatchObject({
      item: { id: "saved-workout-1" },
    });
    await expect((await workoutDetailRoute.GET(new Request("http://localhost"), params("workout-1"))).json()).resolves.toMatchObject({
      item: { id: "workout-1" },
    });
    await workoutDetailRoute.PUT(jsonRequest("/api/workouts/workout-1", createSavedWorkout({ id: "ignored" })), params("workout-1"));
    expect(workoutPersistenceMocks.saveWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: "workout-1" }));
    expect((await workoutDetailRoute.DELETE(new Request("http://localhost"), params("workout-1"))).status).toBe(204);

    await expect((await sessionsRoute.GET()).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await sessionsRoute.POST(jsonRequest("/api/workout-sessions", createScheduledWorkout()))).json()).resolves.toMatchObject({
      item: { id: "schedule-1" },
    });
    await expect((await sessionDetailRoute.PATCH(jsonRequest("/api/workout-sessions/session-1", { status: "completed" }), params("session-1"))).json()).resolves.toMatchObject({
      item: { status: "completed" },
    });
    expect((await sessionDetailRoute.DELETE(new Request("http://localhost"), params("session-1"))).status).toBe(204);
  });

  it("handles chat conversation resource routes", async () => {
    await expect((await conversationsRoute.GET()).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
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
    expect(chatHistoryMocks.saveChatConversation).toHaveBeenCalledWith(expect.objectContaining({ id: "conversation-1" }));
    expect((await conversationDetailRoute.DELETE(new Request("http://localhost"), params("conversation-1"))).status).toBe(204);
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
