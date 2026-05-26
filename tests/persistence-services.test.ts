import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createChatConversation,
  createExercise,
  createWorkoutItem,
  createWorkoutRoutine,
  createWorkoutSchedule,
} from "./fixtures/domain";

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
  exercise: {
    findMany: vi.fn(),
  },
  workoutRoutine: {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  workoutRoutineItem: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  workoutSchedule: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  workoutSessionResult: {
    upsert: vi.fn(),
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

  it("maps workout routines and scopes routine queries by userId", async () => {
    prismaMock.workoutRoutine.findMany.mockResolvedValue([createWorkoutRoutineRecord()]);

    const workouts = await workoutPersistence.listWorkoutRoutines();

    expect(prismaMock.workoutRoutine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", status: "active" },
    }));
    expect(workouts[0]).toMatchObject({
      id: "routine-1",
      title: "胸肌训练",
      items: [expect.objectContaining({ exerciseId: "push-up", imageUrls: ["/push-up.png"] })],
    });
  });

  it("rejects saving another user's routine and scopes delete paths", async () => {
    prismaMock.workoutRoutine.findUnique.mockResolvedValue({ userId: "other-user" });

    await expect(workoutPersistence.saveWorkoutRoutine(createWorkoutRoutine({ id: "routine-1" }))).rejects.toThrow(
      "Workout routine belongs to another user.",
    );

    await workoutPersistence.deleteWorkoutRoutine("routine-1");
    expect(prismaMock.workoutRoutine.updateMany).toHaveBeenCalledWith({
      where: { id: "routine-1", userId: "user-1" },
      data: { status: "archived" },
    });

    await workoutPersistence.deleteWorkoutSchedule("session-1");
    expect(prismaMock.workoutSchedule.updateMany).toHaveBeenCalledWith({
      where: { id: "session-1", userId: "user-1" },
      data: { status: "cancelled" },
    });
  });

  it("validates routine exercise ids and writes routine item order", async () => {
    prismaMock.workoutRoutine.findUnique.mockResolvedValue(null);
    prismaMock.exercise.findMany.mockResolvedValue([{ id: "push-up" }, { id: "squat" }]);
    prismaMock.workoutRoutine.upsert.mockResolvedValue({ id: "routine-1" });
    prismaMock.workoutRoutine.findFirstOrThrow.mockResolvedValue(createWorkoutRoutineRecord());

    await workoutPersistence.saveWorkoutRoutine(createWorkoutRoutine({
      id: "routine-1",
      items: [
        createWorkoutItem({ id: "item-1", exerciseId: "push-up" }),
        createWorkoutItem({ id: "item-2", exerciseId: "squat" }),
      ],
    }));

    expect(prismaMock.exercise.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["push-up", "squat"] } },
    }));
    expect(prismaMock.workoutRoutineItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ exerciseId: "push-up", sortOrder: 1 }),
        expect.objectContaining({ exerciseId: "squat", sortOrder: 2 }),
      ],
    });
  });

  it("rejects routine items with unknown exercise ids before writing", async () => {
    prismaMock.workoutRoutine.findUnique.mockResolvedValue(null);
    prismaMock.exercise.findMany.mockResolvedValue([{ id: "push-up" }]);

    await expect(workoutPersistence.saveWorkoutRoutine(createWorkoutRoutine({
      items: [
        createWorkoutItem({ exerciseId: "push-up" }),
        createWorkoutItem({ id: "bad-item", exerciseId: "missing-exercise" }),
      ],
    }))).rejects.toThrow("Invalid exerciseId: missing-exercise");
    expect(prismaMock.workoutRoutine.upsert).not.toHaveBeenCalled();
  });

  it("creates rest schedules without routine and training schedules from routine snapshots", async () => {
    prismaMock.workoutSchedule.create
      .mockResolvedValueOnce(createWorkoutScheduleRecord({ status: "rest", routine: null }))
      .mockResolvedValueOnce(createWorkoutScheduleRecord());
    prismaMock.workoutRoutine.findFirst.mockResolvedValue(createWorkoutRoutineRecord());

    const restSchedule = await workoutPersistence.createWorkoutSchedule({
      ...createWorkoutSchedule({ id: "rest-1", status: "rest", title: "休息日", items: [] }),
      routineId: undefined,
    });
    const trainingSchedule = await workoutPersistence.createWorkoutSchedule(createWorkoutSchedule({ id: "schedule-1" }));

    expect(prismaMock.workoutSchedule.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.not.objectContaining({ routineId: expect.any(String) }),
    }));
    expect(restSchedule).toMatchObject({ id: "rest-1", status: "rest", items: [] });
    expect(prismaMock.workoutRoutine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "workout-routine-1", userId: "user-1", status: "active" },
    }));
    expect(trainingSchedule).toMatchObject({ id: "schedule-1", routineId: "routine-1", items: [expect.any(Object)] });
  });

  it("writes workout session result and marks schedule completed in one transaction", async () => {
    prismaMock.workoutSchedule.findFirst.mockResolvedValue({ id: "schedule-1", routineId: "routine-1" });
    prismaMock.workoutSessionResult.upsert.mockResolvedValue({
      id: "result-1",
      userId: "user-1",
      scheduleId: "schedule-1",
      routineId: "routine-1",
      startedAt: new Date("2026-05-25T10:00:00.000Z"),
      endedAt: new Date("2026-05-25T10:02:00.000Z"),
      durationSeconds: 120,
      completedStepCount: 2,
      totalStepCount: 2,
      completedExerciseCount: 1,
      totalExerciseCount: 1,
      estimatedCalories: 20,
      actualCalories: null,
      status: "completed",
    });

    const result = await workoutPersistence.saveWorkoutSessionResult("schedule-1", {
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    });

    expect(prismaMock.workoutSchedule.update).toHaveBeenCalledWith({
      where: { id: "schedule-1", userId: "user-1" },
      data: { status: "completed" },
    });
    expect(result).toMatchObject({ id: "result-1", scheduleId: "schedule-1", status: "completed" });
  });

  it("rejects invalid or unauthorized workout session results", async () => {
    await expect(workoutPersistence.saveWorkoutSessionResult("schedule-1", {
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: -1,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    })).rejects.toThrow();
    expect(prismaMock.workoutSchedule.findFirst).not.toHaveBeenCalled();

    prismaMock.workoutSchedule.findFirst.mockResolvedValue(null);
    await expect(workoutPersistence.saveWorkoutSessionResult("missing-schedule", {
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    })).rejects.toThrow("Workout schedule not found: missing-schedule");
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

function createWorkoutRoutineRecord() {
  const exercise = createExercise({
    id: "push-up",
    nameZh: "俯卧撑",
    imageUrls: ["/push-up.png"],
  });

  return {
    id: "routine-1",
    title: "胸肌训练",
    updatedAt: new Date("2026-05-25T10:30:00"),
    trainingLoopRounds: 1,
    trainingLoopRestSeconds: 90,
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
  };
}

function createWorkoutScheduleRecord(overrides: { status?: string; routine?: ReturnType<typeof createWorkoutRoutineRecord> | null } = {}) {
  return {
    id: overrides.status === "rest" ? "rest-1" : "schedule-1",
    scheduledFor: new Date("2026-05-25T00:00:00.000Z"),
    status: overrides.status ?? "planned",
    titleSnapshot: overrides.status === "rest" ? "休息日" : "居家训练",
    estimatedMinutes: 20,
    estimatedCalories: 120,
    routine: overrides.routine === undefined ? createWorkoutRoutineRecord() : overrides.routine,
    result: null,
  };
}
