import { describe, expect, it, vi } from "vitest";

import {
  listRecentExerciseRecommendationFactSummaries,
  persistExerciseRecommendationFactsFromEvents,
  readExerciseRecommendationFact,
} from "@/lib/server/exercise-recommendation-facts/exercise-recommendation-fact-store";

describe("exercise recommendation fact store", () => {
  it("persists displayed exercise ids from user projection events only", async () => {
    const client = createFactClient();

    const result = await persistExerciseRecommendationFactsFromEvents({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      events: [
        {
          type: "tool_result",
          toolName: "searchExerciseResources",
          toolResultId: "tr-search",
          content: createUserProjection(),
        },
        { type: "content", content: "可以参考深蹲。" },
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
          kind: "exercise_recommendation_displayed",
          schemaVersion: 1,
        },
      },
    }));
    const createPayload = client.conversationBusinessFact.upsert.mock.calls[0][0].create.payload;
    expect(createPayload).toMatchObject({
      displayedExerciseIds: ["squat", "lunge"],
      visibilitySource: "response_renderer_tool_result",
      toolResultId: "tr-search",
    });
    expect(JSON.stringify(createPayload)).not.toContain("returnedExerciseIds");
  });

  it("skips persistence when no visible exercise projection exists", async () => {
    const client = createFactClient();

    await expect(persistExerciseRecommendationFactsFromEvents({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      events: [{ type: "content", content: "普通回答" }, { type: "done" }],
      client,
    })).resolves.toEqual({
      ok: true,
      savedCount: 0,
      skippedReason: "no_visible_exercise_fact",
    });
    expect(client.conversationBusinessFact.upsert).not.toHaveBeenCalled();
  });

  it("restores recent summaries without exposing full displayed id payload", async () => {
    const client = createFactClient({
      findMany: [createFactRow()],
    });

    const summaries = await listRecentExerciseRecommendationFactSummaries({
      userId: "user-1",
      conversationId: "conversation-1",
      client,
    });

    expect(client.conversationBusinessFact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        conversationId: "conversation-1",
        kind: "exercise_recommendation_displayed",
        status: "active",
        schemaVersion: 1,
      }),
      take: 3,
    }));
    expect(summaries).toEqual([
      expect.objectContaining({
        factRef: "fact-1",
        messageId: "assistant-1",
        displayedCount: 2,
        displayedExercises: expect.arrayContaining([
          expect.objectContaining({ id: "squat" }),
        ]),
        query: expect.objectContaining({
          appliedFilters: expect.any(Array),
          totalMatches: 5,
        }),
      }),
    ]);
    expect(JSON.stringify(summaries)).not.toContain("displayedExerciseIds");
  });

  it("reads only current user and conversation facts and rejects not unique or inactive references", async () => {
    const successClient = createFactClient({ findMany: [createFactRow()] });

    await expect(readExerciseRecommendationFact({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      client: successClient,
    })).resolves.toMatchObject({
      ok: true,
      fact: {
        factRef: "fact-1",
        conversationId: "conversation-1",
        displayedExerciseIds: ["squat", "lunge"],
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

    await expect(readExerciseRecommendationFact({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      client: createFactClient({ findMany: [createFactRow({ id: "fact-1" }), createFactRow({ id: "fact-2" })] }),
    })).resolves.toMatchObject({ ok: false, code: "not_unique" });

    await expect(readExerciseRecommendationFact({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      client: createFactClient({ findMany: [createFactRow({ status: "expired" })] }),
    })).resolves.toMatchObject({ ok: false, code: "status_not_readable" });
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
    kind: "exercise_recommendation_displayed",
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
    query: {
      bodyRegions: ["lower_body"],
      expandedMuscles: ["股四头肌"],
      published: true,
      sort: "name_asc",
      appliedFilters: [
        { field: "bodyRegions", value: ["lower_body"] },
        { field: "published", value: true },
      ],
      totalMatches: 5,
      returnedCount: 2,
      maxReturned: 12,
      truncated: false,
      excludedCount: 0,
    },
    displayedExerciseIds: ["squat", "lunge"],
    displayedExercises: [
      { id: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { id: "lunge", nameZh: "箭步蹲", nameEn: "Lunge", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
    ],
    visibilitySource: "response_renderer_tool_result",
    toolName: "searchExerciseResources",
    toolResultId: "tr-search",
  };
}

function createUserProjection() {
  return {
    status: "succeeded",
    totalMatches: 5,
    returnedCount: 2,
    maxReturned: 12,
    truncated: false,
    excludedCount: 0,
    bodyRegions: ["lower_body"],
    expandedMuscles: ["股四头肌"],
    appliedFilters: [
      { field: "bodyRegions", value: ["lower_body"] },
      { field: "published", value: true },
    ],
    exercises: [
      { id: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { id: "lunge", nameZh: "箭步蹲", nameEn: "Lunge", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
    ],
  };
}
