import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectExerciseCandidates } from "@/lib/server/workout-plans/exercise-candidate-service";

import {
  createExercise,
  createWorkoutPlanIntent,
} from "./fixtures/domain";

const prismaMock = vi.hoisted(() => ({
  userProfile: {
    findUnique: vi.fn(),
  },
  userMemory: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  userExerciseFeedback: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  workoutSessionResult: {
    findMany: vi.fn(),
  },
}));
const dbMocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));

vi.mock("@/lib/server/db/prisma", () => dbMocks);

const userFeedbackMemory = await import("@/lib/server/user-feedback-memory/user-feedback-memory-service");

const exercises = [
  createExercise({
    id: "push-up",
    nameZh: "俯卧撑",
    primaryMusclesZh: ["胸部"],
  }),
  createExercise({
    id: "plank",
    nameZh: "平板支撑",
    primaryMusclesZh: ["核心"],
    movementPattern: "core",
    regressionExerciseIds: ["dead-bug"],
  }),
  createExercise({
    id: "dead-bug",
    nameZh: "死虫式",
    primaryMusclesZh: ["核心"],
    difficulty: "beginner",
    level: "beginner",
    movementPattern: "core",
  }),
];

describe("user feedback memory service", () => {
  beforeEach(() => {
    for (const model of Object.values(prismaMock)) {
      for (const method of Object.values(model)) {
        if (typeof method === "function" && "mockReset" in method) {
          method.mockReset();
        }
      }
    }

    prismaMock.userProfile.findUnique.mockResolvedValue(null);
    prismaMock.userMemory.findFirst.mockResolvedValue(null);
    prismaMock.userMemory.findMany.mockResolvedValue([]);
    prismaMock.userMemory.create.mockImplementation(async ({ data }) => ({ id: "memory-1", ...data }));
    prismaMock.userExerciseFeedback.findFirst.mockResolvedValue(null);
    prismaMock.userExerciseFeedback.findMany.mockResolvedValue([]);
    prismaMock.userExerciseFeedback.create.mockImplementation(async ({ data }) => ({ id: "feedback-1", ...data }));
    prismaMock.workoutSessionResult.findMany.mockResolvedValue([]);
  });

  it("writes explicit dislike, too_hard, and temporary context without health decision memory", async () => {
    const result = await userFeedbackMemory.recordUserFeedbackFromChat({
      userId: "user-1",
      latestUserMessage: "我不喜欢俯卧撑，平板支撑太难，今天不想练腿，肩膀不舒服",
      exercises,
      now: new Date("2026-05-30T10:00:00.000Z"),
    });

    expect(result).toEqual({ memories: 3, exerciseFeedback: 2 });
    expect(prismaMock.userExerciseFeedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        exerciseId: "push-up",
        kind: "dislike",
        status: "active",
      }),
    }));
    expect(prismaMock.userExerciseFeedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        exerciseId: "plank",
        kind: "too_hard",
      }),
    }));
    expect(prismaMock.userMemory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        kind: "temporary_context",
        subjectLabel: "腿",
        expiresAt: new Date("2026-05-31T22:00:00.000Z"),
      }),
    }));
    expect(prismaMock.userMemory.create).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        kind: "injury_or_pain_signal",
      }),
    }));
  });

  it("requires confirmation for long-term strong constraints", async () => {
    await userFeedbackMemory.recordUserFeedbackFromChat({
      userId: "user-1",
      latestUserMessage: "以后都不要安排俯卧撑",
      exercises,
      now: new Date("2026-05-30T10:00:00.000Z"),
    });

    expect(prismaMock.userExerciseFeedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        exerciseId: "push-up",
        kind: "dislike",
        requiresConfirmation: true,
        status: "pending_confirmation",
      }),
    }));
  });

  it("keeps temporary context short-lived and out of durable preferences", () => {
    const signals = userFeedbackMemory.extractUserFeedbackSignals({
      latestUserMessage: "今天不想练腿",
      exercises,
      now: new Date("2026-05-30T10:00:00.000Z"),
    });

    expect(signals.memories).toEqual([
      expect.objectContaining({
        kind: "temporary_context",
        subjectLabel: "腿",
        expiresAt: new Date("2026-05-31T22:00:00.000Z"),
      }),
    ]);
    expect(signals.memories.some((memory) => memory.kind === "explicit_preference")).toBe(false);
  });

  it("lets the current message override historical exercise dislike", async () => {
    prismaMock.userExerciseFeedback.findMany.mockResolvedValue([
      {
        exerciseId: "push-up",
        kind: "dislike",
        confidence: 1,
        requiresConfirmation: false,
        status: "active",
      },
    ]);

    const memoryState = await userFeedbackMemory.buildConversationMemoryState({
      userId: "user-1",
      latestUserMessage: "我想试试俯卧撑",
      exercises,
    });
    const candidates = selectExerciseCandidates(
      createWorkoutPlanIntent({ goal: "胸肌训练", equipment: ["自重"] }),
      exercises,
      { memoryState },
    );

    expect(memoryState.currentMessage.requestedExerciseIds).toContain("push-up");
    expect(candidates.excluded.find((exercise) => exercise.exerciseId === "push-up")).toBeUndefined();
    expect(candidates.primaryCandidates.map((candidate) => candidate.exercise.id)).toContain("push-up");
  });
});
