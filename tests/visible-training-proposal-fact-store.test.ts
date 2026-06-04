import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listRecentVisibleTrainingProposalSummaries,
  persistVisibleTrainingProposalFactsFromEvents,
  readVisibleTrainingProposalFact,
  toVisibleTrainingProposalMetadataSummary,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-fact-store";

const exerciseRepositoryMocks = vi.hoisted(() => ({
  getExerciseRecordsByIds: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-repository", () => ({
  getExerciseRecordsByIds: exerciseRepositoryMocks.getExerciseRecordsByIds,
}));

describe("visible training proposal fact store", () => {
  beforeEach(() => {
    exerciseRepositoryMocks.getExerciseRecordsByIds.mockReset();
  });

  it("persists visible proposal payloads from visible_output events only", async () => {
    const client = createFactClient();

    const result = await persistVisibleTrainingProposalFactsFromEvents({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      events: [
        createVisibleOutputEvent(),
        { type: "content", content: "这是正文说明，不是训练事实源。" },
        { type: "done" },
      ],
      client,
    });

    expect(result).toEqual({ ok: true, savedCount: 1 });
    expect(client.conversationBusinessFact.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        conversationBusinessFactIdentity: {
          userId: "user-1",
          conversationId: "conversation-1",
          messageId: "assistant-1",
          kind: "visible_training_proposal_displayed",
          schemaVersion: 1,
        },
      },
    }));
    const createPayload = client.conversationBusinessFact.upsert.mock.calls[0][0].create.payload;
    expect(createPayload).toMatchObject({
      proposal: createVisibleProposalPayload(),
      visibilitySource: "response_renderer_visible_output",
      outputType: "visibleTrainingProposal",
      schemaVersion: "1",
      exerciseDetails: [
        expect.objectContaining({ exerciseId: "squat", nameZh: "深蹲" }),
      ],
    });
    expect(JSON.stringify(createPayload)).not.toContain("displayedExerciseIds");
    expect(JSON.stringify(createPayload)).not.toContain("returnedExerciseIds");
  });

  it("skips persistence when no visible training proposal exists", async () => {
    const client = createFactClient();

    await expect(persistVisibleTrainingProposalFactsFromEvents({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      events: [{ type: "content", content: "普通回答" }, { type: "done" }],
      client,
    })).resolves.toEqual({
      ok: true,
      savedCount: 0,
      skippedReason: "no_visible_training_proposal",
    });
    expect(client.conversationBusinessFact.upsert).not.toHaveBeenCalled();
  });

  it("restores recent summaries with proposal item ids and without old displayed payload fields", async () => {
    const client = createFactClient({
      findMany: [createFactRow()],
    });

    const summaries = await listRecentVisibleTrainingProposalSummaries({
      userId: "user-1",
      conversationId: "conversation-1",
      client,
    });

    expect(client.conversationBusinessFact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        conversationId: "conversation-1",
        kind: "visible_training_proposal_displayed",
        status: "active",
        schemaVersion: 1,
      }),
      take: 3,
    }));
    expect(summaries).toEqual([
      expect.objectContaining({
        factRef: "fact-1",
        messageId: "assistant-1",
        proposalKind: "routine",
        exerciseItems: expect.arrayContaining([
          expect.objectContaining({ exerciseId: "squat", section: "training" }),
        ]),
      }),
    ]);
    expect(JSON.stringify(summaries)).not.toContain("displayedExerciseIds");
    expect(JSON.stringify(summaries)).not.toContain("displayedExercises");
  });

  it("projects recent summaries to metadata indexes without reusable exercise payloads", async () => {
    const client = createFactClient({
      findMany: [createFactRow()],
    });
    const [summary] = await listRecentVisibleTrainingProposalSummaries({
      userId: "user-1",
      conversationId: "conversation-1",
      client,
    });

    const metadataSummary = toVisibleTrainingProposalMetadataSummary(summary!);

    expect(metadataSummary).toEqual({
      factRef: "fact-1",
      messageId: "assistant-1",
      kind: "visible_training_proposal_displayed",
      status: "active",
      schemaVersion: 1,
      createdAt: "2026-06-03T14:30:00.000Z",
      proposalKind: "routine",
      visibleOutputSchemaVersion: "1",
      factSchemaVersion: 1,
      sectionSummary: { warmup: 1, training: 1, stretch: 1 },
      reusableTrainingExerciseCount: 1,
    });
    expect(JSON.stringify(metadataSummary)).not.toContain("exerciseItems");
    expect(JSON.stringify(metadataSummary)).not.toContain("prescription");
    expect(JSON.stringify(metadataSummary)).not.toContain("schedule");
    expect(JSON.stringify(metadataSummary)).not.toContain("imageUrl");
  });

  it("reads only current user and conversation facts and validates referenced exercises still exist", async () => {
    const successClient = createFactClient({ findMany: [createFactRow()] });
    exerciseRepositoryMocks.getExerciseRecordsByIds.mockImplementation(async (ids: string[]) => ids.map((id) => createExerciseRecord(id)).filter(Boolean));

    await expect(readVisibleTrainingProposalFact({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      client: successClient,
    })).resolves.toMatchObject({
      ok: true,
      fact: {
        factRef: "fact-1",
        conversationId: "conversation-1",
        payload: expect.objectContaining({
          kind: "routine",
          exerciseItems: expect.arrayContaining([
            expect.objectContaining({ exerciseId: "squat" }),
          ]),
        }),
        exerciseDetails: expect.arrayContaining([
          expect.objectContaining({ exerciseId: "squat", nameZh: "深蹲" }),
        ]),
      },
    });
    expect(successClient.conversationBusinessFact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        conversationId: "conversation-1",
        id: "fact-1",
      }),
      take: 2,
    }));

    await expect(readVisibleTrainingProposalFact({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      client: createFactClient({ findMany: [createFactRow({ id: "fact-1" }), createFactRow({ id: "fact-2" })] }),
    })).resolves.toMatchObject({ ok: false, code: "not_unique" });

    await expect(readVisibleTrainingProposalFact({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      client: createFactClient({ findMany: [createFactRow({ status: "expired" })] }),
    })).resolves.toMatchObject({ ok: false, code: "status_not_readable" });

    exerciseRepositoryMocks.getExerciseRecordsByIds.mockResolvedValueOnce([]);
    await expect(readVisibleTrainingProposalFact({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      client: createFactClient({ findMany: [createFactRow()] }),
    })).resolves.toMatchObject({ ok: false, code: "exercise_missing" });

    exerciseRepositoryMocks.getExerciseRecordsByIds.mockResolvedValueOnce([
      createExerciseRecord("jumping-jack"),
      { ...createExerciseRecord("squat")!, isPublished: false },
      createExerciseRecord("standing-quad-stretch"),
    ]);
    await expect(readVisibleTrainingProposalFact({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      client: createFactClient({ findMany: [createFactRow()] }),
    })).resolves.toMatchObject({ ok: false, code: "exercise_unpublished" });

    exerciseRepositoryMocks.getExerciseRecordsByIds.mockResolvedValueOnce([
      createExerciseRecord("jumping-jack"),
      { ...createExerciseRecord("squat")!, allowedSections: ["warmup"] },
      createExerciseRecord("standing-quad-stretch"),
    ]);
    await expect(readVisibleTrainingProposalFact({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      client: createFactClient({ findMany: [createFactRow()] }),
    })).resolves.toMatchObject({ ok: false, code: "section_not_allowed" });
  });
});

