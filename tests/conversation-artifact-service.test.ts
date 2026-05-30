import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWorkoutPlanDraft,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

const prismaMock = vi.hoisted(() => ({
  artifactIndex: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  conversationArtifact: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
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

const artifactService = await import("@/lib/server/conversation-artifacts/artifact-service");

describe("conversation artifact service", () => {
  beforeEach(() => {
    for (const model of Object.values(prismaMock)) {
      if (typeof model === "function") {
        model.mockReset();
        continue;
      }

      for (const method of Object.values(model)) {
        method.mockReset();
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    userMocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("creates an exercise recommendation artifact with a searchable index", async () => {
    prismaMock.conversationArtifact.findFirst.mockResolvedValue(null);
    prismaMock.conversationArtifact.create.mockResolvedValue({
      id: "artifact-1",
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-1",
      kind: "exercise_recommendation",
      payload: createExerciseRecommendationCard(),
      revision: 1,
    });

    await artifactService.createOrUpdateConversationArtifact({
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-1",
      kind: "exercise_recommendation",
      payload: createExerciseRecommendationCard(),
    });

    expect(prismaMock.conversationArtifact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        sessionId: "chat-1",
        messageId: "message-1",
        kind: "exercise_recommendation",
        payloadSchemaVersion: 1,
        revision: 1,
      }),
    }));
    expect(prismaMock.artifactIndex.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        artifactId: "artifact-1",
        title: "居家胸肌动作",
        exerciseIds: ["push-up"],
        goals: ["胸肌训练"],
        muscles: ["胸部", "肱三头肌"],
        equipment: ["自重"],
      }),
    }));
  });

  it("creates a new revision when the same message payload changes", async () => {
    prismaMock.conversationArtifact.findFirst.mockResolvedValue({
      id: "artifact-old",
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-1",
      kind: "routine",
      payload: createWorkoutRoutineDraft({ title: "旧训练" }),
      revision: 1,
    });
    prismaMock.conversationArtifact.create.mockResolvedValue({
      id: "artifact-new",
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-1",
      kind: "routine",
      payload: createWorkoutRoutineDraft({ title: "新训练" }),
      revision: 2,
    });

    await artifactService.createOrUpdateConversationArtifact({
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-1",
      kind: "routine",
      payload: createWorkoutRoutineDraft({ title: "新训练" }),
    });

    expect(prismaMock.conversationArtifact.update).toHaveBeenCalledWith({
      where: { id: "artifact-old" },
      data: { status: "superseded" },
    });
    expect(prismaMock.artifactIndex.updateMany).toHaveBeenCalledWith({
      where: { artifactId: "artifact-old", userId: "user-1" },
      data: { status: "superseded" },
    });
    expect(prismaMock.conversationArtifact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        revision: 2,
        revisionOfArtifactId: "artifact-old",
      }),
    }));
  });

  it("lists only current user's active recent artifact summaries", async () => {
    prismaMock.artifactIndex.findMany.mockResolvedValue([
      {
        artifactId: "artifact-1",
        kind: "plan",
        title: "四周增肌计划",
        summary: "每周三练",
        exerciseIds: ["push-up"],
        goals: ["增肌"],
        sessionMinutes: 30,
        weeklyFrequency: 3,
        trainingDayCount: 3,
        updatedAt: new Date("2026-05-30T08:00:00.000Z"),
      },
    ]);

    const summaries = await artifactService.listRecentArtifactSummariesForCurrentUser("chat-1");

    expect(prismaMock.artifactIndex.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", sessionId: "chat-1", status: "active" },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }));
    expect(summaries).toEqual([
      expect.objectContaining({
        artifactId: "artifact-1",
        kind: "plan",
        updatedAt: "2026-05-30T08:00:00.000Z",
      }),
    ]);
  });

  it("does not query artifacts when an old request has no conversation id", async () => {
    await expect(artifactService.listRecentArtifactSummariesForCurrentUser(undefined)).resolves.toEqual([]);
    expect(prismaMock.artifactIndex.findMany).not.toHaveBeenCalled();
  });

  it("extracts plan index fields without reading conversation summary", () => {
    const index = artifactService.buildArtifactIndex({
      artifactId: "artifact-plan",
      userId: "user-1",
      sessionId: "chat-1",
      kind: "plan",
      scope: "chat",
      status: "active",
      sourceMessageId: "message-2",
      payload: createWorkoutPlanDraft(),
    });

    expect(index).toMatchObject({
      title: "居家胸肌训练",
      exerciseIds: expect.arrayContaining(["push-up", "warmup", "stretch"]),
      sessionMinutes: 30,
      trainingDayCount: 1,
      sourceMessageId: "message-2",
    });
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
