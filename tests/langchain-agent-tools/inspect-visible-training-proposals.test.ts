import { beforeEach, describe, expect, it, vi } from "vitest";

import { agentRuntimeConfig } from "@/lib/server/config";

const factStoreMocks = vi.hoisted(() => ({
  listRecentVisibleTrainingProposalSummaries: vi.fn(),
}));

vi.mock("@/lib/server/visible-training-proposals/visible-training-proposal-fact-store", () => ({
  listRecentVisibleTrainingProposalSummaries: factStoreMocks.listRecentVisibleTrainingProposalSummaries,
}));

describe("inspectVisibleTrainingProposals LangChain tool", () => {
  beforeEach(() => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockReset();
  });

  it("lists recent visible proposal facts through actor-scoped context", async () => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);
    const { executeLangChainToolWrapper, inspectVisibleTrainingProposalsLangChainTool } = await importLangChainTool();

    const result = await executeLangChainToolWrapper(
      inspectVisibleTrainingProposalsLangChainTool,
      { operation: "list_recent" },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
      { toolCallId: "tc_visible_fact_list" },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(factStoreMocks.listRecentVisibleTrainingProposalSummaries).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-1",
      limit: agentRuntimeConfig.tools.inspectVisibleTrainingProposals.recentFactListLimit,
    });
    expect(result.record).toMatchObject({
      toolCallId: "tc_visible_fact_list",
      toolName: "inspectVisibleTrainingProposals",
      status: "succeeded",
      userProjection: {
        status: "succeeded",
        operation: "list_recent",
        factCount: 1,
      },
      traceSummary: {
        status: "succeeded",
        operation: "list_recent",
        factCount: 1,
      },
    });
    expect(modelMessage).toMatchObject({
      status: "succeeded",
      operation: "list_recent",
      factLevel: "visible_training_facts",
      factCount: 1,
      currentRunImport: { imported: true },
      sectionSummary: { warmup: 1, training: 1, stretch: 1 },
      facts: [
        expect.objectContaining({
          index: 1,
          displayLabel: "最近第 1 条已展示训练方案",
          proposalKind: "routine",
          reusableTrainingExerciseCount: 1,
        }),
      ],
    });
    const modelJson = JSON.stringify(modelMessage);
    expect(modelJson).not.toContain("factRef");
    expect(modelJson).not.toContain("messageId");
    expect(modelJson).not.toContain("resourceId");
    expect(modelJson).not.toContain("read_recent");
    expect(modelJson).not.toContain("fulfillment");
    expect(modelJson).not.toContain("supportsOutputKinds");
    expect(modelJson).not.toContain("final_answer_with_visible_outputs");
  });

  it("returns an empty diagnostic when no visible facts exist", async () => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([]);
    const { executeLangChainToolWrapper, inspectVisibleTrainingProposalsLangChainTool } = await importLangChainTool();

    const result = await executeLangChainToolWrapper(
      inspectVisibleTrainingProposalsLangChainTool,
      { operation: "list_recent" },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(modelMessage).toMatchObject({
      status: "succeeded",
      operation: "list_recent",
      factLevel: "visible_training_facts",
      factCount: 0,
      currentRunImport: { imported: false },
    });
    const modelJson = JSON.stringify(modelMessage);
    expect(modelJson).not.toContain("换一批");
    expect(modelJson).not.toContain("fulfillment");
    expect(modelJson).not.toContain("固定");
    expect(modelJson).not.toContain("continue_tool_call");
  });

  it("normalizes fact-store failures into a model-visible failed diagnostic", async () => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockRejectedValueOnce(new Error("Prisma list failed."));
    const { executeLangChainToolWrapper, inspectVisibleTrainingProposalsLangChainTool } = await importLangChainTool();

    const result = await executeLangChainToolWrapper(
      inspectVisibleTrainingProposalsLangChainTool,
      { operation: "list_recent" },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(result.record.status).toBe("succeeded");
    expect(modelMessage).toMatchObject({
      status: "failed",
      operation: "list_recent",
      factLevel: "diagnostic",
      code: "fact_store_list_failed",
    });
    expect(JSON.stringify(modelMessage)).not.toContain("fulfillment");
  });

  it("rejects old read_recent and internal reference inputs before fact-store access", async () => {
    const { executeLangChainToolWrapper, inspectVisibleTrainingProposalsLangChainTool } = await importLangChainTool();
    const invalidInputs = [
      {},
      { operation: "read_recent" },
      { operation: "read_recent", ref: { type: "fact_ref", value: "fact-1" } },
      { operation: "list_recent", factRef: "fact-1" },
      { operation: "list_recent", messageId: "assistant-1" },
      { operation: "list_recent", resourceId: "res_1" },
      { operation: "list_recent", toolResultId: "tr_1" },
    ];

    for (const input of invalidInputs) {
      const result = await executeLangChainToolWrapper(
        inspectVisibleTrainingProposalsLangChainTool,
        input,
        { actor: { userId: "user-1", conversationId: "conversation-1" } },
      );

      expect(result.record).toMatchObject({
        toolName: "inspectVisibleTrainingProposals",
        status: "failed",
        failureCode: "tool_schema_invalid",
      });
    }
    expect(factStoreMocks.listRecentVisibleTrainingProposalSummaries).not.toHaveBeenCalled();
  });
});

async function importLangChainTool() {
  const [{ executeLangChainToolWrapper }, toolModule] = await Promise.all([
    import("@/lib/server/langchain-agent/tool-wrapper"),
    import("@/lib/server/langchain-agent/tools/visible-training-proposal-tools"),
  ]);

  return {
    executeLangChainToolWrapper,
    inspectVisibleTrainingProposalsLangChainTool: toolModule.inspectVisibleTrainingProposalsLangChainTool,
  };
}

function createRecentVisibleTrainingProposalSummary() {
  const payload = createVisibleProposalPayload();

  return {
    factRef: "fact-1",
    messageId: "assistant-1",
    kind: "visible_training_proposal_displayed",
    status: "active",
    schemaVersion: 1,
    createdAt: "2026-06-03T14:30:00.000Z",
    proposalKind: payload.kind,
    exerciseItems: [
      { ...payload.exerciseItems[0], nameZh: "开合跳", nameEn: "Jumping Jack", equipmentZh: "自重", primaryMusclesZh: ["全身"], allowedSections: ["warmup"], imageUrl: null },
      { ...payload.exerciseItems[1], nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { ...payload.exerciseItems[2], nameZh: "站姿股四头肌拉伸", nameEn: "Standing Quad Stretch", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["stretch"], imageUrl: null },
    ],
    schedule: undefined,
  };
}

function createVisibleProposalPayload() {
  return {
    kind: "routine" as const,
    exerciseItems: [
      { exerciseId: "jumping-jack", section: "warmup" as const, order: 1, prescription: createPrescription({ mode: "reps" as const, target: 20 }) },
      { exerciseId: "squat", section: "training" as const, order: 1, prescription: createPrescription({ mode: "reps" as const, target: 12 }) },
      { exerciseId: "standing-quad-stretch", section: "stretch" as const, order: 1, prescription: createPrescription({ mode: "duration" as const, target: 30 }) },
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
