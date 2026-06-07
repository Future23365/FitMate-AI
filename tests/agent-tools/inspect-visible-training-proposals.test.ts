import { beforeEach, describe, expect, it, vi } from "vitest";

import { toTerminalToolResultRefs } from "@/lib/server/agent-core/contracts";
import { createToolResultId, executeTool, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { ResourceStore } from "@/lib/server/agent-core/resource-store";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { inspectVisibleTrainingProposalsTool } from "@/lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { agentRuntimeConfig } from "@/lib/server/config";

const factStoreMocks = vi.hoisted(() => ({
  listRecentVisibleTrainingProposalSummaries: vi.fn(),
  readVisibleTrainingProposalFact: vi.fn(),
}));

vi.mock("@/lib/server/visible-training-proposals/visible-training-proposal-fact-store", () => ({
  listRecentVisibleTrainingProposalSummaries: factStoreMocks.listRecentVisibleTrainingProposalSummaries,
  readVisibleTrainingProposalFact: factStoreMocks.readVisibleTrainingProposalFact,
  toJsonValue: (value: unknown) => JSON.parse(JSON.stringify(value)),
}));

describe("inspectVisibleTrainingProposals tool", () => {
  beforeEach(() => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockReset();
    factStoreMocks.readVisibleTrainingProposalFact.mockReset();
  });

  it("lists recent visible proposals as a satisfied lightweight index without consumable resources", async () => {
    const input = { operation: "list_recent" as const };
    const expectedToolResultId = createToolResultId(
      "run-list-visible-proposals",
      "inspectVisibleTrainingProposals",
      hashNormalizedInput(input),
    );
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);
    const registry = new ToolRegistry();
    registry.register(inspectVisibleTrainingProposalsTool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input },
      { type: "final_answer", content: "当前有一条可引用的训练方案事实。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
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
          toolResultId: expectedToolResultId,
          ok: true,
          output: {
            status: "succeeded",
            operation: "list_recent",
            facts: [
              expect.objectContaining({
                factRef: "fact-1",
                messageId: "assistant-1",
                proposalKind: "routine",
                visibleOutputSchemaVersion: "1",
                factSchemaVersion: 1,
                sectionSummary: { warmup: 1, training: 1, stretch: 1 },
                reusableTrainingExerciseCount: 1,
                reusableTrainingExercises: [
                  expect.objectContaining({ exerciseId: "squat", section: "training" }),
                ],
              }),
            ],
          },
          fulfillment: expect.objectContaining({
            satisfied: true,
            producedResources: [
              expect.objectContaining({
                resourceType: "visible_training_proposal_fact_index",
                role: "diagnostic",
                schemaVersion: "1",
              }),
            ],
          }),
        }),
      ],
    });
    expect(JSON.stringify(result.toolResults[0])).not.toContain("\"proposal\"");
    expect(JSON.stringify(result.toolResults[0])).not.toContain("\"prescription\"");
    expect(JSON.stringify(result.toolResults[0]?.fulfillment.producedResources)).not.toContain("visible_training_proposal_fact\",\"role\":\"consumable");
    expect(factStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
  });

  it("treats an empty list_recent result as a satisfied fact-state query", async () => {
    const input = { operation: "list_recent" as const };
    const expectedToolResultId = createToolResultId(
      "run-list-visible-proposals-empty",
      "inspectVisibleTrainingProposals",
      hashNormalizedInput(input),
    );
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([]);
    const registry = new ToolRegistry();
    registry.register(inspectVisibleTrainingProposalsTool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input },
      { type: "final_answer", content: "当前没有可引用的上一轮训练方案。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: createRun("run-list-visible-proposals-empty"),
    });

    expect(result).toMatchObject({
      status: "completed",
      toolResults: [
        expect.objectContaining({
          ok: true,
          output: { status: "succeeded", operation: "list_recent", facts: [] },
          fulfillment: expect.objectContaining({ satisfied: true }),
        }),
      ],
    });
    const listToolResultForPlanner = planner.calls[1].toolResults.find((toolResult) => (
      toolResult.toolName === "inspectVisibleTrainingProposals" &&
      JSON.stringify(toolResult).includes("\"list_recent\"")
    ));
    const serializedToolResultForPlanner = JSON.stringify(listToolResultForPlanner);

    expect(listToolResultForPlanner).toMatchObject({
      ok: true,
      projection: expect.objectContaining({
        model: expect.objectContaining({
          operation: "list_recent",
          factLevel: "diagnostic_index",
          factCount: 0,
          facts: [],
          refSource: expect.stringContaining("read_recent.ref.value"),
        }),
      }),
    });
    expect(serializedToolResultForPlanner).not.toContain("\"output\"");
    expect(serializedToolResultForPlanner).toContain("\"factLevel\":\"diagnostic_index\"");
    expect(serializedToolResultForPlanner).not.toContain("\"nextActionHints\"");
    expect(serializedToolResultForPlanner).not.toContain("supportsOutputKinds");
    expect(serializedToolResultForPlanner).not.toContain("finalAnswerSupport");
    expect(serializedToolResultForPlanner).not.toContain("开始新的生成");
    expect(serializedToolResultForPlanner).not.toContain("如果用户这样说");
    expect(serializedToolResultForPlanner).not.toContain("答案模板");
    expect(serializedToolResultForPlanner).not.toContain("换一批");
    expect(serializedToolResultForPlanner).not.toContain("再来一组");
    expect(serializedToolResultForPlanner).not.toContain("不要这个");
    expect(serializedToolResultForPlanner).not.toContain("固定调用顺序");
    expect(JSON.stringify(result.toolResults[0]?.fulfillment.producedResources)).not.toContain("visible_training_proposal_fact\",\"role\":\"consumable");
  });

  it("reads a listed visible proposal and registers a consumable current-run resource", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-1" } };
    const expectedReadToolResultId = createToolResultId(
      "run-read-visible-proposal",
      "inspectVisibleTrainingProposals",
      hashNormalizedInput(readInput),
    );
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);
    factStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    const registry = new ToolRegistry();
    registry.register(inspectVisibleTrainingProposalsTool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      { type: "final_answer", content: "我会沿用上一轮主训练动作。", usedRefs: toTerminalToolResultRefs([expectedReadToolResultId]) },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: createRun("run-read-visible-proposal"),
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
        expect.objectContaining({ output: expect.objectContaining({ operation: "list_recent" }) }),
        expect.objectContaining({
          toolResultId: expectedReadToolResultId,
          ok: true,
          output: expect.objectContaining({
            status: "succeeded",
            operation: "read_recent",
            fact: expect.objectContaining({
              factRef: "fact-1",
              proposalKind: "routine",
              visibleOutputSchemaVersion: "1",
              factSchemaVersion: 1,
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

    const readToolResultForPlanner = planner.calls[2].toolResults.find((toolResult) => (
      toolResult.toolName === "inspectVisibleTrainingProposals" &&
      JSON.stringify(toolResult).includes("\"read_recent\"")
    ));
    const serializedToolResultForPlanner = JSON.stringify(readToolResultForPlanner);

    expect(readToolResultForPlanner).toMatchObject({
      ok: true,
      projection: expect.objectContaining({
        model: expect.objectContaining({
          operation: "read_recent",
          factLevel: "consumable",
          currentRunImport: expect.objectContaining({
            imported: true,
            role: "consumable",
            note: expect.stringContaining("正向消费的训练事实来源"),
          }),
          availableSections: ["warmup", "training", "stretch"],
          missingSections: [],
          hasSchedule: false,
          reusableExerciseItems: [
            expect.objectContaining({ exerciseId: "jumping-jack", section: "warmup" }),
            expect.objectContaining({ exerciseId: "squat", section: "training" }),
            expect.objectContaining({ exerciseId: "standing-quad-stretch", section: "stretch" }),
          ],
          trainingExerciseItems: [
            expect.objectContaining({
              exerciseId: "squat",
              section: "training",
            }),
          ],
          sectionSummary: { warmup: 1, training: 1, stretch: 1 },
        }),
      }),
    });
    expect(serializedToolResultForPlanner).not.toContain("\"output\"");
    expect(serializedToolResultForPlanner).toContain("visibleOutputSchemaVersion");
    expect(serializedToolResultForPlanner).toContain("factSchemaVersion");
    expect(serializedToolResultForPlanner).toContain("\"factLevel\":\"consumable\"");
    expect(serializedToolResultForPlanner).toContain("正向消费的训练事实来源");
    expect(serializedToolResultForPlanner).toContain("不得把已导入动作默认排除");
    expect(serializedToolResultForPlanner).not.toContain("\"nextActionHints\"");
    expect(serializedToolResultForPlanner).not.toContain("supportsOutputKinds");
    expect(serializedToolResultForPlanner).toContain("final_answer.visibleOutputs[]");
    expect(serializedToolResultForPlanner).not.toContain("displayedExerciseIds");
    expect(serializedToolResultForPlanner).not.toContain("displayedExercises");
    expect(serializedToolResultForPlanner).not.toContain("exercise_recommendation_fact");
  });

  it("projects training-only read_recent facts as partial coverage without routine support", async () => {
    factStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createTrainingOnlyVisibleTrainingProposalFact(),
    });

    const result = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "read_recent", ref: { type: "fact_ref", value: "fact-training-only" } },
      run: createRun("run-visible-training-only"),
      resourceStore: createVisibleProposalIndexResourceStore("run-visible-training-only", [
        createTrainingOnlyVisibleTrainingProposalFact(),
      ]),
      timeoutMs: 100,
      toolCallId: "tc_visible_training_only",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
        operation: "read_recent",
      },
      projection: {
        model: expect.objectContaining({
          availableSections: ["training"],
          missingSections: ["warmup", "stretch"],
          hasSchedule: false,
          resourceConsumption: expect.objectContaining({
            availableSections: ["training"],
            missingSections: ["warmup", "stretch"],
            hasSchedule: false,
          }),
        }),
      },
    });

    const observationJson = JSON.stringify(result.ok ? result.projection.model : {});
    expect(observationJson).toContain("\"factLevel\":\"consumable\"");
    expect(observationJson).not.toContain("\"nextActionHints\"");
    expect(observationJson).not.toContain("continue_tool_call");
    expect(observationJson).not.toContain("supportsOutputKinds");
    expect(observationJson).not.toContain("\"routine\",\"plan\"");
    expect(observationJson).not.toContain("本 observation 不规定固定 tool 调用顺序");
    expect(observationJson).not.toContain("必须调用 searchExerciseResources");
  });

  it("refuses read_recent references that are absent from current run visible indexes before reading the store", async () => {
    const result = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "read_recent", ref: { type: "fact_ref", value: "fact-not-in-run" } },
      run: createRun("run-visible-fact-not-in-index"),
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_not_in_index",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        operation: "read_recent",
        code: "fact_reference_not_visible_in_run",
      },
      fulfillment: {
        satisfied: false,
      },
    });
    expect(factStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
  });

  it("refuses metadata-only read_recent references before reading the store", async () => {
    const result = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "read_recent", ref: { type: "fact_ref", value: "fact-1" } },
      run: {
        ...createRun("run-visible-fact-metadata-only"),
        metadata: createRunMetadata(),
      },
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_metadata_only",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        operation: "read_recent",
        code: "fact_reference_not_visible_in_run",
      },
      fulfillment: {
        satisfied: false,
      },
    });
    expect(factStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
  });

  it("accepts a messageId reference when it exists in the current run diagnostic index resource", async () => {
    factStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });

    const result = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "read_recent", ref: { type: "message_id", value: "assistant-1" } },
      run: createRun("run-visible-fact-message-id"),
      resourceStore: createVisibleProposalIndexResourceStore("run-visible-fact-message-id"),
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_message_id",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
        operation: "read_recent",
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

  it.each([
    ["cross user", "not_found"],
    ["cross conversation", "not_found"],
    ["unsupported schema version", "schema_version_unsupported"],
    ["invalid payload", "payload_invalid"],
  ])("normalizes read_recent %s failures into unsatisfied structured output", async (_label, code) => {
    factStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: false,
      code,
      message: `failure: ${code}`,
    });

    const result = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "read_recent", ref: { type: "fact_ref", value: "fact-1" } },
      run: createRun(`run-${code}`),
      resourceStore: createVisibleProposalIndexResourceStore(`run-${code}`),
      timeoutMs: 100,
      toolCallId: `tc_${code}`,
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        operation: "read_recent",
        code,
      },
      fulfillment: {
        satisfied: false,
      },
    });
  });

  it("normalizes fact store exceptions into structured output for list_recent and read_recent", async () => {
    factStoreMocks.listRecentVisibleTrainingProposalSummaries.mockRejectedValueOnce(new Error("Prisma list failed."));
    factStoreMocks.readVisibleTrainingProposalFact.mockRejectedValueOnce(new Error("Prisma read failed."));

    const listResult = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "list_recent" },
      run: createRun("run-visible-fact-list-error"),
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_list_error",
    });
    const readResult = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "read_recent", ref: { type: "fact_ref", value: "fact-1" } },
      run: createRun("run-visible-fact-read-error"),
      resourceStore: createVisibleProposalIndexResourceStore("run-visible-fact-read-error"),
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_read_error",
    });

    expect(listResult).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        operation: "list_recent",
        code: "fact_store_list_failed",
      },
      fulfillment: { satisfied: false },
    });
    expect(readResult).toMatchObject({
      ok: true,
      output: {
        status: "failed",
        operation: "read_recent",
        code: "fact_store_read_failed",
      },
      fulfillment: { satisfied: false },
    });
    expect(JSON.stringify([listResult, readResult])).not.toContain(AGENT_ERROR_CODES.HANDLER_ERROR);
  });

  it("rejects missing operation or missing read references before handler execution", async () => {
    const missingOperation = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: {},
      run: createRun("run-visible-fact-invalid-operation"),
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_invalid_operation",
    });
    const missingReadReference = await executeTool({
      tool: inspectVisibleTrainingProposalsTool,
      input: { operation: "read_recent" },
      run: createRun("run-visible-fact-invalid-read"),
      timeoutMs: 100,
      toolCallId: "tc_visible_fact_invalid_read",
    });

    expect(missingOperation).toMatchObject({
      ok: false,
      error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT },
    });
    expect(missingReadReference).toMatchObject({
      ok: false,
      error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT },
    });
    expect(factStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
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

function createRunMetadata(input: { factRef?: string; messageId?: string } = {}) {
  return {
    recentVisibleTrainingProposals: [
      {
        factRef: input.factRef ?? "fact-1",
        messageId: input.messageId ?? "assistant-1",
        proposalKind: "routine",
      },
    ],
  };
}

function createVisibleProposalIndexResourceStore(
  runId: string,
  facts: Array<{ factRef: string; messageId: string }> = [createRecentVisibleTrainingProposalSummary()],
) {
  const store = new ResourceStore(runId);
  store.register({
    resourceType: "visible_training_proposal_fact_index",
    role: "diagnostic",
    schemaVersion: "1",
    sourceToolResultId: "tr_visible_training_proposal_fact_index",
    summary: {
      operation: "list_recent",
      facts: facts.map((fact) => ({
        factRef: fact.factRef,
        messageId: fact.messageId,
      })),
    },
  });

  return store;
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

function createReadableVisibleTrainingProposalFact() {
  const payload = createVisibleProposalPayload();

  return {
    ...createRecentVisibleTrainingProposalSummary(),
    userId: "user-1",
    conversationId: "conversation-1",
    payload,
    exerciseDetails: [
      { exerciseId: "jumping-jack", nameZh: "开合跳", nameEn: "Jumping Jack", equipmentZh: "自重", primaryMusclesZh: ["全身"], allowedSections: ["warmup"], imageUrl: null },
      { exerciseId: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { exerciseId: "standing-quad-stretch", nameZh: "站姿股四头肌拉伸", nameEn: "Standing Quad Stretch", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["stretch"], imageUrl: null },
    ],
  };
}

function createTrainingOnlyVisibleTrainingProposalFact() {
  return {
    ...createRecentVisibleTrainingProposalSummary(),
    factRef: "fact-training-only",
    proposalKind: "exercise_selection" as const,
    userId: "user-1",
    conversationId: "conversation-1",
    payload: {
      kind: "exercise_selection" as const,
      exerciseItems: [
        { exerciseId: "squat", section: "training" as const, order: 1 },
      ],
    },
    exerciseItems: [
      { exerciseId: "squat", section: "training" as const, order: 1, nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training" as const], imageUrl: null },
    ],
    exerciseDetails: [
      { exerciseId: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training" as const], imageUrl: null },
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
