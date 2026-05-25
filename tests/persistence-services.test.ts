import { beforeEach, describe, expect, it, vi } from "vitest";

import { createChatConversation, createExercise, createSavedWorkout } from "./fixtures/domain";

const prismaMock = vi.hoisted(() => ({
  chatMessage: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  chatSession: {
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  workoutPlan: {
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  workoutPlanDay: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  workoutSession: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));
const userMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/server/db/prisma", () => dbMocks);
vi.mock("@/lib/server/users/current-user", () => userMocks);

const workoutPersistence = await import("@/lib/server/workouts/workout-persistence-service");
const chatHistory = await import("@/lib/server/chat/chat-history-service");

describe("persistence services", () => {
  beforeEach(() => {
    for (const model of Object.values(prismaMock)) {
      if (typeof model === "function") {
        model.mockReset();
        continue;
      }

      for (const method of Object.values(model)) {
        if (typeof method === "function" && "mockReset" in method) {
          method.mockReset();
        }
      }
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    userMocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("maps workout plans and scopes saved workout queries by userId", async () => {
    prismaMock.workoutPlan.findMany.mockResolvedValue([createWorkoutPlanRecord()]);

    const workouts = await workoutPersistence.listSavedWorkouts();

    expect(prismaMock.workoutPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", status: { not: "archived" } },
    }));
    expect(workouts[0]).toMatchObject({
      id: "plan-1",
      title: "胸肌训练",
      items: [expect.objectContaining({ exerciseId: "push-up", imageUrls: ["/push-up.png"] })],
    });
  });

  it("rejects saving another user's workout and scopes delete paths", async () => {
    prismaMock.workoutPlan.findUnique.mockResolvedValue({ userId: "other-user" });

    await expect(workoutPersistence.saveWorkout(createSavedWorkout({ id: "plan-1" }))).rejects.toThrow(
      "Workout plan belongs to another user.",
    );

    await workoutPersistence.deleteSavedWorkout("plan-1");
    expect(prismaMock.workoutPlan.deleteMany).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: "user-1" },
    });

    await workoutPersistence.deleteScheduledWorkout("session-1");
    expect(prismaMock.workoutSession.updateMany).toHaveBeenCalledWith({
      where: { id: "session-1", userId: "user-1" },
      data: { status: "cancelled" },
    });
  });

  it("maps chat history metadata and saves only conversations with user messages", async () => {
    prismaMock.chatSession.findMany.mockResolvedValue([
      {
        id: "chat-1",
        title: null,
        updatedAt: new Date("2026-05-25T10:00:00.000Z"),
        messages: [
          {
            id: "m1",
            role: "user",
            content: "今天练胸",
            metadata: null,
          },
          {
            id: "m2",
            role: "assistant",
            content: "可以。",
            metadata: {
              suggestedReplies: ["30 分钟"],
              conversationContext: createChatConversation().conversationContext,
            },
          },
        ],
      },
    ]);

    const conversations = await chatHistory.listChatConversations();
    expect(prismaMock.chatSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
    }));
    expect(conversations[0]).toMatchObject({
      id: "chat-1",
      title: "今天练胸",
      messages: [expect.objectContaining({ id: "m1" }), expect.objectContaining({ suggestedReplies: ["30 分钟"] })],
    });

    const assistantOnly = createChatConversation({
      messages: [{ id: "assistant-only", role: "assistant", content: "你好" }],
    });
    await expect(chatHistory.saveChatConversation(assistantOnly)).resolves.toMatchObject({
      id: assistantOnly.id,
      messages: [expect.objectContaining({ role: "assistant" })],
    });
    expect(prismaMock.chatSession.upsert).not.toHaveBeenCalled();
  });
});

function createWorkoutPlanRecord() {
  const exercise = createExercise({
    id: "push-up",
    nameZh: "俯卧撑",
    imageUrls: ["/push-up.png"],
  });

  return {
    id: "plan-1",
    title: "胸肌训练",
    updatedAt: new Date("2026-05-25T10:30:00"),
    trainingLoopRounds: 1,
    trainingLoopRestSeconds: 90,
    days: [
      {
        items: [
          {
            id: "item-1",
            exercise,
            mode: "reps",
            target: 12,
            sets: 3,
            setRestSeconds: 45,
            transitionRestSeconds: 60,
            section: "training",
          },
        ],
      },
    ],
  };
}
