import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createChatConversation,
  createExercise,
  createWorkoutItem,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutine,
  createWorkoutRoutineDraft,
  createWorkoutSchedule,
} from "./fixtures/domain";

const prismaMock = vi.hoisted(() => ({
  artifactIndex: {
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
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
  conversationArtifact: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
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

  afterEach(() => {
    vi.restoreAllMocks();
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
      updatedAt: "2026-05-25T10:30:00.000Z",
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
      warmupToTrainingRestSeconds: 45,
      trainingToStretchRestSeconds: 75,
      items: [
        createWorkoutItem({ id: "item-1", exerciseId: "push-up" }),
        createWorkoutItem({ id: "item-2", exerciseId: "squat" }),
      ],
    }));

    expect(prismaMock.exercise.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["push-up", "squat"] } },
    }));
    expect(prismaMock.workoutRoutine.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        warmupToTrainingRestSeconds: 45,
        trainingToStretchRestSeconds: 75,
      }),
      update: expect.objectContaining({
        warmupToTrainingRestSeconds: 45,
        trainingToStretchRestSeconds: 75,
      }),
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
      data: expect.objectContaining({
        scheduledFor: new Date("2026-05-25T00:00:00.000Z"),
      }),
    }));
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
    expect(result).toMatchObject({
      startedAt: "2026-05-25T10:00:00.000Z",
      endedAt: "2026-05-25T10:02:00.000Z",
    });
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

    await expect(workoutPersistence.saveWorkoutSessionResult("schedule-1", {
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "2026-05-25T10:02:00",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      totalExerciseCount: 1,
      totalStepCount: 2,
    })).rejects.toThrow();
  });

  it("maps chat history metadata and uses latest message time for history ordering", async () => {
    prismaMock.chatSession.findMany.mockResolvedValue([
      {
        id: "chat-1",
        title: null,
        updatedAt: new Date("2026-05-25T12:00:00.000Z"),
        messages: [
          {
            id: "m1",
            role: "user",
            content: "今天练胸",
            createdAt: new Date("2026-05-25T09:00:00.000Z"),
            metadata: null,
          },
          {
            id: "m2",
            role: "assistant",
            content: "可以。",
            createdAt: new Date("2026-05-25T09:01:00.000Z"),
            metadata: {
              suggestedQuestions: ["30 分钟"],
              visibleOutputs: [createVisibleExerciseSelectionOutput("push-up")],
              plan: createWorkoutPlanDraft(),
              exerciseRecommendation: createExerciseRecommendationCard(),
              recommendationIntent: createWorkoutPlanIntent({ goal: "练胸" }),
              conversationContext: createChatConversation().conversationContext,
            },
          },
        ],
      },
      {
        id: "chat-2",
        title: "更晚的真实消息",
        updatedAt: new Date("2026-05-25T08:00:00.000Z"),
        messages: [
          {
            id: "m3",
            role: "user",
            content: "明天练背",
            createdAt: new Date("2026-05-25T10:30:00.000Z"),
            metadata: null,
          },
        ],
      },
      {
        id: "chat-empty",
        title: "缺少消息时间",
        updatedAt: new Date("2026-05-25T11:00:00.000Z"),
        messages: [],
      },
    ]);

    const conversations = await chatHistory.listChatConversations();
    expect(prismaMock.chatSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
    }));
    expect(conversations.map((conversation) => conversation.id)).toEqual(["chat-empty", "chat-2", "chat-1"]);
    expect(conversations[0]).toMatchObject({ id: "chat-empty", updatedAt: "2026-05-25T11:00:00.000Z" });
    expect(conversations[2]).toMatchObject({
      id: "chat-1",
      title: "今天练胸",
      updatedAt: "2026-05-25T09:01:00.000Z",
      messages: [
        expect.objectContaining({ id: "m1" }),
        expect.objectContaining({
          suggestedQuestions: ["30 分钟"],
          visibleOutputs: [
            expect.objectContaining({
              outputType: "visibleTrainingProposal",
              payload: expect.objectContaining({ kind: "exercise_selection" }),
            }),
          ],
        }),
      ],
    });
    expect(conversations[2].plans).toBeUndefined();
    expect(conversations[2].exerciseRecommendations).toBeUndefined();
    expect(conversations[2].recommendationIntents).toBeUndefined();
  });

  it("saves chat history without rewriting existing message timestamps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-25T12:00:00.000Z").getTime());
    prismaMock.chatSession.findUnique.mockResolvedValue(null);
    prismaMock.chatSession.findFirstOrThrow.mockResolvedValue({
      id: "chat-save",
      title: "今天练胸",
      updatedAt: new Date("2026-05-25T12:00:00.000Z"),
      messages: [
        {
          id: "m1",
          role: "user",
          content: "今天练胸",
          createdAt: new Date("2026-05-25T09:00:00.000Z"),
          metadata: null,
        },
        {
          id: "m2",
          role: "assistant",
          content: "可以。",
          createdAt: new Date("2026-05-25T09:01:00.000Z"),
          metadata: null,
        },
        {
          id: "m3",
          role: "user",
          content: "加一点核心",
          createdAt: new Date("2026-05-25T12:00:02.000Z"),
          metadata: null,
        },
      ],
    });

    await chatHistory.saveChatConversation(createChatConversation({
      id: "chat-save",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "今天练胸",
          createdAt: "2026-05-25T09:00:00.000Z",
        },
        {
          id: "m2",
          role: "assistant",
          content: "可以。",
          createdAt: "2026-05-25T09:01:00.000Z",
        },
        {
          id: "m3",
          role: "user",
          content: "加一点核心",
        },
      ],
    }));

    const createManyPayload = prismaMock.chatMessage.createMany.mock.calls[0][0].data;
    expect(createManyPayload).toMatchObject([
      { id: "m1", createdAt: new Date("2026-05-25T09:00:00.000Z") },
      { id: "m2", createdAt: new Date("2026-05-25T09:01:00.000Z") },
      { id: "m3", createdAt: new Date("2026-05-25T12:00:00.002Z") },
    ]);
  });

  it("rejects ambiguous chat message timestamps before persistence", async () => {
    prismaMock.chatSession.findUnique.mockResolvedValue(null);

    await expect(chatHistory.saveChatConversation(createChatConversation({
      id: "chat-invalid-time",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "今天练胸",
          createdAt: "2026-05-25T09:00:00",
        },
      ],
    }))).rejects.toThrow();
    expect(prismaMock.chatMessage.createMany).not.toHaveBeenCalled();
  });

  it("creates artifacts for pushed chat cards when saving conversation history", async () => {
    prismaMock.chatSession.findUnique.mockResolvedValue(null);
    prismaMock.conversationArtifact.findFirst.mockResolvedValue(null);
    prismaMock.conversationArtifact.create
      .mockResolvedValueOnce({ id: "artifact-rec", revision: 1 })
      .mockResolvedValueOnce({ id: "artifact-routine", revision: 1 })
      .mockResolvedValueOnce({ id: "artifact-plan", revision: 1 });
    prismaMock.chatSession.findFirstOrThrow.mockResolvedValue({
      id: "chat-save",
      title: "今天练胸",
      updatedAt: new Date("2026-05-25T12:00:00.000Z"),
      messages: [
        {
          id: "m1",
          role: "user",
          content: "今天练胸",
          createdAt: new Date("2026-05-25T09:00:00.000Z"),
          metadata: null,
        },
        {
          id: "m2",
          role: "assistant",
          content: "可以。",
          createdAt: new Date("2026-05-25T09:01:00.000Z"),
          metadata: null,
        },
      ],
    });

    await chatHistory.saveChatConversation(createChatConversation({
      id: "chat-save",
      messages: [
        { id: "m1", role: "user", content: "今天练胸" },
        {
          id: "m2",
          role: "assistant",
          content: "可以。",
          visibleOutputs: [createVisibleExerciseSelectionOutput("push-up")],
        },
      ],
      exerciseRecommendations: {
        m2: createExerciseRecommendationCard(),
      },
      recommendationIntents: {
        m2: createWorkoutPlanIntent({ goal: "练胸" }),
      },
      routines: {
        m2: createWorkoutRoutineDraft(),
      },
      plans: {
        m2: createWorkoutPlanDraft(),
      },
    }));

    expect(prismaMock.conversationArtifact.create).not.toHaveBeenCalled();
    expect(prismaMock.chatMessage.createMany.mock.calls[0][0].data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "m2",
          metadata: expect.objectContaining({
            visibleOutputs: [
              expect.objectContaining({
                outputType: "visibleTrainingProposal",
                payload: expect.objectContaining({ kind: "exercise_selection" }),
              }),
            ],
          }),
        }),
      ]),
    );
    const assistantMetadata = prismaMock.chatMessage.createMany.mock.calls[0][0].data.find(
      (item: { id: string }) => item.id === "m2",
    )?.metadata;
    expect(assistantMetadata).not.toHaveProperty("plan");
    expect(assistantMetadata).not.toHaveProperty("routine");
    expect(assistantMetadata).not.toHaveProperty("exerciseRecommendation");
    expect(assistantMetadata).not.toHaveProperty("recommendationIntent");
    expect(prismaMock.artifactIndex.upsert).not.toHaveBeenCalled();
  });

  it("does not persist assistant-only chat conversations", async () => {
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

function createExerciseRecommendationCard() {
  return {
    title: "居家胸肌动作",
    goal: "胸肌训练",
    summary: "适合新手的自重动作。",
    items: [
      {
        exerciseId: "push-up",
        nameZh: "俯卧撑",
        categoryZh: "力量",
        levelZh: "新手",
        equipmentZh: "自重",
        primaryMusclesZh: ["胸部"],
        secondaryMusclesZh: ["肱三头肌"],
        reasons: ["无需器械"],
      },
    ],
    safetyNotes: [],
  };
}

function createVisibleExerciseSelectionOutput(exerciseId: string) {
  return {
    outputType: "visibleTrainingProposal",
    schemaVersion: "1",
    payload: {
      kind: "exercise_selection",
      exerciseItems: [
        { exerciseId, section: "training", order: 1 },
      ],
    },
    content: {
      kind: "exercise_selection",
      sections: [
        {
          section: "training",
          items: [
            {
              exerciseId,
              section: "training",
              order: 1,
              exercise: {
                exerciseId,
                nameZh: "俯卧撑",
                equipmentZh: "自重",
                primaryMusclesZh: ["胸部"],
                imageUrl: null,
              },
            },
          ],
        },
      ],
    },
  };
}

function createWorkoutRoutineRecord() {
  const exercise = createExercise({
    id: "push-up",
    nameZh: "俯卧撑",
    imageUrls: ["/push-up.png"],
  });

  return {
    id: "routine-1",
    title: "胸肌训练",
    updatedAt: new Date("2026-05-25T10:30:00.000Z"),
    trainingLoopRounds: 1,
    trainingLoopRestSeconds: 90,
    warmupToTrainingRestSeconds: 45,
    trainingToStretchRestSeconds: 75,
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
