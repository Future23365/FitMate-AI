import { beforeEach, describe, expect, it, vi } from "vitest";

import { createToolResultId, executeTool, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { readRecentExerciseRecommendationFactTool } from "@/lib/server/agent-tools";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";

const factStoreMocks = vi.hoisted(() => ({
  readExerciseRecommendationFact: vi.fn(),
}));

vi.mock("@/lib/server/exercise-recommendation-facts/exercise-recommendation-fact-store", () => ({
  exerciseRecommendationFactKind: "exercise_recommendation_displayed",
  exerciseRecommendationFactResourceType: "exercise_recommendation_fact",
  exerciseRecommendationFactSchemaVersion: 1,
  readExerciseRecommendationFact: factStoreMocks.readExerciseRecommendationFact,
}));

describe("readRecentExerciseRecommendationFact tool", () => {
  beforeEach(() => {
    factStoreMocks.readExerciseRecommendationFact.mockReset();
  });

  it("reads an accessible fact through runtime and registers a consumable current-run resource", async () => {
    const input = { factRef: "fact-1" };
    const expectedToolResultId = createToolResultId(
      "run-read-fact",
      "readRecentExerciseRecommendationFact",
      hashNormalizedInput(input),
    );
    factStoreMocks.readExerciseRecommendationFact.mockResolvedValueOnce({
      ok: true,
      fact: createFact(),
    });
    const registry = new ToolRegistry();
    registry.register(readRecentExerciseRecommendationFactTool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "readRecentExerciseRecommendationFact", input },
      { type: "final_answer", content: "我会排除上一轮已展示动作。", usedToolResultIds: [expectedToolResultId] },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-read-fact",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "再推荐一批",
        limits: { maxToolCalls: 2, maxPlannerCalls: 3, maxSteps: 3 },
      },
    });

    expect(factStoreMocks.readExerciseRecommendationFact).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: "fact-1",
      messageId: undefined,
    });
    expect(result).toMatchObject({
      status: "completed",
      toolResults: [
        expect.objectContaining({
          toolResultId: expectedToolResultId,
          ok: true,
          output: expect.objectContaining({
            status: "succeeded",
            fact: expect.objectContaining({
              displayedExerciseIds: ["squat", "lunge"],
            }),
          }),
          fulfillment: expect.objectContaining({
            satisfied: true,
            producedResources: [
              expect.objectContaining({
                resourceType: "exercise_recommendation_fact",
                role: "consumable",
                schemaVersion: "1",
              }),
            ],
          }),
        }),
      ],
    });
  });

  it("returns an unsatisfied structured result for inaccessible facts", async () => {
    factStoreMocks.readExerciseRecommendationFact.mockResolvedValueOnce({
      ok: false,
      code: "not_found",
      message: "No accessible exercise recommendation fact was found.",
    });

    const result = await executeTool({
      tool: readRecentExerciseRecommendationFactTool,
      input: { factRef: "fact-cross-user" },
      run: {
        runId: "run-fact-denied",
        actor: { userId: "user-2", sessionId: "conversation-2" },
        userInput: "再推荐一批",
      },
      timeoutMs: 100,
      toolCallId: "tc_fact_denied",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        code: "not_found",
      },
      fulfillment: {
        satisfied: false,
      },
    });
  });

  it("normalizes fact store exceptions into unsatisfied structured output", async () => {
    factStoreMocks.readExerciseRecommendationFact.mockRejectedValueOnce(new Error("Prisma read failed."));

    const result = await executeTool({
      tool: readRecentExerciseRecommendationFactTool,
      input: { factRef: "fact-store-error" },
      run: {
        runId: "run-fact-store-error",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "换一批",
      },
      timeoutMs: 100,
      toolCallId: "tc_fact_store_error",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        code: "fact_store_read_failed",
      },
      fulfillment: {
        satisfied: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain(AGENT_ERROR_CODES.HANDLER_ERROR);
    expect(result.fulfillment.producedResources).toBeUndefined();
  });

  it("rejects missing fact references before handler execution", async () => {
    const result = await executeTool({
      tool: readRecentExerciseRecommendationFactTool,
      input: {},
      run: {
        runId: "run-fact-invalid",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "再推荐一批",
      },
      timeoutMs: 100,
      toolCallId: "tc_fact_invalid",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT },
    });
    expect(factStoreMocks.readExerciseRecommendationFact).not.toHaveBeenCalled();
  });
});

function createFact() {
  return {
    factRef: "fact-1",
    userId: "user-1",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    kind: "exercise_recommendation_displayed",
    status: "active",
    schemaVersion: 1,
    createdAt: "2026-06-03T14:30:00.000Z",
    displayedCount: 2,
    displayedExerciseIds: ["squat", "lunge"],
    displayedExercises: [
      { id: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { id: "lunge", nameZh: "箭步蹲", nameEn: "Lunge", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
    ],
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
  };
}