function createFactClient(input: { findMany?: unknown[] } = {}): any {
  return {
    conversationBusinessFact: {
      upsert: vi.fn(async (args: any) => ({ id: "fact-1", ...args.create })),
      findMany: vi.fn(async () => input.findMany ?? []),
    },
  };
}

function createFactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fact-1",
    userId: "user-1",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    kind: "visible_training_proposal_displayed",
    status: "active",
    schemaVersion: 1,
    payload: createFactPayload(),
    createdAt: new Date("2026-06-03T14:30:00.000Z"),
    updatedAt: new Date("2026-06-03T14:30:00.000Z"),
    ...overrides,
  };
}

function createFactPayload() {
  return {
    proposal: createVisibleProposalPayload(),
    exerciseDetails: [
      { exerciseId: "jumping-jack", nameZh: "开合跳", nameEn: "Jumping Jack", equipmentZh: "自重", primaryMusclesZh: ["全身"], allowedSections: ["warmup"], imageUrl: null },
      { exerciseId: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { exerciseId: "standing-quad-stretch", nameZh: "站姿股四头肌拉伸", nameEn: "Standing Quad Stretch", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["stretch"], imageUrl: null },
    ],
    visibilitySource: "response_renderer_visible_output",
    outputType: "visibleTrainingProposal",
    schemaVersion: "1",
  };
}

function createVisibleOutputEvent() {
  return {
    type: "visible_output" as const,
    outputType: "visibleTrainingProposal",
    schemaVersion: "1",
    payload: createVisibleProposalPayload(),
    content: {
      kind: "routine",
      sections: [
        {
          section: "training",
          items: [
            {
              exerciseId: "squat",
              section: "training",
              order: 1,
              prescription: createPrescription({ mode: "reps", target: 12 }),
              exercise: { exerciseId: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
            },
          ],
        },
      ],
    },
  };
}

function createVisibleProposalPayload() {
  return {
    kind: "routine" as const,
    exerciseItems: [
      { exerciseId: "jumping-jack", section: "warmup" as const, order: 1, prescription: createPrescription({ mode: "reps", target: 20 }) },
      { exerciseId: "squat", section: "training" as const, order: 1, prescription: createPrescription({ mode: "reps", target: 12 }) },
      { exerciseId: "standing-quad-stretch", section: "stretch" as const, order: 1, prescription: createPrescription({ mode: "duration", target: 30 }) },
    ],
  };
}

function createPrescription(input: { mode: "reps" | "duration"; target: number }) {
  return {
    mode: input.mode,
    sets: 2,
    target: input.target,
    setRestSeconds: 45,
    transitionRestSeconds: 30,
  };
}

function createExerciseRecord(id: string) {
  const records = {
    "jumping-jack": {
      id,
      nameZh: "开合跳",
      nameEn: "Jumping Jack",
      equipmentZh: "自重",
      primaryMusclesZh: ["全身"],
      allowedSections: ["warmup"],
      imageUrls: [],
      isPublished: true,
    },
    squat: {
      id,
      nameZh: "深蹲",
      nameEn: "Squat",
      equipmentZh: "自重",
      primaryMusclesZh: ["股四头肌"],
      allowedSections: ["training"],
      imageUrls: [],
      isPublished: true,
    },
    "standing-quad-stretch": {
      id,
      nameZh: "站姿股四头肌拉伸",
      nameEn: "Standing Quad Stretch",
      equipmentZh: "自重",
      primaryMusclesZh: ["股四头肌"],
      allowedSections: ["stretch"],
      imageUrls: [],
      isPublished: true,
    },
  } as const;

  return records[id as keyof typeof records];
}
