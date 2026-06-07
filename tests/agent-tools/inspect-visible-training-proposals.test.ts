import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeTool } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { ResourceStore } from "@/lib/server/agent-core/resource-store";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { inspectVisibleTrainingProposalsTool } from "@/lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { agentRuntimeConfig } from "@/lib/server/config";
import { visibleTrainingProposalFactResourceType } from "@/lib/server/visible-training-proposals/visible-training-proposal-contract";

const factStoreMocks = vi.hoisted(() => ({
  listRecentVisibleTrainingProposalSummaries: vi.fn(),
}));

vi.mock("@/lib/server/visible-training-proposals/visible-training-proposal-fact-store", () => ({
  listRecentVisibleTrainingProposalSummaries: factStoreMocks.listRecentVisibleTrainingProposalSummaries,
  toJsonValue: (value: unknown) => JSON.parse(JSON.stringify(value)),
}));

describe("inspectVisibleTrainingProposals tool", () => {
  beforeEach(() => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockReset();
  });

  it("list_recent returns compressed consumable business facts and registers an internal resource", async () => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);

    const registry = new ToolRegistry();
    registry.register(inspectVisibleTrainingProposalsTool);
    const resourceStore = new ResourceStore("run-list-visible-proposals");
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: { operation: "list_recent" } },
      { type: "final_answer", content: "我已读取上一套训练方案事实。" },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      resourceStore,
      run: createRun("run-list-visible-proposals"),
    });

    expect(factStoreMocks.listRecentVisibleTrainingProposalSummaries).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-1",
      limit: agentRuntimeConfig.tools.inspectVisibleTrainingProposals.recentFactListLimit,
    });
    expect(result).toMatchObject({
      status: "completed",
      toolResults: [
        expect.objectContaining({
          ok: true,
          output: {
            status: "succeeded",
            operation: "list_recent",
            facts: [
              expect.objectContaining({
                index: 1,
                displayLabel: "最近第 1 条已展示训练方案",
                proposalKind: "routine",
                visibleOutputSchemaVersion: "1",
                factSchemaVersion: 1,
                sectionSummary: { warmup: 1, training: 1, stretch: 1 },
                exerciseItems: expect.arrayContaining([
                  expect.objectContaining({
                    exerciseId: "squat",
                    section: "training",
                    prescription: expect.objectContaining({ mode: "reps", target: 12 }),
                    allowedSections: ["training"],
                  }),
                ]),
              }),
            ],
          },
          fulfillment: expect.objectContaining({
            satisfied: true,
            producedResources: [
              expect.objectContaining({
                resourceType: visibleTrainingProposalFactResourceType,
                role: "consumable",
                schemaVersion: "1",
              }),
            ],
          }),
        }),
      ],
    });

    const registered = resourceStore.list({
      resourceType: visibleTrainingProposalFactResourceType,
      role: "consumable",
    });
    expect(registered).toHaveLength(1);
    expect(registered[0].summary).toMatchObject({
      operation: "list_recent",
      factCount: 1,
      facts: [
        expect.objectContaining({
          index: 1,
          proposalKind: "routine",
        }),
      ],
    });

    const plannerVisibleToolResult = planner.calls[1].toolResults[0];
    const plannerVisibleJson = JSON.stringify(plannerVisibleToolResult);
    expect(plannerVisibleToolResult).toMatchObject({
      toolName: "inspectVisibleTrainingProposals",
      ok: true,
      projection: {
        model: expect.objectContaining({
          operation: "list_recent",
          factLevel: "consumable",
          factCount: 1,
          currentRunImport: expect.objectContaining({ imported: true }),
          outputBoundary: expect.stringContaining("final_answer.visibleOutputs[]"),
        }),
      },
    });
    expect(plannerVisibleJson).not.toContain("factRef");
    expect(plannerVisibleJson).not.toContain("messageId");
    expect(plannerVisibleJson).not.toContain("resourceId");
    expect(plannerVisibleJson).not.toContain("toolResultId");
    expect(plannerVisibleJson).not.toContain("read_recent");
  });

  it("list_recent empty result is satisfied but does not register a consumable resource", async () => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([]);

    const registry = new ToolRegistry();
    registry.register(inspectVisibleTrainingProposalsTool);
    const resourceStore = new ResourceStore("run-list-visible-proposals-empty");
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: { operation: "list_recent" } },
      { type: "final_answer", content: "当前没有可读取的上一套训练方案。" },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      resourceStore,
      run: createRun("run-list-visible-proposals-empty"),
    });

    expect(result).toMatchObject({
      status: "completed",
      toolResults: [
        expect.objectContaining({
          ok: true,
          output: { status: "succeeded", operation: "list_recent", facts: [] },
          fulfillment: expect.objectContaining({
            satisfied: true,
            producedResources: [],
          }),
        }),
      ],
    });
    expect(resourceStore.list({
      resourceType: visibleTrainingProposalFactResourceType,
      role: "consumable",
    })).toHaveLength(0);

    const plannerVisibleJson = JSON.stringify(planner.calls[1].toolResults[0]);
    expect(plannerVisibleJson).toContain("\"factLevel\":\"diagnostic\"");
    expect(plannerVisibleJson).toContain("\"imported\":false");
    expect(plannerVisibleJson).not.toContain("read_recent");
    expect(plannerVisibleJson).not.toContain("factRef");
    expect(plannerVisibleJson).not.toContain("messageId");
    expect(plannerVisibleJson).not.toContain("如果用户这样说");
    expect(plannerVisibleJson).not.toContain("换一批");
  });

  it("normalizes list_recent store exceptions into structured unsatisfied output", async () => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockRejectedValueOnce(new Error("Prisma list failed."));

    const result = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "list_recent" },
      run: createRun("run-visible-fact-list-error"),
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_list_error",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        operation: "list_recent",
        code: "fact_store_list_failed",
      },
      fulfillment: { satisfied: false },
    });
    expect(JSON.stringify(result)).not.toContain(AGENT_ERROR_CODES.HANDLER_ERROR);
  });

  it("rejects old read_recent and internal reference inputs before handler execution", async () => {
    const invalidInputs = [
      {},
      { operation: "read_recent" },
      { operation: "read_recent", ref: { type: "fact_ref", value: "fact-1" } },
      { operation: "list_recent", factRef: "fact-1" },
      { operation: "list_recent", messageId: "assistant-1" },
      { operation: "list_recent", resourceId: "res_1" },
      { operation: "list_recent", toolResultId: "tr_1" },
    ];

    for (const [index, input] of invalidInputs.entries()) {
      const result = await executeTool({
        tool: inspectVisibleTrainingProposalsTool,
        input,
        run: createRun(`run-visible-fact-invalid-${index}`),
        timeoutMs: 100,
        toolCallId: `tc_visible_fact_invalid_${index}`,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT },
      });
    }
    expect(factStoreMocks.listRecentVisibleTrainingProposalSummaries).not.toHaveBeenCalled();
  });

  it("model-visible manifest and examples only expose list_recent without copyable refs", () => {
    const registry = new ToolRegistry();
    registry.register(inspectVisibleTrainingProposalsTool);
    const manifest = registry.serializeForPlanner()[0];
    const manifestJson = JSON.stringify(manifest);

    expect(manifestJson).toContain("operation");
    expect(manifestJson).toContain("list_recent");
    expect(manifestJson).not.toContain("read_recent");
    expect(manifestJson).not.toContain("factRef");
    expect(manifestJson).not.toContain("messageId");
    expect(manifestJson).not.toContain("resourceId");
    expect(manifestJson).not.toContain("toolResultId");
    expect(manifestJson).not.toContain("usedRefs");
    expect(manifest.examples).toEqual([
      {
        description: expect.stringContaining("查询并导入"),
        action: {
          type: "tool_call",
          toolName: "inspectVisibleTrainingProposals",
          input: { operation: "list_recent" },
        },
      },
    ]);
  });
});

function createRun(runId = "run-visible-proposals") {
  return {
    runId,
    actor: { userId: "user-1", sessionId: "conversation-1" },
    userInput: "resource",
    limits: { maxToolCalls: 3, maxPlannerCalls: 4, maxSteps: 4 },
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
