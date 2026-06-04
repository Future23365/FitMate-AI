import { beforeEach, describe, expect, it, vi } from "vitest";

import { createToolResultId, executeTool, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { readRecentVisibleTrainingProposalTool } from "@/lib/server/agent-tools/exercise-facts/read-recent-visible-training-proposal.tool";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";

const factStoreMocks = vi.hoisted(() => ({
  readVisibleTrainingProposalFact: vi.fn(),
}));

vi.mock("@/lib/server/visible-training-proposals/visible-training-proposal-fact-store", () => ({
  readVisibleTrainingProposalFact: factStoreMocks.readVisibleTrainingProposalFact,
  toJsonValue: (value: unknown) => JSON.parse(JSON.stringify(value)),
}));

describe("readRecentVisibleTrainingProposal tool", () => {
  beforeEach(() => {
    factStoreMocks.readVisibleTrainingProposalFact.mockReset();
  });

  it("reads an accessible visible proposal through runtime and registers a consumable current-run resource", async () => {
    const input = { factRef: "fact-1" };
    const expectedToolResultId = createToolResultId(
      "run-read-visible-proposal",
      "readRecentVisibleTrainingProposal",
      hashNormalizedInput(input),
    );
    factStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createFact(),
    });
    const registry = new ToolRegistry();
    registry.register(readRecentVisibleTrainingProposalTool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "readRecentVisibleTrainingProposal", input },
      { type: "final_answer", content: "我会沿用上一轮主训练动作。", usedToolResultIds: [expectedToolResultId] },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-read-visible-proposal",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "基于上一轮动作加一个计划",
        metadata: createRunMetadata(),
        limits: { maxToolCalls: 2, maxPlannerCalls: 3, maxSteps: 3 },
      },
    });

    expect(factStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledWith({
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
              proposalKind: "routine",
              proposal: expect.objectContaining({
                exerciseItems: expect.arrayContaining([
                  expect.objectContaining({ exerciseId: "squat", section: "training" }),
                ]),
              }),
            }),
          }),
          fulfillment: expect.objectContaining({
            satisfied: true,
            producedResources: [
              expect.objectContaining({
                resourceType: "visible_training_proposal_fact",
                role: "consumable",
                schemaVersion: "1",
              }),
            ],
          }),
        }),
      ],
    });

    const readObservation = result.observations.find((observation) => observation.toolName === "readRecentVisibleTrainingProposal");
    const serializedObservation = JSON.stringify(readObservation);

    expect(readObservation).toMatchObject({
      ok: true,
      content: expect.objectContaining({
        factRef: "fact-1",
        messageId: "assistant-1",
        proposalKind: "routine",
        trainingExerciseItems: [
          expect.objectContaining({
            exerciseId: "squat",
            section: "training",
          }),
        ],
        sectionSummary: { warmup: 1, training: 1, stretch: 1 },
        currentRunImport: expect.objectContaining({
          imported: true,
          note: expect.stringContaining("已成功导入当前 run"),
        }),
      }),
    });
    expect(serializedObservation).toContain("final_answer.visibleOutputs[]");
    expect(serializedObservation).not.toContain("displayedExerciseIds");
    expect(serializedObservation).not.toContain("displayedExercises");
    expect(serializedObservation).not.toContain("exercise_recommendation_fact");
  });

  it("returns an unsatisfied structured result for inaccessible visible proposal facts", async () => {
    factStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: false,
      code: "not_found",
      message: "No accessible visible training proposal fact was found.",
    });

    const result = await executeTool({
      tool: readRecentVisibleTrainingProposalTool,
      input: { factRef: "fact-cross-user" },
      run: {
        runId: "run-visible-fact-denied",
        actor: { userId: "user-2", sessionId: "conversation-2" },
        userInput: "继续上一轮",
        metadata: createRunMetadata({ factRef: "fact-cross-user" }),
      },
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_denied",
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

  it("refuses fact references that are absent from current run metadata before reading the store", async () => {
    const result = await executeTool({
      tool: readRecentVisibleTrainingProposalTool,
      input: { factRef: "fact-not-in-run" },
      run: {
        runId: "run-visible-fact-not-in-metadata",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "继续上一轮",
        metadata: createRunMetadata(),
      },
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_not_in_metadata",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        code: "fact_reference_not_in_run_metadata",
      },
      fulfillment: {
        satisfied: false,
      },
    });
    expect(factStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
  });

  it("accepts a messageId reference when it exists in current run metadata", async () => {
    factStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createFact(),
    });

    const result = await executeTool({
      tool: readRecentVisibleTrainingProposalTool,
      input: { messageId: "assistant-1" },
      run: {
        runId: "run-visible-fact-message-id",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "继续上一轮",
        metadata: createRunMetadata(),
      },
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_message_id",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
      },
      fulfillment: {
        satisfied: true,
      },
    });
    expect(factStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-1",
      factRef: undefined,
      messageId: "assistant-1",
    });
  });

  it("normalizes fact store exceptions into unsatisfied structured output", async () => {
    factStoreMocks.readVisibleTrainingProposalFact.mockRejectedValueOnce(new Error("Prisma read failed."));

    const result = await executeTool({
      tool: readRecentVisibleTrainingProposalTool,
      input: { factRef: "fact-store-error" },
      run: {
        runId: "run-visible-fact-store-error",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "换一批",
        metadata: createRunMetadata({ factRef: "fact-store-error" }),
      },
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_store_error",
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
      tool: readRecentVisibleTrainingProposalTool,
      input: {},
      run: {
        runId: "run-visible-fact-invalid",
        actor: { userId: "user-1", sessionId: "conversation-1" },
        userInput: "继续上一轮",
      },
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_invalid",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT },
    });
    expect(factStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
  });
});

function createRunMetadata(input: { factRef?: string; messageId?: string } = {}) {
  return {
    recentVisibleTrainingProposals: [
      {
        factRef: input.factRef ?? "fact-1",
        messageId: input.messageId ?? "assistant-1",
        proposalKind: "routine",
        exerciseItems: [
          { exerciseId: "squat", section: "training", order: 1 },
        ],
      },
    ],
  };
}

function createFact() {
  const payload = createVisibleProposalPayload();

  return {
    factRef: "fact-1",
    userId: "user-1",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    kind: "visible_training_proposal_displayed",
    status: "active",
    schemaVersion: 1,
    createdAt: "2026-06-03T14:30:00.000Z",
    proposalKind: payload.kind,
    exerciseItems: payload.exerciseItems,
    schedule: undefined,
    payload,
    exerciseDetails: [
      { exerciseId: "jumping-jack", nameZh: "开合跳", nameEn: "Jumping Jack", equipmentZh: "自重", primaryMusclesZh: ["全身"], allowedSections: ["warmup"], imageUrl: null },
      { exerciseId: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { exerciseId: "standing-quad-stretch", nameZh: "站姿股四头肌拉伸", nameEn: "Standing Quad Stretch", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["stretch"], imageUrl: null },
    ],
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
