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
    findMany: vi.fn(),
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
        embeddingText: expect.stringContaining("居家胸肌动作"),
        embedding: expect.any(Array),
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

  it("reuses the active artifact when the same message saves the same routine payload again", async () => {
    const routine = createWorkoutRoutineDraft({ title: "重复训练" });
    prismaMock.conversationArtifact.findFirst.mockResolvedValue({
      id: "artifact-existing",
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-1",
      kind: "routine",
      payload: routine,
      revision: 1,
    });

    await expect(artifactService.createOrUpdateConversationArtifact({
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-1",
      kind: "routine",
      payload: routine,
    })).resolves.toMatchObject({
      id: "artifact-existing",
    });

    expect(prismaMock.conversationArtifact.create).not.toHaveBeenCalled();
    expect(prismaMock.conversationArtifact.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "superseded" },
    }));
    expect(prismaMock.artifactIndex.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { artifactId: "artifact-existing" },
      update: expect.objectContaining({
        sourceMessageId: "message-1",
      }),
    }));
  });

  it("binds an old unbound active artifact to the current message when payload is stable", async () => {
    const routine = createWorkoutRoutineDraft({ title: "旧未绑定训练" });
    prismaMock.conversationArtifact.findFirst.mockResolvedValue(null);
    prismaMock.conversationArtifact.findMany.mockResolvedValue([
      {
        id: "artifact-unbound",
        userId: "user-1",
        sessionId: "chat-1",
        messageId: null,
        kind: "routine",
        payload: routine,
        revision: 1,
      },
    ]);

    await artifactService.createOrUpdateConversationArtifact({
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "message-2",
      kind: "routine",
      payload: routine,
    });

    expect(prismaMock.conversationArtifact.create).not.toHaveBeenCalled();
    expect(prismaMock.conversationArtifact.update).toHaveBeenCalledWith({
      where: { id: "artifact-unbound" },
      data: { messageId: "message-2" },
    });
    expect(prismaMock.artifactIndex.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { artifactId: "artifact-unbound" },
      update: expect.objectContaining({
        sourceMessageId: "message-2",
      }),
    }));
  });

  it("lists only current user's active recent artifact summaries", async () => {
    prismaMock.artifactIndex.findMany.mockResolvedValue([
      {
        artifactId: "artifact-1",
        sessionId: "chat-1",
        kind: "plan",
        title: "四周增肌计划",
        summary: "每周三练",
        exerciseIds: ["push-up"],
        goals: ["增肌"],
        muscles: ["胸部"],
        equipment: ["自重"],
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
      take: 18,
    }));
    expect(summaries).toEqual([
      expect.objectContaining({
        artifactId: "artifact-1",
        kind: "plan",
        muscles: ["胸部"],
        equipment: ["自重"],
        updatedAt: "2026-05-30T08:00:00.000Z",
      }),
    ]);
  });

  it("deduplicates recent active summaries by source message and stable index facts", async () => {
    prismaMock.artifactIndex.findMany.mockResolvedValue([
      {
        artifactId: "artifact-1-newer",
        sessionId: "chat-1",
        kind: "routine",
        sourceMessageId: "assistant-1",
        title: "训练 A",
        summary: "30 分钟",
        exerciseIds: ["push-up"],
        goals: ["胸肌训练"],
        muscles: ["胸部"],
        equipment: ["自重"],
        sessionMinutes: 30,
        weeklyFrequency: null,
        trainingDayCount: null,
        updatedAt: new Date("2026-06-02T08:03:00.000Z"),
      },
      {
        artifactId: "artifact-1-duplicate",
        sessionId: "chat-1",
        kind: "routine",
        sourceMessageId: "assistant-1",
        title: "训练 A",
        summary: "30 分钟",
        exerciseIds: ["push-up"],
        goals: ["胸肌训练"],
        muscles: ["胸部"],
        equipment: ["自重"],
        sessionMinutes: 30,
        weeklyFrequency: null,
        trainingDayCount: null,
        updatedAt: new Date("2026-06-02T08:02:00.000Z"),
      },
      {
        artifactId: "artifact-unbound-duplicate",
        sessionId: "chat-1",
        kind: "routine",
        sourceMessageId: null,
        title: "训练 A",
        summary: "30 分钟",
        exerciseIds: ["push-up"],
        goals: ["胸肌训练"],
        muscles: ["胸部"],
        equipment: ["自重"],
        sessionMinutes: 30,
        weeklyFrequency: null,
        trainingDayCount: null,
        updatedAt: new Date("2026-06-02T08:01:00.000Z"),
      },
      {
        artifactId: "artifact-2",
        sessionId: "chat-1",
        kind: "routine",
        sourceMessageId: "assistant-2",
        title: "训练 B",
        summary: "20 分钟",
        exerciseIds: ["squat"],
        goals: ["腿部训练"],
        muscles: ["腿部"],
        equipment: ["自重"],
        sessionMinutes: 20,
        weeklyFrequency: null,
        trainingDayCount: null,
        updatedAt: new Date("2026-06-02T08:00:00.000Z"),
      },
    ]);

    const summaries = await artifactService.listRecentArtifactSummariesForCurrentUser("chat-1");

    expect(summaries.map((summary) => summary.artifactId)).toEqual([
      "artifact-1-newer",
      "artifact-2",
    ]);
  });

  it("searches artifacts within current user scope and returns lightweight candidates", async () => {
    prismaMock.artifactIndex.findMany.mockResolvedValue([
      {
        artifactId: "artifact-chest",
        sessionId: "chat-1",
        kind: "routine",
        title: "居家胸肌循环",
        summary: "胸部自重训练。",
        exerciseIds: ["push-up"],
        goals: ["胸肌训练"],
        muscles: ["胸部"],
        equipment: ["自重"],
        sessionMinutes: 30,
        weeklyFrequency: null,
        trainingDayCount: null,
        embeddingText: "居家胸肌循环 | 胸部自重训练 | 胸部 | 自重",
        embedding: null,
        updatedAt: new Date("2026-05-30T08:00:00.000Z"),
      },
      {
        artifactId: "artifact-leg",
        sessionId: "chat-2",
        kind: "routine",
        title: "腿部训练",
        summary: "下肢力量。",
        exerciseIds: ["squat"],
        goals: ["腿部训练"],
        muscles: ["腿部"],
        equipment: ["自重"],
        sessionMinutes: 20,
        weeklyFrequency: null,
        trainingDayCount: null,
        embeddingText: "腿部训练 | 下肢力量 | 腿部 | 自重",
        embedding: null,
        updatedAt: new Date("2026-05-30T07:00:00.000Z"),
      },
    ]);

    const candidates = await artifactService.searchArtifacts({
      userId: "user-1",
      sessionId: "chat-1",
      sessionScope: "current_user",
      kind: "routine",
      query: "之前那套练胸的",
      limit: 3,
    });

    expect(prismaMock.artifactIndex.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", status: "active", kind: "routine" },
      take: 24,
    }));
    expect(candidates).toEqual([
      expect.objectContaining({
        artifactId: "artifact-chest",
        title: "居家胸肌循环",
        muscles: ["胸部"],
      }),
    ]);
    expect(candidates[0]).not.toHaveProperty("payload");
  });

  it("keeps artifact hybrid search inside current user and status filters", async () => {
    prismaMock.artifactIndex.findMany.mockResolvedValue([
      {
        artifactId: "artifact-core",
        sessionId: "chat-2",
        kind: "routine",
        scope: "chat",
        status: "active",
        title: "核心稳定训练",
        summary: "平板支撑和抗旋转训练。",
        exerciseIds: ["plank"],
        goals: ["核心稳定"],
        muscles: ["核心"],
        equipment: ["自重"],
        sessionMinutes: 20,
        weeklyFrequency: null,
        trainingDayCount: null,
        embeddingText: "核心稳定训练 | 平板支撑 | 抗旋转 | 核心",
        embedding: null,
        updatedAt: new Date("2026-05-30T08:00:00.000Z"),
      },
    ]);

    const result = await artifactService.searchArtifactsDetailed({
      userId: "user-1",
      sessionId: "chat-1",
      sessionScope: "current_user",
      kind: "routine",
      query: "核心不稳",
      limit: 3,
    });

    expect(prismaMock.artifactIndex.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", status: "active", kind: "routine" },
    }));
    expect(result).toMatchObject({
      candidates: [expect.objectContaining({ artifactId: "artifact-core" })],
      diagnostics: expect.objectContaining({
        recalledCount: 1,
        finalCandidateIds: ["artifact-core"],
      }),
    });
  });

  it("reads artifact payload only after user and schema validation", async () => {
    prismaMock.conversationArtifact.findFirst.mockResolvedValueOnce({
      id: "artifact-routine",
      kind: "routine",
      payloadSchemaVersion: 1,
      payload: createWorkoutRoutineDraft(),
    });

    await expect(
      artifactService.getArtifactPayload({
        userId: "user-1",
        artifactId: "artifact-routine",
      }),
    ).resolves.toMatchObject({
      ok: true,
      artifactId: "artifact-routine",
      kind: "routine",
    });
    expect(prismaMock.conversationArtifact.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "artifact-routine",
        userId: "user-1",
        status: "active",
      },
    }));

    prismaMock.conversationArtifact.findFirst.mockResolvedValueOnce({
      id: "artifact-invalid",
      kind: "routine",
      payloadSchemaVersion: 1,
      payload: { title: "坏数据" },
    });

    await expect(
      artifactService.getArtifactPayload({
        userId: "user-1",
        artifactId: "artifact-invalid",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid_payload",
    });
  });

  it("reads active artifact payload directly without switching revisions", async () => {
    prismaMock.conversationArtifact.findFirst.mockResolvedValueOnce({
      id: "artifact-active",
      userId: "user-1",
      sessionId: "chat-1",
      kind: "routine",
      status: "active",
      revisionOfArtifactId: null,
      payloadSchemaVersion: 1,
      payload: createWorkoutRoutineDraft(),
    });

    await expect(
      artifactService.getActiveArtifactPayload({
        userId: "user-1",
        artifactId: "artifact-active",
      }),
    ).resolves.toMatchObject({
      ok: true,
      artifactId: "artifact-active",
      requestedArtifactId: "artifact-active",
      revisionResolution: {
        status: "direct",
        activeArtifactId: "artifact-active",
      },
    });
    expect(prismaMock.conversationArtifact.findMany).not.toHaveBeenCalled();
  });

  it("resolves a superseded artifact to the current active revision in the same lineage", async () => {
    prismaMock.conversationArtifact.findFirst.mockResolvedValueOnce({
      id: "artifact-old",
      userId: "user-1",
      sessionId: "chat-1",
      kind: "routine",
      status: "superseded",
      revisionOfArtifactId: null,
      payloadSchemaVersion: 1,
      payload: createWorkoutRoutineDraft({ title: "旧训练" }),
    });
    prismaMock.conversationArtifact.findMany.mockResolvedValueOnce([
      {
        id: "artifact-old",
        kind: "routine",
        status: "superseded",
        revision: 1,
        revisionOfArtifactId: null,
        payloadSchemaVersion: 1,
        payload: createWorkoutRoutineDraft({ title: "旧训练" }),
      },
      {
        id: "artifact-middle",
        kind: "routine",
        status: "superseded",
        revision: 2,
        revisionOfArtifactId: "artifact-old",
        payloadSchemaVersion: 1,
        payload: createWorkoutRoutineDraft({ title: "中间训练" }),
      },
      {
        id: "artifact-active",
        kind: "routine",
        status: "active",
        revision: 3,
        revisionOfArtifactId: "artifact-middle",
        payloadSchemaVersion: 1,
        payload: createWorkoutRoutineDraft({ title: "当前训练" }),
      },
      {
        id: "artifact-other-active",
        kind: "routine",
        status: "active",
        revision: 1,
        revisionOfArtifactId: null,
        payloadSchemaVersion: 1,
        payload: createWorkoutRoutineDraft({ title: "无关训练" }),
      },
    ]);

    await expect(
      artifactService.getActiveArtifactPayload({
        userId: "user-1",
        artifactId: "artifact-old",
      }),
    ).resolves.toMatchObject({
      ok: true,
      artifactId: "artifact-active",
      requestedArtifactId: "artifact-old",
      payload: {
        title: "当前训练",
      },
      revisionResolution: {
        status: "resolved_to_active",
        requestedArtifactId: "artifact-old",
        activeArtifactId: "artifact-active",
      },
    });
    expect(prismaMock.conversationArtifact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: "user-1",
        sessionId: "chat-1",
        kind: "routine",
      },
    }));
  });

  it("fails instead of reading unrelated or archived artifact revisions", async () => {
    prismaMock.conversationArtifact.findFirst.mockResolvedValueOnce({
      id: "artifact-old",
      userId: "user-1",
      sessionId: "chat-1",
      kind: "routine",
      status: "superseded",
      revisionOfArtifactId: null,
      payloadSchemaVersion: 1,
      payload: createWorkoutRoutineDraft(),
    });
    prismaMock.conversationArtifact.findMany.mockResolvedValueOnce([
      {
        id: "artifact-other-active",
        kind: "routine",
        status: "active",
        revision: 1,
        revisionOfArtifactId: null,
        payloadSchemaVersion: 1,
        payload: createWorkoutRoutineDraft({ title: "无关训练" }),
      },
    ]);

    await expect(
      artifactService.getActiveArtifactPayload({
        userId: "user-1",
        artifactId: "artifact-old",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "not_found",
    });

    prismaMock.conversationArtifact.findFirst.mockResolvedValueOnce({
      id: "artifact-archived",
      userId: "user-1",
      sessionId: "chat-1",
      kind: "routine",
      status: "archived",
      revisionOfArtifactId: null,
      payloadSchemaVersion: 1,
      payload: createWorkoutRoutineDraft(),
    });

    await expect(
      artifactService.getActiveArtifactPayload({
        userId: "user-1",
        artifactId: "artifact-archived",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "not_found",
    });
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
