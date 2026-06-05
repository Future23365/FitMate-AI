import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chatRequestSchema,
  prepareChatRequest,
} from "@/lib/server/chat/chat-service";
import {
  createAgentTextChatResponse,
  createProductionAgentTextChatPlanner,
} from "@/lib/server/chat/agent-text-chat-service";
import { createProductionToolRegistry } from "@/lib/server/agent-tools";
import { createToolResultId, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import { toTerminalToolResultRefs, type JsonValue } from "@/lib/server/agent-core/contracts";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { LlmPlanner } from "@/lib/server/agent-planners/llm-planner";
import {
  createInvalidModelActionCandidate,
  type ModelActionCompletionInput,
  type ModelActionCompletionParseStatus,
  type ModelActionCompletionResult,
  type ModelAdapter,
  type ModelTokenUsage,
} from "@/lib/server/agent-planners/model-adapters/model-adapter";
import { clearAiTraces, listAiTracesForUser } from "@/lib/server/dev/ai-trace-store";
import { agentRuntimeConfig } from "@/lib/server/config";
import type { ExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";
import { createChatConversation } from "./fixtures/domain";

const exerciseResourceRepositoryMocks = vi.hoisted(() => ({
  getExerciseResourceSummariesByIds: vi.fn(),
  getExerciseRecordsByIds: vi.fn(),
  isBodyweightExerciseResourceEquipment: (input: { equipment?: string | null; equipmentZh?: string | null }) => (
    input.equipment === "body only" || input.equipment === "bodyweight" || input.equipmentZh === "自重"
  ),
  isNoEquipmentResourceQueryValue: (value: string) => (
    value.trim().toLowerCase() === "no_equipment" || value.trim() === "无器械"
  ),
  isRemovedNoEquipmentHomeRequirementValue: (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized === "none" || normalized === "no_equipment" || value.trim() === "无器械";
  },
  normalizeExerciseResourceFacetCatalogForPlanner: (catalog: ExerciseResourceFacetCatalog) => ({
    ...catalog,
    equipment: [...new Set([...catalog.equipment, "no_equipment", "无器械"])],
    homeRequirements: catalog.homeRequirements.filter((value) => {
      const normalized = value.trim().toLowerCase();
      return normalized !== "none" && normalized !== "no_equipment" && value.trim() !== "无器械";
    }),
  }),
  resolveExerciseResourceMentionSummaries: vi.fn(),
  readExerciseResourceFacetCatalog: vi.fn(),
  searchExerciseResourceSummaries: vi.fn(),
}));
const visibleTrainingProposalFactStoreMocks = vi.hoisted(() => ({
  listRecentVisibleTrainingProposalSummaries: vi.fn(),
  persistVisibleTrainingProposalFactsFromEvents: vi.fn(),
  readVisibleTrainingProposalFact: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-repository", () => exerciseResourceRepositoryMocks);
vi.mock("@/lib/server/visible-training-proposals/visible-training-proposal-fact-store", () => ({
  listRecentVisibleTrainingProposalSummaries: visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries,
  persistVisibleTrainingProposalFactsFromEvents: visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents,
  readVisibleTrainingProposalFact: visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact,
  toVisibleTrainingProposalMetadataSummary: (summary: any) => {
    const exerciseItems = Array.isArray(summary.exerciseItems) ? summary.exerciseItems : [];

    return {
      kind: summary.kind,
      status: summary.status,
      schemaVersion: summary.schemaVersion,
      createdAt: summary.createdAt,
      proposalKind: summary.proposalKind,
      visibleOutputSchemaVersion: "1",
      factSchemaVersion: summary.schemaVersion,
      sectionSummary: {
        warmup: exerciseItems.filter((item: any) => item.section === "warmup").length,
        training: exerciseItems.filter((item: any) => item.section === "training").length,
        stretch: exerciseItems.filter((item: any) => item.section === "stretch").length,
      },
      reusableTrainingExerciseCount: exerciseItems.filter((item: any) => item.section === "training").length,
    };
  },
  toJsonValue: (value: unknown) => JSON.parse(JSON.stringify(value)),
}));

const productionToolNames = [
  "inspectVisibleTrainingProposals",
  "resolveExerciseResourceMentions",
  "searchExerciseResources",
];

async function readNdjsonEvents(
  response: Response,
  options: { includeProgress?: boolean } = {},
) {
  const text = await response.text();
  const events = text.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);

  return options.includeProgress
    ? events
    : events.filter((event) => !isTransientAgentActivityEvent(event));
}

function isTransientAgentActivityEvent(event: Record<string, unknown>) {
  return event.type === "agent_progress" || event.type === "agent_loop";
}

function findPlannerToolResult(
  input: Pick<ModelActionCompletionInput, "toolResults">,
  toolName: string,
  contentNeedle?: string,
) {
  return input.toolResults.find((toolResult) => (
    toolResult.toolName === toolName &&
    (contentNeedle ? JSON.stringify(toolResult).includes(contentNeedle) : true)
  ));
}

function stringifyPlannerToolResult(
  input: Pick<ModelActionCompletionInput, "toolResults">,
  toolName: string,
  contentNeedle?: string,
) {
  return JSON.stringify(findPlannerToolResult(input, toolName, contentNeedle));
}

type TraceAdapterCandidate = {
  actionCandidate: unknown;
  parsedAction?: unknown;
  parseStatus?: ModelActionCompletionParseStatus;
  failureCode?: string;
  tokenUsage?: ModelTokenUsage;
};

class TraceModelAdapter implements ModelAdapter {
  readonly name = "trace-model-adapter";
  readonly calls: ModelActionCompletionInput[] = [];
  private cursor = 0;

  constructor(private readonly candidates: TraceAdapterCandidate[]) {}

  async completeAction(input: ModelActionCompletionInput): Promise<ModelActionCompletionResult> {
    this.calls.push(input);
    const candidate = this.candidates[this.cursor];
    this.cursor += 1;
    const successfulLightweightObservationCount = input.observations.filter((observation) => (
      isRecord(observation.content) &&
      observation.content.observationRole === "ok_tool_result_index"
    )).length;
    const toolResultProjectionPresence = input.toolResults.map((toolResult) => ({
      toolResultId: toolResult.toolResultId,
      toolName: toolResult.toolName,
      satisfied: toolResult.fulfillment.satisfied,
      factChannel: toolResult.ok ? (toolResult.fulfillment.satisfied ? "fact" as const : "diagnostic" as const) : "failed" as const,
      hasModelProjection: toolResult.ok && toolResult.projection.model !== undefined,
    }));

    if (!candidate) {
      throw new Error("TraceModelAdapter exhausted.");
    }

    const parseStatus = candidate.parseStatus ?? "parsed";
    const tokenUsage = candidate.tokenUsage ?? {
      prompt_tokens: 7,
      completion_tokens: 3,
      total_tokens: 10,
    };
    const actionSource = candidate.parsedAction ?? candidate.actionCandidate;

    return {
      actionCandidate: candidate.actionCandidate,
      model: "trace-test-model",
      usage: tokenUsage,
      trace: {
        provider: "test",
        adapterName: this.name,
        request: {
          model: "trace-test-model",
          response_format: { type: "json_object" },
          messageCount: 1,
          messages: [
            {
              role: "user",
              content: input.run.userInput,
              contentLength: input.run.userInput.length,
            },
          ],
          run: {
            runId: input.run.runId,
            step: input.step,
            latestUserMessage: input.run.userInput,
            messageCount: input.run.messages?.length ?? 0,
            observationCount: input.observations.length,
            toolResultCount: input.toolResults.length,
            successfulLightweightObservationCount,
            repairDiagnosticObservationCount: Math.max(0, input.observations.length - successfulLightweightObservationCount),
            toolResultProjectionCount: toolResultProjectionPresence.filter((entry) => entry.hasModelProjection).length,
            toolResultProjectionPresence,
            toolCount: input.manifests.length,
            toolNames: input.manifests.map((manifest) => manifest.name),
            limits: input.run.limits ?? {},
          },
        },
        response: {
          model: "trace-test-model",
          status: parseStatus,
          rawText: JSON.stringify(candidate.parsedAction ?? candidate.actionCandidate),
          rawTextLength: JSON.stringify(candidate.parsedAction ?? candidate.actionCandidate).length,
        },
        parsedAction: toJsonValue(candidate.parsedAction ?? candidate.actionCandidate),
        actionType: readActionType(actionSource),
        toolName: readToolName(actionSource),
        parseStatus,
        failureCode: candidate.failureCode,
        tokenUsage,
      },
    };
  }
}

describe("chat service agent text flow boundary", () => {
  beforeEach(() => {
    clearAiTraces();
    exerciseResourceRepositoryMocks.getExerciseRecordsByIds.mockReset();
    exerciseResourceRepositoryMocks.getExerciseRecordsByIds.mockImplementation(async (ids: string[]) => (
      ids.map((id) => createExerciseRecordForValidation(id)).filter(Boolean)
    ));
    exerciseResourceRepositoryMocks.getExerciseResourceSummariesByIds.mockReset();
    exerciseResourceRepositoryMocks.getExerciseResourceSummariesByIds.mockResolvedValue([]);
    exerciseResourceRepositoryMocks.resolveExerciseResourceMentionSummaries.mockReset();
    exerciseResourceRepositoryMocks.readExerciseResourceFacetCatalog.mockReset();
    exerciseResourceRepositoryMocks.readExerciseResourceFacetCatalog.mockResolvedValue(createExerciseResourceFacetCatalog());
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockReset();
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValue(createExerciseResourceSearchResult());
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockReset();
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValue([]);
    visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents.mockReset();
    visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents.mockResolvedValue({ ok: true, savedCount: 0, skippedReason: "no_visible_training_proposal" });
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockReset();
  });

  it("accepts current chat request shape and ignores removed legacy event toggles", () => {
    const parsed = chatRequestSchema.parse({
      latestUserMessage: "给我一个 30 分钟居家训练",
      conversationSummary: "",
      emitLegacyEvents: true,
    });

    expect(parsed).toEqual({
      latestUserMessage: "给我一个 30 分钟居家训练",
      conversationSummary: "",
    });
    expect("emitLegacyEvents" in parsed).toBe(false);
  });

  it("keeps production tool activity stages on tool definitions and out of planner manifests", () => {
    const registry = createProductionToolRegistry({
      searchExerciseResourcesFacetCatalog: createExerciseResourceFacetCatalog(),
    });
    const expectedActivityStages = new Map([
      ["inspectVisibleTrainingProposals", "reading_artifacts"],
      ["resolveExerciseResourceMentions", "querying_exercises"],
      ["searchExerciseResources", "querying_exercises"],
    ]);

    for (const [toolName, stage] of expectedActivityStages) {
      expect(registry.get(toolName)?.uiActivityStage).toBe(stage);
    }

    const manifests = registry.serializeForPlanner();
    const manifestJson = JSON.stringify(manifests);
    const searchManifest = manifests.find((manifest) => manifest.name === "searchExerciseResources");

    expect(manifests.map((manifest) => manifest.name)).toEqual(productionToolNames);
    expect(searchManifest?.metadata).toMatchObject({
      facetCatalog: expect.objectContaining({
        suitabilities: ["warmup", "training", "stretch"],
      }),
    });
    expect(manifestJson).not.toContain("uiActivityStage");
    expect(manifestJson).not.toContain("querying_exercises");
    expect(manifestJson).not.toContain("reading_artifacts");
  });

  it("hydrates saved server messages without constructing Agent execution facts", () => {
    const savedConversation = createChatConversation({
      messages: [
        { id: "m1", role: "user", content: "我想练胸", createdAt: "2026-06-01T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已生成训练", createdAt: "2026-06-01T00:01:00.000Z" },
      ],
      conversationSummary: { summary: "用户想练胸。" },
    });
    const prepared = prepareChatRequest(
      {
        conversationId: savedConversation.id,
        latestUserMessage: "换成徒手",
        conversationSummary: "客户端摘要不可信。",
      },
      { savedConversation },
    );

    expect(prepared.rawMessages.map((message) => message.content)).toEqual([
      "我想练胸",
      "已生成训练",
      "换成徒手",
    ]);
    expect(prepared.conversationSummaryContext.summary).toBe("用户想练胸。");
    expect(prepared.hydration.source).toBe("server_saved");
    expect(prepared).not.toHaveProperty("contextPackage");
    expect(prepared).not.toHaveProperty("agentExecutionResult");
  });

  it.each(["不要", "换一批"])("appends same-text user turn after an assistant reply for %s", (latestUserMessage) => {
    const savedConversation = createChatConversation({
      messages: [
        { id: "m1", role: "user", content: latestUserMessage, createdAt: "2026-06-01T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "好的，我已经处理了上一轮请求。", createdAt: "2026-06-01T00:01:00.000Z" },
      ],
    });

    const prepared = prepareChatRequest(
      {
        conversationId: savedConversation.id,
        latestUserMessage,
        conversationSummary: "",
      },
      { savedConversation },
    );

    expect(prepared.rawMessages).toEqual([
      { role: "user", content: latestUserMessage },
      { role: "assistant", content: "好的，我已经处理了上一轮请求。" },
      { role: "user", content: latestUserMessage },
    ]);
  });

  it("does not duplicate latest user message when saved conversation already ends with the same user turn", () => {
    const savedConversation = createChatConversation({
      messages: [
        { id: "m1", role: "user", content: "不要", createdAt: "2026-06-01T00:00:00.000Z" },
      ],
    });

    const prepared = prepareChatRequest(
      {
        conversationId: savedConversation.id,
        latestUserMessage: "不要",
        conversationSummary: "",
      },
      { savedConversation },
    );

    expect(prepared.rawMessages).toEqual([
      { role: "user", content: "不要" },
    ]);
  });

  it("projects final_answer into content and done NDJSON with the controlled production registry", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "今天练胸",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "final_answer", content: "可以，今天先做轻量胸部训练。" },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const rawEvents = await readNdjsonEvents(response, { includeProgress: true });
    const events = rawEvents.filter((event) => !isTransientAgentActivityEvent(event));
    const firstProgressIndex = rawEvents.findIndex((event) => event.type === "agent_progress");
    const firstLoopIndex = rawEvents.findIndex((event) => event.type === "agent_loop");
    const firstContentIndex = rawEvents.findIndex((event) => event.type === "content");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(rawEvents[firstProgressIndex]).toMatchObject({
      type: "agent_progress",
      stage: "preparing_context",
      status: "active",
      sequence: 1,
    });
    expect(firstProgressIndex).toBeGreaterThanOrEqual(0);
    expect(rawEvents[firstLoopIndex]).toEqual({
      type: "agent_loop",
      loopTurn: 1,
      sequence: expect.any(Number),
    });
    expect(firstLoopIndex).toBeGreaterThan(firstProgressIndex);
    expect(firstContentIndex).toBeGreaterThan(firstLoopIndex);
    expect(JSON.stringify(rawEvents)).not.toContain("agent_activity");
    expect(JSON.stringify(rawEvents)).not.toContain("assistant_action");
    expect(JSON.stringify(rawEvents)).not.toContain("agent_" + "execution_result");
    expect(JSON.stringify(rawEvents)).not.toContain("intent_resolved");
    expect(events).toEqual([
      { type: "content", content: "可以，今天先做轻量胸部训练。" },
      { type: "done" },
    ]);
    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(productionToolNames);
    const plannerSearchManifest = planner.calls[0].manifests.find((manifest) => manifest.name === "searchExerciseResources");
    const plannerSearchFacetCatalog = plannerSearchManifest?.metadata?.facetCatalog as ExerciseResourceFacetCatalog | undefined;
    expect(plannerSearchManifest).toMatchObject({
      metadata: {
        facetCatalog: expect.objectContaining({
          muscles: expect.arrayContaining(["胸部", "股四头肌"]),
          equipment: expect.arrayContaining(["body only", "自重", "no_equipment", "无器械"]),
          suitabilities: ["warmup", "training", "stretch"],
        }),
      },
    });
    expect(plannerSearchFacetCatalog?.homeRequirements).not.toContain("none");
    expect(plannerSearchFacetCatalog?.homeRequirements).not.toContain("无器械");
    const serializedSearchManifest = JSON.stringify(plannerSearchManifest);
    expect(serializedSearchManifest).toContain("missingSectionsForRoutineOrPlan 非空");
    expect(serializedSearchManifest).toContain("suitabilities = [\\\"warmup\\\", \\\"stretch\\\"]");
    expect(serializedSearchManifest).toContain("候选足够后应继续组合完整 routine / plan");
    expect(serializedSearchManifest).toContain("正文动作列表或用户自行组合建议");
    expect(serializedSearchManifest).toContain("普通动作推荐、动作清单或动作事实问答不要求固定查询 warmup / training / stretch");
    expect(serializedSearchManifest).toContain("不把具体用户短句映射成固定 payload.kind");
    expect(serializedSearchManifest).toContain("真实 facet、器械、场地或难度约束");
    expect(serializedSearchManifest).toContain("\"level\":\"beginner\"");
    expect(serializedSearchManifest).toContain("final_answer.visibleOutputs[].payload.kind = \\\"routine\\\" 或 \\\"plan\\\"");
    expect(serializedSearchManifest).toContain("不要在 content 中解释缺口后仍提交缺 section 的结构");
    expect(serializedSearchManifest).not.toContain("generatePlanDraft");
    expect(serializedSearchManifest).not.toContain("generateRoutineDraft");
    expect(JSON.stringify(planner.calls[0].manifests)).not.toContain("uiActivityStage");
    expect(planner.calls[0].run).toMatchObject({
      actor: { userId: "user-1" },
      userInput: "今天练胸",
      metadata: {
        hydration: expect.objectContaining({ source: "latest_message" }),
      },
      limits: agentRuntimeConfig.runtime,
    });
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      route: "/api/chat",
      status: "success",
      userId: "user-1",
      finalDecision: {
        status: "success",
        reason: "completed",
        responseType: "final_answer",
      },
      input: expect.objectContaining({
        latestUserMessage: "今天练胸",
        registry: {
          manifestHash: expect.any(String),
          toolCount: productionToolNames.length,
          toolNames: productionToolNames,
        },
      }),
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "user_input",
          input: expect.objectContaining({ latestUserMessage: "今天练胸" }),
        }),
        expect.objectContaining({
          type: "runtime_event",
          output: expect.objectContaining({
            type: "registry_snapshot",
            toolCount: productionToolNames.length,
            toolNames: productionToolNames,
            tools: expect.arrayContaining([
              expect.objectContaining({
                name: "searchExerciseResources",
                inputJsonSchema: expect.any(Object),
                outputJsonSchema: expect.any(Object),
                policyHint: expect.any(Object),
              }),
            ]),
          }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({ eventTypes: ["content", "done"], done: true }),
        }),
      ]),
    });
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).not.toHaveBeenCalled();
  });

  it("runs searchExerciseResources when the model explicitly calls the production tool", async () => {
    const toolInput = { q: "胸", suitabilities: ["training"] };
    const expectedToolResultId = createToolResultId(
      "chat_assistant-tool",
      "searchExerciseResources",
      hashNormalizedInput(toolInput),
    );
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        q: "胸",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "q", value: "胸" },
        { field: "suitability", value: "training" },
        { field: "published", value: true },
      ],
    }));
    const prepared = prepareChatRequest({
      latestUserMessage: "找几个胸部训练动作",
      conversationSummary: "",
      responseMessageId: "assistant-tool",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
      { type: "final_answer", content: "可以参考俯卧撑。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const rawEvents = await readNdjsonEvents(response, { includeProgress: true });
    const events = rawEvents.filter((event) => !isTransientAgentActivityEvent(event));
    const progressEvents = rawEvents.filter((event) => event.type === "agent_progress");
    const loopEvents = rawEvents.filter((event) => event.type === "agent_loop");

    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolResultId: expectedToolResultId,
        toolName: "searchExerciseResources",
        content: expect.objectContaining({
          totalMatches: 1,
          returnedCount: 1,
          truncated: false,
          groups: expect.objectContaining({
            training: expect.objectContaining({
              exercises: [
                expect.objectContaining({ exerciseId: "push-up" }),
              ],
            }),
          }),
        }),
      }),
      { type: "content", content: "可以参考俯卧撑。" },
      { type: "done" },
    ]);
    expect(progressEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "querying_exercises", status: "active" }),
    ]));
    expect(loopEvents).toEqual([
      { type: "agent_loop", loopTurn: 1, sequence: expect.any(Number) },
      { type: "agent_loop", loopTurn: 2, sequence: expect.any(Number) },
    ]);
    expect(JSON.stringify(loopEvents)).not.toContain("toolName");
    expect(JSON.stringify(progressEvents)).not.toContain("toolName");
    expect(JSON.stringify(progressEvents)).not.toContain("searchExerciseResources");
    expect(JSON.stringify(progressEvents)).not.toContain("toolName");
    expect(JSON.stringify(progressEvents)).not.toContain("toolResultId");
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith({
      q: "胸",
      category: undefined,
      suitability: "training",
      level: undefined,
      force: undefined,
      mechanic: undefined,
      equipment: undefined,
      homeRequirement: undefined,
      muscles: undefined,
      goalTag: undefined,
      riskTag: undefined,
      excludeExerciseIds: undefined,
      maxReturned: agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection,
      published: true,
      sort: "name_asc",
    });
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "success",
      input: expect.objectContaining({
        registry: expect.objectContaining({
          toolCount: productionToolNames.length,
          toolNames: productionToolNames,
        }),
      }),
      steps: expect.arrayContaining([
        expect.objectContaining({
          name: "Tool 执行",
          type: "tool_call",
          input: toolInput,
          output: expect.objectContaining({
            type: "tool_execution",
            step: 1,
            toolName: "searchExerciseResources",
            toolResultId: expectedToolResultId,
            ok: true,
            satisfied: true,
            projectionSummary: expect.objectContaining({
              model: expect.objectContaining({
                totalMatches: 1,
                returnedCount: 1,
              }),
              user: expect.objectContaining({
                totalMatches: 1,
                returnedCount: 1,
              }),
            }),
          }),
          metadata: expect.objectContaining({
            eventType: "tool_execution",
            boundary: "tool_execution",
            runtimeStep: 1,
            toolName: "searchExerciseResources",
            toolResultId: expectedToolResultId,
          }),
        }),
        expect.objectContaining({
          name: "Tool result 摘要",
          output: {
            toolResults: [
              expect.objectContaining({
                toolResultId: expectedToolResultId,
                toolName: "searchExerciseResources",
                ok: true,
                satisfied: true,
              }),
            ],
          },
        }),
      ]),
    });
    expect(JSON.stringify(events)).not.toContain("candidateSetId");
    expect(JSON.stringify(events)).not.toContain("candidate_set");
  });

  it("runs no-equipment chest search through the production tool contract", async () => {
    const toolInput = { muscles: ["胸部"], equipment: "no_equipment", suitabilities: ["training"] };
    const expectedToolResultId = createToolResultId(
      "chat_assistant-no-equipment-search",
      "searchExerciseResources",
      hashNormalizedInput(toolInput),
    );
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        muscles: ["胸部"],
        equipment: "no_equipment",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "equipment", value: "no_equipment" },
        { field: "muscles", value: ["胸部"] },
        { field: "suitability", value: "training" },
        { field: "published", value: true },
      ],
      filterSemantics: [createNoEquipmentFilterSemantic("no_equipment")],
      exercises: [
        createExerciseResourceSummary({
          id: "push-up",
          nameZh: "俯卧撑",
          equipment: "body only",
          equipmentZh: "自重",
          homeRequirement: "floor",
          homeRequirementZh: "地面/瑜伽垫",
        }),
      ],
    }));
    const prepared = prepareChatRequest({
      latestUserMessage: "找几个无器械胸部训练动作",
      conversationSummary: "",
      responseMessageId: "assistant-no-equipment-search",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
      { type: "final_answer", content: "可以参考俯卧撑。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const searchToolResultJson = stringifyPlannerToolResult(planner.calls[1], "searchExerciseResources");

    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      equipment: "no_equipment",
      homeRequirement: undefined,
      muscles: ["胸部"],
      suitability: "training",
    }));
    expect(searchToolResultJson).toContain("filterSemantics");
    expect(searchToolResultJson).toContain("repository 只映射到自重动作字段");
    expect(searchToolResultJson).toContain("地面/瑜伽垫");
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            training: expect.objectContaining({
              exercises: [
                expect.objectContaining({
                  exerciseId: "push-up",
                  equipmentZh: "自重",
                  homeRequirementZh: "地面/瑜伽垫",
                }),
              ],
            }),
          }),
        }),
      }),
      { type: "content", content: "可以参考俯卧撑。" },
      { type: "done" },
    ]);
  });

  it("replays a multi-mentioned exercise request through mention resolution and requiredExerciseIds", async () => {
    const mentionInput = {
      mentions: [
        { text: "俯卧撑", sectionHint: "training" },
        { text: "深蹲", sectionHint: "training" },
        { text: "平板支撑", sectionHint: "training" },
      ],
    };
    const searchInput = {
      suitabilities: ["training"],
      equipment: "no_equipment",
      level: "beginner",
      requiredExerciseIds: ["push-up", "squat", "plank"],
      sort: "name_asc",
    };
    const expectedResolveToolResultId = createToolResultId(
      "chat_assistant-mentioned-required",
      "resolveExerciseResourceMentions",
      hashNormalizedInput(mentionInput),
    );
    const expectedSearchToolResultId = createToolResultId(
      "chat_assistant-mentioned-required",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    const mentionedExercises = [
      createExerciseResourceSummary({ id: "push-up", nameZh: "俯卧撑", nameEn: "Push-up" }),
      createExerciseResourceSummary({ id: "squat", nameZh: "深蹲", nameEn: "Squat", primaryMusclesZh: ["股四头肌"] }),
      createExerciseResourceSummary({ id: "plank", nameZh: "平板支撑", nameEn: "Plank", primaryMusclesZh: ["腹肌"] }),
    ];
    exerciseResourceRepositoryMocks.resolveExerciseResourceMentionSummaries.mockImplementation(async (input) => {
      const text = isRecord(input) && typeof input.text === "string" ? input.text : "";
      const exercise = mentionedExercises.find((item) => item.nameZh === text);
      return createExerciseResourceMentionResult({
        text,
        totalMatches: exercise ? 1 : 0,
        returnedCount: exercise ? 1 : 0,
        exactMatchCount: exercise ? 1 : 0,
        exercises: exercise ? [exercise] : [],
      });
    });
    exerciseResourceRepositoryMocks.getExerciseResourceSummariesByIds.mockResolvedValueOnce(mentionedExercises);
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        suitability: "training",
        equipment: "no_equipment",
        level: "beginner",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 1,
      returnedCount: 1,
      exercises: [mentionedExercises[0]],
    }));
    const prepared = prepareChatRequest({
      responseMessageId: "assistant-mentioned-required",
      latestUserMessage: "我想做一套 20 分钟徒手全身训练，包含俯卧撑、深蹲和平板支撑，动作不要太难",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "resolveExerciseResourceMentions", input: mentionInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "这套训练包含你点名的俯卧撑、深蹲和平板支撑。",
        usedRefs: toTerminalToolResultRefs([expectedSearchToolResultId]),
        visibleOutputs: [{
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          payload: {
            kind: "exercise_selection",
            exerciseItems: [
              { exerciseId: "push-up", section: "training", order: 1 },
              { exerciseId: "squat", section: "training", order: 2 },
              { exerciseId: "plank", section: "training", order: 3 },
            ],
          },
        }],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(exerciseResourceRepositoryMocks.resolveExerciseResourceMentionSummaries).toHaveBeenCalledTimes(3);
    expect(exerciseResourceRepositoryMocks.getExerciseResourceSummariesByIds).toHaveBeenCalledWith(["push-up", "squat", "plank"]);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      equipment: "no_equipment",
      homeRequirement: undefined,
      level: "beginner",
      suitability: "training",
    }));
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "resolveExerciseResourceMentions",
        toolResultId: expectedResolveToolResultId,
        content: expect.objectContaining({
          matchedCount: 3,
          results: [
            expect.objectContaining({ text: "俯卧撑", status: "matched" }),
            expect.objectContaining({ text: "深蹲", status: "matched" }),
            expect.objectContaining({ text: "平板支撑", status: "matched" }),
          ],
        }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedSearchToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            training: expect.objectContaining({
              exercises: [
                expect.objectContaining({ exerciseId: "push-up" }),
                expect.objectContaining({ exerciseId: "squat" }),
                expect.objectContaining({ exerciseId: "plank" }),
              ],
            }),
          }),
        }),
      }),
      { type: "content", content: "这套训练包含你点名的俯卧撑、深蹲和平板支撑。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        payload: expect.objectContaining({
          exerciseItems: [
            expect.objectContaining({ exerciseId: "push-up" }),
            expect.objectContaining({ exerciseId: "squat" }),
            expect.objectContaining({ exerciseId: "plank" }),
          ],
        }),
      }),
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("requiredMatches");
    expect(JSON.stringify(events)).not.toContain("supplementalMatches");
  });

  it("refreshes visible training proposals by reading prior visible fact and excluding prior exercise ids", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-previous" } };
    const searchInput = {
      muscles: ["股四头肌", "臀部"],
      suitabilities: ["training"],
      excludeExerciseIds: ["squat", "lunge"],
      sort: "name_asc",
    };
    const expectedSearchToolResultId = createToolResultId(
      "chat_assistant-refresh",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()])
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        muscles: ["股四头肌", "臀部"],
        suitability: "training",
        excludeExerciseIds: ["squat", "lunge"],
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "muscles", value: ["股四头肌", "臀部"] },
        { field: "suitability", value: "training" },
        { field: "excludeExerciseIds", value: ["squat", "lunge"] },
        { field: "published", value: true },
      ],
      excludedCount: 2,
      totalMatches: 1,
      returnedCount: 1,
      exercises: [
        {
          ...createExerciseResourceSearchResult().exercises[0],
          id: "step-up",
          nameZh: "台阶上步",
        },
      ],
    }));
    const prepared = prepareChatRequest({
      conversationId: "conversation-refresh",
      responseMessageId: "assistant-refresh",
      latestUserMessage: "不要刚才那套，重新来一套",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "这次可以参考台阶上步。",
        usedRefs: toTerminalToolResultRefs([expectedSearchToolResultId]),
        visibleOutputs: [createVisibleExerciseSelectionOutput("step-up")],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const listToolResultForPlanner = findPlannerToolResult(planner.calls[1], "inspectVisibleTrainingProposals", "\"list_recent\"");
    const readToolResultForPlanner = findPlannerToolResult(planner.calls[2], "inspectVisibleTrainingProposals", "\"read_recent\"");
    const searchToolResultForPlanner = findPlannerToolResult(planner.calls[3], "searchExerciseResources");

    expect(planner.calls[0].run.metadata).toMatchObject({
      recentVisibleTrainingProposals: [
        expect.objectContaining({
          proposalKind: "exercise_selection",
          sectionSummary: { warmup: 0, training: 2, stretch: 0 },
          reusableTrainingExerciseCount: 2,
        }),
      ],
    });
    expect(planner.calls[0].run.userInput).toBe("不要刚才那套，重新来一套");
    expect(planner.calls).toHaveLength(4);
    expect(listToolResultForPlanner).toMatchObject({
      ok: true,
      output: "[redacted]",
      projection: { model: expect.objectContaining({ operation: "list_recent" }) },
    });
    expect(readToolResultForPlanner).toMatchObject({
      ok: true,
      output: "[redacted]",
      projection: { model: expect.objectContaining({
        operation: "read_recent",
        currentRunImport: expect.objectContaining({ imported: true }),
      }) },
    });
    expect(searchToolResultForPlanner).toMatchObject({
      ok: true,
      output: "[redacted]",
      projection: { model: expect.objectContaining({
        status: "succeeded",
      }) },
    });
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("exerciseItems");
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("prescription");
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("imageUrl");
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("fact-previous");
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("assistant-previous");
    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-refresh",
      factRef: "fact-previous",
      messageId: undefined,
    });
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["股四头肌", "臀部"],
      suitability: "training",
      excludeExerciseIds: ["squat", "lunge"],
      published: true,
    }));
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        content: expect.objectContaining({
          operation: "list_recent",
        }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        content: expect.objectContaining({
          operation: "read_recent",
        }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        content: expect.objectContaining({
          excludedCount: 2,
          groups: expect.objectContaining({
            training: expect.objectContaining({
              exercises: [
                expect.objectContaining({ exerciseId: "step-up" }),
              ],
            }),
          }),
        }),
      }),
      { type: "content", content: "这次可以参考台阶上步。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: expect.objectContaining({
          kind: "exercise_selection",
          exerciseItems: [
            expect.objectContaining({ exerciseId: "step-up", section: "training" }),
          ],
        }),
      }),
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("budget_exhausted");
    expect(JSON.stringify(events)).not.toContain("\"id\":\"squat\"");
    expect(JSON.stringify(events)).not.toContain("\"id\":\"lunge\"");
    expect(visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      conversationId: "conversation-refresh",
      messageId: "assistant-refresh",
      events: expect.any(Array),
    }));
  });

  it("reuses shown visible proposal exercises through requiredExerciseIds without excluding them", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-previous" } };
    const searchInput = {
      suitabilities: ["training"],
      requiredExerciseIds: ["squat"],
      sort: "name_asc",
    };
    const expectedSearchToolResultId = createToolResultId(
      "chat_assistant-visible-required",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()])
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    exerciseResourceRepositoryMocks.getExerciseResourceSummariesByIds.mockResolvedValueOnce([
      createExerciseResourceSummary({
        id: "squat",
        nameZh: "深蹲",
        nameEn: "Squat",
        primaryMusclesZh: ["股四头肌"],
      }),
    ]);
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }));
    const prepared = prepareChatRequest({
      conversationId: "conversation-visible-required",
      responseMessageId: "assistant-visible-required",
      latestUserMessage: "从刚才展示的动作里取一个",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "我从上一轮已展示动作里保留深蹲。",
        usedRefs: toTerminalToolResultRefs([expectedSearchToolResultId]),
        visibleOutputs: [createVisibleExerciseSelectionOutput("squat")],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const searchToolResultJson = stringifyPlannerToolResult(planner.calls[3], "searchExerciseResources");
    const eventsJson = JSON.stringify(events);

    expect(exerciseResourceRepositoryMocks.getExerciseResourceSummariesByIds).toHaveBeenCalledWith(["squat"]);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      suitability: "training",
      excludeExerciseIds: undefined,
      published: true,
    }));
    expect(searchToolResultJson).toContain("positiveAnchorBoundary");
    expect(searchToolResultJson).toContain("requiredExerciseIds");
    expect(searchToolResultJson).toContain("正向锚点");
    expect(searchToolResultJson).not.toContain("本次查询已应用 excludeExerciseIds");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "visible_output",
        payload: expect.objectContaining({
          kind: "exercise_selection",
          exerciseItems: [
            expect.objectContaining({ exerciseId: "squat", section: "training" }),
          ],
        }),
      }),
      { type: "done" },
    ]));
    expect(eventsJson).not.toContain("\"excludeExerciseIds\":[\"squat\"]");
    expect(eventsJson).not.toContain("无法完全换新");
  });

  it("validates final_answer.visibleOutputs against database exercise facts before rendering or fact persistence", async () => {
    exerciseResourceRepositoryMocks.getExerciseRecordsByIds.mockResolvedValueOnce([]);
    const prepared = prepareChatRequest({
      conversationId: "conversation-visible-validation",
      responseMessageId: "assistant-visible-validation",
      latestUserMessage: "推荐一个不存在的动作",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      {
        type: "final_answer",
        content: "这个动作可以参考。",
        visibleOutputs: [createVisibleExerciseSelectionOutput("missing-exercise")],
      },
      {
        type: "final_answer",
        content: "当前动作事实校验没有通过，我需要重新查询可用动作。",
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const repairObservation = planner.calls[1].observations.find((observation) => (
      observation.source === "validator"
      && JSON.stringify(observation.content).includes("exercise_missing")
    ));

    expect(repairObservation).toMatchObject({
      ok: false,
      content: expect.objectContaining({
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
      }),
    });
    expect(events).toEqual([
      { type: "content", content: "当前动作事实校验没有通过，我需要重新查询可用动作。" },
      { type: "done" },
    ]);
    expect(visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      conversationId: "conversation-visible-validation",
      messageId: "assistant-visible-validation",
      events: [
        { type: "content", content: "当前动作事实校验没有通过，我需要重新查询可用动作。" },
        { type: "done" },
      ],
    }));
  });

  it.each([
    { responseMessageId: "assistant-broad-query", latestUserMessage: "给我一套训练" },
    { responseMessageId: "assistant-broad-query-variant", latestUserMessage: "帮我安排一节今天的训练" },
  ])("blocks visible training output after an unsatisfied broad exercise query: $latestUserMessage", async ({
    responseMessageId,
    latestUserMessage,
  }) => {
    const searchInput = { suitabilities: ["training" as const] };
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      exercises: [
        createExerciseResourceSummary({ id: "push-up", nameZh: "俯卧撑", allowedSections: ["training"] }),
      ],
    }));
    const prepared = prepareChatRequest({
      conversationId: "conversation-broad-query",
      responseMessageId,
      latestUserMessage,
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "先给你一组动作。",
        visibleOutputs: [createVisibleExerciseSelectionOutput("push-up")],
      },
      {
        type: "ask_user", content: "我还需要先确认你的训练目标、时长、器械或场地，再生成可靠训练方案。",
        suggestedQuestions: ["练胸，20分钟，无器械", "每周3练，每次30分钟", "先推荐核心动作"],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const broadFactsJson = JSON.stringify(planner.calls[1].toolResults);
    const repairObservation = planner.calls[2].observations.find((observation) => (
      observation.source === "validator"
      && JSON.stringify(observation.content).includes("current_run_source_missing")
    ));

    expect(broadFactsJson).toContain("\"status\":\"too_broad\"");
    expect(broadFactsJson).toContain("\"satisfied\":false");
    expect(repairObservation).toMatchObject({
      ok: false,
      content: expect.objectContaining({
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
      }),
    });
    expect(events).toEqual([
      { type: "content", content: "我还需要先确认你的训练目标、时长、器械或场地，再生成可靠训练方案。" },
      {
        type: "suggested_questions",
        suggestedQuestions: ["练胸，20分钟，无器械", "每周3练，每次30分钟", "先推荐核心动作"],
      },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("visible_output");
    expect(visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      conversationId: "conversation-broad-query",
      messageId: responseMessageId,
      events: [
        { type: "content", content: "我还需要先确认你的训练目标、时长、器械或场地，再生成可靠训练方案。" },
        {
          type: "suggested_questions",
          suggestedQuestions: ["练胸，20分钟，无器械", "每周3练，每次30分钟", "先推荐核心动作"],
        },
        { type: "done" },
      ],
    }));
  });

  it("keeps section_not_allowed details in visible output repair observations", async () => {
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        suitability: "training",
        muscles: ["胸部"],
        published: true,
        sort: "name_asc",
      },
      exercises: [
        createExerciseResourceSummary({ id: "Pushups", nameEn: "Pushups", nameZh: "俯卧撑", allowedSections: ["training"] }),
      ],
    }));
    const prepared = prepareChatRequest({
      conversationId: "conversation-section-repair",
      responseMessageId: "assistant-section-repair",
      latestUserMessage: "把胸部自重动作编排成完整训练",
      conversationSummary: "",
    });
    const searchInput = { muscles: ["胸部"], suitabilities: ["training" as const] };
    const expectedSearchToolResultId = createToolResultId(
      "chat_assistant-section-repair",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "先给你一版完整训练。",
        visibleOutputs: [createInvalidWarmupRoutineOutput()],
      },
      {
        type: "final_answer",
        content: "当前动作 section 校验没有通过，我会重新基于可用动作事实调整。",
        usedRefs: toTerminalToolResultRefs([expectedSearchToolResultId]),
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const secondPlannerInput = planner.calls[1];
    const repairPlannerInput = planner.calls[2];
    const searchToolResultJson = stringifyPlannerToolResult(secondPlannerInput, "searchExerciseResources");
    const repairObservation = repairPlannerInput.observations.find((observation) => (
      observation.type === "invalid_action"
      && observation.source === "validator"
      && JSON.stringify(observation.content).includes("section_not_allowed")
    ));
    const repairObservationJson = JSON.stringify(repairObservation?.content);

    expect(searchToolResultJson).toContain("groups");
    expect(searchToolResultJson).toContain("training");
    expect(searchToolResultJson).toContain("Pushups");
    expect(searchToolResultJson).toContain("allowedSections");
    expect(searchToolResultJson).toContain("groupSemantics");
    expect(repairObservation).toMatchObject({
      ok: false,
      content: {
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
        details: {
          index: 0,
          type: "domain_validation_failed",
          target: {
            kind: "DomainValidation",
            schemaId: "visibleTrainingProposal@1",
            outputType: "visibleTrainingProposal",
            variant: "1",
          },
          facts: expect.arrayContaining([
            expect.objectContaining({
              code: "section_not_allowed",
              path: "payload.exerciseItems[0].section",
              exerciseId: "Pushups",
              section: "warmup",
              allowedSections: ["training"],
              currentVisibleCoverage: expect.objectContaining({
                availableSections: ["training"],
                missingSectionsForRoutineOrPlan: ["warmup", "stretch"],
              }),
            }),
          ]),
        },
      },
    });
    expect(repairObservationJson).not.toContain("必须调用 searchExerciseResources");
    expect(repairObservationJson).not.toContain("recoveryDirections");
    expect(repairObservationJson).not.toContain("stack");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_result", toolName: "searchExerciseResources" }),
      { type: "content", content: "当前动作 section 校验没有通过，我会重新基于可用动作事实调整。" },
      { type: "done" },
    ]));
  });

  it.each([
    {
      responseMessageId: "assistant-terminal-grounding",
      latestUserMessage: "可以可以，这些动作没问题。",
      invalidContent: "需要先查询热身和拉伸动作，请稍等。",
    },
    {
      responseMessageId: "assistant-terminal-grounding-variant",
      latestUserMessage: "继续把刚才那组动作排成一次完整训练。",
      invalidContent: "我还要补齐热身和拉伸，稍后继续生成。",
    },
  ])("repairs ungrounded terminal completion after read_recent and continues legal tool calls: $latestUserMessage", async ({
    responseMessageId,
    latestUserMessage,
    invalidContent,
  }) => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-previous" } };
    const searchInput = {
      muscles: ["股四头肌"],
      suitabilities: ["warmup", "stretch"] as const,
      sort: "name_asc" as const,
    };
    const runId = `chat_${responseMessageId}`;
    const expectedReadToolResultId = createToolResultId(
      runId,
      "inspectVisibleTrainingProposals",
      hashNormalizedInput(readInput),
    );
    const expectedSearchToolResultId = createToolResultId(
      runId,
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()])
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockImplementation(async (input: unknown) => {
      const suitability = (input as { suitability?: "warmup" | "stretch" | "training" }).suitability ?? "training";

      return createExerciseResourceSearchResult({
        query: {
          muscles: ["股四头肌"],
          suitability,
          published: true,
          sort: "name_asc",
        },
        exercises: [
          suitability === "stretch"
            ? createExerciseResourceSummary({ id: "chest-stretch", nameZh: "胸部拉伸", allowedSections: ["stretch"] })
            : createExerciseResourceSummary({ id: "jumping-jack", nameZh: "开合跳", allowedSections: ["warmup"] }),
        ],
      });
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      {
        type: "final_answer",
        content: invalidContent,
        visibleOutputs: [],
      },
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "已补齐热身和拉伸动作，并基于当前可见事实生成完整训练。",
        visibleOutputs: [createRoutineOutputWithTrainingExercise("squat")],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({
        conversationId: "conversation-refresh",
        responseMessageId,
        latestUserMessage,
        conversationSummary: "",
      }),
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const repairObservation = planner.calls[3].observations.find((observation) => (
      observation.type === "invalid_action"
      && observation.source === "validator"
      && JSON.stringify(observation.content).includes("missing_terminal_grounding_after_tool_result")
    ));
    const eventsJson = JSON.stringify(events);

    expect(repairObservation).toMatchObject({
      ok: false,
      content: expect.objectContaining({
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
        details: expect.objectContaining({
          type: "domain_validation_failed",
          target: expect.objectContaining({
            kind: "DomainValidation",
            schemaId: "AgentAction",
            variant: "final_answer",
          }),
          facts: expect.arrayContaining([
            expect.objectContaining({
              code: "missing_terminal_grounding_after_tool_result",
              path: "usedRefs",
              toolResultCount: 2,
            }),
          ]),
        }),
      }),
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        toolResultId: expectedReadToolResultId,
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedSearchToolResultId,
      }),
      { type: "content", content: "已补齐热身和拉伸动作，并基于当前可见事实生成完整训练。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        payload: expect.objectContaining({
          kind: "routine",
          exerciseItems: expect.arrayContaining([
            expect.objectContaining({ exerciseId: "squat", section: "training" }),
          ]),
        }),
      }),
      { type: "done" },
    ]));
    expect(eventsJson).not.toContain(invalidContent);
    expect(eventsJson).not.toContain("missing_terminal_grounding_after_tool_result");
  });

  it("returns a safe failure when ungrounded terminal completion repeats after repair", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-previous" } };
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()])
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      {
        type: "final_answer",
        content: "我会继续查询缺失动作，请稍等。",
        visibleOutputs: [],
      },
      {
        type: "final_answer",
        content: "我稍后继续生成完整训练。",
        visibleOutputs: [],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({
        conversationId: "conversation-terminal-grounding-fallback",
        responseMessageId: "assistant-terminal-grounding-fallback",
        latestUserMessage: "继续用刚才动作排成一套训练。",
        conversationSummary: "",
      }),
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const eventsJson = JSON.stringify(events);
    const trace = listAiTracesForUser("user-1")[0];

    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({
          code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          message: "聊天服务暂时没能完成这次回复。你可以稍后重试，或把问题缩小后再发一次。",
        }),
      },
      { type: "done" },
    ]);
    expect(eventsJson).not.toContain("我会继续查询缺失动作，请稍等。");
    expect(eventsJson).not.toContain("我稍后继续生成完整训练。");
    expect(eventsJson).not.toContain("Agent runtime reached the invalid action repair limit.");
    expect(eventsJson).not.toContain("stack");
    expect(trace).toMatchObject({
      status: "failed",
      finalDecision: {
        status: "hard_failure",
        code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
        responseType: "error",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "validation",
          output: expect.objectContaining({ ok: false, code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID }),
        }),
      ]),
    });
  });

  it("recovers from duplicate successful read/import without resource duplicate hard failure", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-previous" } };
    const searchInput = {
      muscles: ["股四头肌", "臀部"],
      suitabilities: ["training"],
      excludeExerciseIds: ["squat", "lunge"],
      sort: "name_asc",
    };
    const expectedSearchToolResultId = createToolResultId(
      "chat_assistant-refresh-duplicate",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    const expectedReadToolResultId = createToolResultId(
      "chat_assistant-refresh-duplicate",
      "inspectVisibleTrainingProposals",
      hashNormalizedInput(readInput),
    );
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()])
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        muscles: ["股四头肌", "臀部"],
        suitability: "training",
        excludeExerciseIds: ["squat", "lunge"],
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "muscles", value: ["股四头肌", "臀部"] },
        { field: "suitability", value: "training" },
        { field: "excludeExerciseIds", value: ["squat", "lunge"] },
        { field: "published", value: true },
      ],
      excludedCount: 2,
      totalMatches: 1,
      returnedCount: 1,
      exercises: [
        {
          ...createExerciseResourceSearchResult().exercises[0],
          id: "step-up",
          nameZh: "台阶上步",
        },
      ],
    }));
    const prepared = prepareChatRequest({
      conversationId: "conversation-refresh",
      responseMessageId: "assistant-refresh-duplicate",
      latestUserMessage: "换一个",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "这次可以参考台阶上步。",
        usedRefs: toTerminalToolResultRefs([expectedSearchToolResultId]),
        visibleOutputs: [createVisibleExerciseSelectionOutput("step-up")],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const trace = listAiTracesForUser("user-1")[0];
    const serializedTrace = JSON.stringify(trace);
    const duplicateFeedback = planner.calls[3].observations.find((observation) => (
      observation.source === "runtime"
      && JSON.stringify(observation.content).includes(AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT)
    ));

    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledTimes(1);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["股四头肌", "臀部"],
      suitability: "training",
      excludeExerciseIds: ["squat", "lunge"],
      published: true,
    }));
    expect(duplicateFeedback).toMatchObject({
      toolResultId: expectedReadToolResultId,
      toolName: "inspectVisibleTrainingProposals",
      content: expect.objectContaining({
        code: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
        details: expect.objectContaining({
          previousToolResultId: expectedReadToolResultId,
          previousOk: true,
          repeatCount: 2,
          allowedNextActions: expect.arrayContaining([
            "基于 previousToolResultId 输出带 usedRefs 的合法 final_answer。",
            "提交改变后的合法 tool input。",
            "使用 ask_user 澄清缺失信息。",
          ]),
        }),
      }),
    });
    expect(trace).toMatchObject({
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "runtime_event",
          output: expect.objectContaining({
            type: "duplicate_tool_call",
            toolName: "inspectVisibleTrainingProposals",
            previousToolResultId: expectedReadToolResultId,
            previousOk: true,
            previousCount: 1,
            repeatCount: 2,
          }),
        }),
      ]),
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        content: expect.objectContaining({
          operation: "list_recent",
        }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        content: expect.objectContaining({
          operation: "read_recent",
        }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        content: expect.objectContaining({
          excludedCount: 2,
          groups: expect.objectContaining({
            training: expect.objectContaining({
              exercises: [
                expect.objectContaining({ exerciseId: "step-up" }),
              ],
            }),
          }),
        }),
      }),
      { type: "content", content: "这次可以参考台阶上步。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
      }),
      { type: "done" },
    ]);
    expect(serializedTrace).toContain(AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT);
    expect(serializedTrace).not.toContain("Resource id is already registered in the current run.");
    expect(serializedTrace).not.toContain("\"invalid_action\"");
    expect(JSON.stringify(events)).not.toContain("聊天生成失败");
  });

  it("settles a satisfied exercise search final answer through usedRefs", async () => {
    const searchInput = {
      muscles: ["胸部", "股四头肌"],
      suitabilities: ["training"],
      sort: "name_asc",
    };
    const expectedToolResultId = createToolResultId(
      "chat_assistant-leg-chest",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        muscles: ["胸部", "股四头肌"],
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "muscles", value: ["胸部", "股四头肌"] },
        { field: "suitability", value: "training" },
        { field: "published", value: true },
      ],
      totalMatches: 1,
      returnedCount: 1,
      exercises: [
        {
          ...createExerciseResourceSearchResult().exercises[0],
          id: "chest-leg-drive",
          nameZh: "三点支撑胸推动作",
          primaryMusclesZh: ["胸部"],
          secondaryMusclesZh: ["股四头肌"],
        },
      ],
    }));
    const prepared = prepareChatRequest({
      responseMessageId: "assistant-leg-chest",
      latestUserMessage: "找既练腿又练胸肌的动作",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      { type: "final_answer", content: "可以参考三点支撑胸推动作。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedToolResultId,
      }),
      { type: "content", content: "可以参考三点支撑胸推动作。" },
      { type: "done" },
    ]);
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "success",
      finalDecision: {
        status: "success",
        reason: "completed",
        responseType: "final_answer",
      },
    });
  });

  it("settles a zero-match exercise search final answer through usedRefs", async () => {
    const searchInput = {
      q: "铅球",
      published: true,
      sort: "name_asc",
    };
    const expectedToolResultId = createToolResultId(
      "chat_assistant-shot-put",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        q: "铅球",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "q", value: "铅球" },
        { field: "published", value: true },
      ],
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }));
    const prepared = prepareChatRequest({
      responseMessageId: "assistant-shot-put",
      latestUserMessage: "有没有铅球动作",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      { type: "final_answer", content: "当前发布态动作库没有找到铅球相关动作。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedToolResultId,
        content: expect.objectContaining({
          totalMatches: 0,
          returnedCount: 0,
          groups: expect.objectContaining({
            training: expect.objectContaining({ exercises: [] }),
          }),
        }),
      }),
      { type: "content", content: "当前发布态动作库没有找到铅球相关动作。" },
      { type: "done" },
    ]);
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "success",
      finalDecision: {
        status: "success",
        reason: "completed",
        responseType: "final_answer",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          name: "Tool 执行",
          output: expect.objectContaining({
            toolName: "searchExerciseResources",
            toolResultId: expectedToolResultId,
            ok: true,
            satisfied: true,
            fulfillment: expect.objectContaining({
              summary: "查询已执行，当前发布态动作库没有匹配结果。",
            }),
          }),
        }),
      ]),
    });
    expect(JSON.stringify(events)).not.toContain("candidateSetId");
    expect(JSON.stringify(events)).not.toContain("candidate_set");
    expect(JSON.stringify(events)).not.toContain("repair_limit_exceeded");
  });

  it("renders a routine visible output after querying warmup training and stretch groups", async () => {
    const searchInput = {
      muscles: ["胸部", "股四头肌", "腹肌"],
      suitabilities: ["warmup", "training", "stretch"],
      sort: "name_asc",
    };
    const expectedToolResultId = createToolResultId(
      "chat_assistant-routine-visible",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockImplementation(async (input) => {
      const suitability = isRecord(input) && typeof input.suitability === "string" ? input.suitability : "training";
      const exerciseBySuitability = {
        warmup: { id: "jumping-jack", nameZh: "开合跳" },
        training: { id: "push-up", nameZh: "俯卧撑" },
        stretch: { id: "chest-stretch", nameZh: "胸部拉伸" },
      }[suitability] ?? { id: "push-up", nameZh: "俯卧撑" };

      return createExerciseResourceSearchResult({
        query: {
          muscles: ["胸部", "股四头肌", "腹肌"],
          suitability,
          published: true,
          sort: "name_asc",
        },
        totalMatches: 1,
        returnedCount: 1,
        exercises: [
          {
            ...createExerciseResourceSearchResult().exercises[0],
            id: exerciseBySuitability.id,
            nameZh: exerciseBySuitability.nameZh,
            allowedSections: [suitability],
          },
        ],
      });
    });
    const prepared = prepareChatRequest({
      responseMessageId: "assistant-routine-visible",
      latestUserMessage: "帮我做一套全身训练编排",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      {
        type: "final_answer",
        content: "这是一套包含热身、主训练和拉伸的全身训练。",
        usedRefs: toTerminalToolResultRefs([expectedToolResultId]),
        visibleOutputs: [createVisibleRoutineOutput()],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledTimes(3);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mock.calls.map(([input]) => (
      isRecord(input) ? input.suitability : undefined
    ))).toEqual(["warmup", "training", "stretch"]);
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            warmup: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "jumping-jack" })] }),
            training: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "push-up" })] }),
            stretch: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "chest-stretch" })] }),
          }),
        }),
      }),
      { type: "content", content: "这是一套包含热身、主训练和拉伸的全身训练。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        payload: expect.objectContaining({
          kind: "routine",
          exerciseItems: expect.arrayContaining([
            expect.objectContaining({ exerciseId: "jumping-jack", section: "warmup" }),
            expect.objectContaining({ exerciseId: "push-up", section: "training" }),
            expect.objectContaining({ exerciseId: "chest-stretch", section: "stretch" }),
          ]),
        }),
      }),
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("displayedExerciseIds");
  });

  it.each([
    {
      caseId: "chest-no-equipment",
      latestUserMessage: "给我一套胸部20分钟无器械训练",
      muscle: "胸部",
      trainingExercise: { id: "push-up", nameZh: "俯卧撑" },
      warmupExercise: { id: "jumping-jack", nameZh: "开合跳" },
      stretchExercise: { id: "chest-stretch", nameZh: "胸部拉伸" },
    },
    {
      caseId: "home-back-30",
      latestUserMessage: "今天在家练背30分钟",
      muscle: "背部",
      trainingExercise: { id: "superman", nameZh: "超人式" },
      warmupExercise: { id: "dynamic-back-stretch", nameZh: "动态背部热身" },
      stretchExercise: { id: "back-stretch", nameZh: "背部拉伸" },
    },
    {
      caseId: "chest-circuit",
      latestUserMessage: "给我一套循环胸部训练",
      muscle: "胸部",
      trainingExercise: { id: "push-up", nameZh: "俯卧撑" },
      warmupExercise: { id: "jumping-jack", nameZh: "开合跳" },
      stretchExercise: { id: "chest-stretch", nameZh: "胸部拉伸" },
    },
  ])("completes a direct routine request by supplementing support sections before final visible output: $caseId", async ({
    caseId,
    latestUserMessage,
    muscle,
    trainingExercise,
    warmupExercise,
    stretchExercise,
  }) => {
    const responseMessageId = `assistant-direct-routine-compose-${caseId}`;
    const trainingSearchInput = {
      muscles: [muscle],
      equipment: "no_equipment",
      level: "beginner",
      suitabilities: ["training"],
      sort: "name_asc",
    };
    const supportSearchInput = {
      muscles: [muscle],
      equipment: "no_equipment",
      level: "beginner",
      suitabilities: ["warmup", "stretch"],
      sort: "name_asc",
    };
    const expectedTrainingToolResultId = createToolResultId(
      `chat_${responseMessageId}`,
      "searchExerciseResources",
      hashNormalizedInput(trainingSearchInput),
    );
    const expectedSupportToolResultId = createToolResultId(
      `chat_${responseMessageId}`,
      "searchExerciseResources",
      hashNormalizedInput(supportSearchInput),
    );
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockImplementation(async (input) => {
      const suitability = isRecord(input) && typeof input.suitability === "string" ? input.suitability : "training";
      const exerciseBySuitability = {
        warmup: warmupExercise,
        training: trainingExercise,
        stretch: stretchExercise,
      }[suitability] ?? trainingExercise;

      return createExerciseResourceSearchResult({
        query: {
          muscles: [muscle],
          equipment: "no_equipment",
          level: "beginner",
          suitability,
          published: true,
          sort: "name_asc",
        },
        totalMatches: 1,
        returnedCount: 1,
        exercises: [
          {
            ...createExerciseResourceSearchResult().exercises[0],
            id: exerciseBySuitability.id,
            nameZh: exerciseBySuitability.nameZh,
            allowedSections: [suitability],
          },
        ],
      });
    });
    const prepared = prepareChatRequest({
      conversationId: "conversation-direct-routine-compose",
      responseMessageId,
      latestUserMessage,
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: trainingSearchInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: supportSearchInput },
      {
        type: "final_answer",
        content: "这是一套完整训练，已经包含热身、主训练和拉伸。",
        usedRefs: toTerminalToolResultRefs([expectedTrainingToolResultId, expectedSupportToolResultId]),
        visibleOutputs: [createVisibleRoutineOutputForExercises({
          warmupExerciseId: warmupExercise.id,
          trainingExerciseId: trainingExercise.id,
          stretchExerciseId: stretchExercise.id,
        })],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const supportPlannerInputJson = JSON.stringify(planner.calls[1]);
    const finalPlannerToolResultsJson = JSON.stringify(planner.calls[2].toolResults);

    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledTimes(3);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mock.calls.map(([input]) => (
      isRecord(input) ? input.suitability : undefined
    ))).toEqual(["training", "warmup", "stretch"]);
    expect(supportPlannerInputJson).toContain("missingSectionsForRoutineOrPlan");
    expect(supportPlannerInputJson).toContain("作为本轮完成 routine / plan 的正常下一步");
    expect(supportPlannerInputJson).toContain("不要让用户自行组合 training 动作列表");
    expect(finalPlannerToolResultsJson).toContain(warmupExercise.id);
    expect(finalPlannerToolResultsJson).toContain(trainingExercise.id);
    expect(finalPlannerToolResultsJson).toContain(stretchExercise.id);
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedTrainingToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            training: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: trainingExercise.id })] }),
          }),
        }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedSupportToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            warmup: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: warmupExercise.id })] }),
            stretch: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: stretchExercise.id })] }),
          }),
        }),
      }),
      { type: "content", content: "这是一套完整训练，已经包含热身、主训练和拉伸。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        payload: expect.objectContaining({
          kind: "routine",
          exerciseItems: expect.arrayContaining([
            expect.objectContaining({ exerciseId: warmupExercise.id, section: "warmup" }),
            expect.objectContaining({ exerciseId: trainingExercise.id, section: "training" }),
            expect.objectContaining({ exerciseId: stretchExercise.id, section: "stretch" }),
          ]),
        }),
      }),
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("你可以从中挑选");
    expect(JSON.stringify(events)).not.toContain("如果你需要完整计划");
    expect(JSON.stringify(events)).not.toContain("kind\":\"exercise_selection");
  });

  it("renders a plan visible output after composing multiple exercise search observations", async () => {
    const trainingSearchInput = {
      muscles: ["胸部"],
      equipment: "no_equipment",
      level: "beginner",
      suitabilities: ["training"],
      sort: "name_asc",
    };
    const supportSearchInput = {
      muscles: ["胸部"],
      equipment: "no_equipment",
      suitabilities: ["warmup", "stretch"],
      sort: "name_asc",
    };
    const expectedTrainingToolResultId = createToolResultId(
      "chat_assistant-plan-visible",
      "searchExerciseResources",
      hashNormalizedInput(trainingSearchInput),
    );
    const expectedSupportToolResultId = createToolResultId(
      "chat_assistant-plan-visible",
      "searchExerciseResources",
      hashNormalizedInput(supportSearchInput),
    );
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockImplementation(async (input) => {
      const suitability = isRecord(input) && typeof input.suitability === "string" ? input.suitability : "training";
      const exerciseBySuitability = {
        warmup: { id: "jumping-jack", nameZh: "开合跳" },
        training: { id: "push-up", nameZh: "俯卧撑" },
        stretch: { id: "chest-stretch", nameZh: "胸部拉伸" },
      }[suitability] ?? { id: "push-up", nameZh: "俯卧撑" };

      return createExerciseResourceSearchResult({
        query: {
          muscles: isRecord(input) && Array.isArray(input.muscles) ? input.muscles.filter((value): value is string => typeof value === "string") : undefined,
          equipment: isRecord(input) && typeof input.equipment === "string" ? input.equipment : undefined,
          level: isRecord(input) && typeof input.level === "string" ? input.level : undefined,
          suitability,
          published: true,
          sort: "name_asc",
        },
        totalMatches: 1,
        returnedCount: 1,
        exercises: [
          {
            ...createExerciseResourceSearchResult().exercises[0],
            id: exerciseBySuitability.id,
            nameZh: exerciseBySuitability.nameZh,
            allowedSections: [suitability],
          },
        ],
      });
    });
    const prepared = prepareChatRequest({
      responseMessageId: "assistant-plan-visible",
      latestUserMessage: "我想在家减脂，没有器械，每周 3 练，每次 25 分钟，动作简单一点",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: trainingSearchInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: supportSearchInput },
      {
        type: "final_answer",
        content: "这是一套每周 3 练的居家自重减脂计划。",
        usedRefs: toTerminalToolResultRefs([expectedTrainingToolResultId, expectedSupportToolResultId]),
        visibleOutputs: [createVisiblePlanOutput()],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const supportPlannerToolResultsJson = JSON.stringify(planner.calls[1].toolResults);
    const finalPlannerToolResultsJson = JSON.stringify(planner.calls[2].toolResults);

    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledTimes(3);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mock.calls.map(([input]) => (
      isRecord(input) ? input.suitability : undefined
    ))).toEqual(["training", "warmup", "stretch"]);
    expect(supportPlannerToolResultsJson).toContain("当前结果只提供 training 动作事实");
    expect(supportPlannerToolResultsJson).toContain("还需要当前 run 可消费的 warmup 和 stretch 动作事实");
    expect(supportPlannerToolResultsJson).toContain("suitabilities = [\\\"warmup\\\"");
    expect(finalPlannerToolResultsJson).toContain("push-up");
    expect(finalPlannerToolResultsJson).toContain("jumping-jack");
    expect(finalPlannerToolResultsJson).toContain("chest-stretch");
    expect(finalPlannerToolResultsJson).toContain("missingSectionsForRoutineOrPlan");
    expect(finalPlannerToolResultsJson).toContain("groups.<section>.exercises[*].exerciseId 可作为 visibleTrainingProp");
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedTrainingToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            training: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "push-up" })] }),
          }),
        }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedSupportToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            warmup: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "jumping-jack" })] }),
            stretch: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "chest-stretch" })] }),
          }),
        }),
      }),
      { type: "content", content: "这是一套每周 3 练的居家自重减脂计划。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        payload: expect.objectContaining({
          kind: "plan",
          schedule: expect.objectContaining({
            cycleLengthDays: 7,
            assignments: [
              { cycleDayIndex: 1, type: "training" },
              { cycleDayIndex: 2, type: "rest" },
              { cycleDayIndex: 3, type: "training" },
              { cycleDayIndex: 4, type: "rest" },
              { cycleDayIndex: 5, type: "training" },
              { cycleDayIndex: 6, type: "rest" },
              { cycleDayIndex: 7, type: "rest" },
            ],
          }),
        }),
      }),
      { type: "done" },
    ]);
    expect(visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "assistant-plan-visible",
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "visible_output",
          outputType: "visibleTrainingProposal",
        }),
      ]),
    }));
    expect(JSON.stringify(events)).not.toContain("kind\":\"exercise_selection");
    expect(JSON.stringify(events)).not.toContain("下一轮再生成计划");
  });

  it.each([
    "把这些动作组成 30 分钟训练",
    "用刚才动作排一节完整课",
  ])("supplements missing routine sections before final visible output for training-only facts: %s", async (latestUserMessage) => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-previous" } };
    const supportSearchInput = {
      muscles: ["股四头肌"],
      suitabilities: ["warmup", "stretch"],
      sort: "name_asc",
    };
    const expectedSupportToolResultId = createToolResultId(
      "chat_assistant-compose-from-training-only",
      "searchExerciseResources",
      hashNormalizedInput(supportSearchInput),
    );
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()])
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockImplementation(async (input) => {
      const suitability = isRecord(input) && typeof input.suitability === "string" ? input.suitability : "training";
      const exercisesBySuitability: Record<string, { id: string; nameZh: string }> = {
        warmup: { id: "jumping-jack", nameZh: "开合跳" },
        stretch: { id: "chest-stretch", nameZh: "胸部拉伸" },
      };
      const exerciseBySuitability = exercisesBySuitability[suitability] ?? { id: "squat", nameZh: "深蹲" };

      return createExerciseResourceSearchResult({
        query: {
          suitability,
          published: true,
          sort: "name_asc",
        },
        totalMatches: 1,
        returnedCount: 1,
        exercises: [
          {
            ...createExerciseResourceSearchResult().exercises[0],
            id: exerciseBySuitability.id,
            nameZh: exerciseBySuitability.nameZh,
            allowedSections: [suitability],
          },
        ],
      });
    });
    const prepared = prepareChatRequest({
      conversationId: "conversation-refresh",
      responseMessageId: "assistant-compose-from-training-only",
      latestUserMessage,
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: supportSearchInput },
      {
        type: "final_answer",
        content: "已经补齐热身和拉伸动作，下面是一节完整训练。",
        usedRefs: toTerminalToolResultRefs([expectedSupportToolResultId]),
        visibleOutputs: [createRoutineOutputWithTrainingExercise("squat")],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const supportPlannerInputJson = JSON.stringify(planner.calls[2]);
    const finalPlannerToolResultsJson = JSON.stringify(planner.calls[3].toolResults);

    expect(planner.calls[0].run.metadata).toMatchObject({
      recentVisibleTrainingProposals: [
        expect.objectContaining({
          proposalKind: "exercise_selection",
          sectionSummary: { warmup: 0, training: 2, stretch: 0 },
        }),
      ],
    });
    expect(supportPlannerInputJson).toContain("missingSectionsForRoutineOrPlan");
    expect(supportPlannerInputJson).toContain("warmup");
    expect(supportPlannerInputJson).toContain("stretch");
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledTimes(2);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mock.calls.map(([input]) => (
      isRecord(input) ? input.suitability : undefined
    ))).toEqual(["warmup", "stretch"]);
    expect(finalPlannerToolResultsJson).toContain("forbiddenFinalVisibleOutputs");
    expect(finalPlannerToolResultsJson).toContain("missingSectionsForRoutineOrPlan 非空时");
    expect(finalPlannerToolResultsJson).toContain("jumping-jack");
    expect(finalPlannerToolResultsJson).toContain("chest-stretch");
    expect(events).toEqual([
      expect.objectContaining({ type: "tool_result", toolName: "inspectVisibleTrainingProposals" }),
      expect.objectContaining({ type: "tool_result", toolName: "inspectVisibleTrainingProposals" }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedSupportToolResultId,
        content: expect.objectContaining({
          groups: expect.objectContaining({
            warmup: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "jumping-jack" })] }),
            stretch: expect.objectContaining({ exercises: [expect.objectContaining({ exerciseId: "chest-stretch" })] }),
          }),
        }),
      }),
      { type: "content", content: "已经补齐热身和拉伸动作，下面是一节完整训练。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        payload: expect.objectContaining({
          kind: "routine",
          exerciseItems: expect.arrayContaining([
            expect.objectContaining({ exerciseId: "jumping-jack", section: "warmup" }),
            expect.objectContaining({ exerciseId: "squat", section: "training" }),
            expect.objectContaining({ exerciseId: "chest-stretch", section: "stretch" }),
          ]),
        }),
      }),
      { type: "done" },
    ]);
  });

  it("explains shortage when no more exercises remain after excluding displayed ids", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, ref: { type: "fact_ref", value: "fact-previous" } };
    const searchInput = {
      muscles: ["股四头肌", "臀部"],
      suitabilities: ["training"],
      excludeExerciseIds: ["squat", "lunge"],
      sort: "name_asc",
    };
    const expectedSearchToolResultId = createToolResultId(
      "chat_assistant-shortage",
      "searchExerciseResources",
      hashNormalizedInput(searchInput),
    );
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()])
      .mockResolvedValueOnce([createRecentVisibleTrainingProposalSummary()]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockResolvedValueOnce({
      ok: true,
      fact: createReadableVisibleTrainingProposalFact(),
    });
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        muscles: ["股四头肌", "臀部"],
        suitability: "training",
        excludeExerciseIds: ["squat", "lunge"],
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "muscles", value: ["股四头肌", "臀部"] },
        { field: "suitability", value: "training" },
        { field: "excludeExerciseIds", value: ["squat", "lunge"] },
        { field: "published", value: true },
      ],
      excludedCount: 2,
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }));
    const prepared = prepareChatRequest({
      conversationId: "conversation-refresh",
      responseMessageId: "assistant-shortage",
      latestUserMessage: "再推荐一批",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: readInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: searchInput },
      { type: "final_answer", content: "当前条件下没有更多未重复的腿部训练动作了，可以放宽器械或训练阶段再找。", usedRefs: toTerminalToolResultRefs([expectedSearchToolResultId]) },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        content: expect.objectContaining({ operation: "list_recent" }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        content: expect.objectContaining({ operation: "read_recent" }),
      }),
      expect.objectContaining({
        type: "tool_result",
        toolName: "searchExerciseResources",
        toolResultId: expectedSearchToolResultId,
        content: expect.objectContaining({
          totalMatches: 0,
          returnedCount: 0,
          excludedCount: 2,
          groups: expect.objectContaining({
            training: expect.objectContaining({ exercises: [] }),
          }),
        }),
      }),
      { type: "content", content: "当前条件下没有更多未重复的腿部训练动作了，可以放宽器械或训练阶段再找。" },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("\"id\":\"squat\"");
    expect(JSON.stringify(events)).not.toContain("\"id\":\"lunge\"");
    expect(JSON.stringify(events)).not.toContain("budget_exhausted");
  });

  it.each(["换一批", "再来一组", "不要这个", "重新来一套"])("lets the planner recover through list_recent when no visible proposal exists for %s", async (latestUserMessage) => {
    const listInput = { operation: "list_recent" as const };
    const expectedListToolResultId = createToolResultId(
      "chat_assistant-refresh-empty",
      "inspectVisibleTrainingProposals",
      hashNormalizedInput(listInput),
    );
    const previousAssistantCapabilityIntro = "我是你的 AI 健身助手，可以帮你澄清训练目标、推荐动作、编排训练计划。";
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([]);
    const prepared = prepareChatRequest({
      conversationId: "conversation-refresh-empty",
      responseMessageId: "assistant-refresh-empty",
      latestUserMessage,
      conversationSummary: "",
      messages: [
        { role: "user", content: "你好啊" },
        { role: "assistant", content: previousAssistantCapabilityIntro },
        { role: "user", content: "你可以干什么呢？" },
        { role: "assistant", content: previousAssistantCapabilityIntro },
        { role: "user", content: latestUserMessage },
      ],
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: listInput },
      { type: "final_answer", content: "我这里没有可读取的上一轮推荐记录，你可以告诉我想换哪类动作，我再按条件帮你找。", usedRefs: toTerminalToolResultRefs([expectedListToolResultId]) },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const trace = listAiTracesForUser("user-1")[0];
    const serializedTrace = JSON.stringify(trace);

    expect(planner.calls[0].run.metadata).toMatchObject({
      recentVisibleTrainingProposals: [],
    });
    expect(planner.calls[0].run.messages).toEqual(expect.arrayContaining([
      { role: "assistant", content: previousAssistantCapabilityIntro },
      { role: "user", content: latestUserMessage },
    ]));
    expect(visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-refresh-empty",
      limit: agentRuntimeConfig.tools.inspectVisibleTrainingProposals.recentFactListLimit,
    });
    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "inspectVisibleTrainingProposals",
        toolResultId: expectedListToolResultId,
        content: expect.objectContaining({
          operation: "list_recent",
          factCount: 0,
        }),
      }),
      { type: "content", content: "我这里没有可读取的上一轮推荐记录，你可以告诉我想换哪类动作，我再按条件帮你找。" },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain(previousAssistantCapabilityIntro);
    expect(JSON.stringify(events)).not.toContain("我是你的 AI 健身助手，可以帮你");
    expect(serializedTrace).toContain("list_recent");
    expect(serializedTrace).not.toContain("handler_error");
    expect(serializedTrace).not.toContain("duplicate_tool_failure");
    expect(trace).toMatchObject({
      status: "success",
      finalDecision: {
        status: "success",
        reason: "completed",
        responseType: "final_answer",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          name: "Tool result 摘要",
          output: {
            toolResults: [
              expect.objectContaining({
                toolName: "inspectVisibleTrainingProposals",
                ok: true,
                satisfied: true,
              }),
            ],
          },
        }),
      ]),
    });
  });

  it("answers capability questions through model final_answer instead of server fallback", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "你能干什么",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      {
        type: "final_answer",
        content: "我现在可以做普通文本交流，也可以通过受控工具查询发布态动作库事实；我不会声称能保存计划、修改日程或查询未发布动作。",
      },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(productionToolNames);
    expect(events).toEqual([
      {
        type: "content",
        content: "我现在可以做普通文本交流，也可以通过受控工具查询发布态动作库事实；我不会声称能保存计划、修改日程或查询未发布动作。",
      },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("当前未接入的工具");
    expect(JSON.stringify(events)).not.toContain("聊天生成失败");
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "success",
      input: expect.objectContaining({
        latestUserMessage: "你能干什么",
        registry: {
          manifestHash: expect.any(String),
          toolCount: productionToolNames.length,
          toolNames: productionToolNames,
        },
      }),
      finalDecision: {
        status: "success",
        reason: "completed",
        responseType: "final_answer",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "validation",
          output: expect.objectContaining({ ok: true }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({ eventTypes: ["content", "done"], errorCodes: [] }),
        }),
      ]),
    });
  });

  it("writes model_request and model_response trace steps for final_answer model calls", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "今天练胸",
      conversationSummary: "",
    });
    const planner = createTracePlanner([
      {
        actionCandidate: { type: "final_answer", content: "可以，今天先做轻量胸部训练。" },
      },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });

    await expect(readNdjsonEvents(response)).resolves.toEqual([
      { type: "content", content: "可以，今天先做轻量胸部训练。" },
      { type: "done" },
    ]);
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      model: "trace-test-model",
      metadata: expect.objectContaining({
        plannerModelCallCount: 1,
        tokenUsageSummary: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
      }),
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "model_request",
          output: expect.objectContaining({
            plannerCallIndex: 1,
            runtimeStep: 1,
            model: "trace-test-model",
          }),
        }),
        expect.objectContaining({
          type: "model_response",
          status: "success",
          output: expect.objectContaining({
            parseStatus: "parsed",
            actionType: "final_answer",
            tokenUsage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
            runtimeLinkage: expect.objectContaining({
              plannerCallIndex: 1,
              runtimeStep: 1,
              validation: { ok: true },
              terminalStatus: "completed",
            }),
          }),
        }),
        expect.objectContaining({
          type: "response_write",
          metadata: expect.objectContaining({
            plannerModelCallCount: 1,
            tokenUsageSummary: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
          }),
        }),
      ]),
    });
  });

  it("projects ask_user into clarification content and suggested_questions", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "帮我安排训练",
      conversationSummary: "",
    });
    const planner = createTracePlanner([
      {
        actionCandidate: { type: "ask_user", content: "你今天有多少时间？", suggestedQuestions: ["20 分钟", "40 分钟"] },
      },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });

    await expect(readNdjsonEvents(response)).resolves.toEqual([
      { type: "content", content: "你今天有多少时间？" },
      { type: "suggested_questions", suggestedQuestions: ["20 分钟", "40 分钟"] },
      { type: "done" },
    ]);
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "success",
      finalDecision: {
        status: "success",
        reason: "needs_input",
        responseType: "ask_user",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "model_response",
          output: expect.objectContaining({ actionType: "ask_user", parseStatus: "parsed" }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({
            eventTypes: ["content", "suggested_questions", "done"],
            suggestionCount: 2,
            suggestedQuestions: ["20 分钟", "40 分钟"],
          }),
        }),
      ]),
    });
  });

  it("returns stable configuration errors without the old chat_ai_disabled path", async () => {
    const plannerResult = createProductionAgentTextChatPlanner({
      env: { DEEPSEEK_API_KEY: "" },
    });

    expect(plannerResult).toMatchObject({
      ok: false,
      error: {
        code: "chat_ai_not_configured",
        message: "Chat AI model configuration is missing.",
      },
    });

    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({ latestUserMessage: "你好", conversationSummary: "" }),
      currentUser: { id: "user-1" },
      plannerFactory: () => plannerResult,
    });
    const events = await readNdjsonEvents(response);

    expect(response.status).toBe(503);
    expect(JSON.stringify(events)).not.toContain("chat_ai_disabled");
    expect(events).toEqual([
      {
        type: "error",
        error: {
          code: "chat_ai_not_configured",
          message: "聊天服务暂时不可用，请稍后再试。",
          retryable: false,
          details: { code: "chat_ai_not_configured", missing: ["DEEPSEEK_API_KEY"] },
        },
      },
      { type: "done" },
    ]);
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      route: "/api/chat",
      status: "failed",
      userId: "user-1",
      finalDecision: {
        status: "hard_failure",
        code: "chat_ai_not_configured",
        responseType: "error",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          name: "模型配置错误",
          type: "error",
          status: "failed",
          output: expect.objectContaining({ code: "chat_ai_not_configured" }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({
            eventTypes: ["error", "done"],
            errorCodes: ["chat_ai_not_configured"],
          }),
        }),
      ]),
    });
  });

  it("projects unknown tool repair exhaustion as unsupported capability fallback from validation facts", async () => {
    const planner = createTracePlanner([
      { actionCandidate: { type: "tool_call", toolName: "searchExercises", input: { query: "胸" } } },
      { actionCandidate: { type: "tool_call", toolName: "searchExercises", input: { query: "胸" } } },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({ latestUserMessage: "推荐胸部动作", conversationSummary: "" }),
      currentUser: { id: "user-1" },
      planner,
    });
    const rawEvents = await readNdjsonEvents(response, { includeProgress: true });
    const events = rawEvents.filter((event) => !isTransientAgentActivityEvent(event));
    const progressEvents = rawEvents.filter((event) => event.type === "agent_progress");
    const loopEvents = rawEvents.filter((event) => event.type === "agent_loop");

    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(productionToolNames);
    expect(events).toEqual([
      { type: "content", content: expect.stringContaining("当前未接入的工具") },
      {
        type: "suggested_questions",
        suggestedQuestions: expect.arrayContaining([
          "改成普通文本问题",
        ]),
      },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("聊天生成失败");
    expect(JSON.stringify(events)).not.toContain("Agent runtime reached the invalid action repair limit.");
    expect(JSON.stringify(events)).not.toContain("Tool \"searchExercises\" is not registered.");
    expect(progressEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "agent_progress", stage: "validating_result", status: "active" }),
    ]));
    expect(loopEvents).toEqual([
      { type: "agent_loop", loopTurn: 1, sequence: expect.any(Number) },
      { type: "agent_loop", loopTurn: 2, sequence: expect.any(Number) },
    ]);
    expect(JSON.stringify(progressEvents)).not.toContain("\"failed\"");
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "failed",
      finalDecision: {
        status: "recoverable_failure",
        reason: "unsupported_capability_fallback",
        code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
        responseType: "content",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "model_request",
          output: expect.objectContaining({ plannerCallIndex: 1, runtimeStep: 1 }),
        }),
        expect.objectContaining({
          type: "model_response",
          output: expect.objectContaining({
            actionType: "tool_call",
            toolName: "searchExercises",
            runtimeLinkage: expect.objectContaining({
              validation: { ok: false, code: AGENT_ERROR_CODES.UNKNOWN_TOOL },
            }),
          }),
        }),
        expect.objectContaining({
          type: "validation",
          output: expect.objectContaining({ ok: false, code: AGENT_ERROR_CODES.UNKNOWN_TOOL }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({
            eventTypes: ["content", "suggested_questions", "done"],
            projectionType: "unsupported_capability_fallback",
            errorCodes: [],
          }),
        }),
      ]),
    });
  });

  it("projects repair exhausted section coverage failures as safe assistant content without rendering invalid visible output", async () => {
    const planner = new ReplayPlanner([
      {
        type: "final_answer",
        content: "我会把热身和拉伸写在说明里。",
        visibleOutputs: [createTrainingOnlyRoutineOutput()],
      },
      {
        type: "final_answer",
        content: "我还是把热身和拉伸写在正文里。",
        visibleOutputs: [createTrainingOnlyRoutineOutput()],
      },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({
        conversationId: "conversation-section-coverage-fallback",
        responseMessageId: "assistant-section-coverage-fallback",
        latestUserMessage: "把这些动作帮我组一套 30 分钟训练。",
        conversationSummary: "",
      }),
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const repairObservationJson = JSON.stringify(planner.calls[1].observations);
    const trace = listAiTracesForUser("user-1")[0];

    expect(events).toEqual([
      { type: "content", content: expect.stringContaining("没有生成通过校验的可靠训练结果") },
      {
        type: "suggested_questions",
        suggestedQuestions: expect.arrayContaining([
          "补充缺失条件",
        ]),
      },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("visible_output");
    expect(JSON.stringify(events)).not.toContain("聊天生成失败");
    expect(repairObservationJson).toContain("section_coverage_missing");
    expect(repairObservationJson).toContain("missingSectionsForRoutineOrPlan");
    expect(repairObservationJson).toContain("currentVisibleCoverage");
    expect(repairObservationJson).not.toContain("recoveryDirections");
    expect(repairObservationJson).not.toContain("继续获取缺失 section");
    expect(repairObservationJson).not.toContain("不要再次提交缺少 warmup、training 或 stretch 的 routine / plan visibleOutputs");
    expect(repairObservationJson).not.toContain("必须调用 searchExerciseResources");
    expect(trace).toMatchObject({
      status: "failed",
      finalDecision: {
        status: "recoverable_failure",
        reason: "visible_output_validation_fallback",
        code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
        responseType: "content",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "validation",
          output: expect.objectContaining({ ok: false, code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({
            eventTypes: ["content", "suggested_questions", "done"],
            projectionType: "visible_output_validation_fallback",
            errorCodes: [],
          }),
        }),
      ]),
    });
    expect(visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents).toHaveBeenCalledWith(expect.objectContaining({
      events,
    }));
  });

  it("projects planner timeout failures as budget timeout fallback content", async () => {
    const planner = {
      async decideNext() {
        throw new AgentContractError(AGENT_ERROR_CODES.OVERALL_TIMEOUT, "Provider timed out while waiting for completion.");
      },
    };
    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({ latestUserMessage: "帮我整理一个复杂训练计划", conversationSummary: "" }),
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(events).toEqual([
      { type: "content", content: expect.stringContaining("步骤或信息量超出了当前处理范围") },
      {
        type: "suggested_questions",
        suggestedQuestions: expect.arrayContaining([
          "拆成两步提问",
        ]),
      },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("Provider timed out");
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      finalDecision: {
        status: "recoverable_failure",
        reason: "budget_timeout_fallback",
        code: AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        responseType: "content",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({
            projectionType: "budget_timeout_fallback",
          }),
        }),
      ]),
    });
  });

  it("keeps missing read_recent references inside validator repair boundaries without reading facts", async () => {
    const adapter = new TraceModelAdapter([
      {
        actionCandidate: {
          type: "tool_call",
          toolName: "inspectVisibleTrainingProposals",
          input: { operation: "read_recent" },
        },
      },
      {
        actionCandidate: {
          type: "tool_call",
          toolName: "inspectVisibleTrainingProposals",
          input: { operation: "read_recent", factRef: "" },
        },
      },
    ]);
    const planner = new LlmPlanner(adapter);
    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({ latestUserMessage: "把这些动作帮我组一套30分钟的锻炼。", conversationSummary: "" }),
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const secondModelInput = adapter.calls[1];
    const repairContext = JSON.stringify(secondModelInput.observations);
    const trace = listAiTracesForUser("user-1")[0];
    const serializedTrace = JSON.stringify(trace);

    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({
          code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          message: "聊天服务暂时没能完成这次回复。你可以稍后重试，或把问题缩小后再发一次。",
        }),
      },
      { type: "done" },
    ]);
    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
    expect(repairContext).toContain("schema_validation_failed");
    expect(repairContext).toContain("invalid_literal");
    expect(repairContext).toContain("required_field_missing");
    expect(repairContext).toContain("ref");
    expect(repairContext).not.toContain("payload");
    expect(serializedTrace).toContain(AGENT_ERROR_CODES.INVALID_TOOL_INPUT);
    expect(serializedTrace).not.toContain("handler_error");
    expect(trace).toMatchObject({
      status: "failed",
      finalDecision: {
        status: "hard_failure",
        reason: "unclassified_error_event",
        code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
        responseType: "error",
      },
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "validation",
          output: expect.objectContaining({ ok: false, code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({
            eventTypes: ["error", "done"],
            projectionType: "unclassified_error_event",
            errorCodes: [AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED],
          }),
        }),
      ]),
    });
  });

  it("writes model diagnostics when model parsing fails before a valid action", async () => {
    const invalidAction = createInvalidModelActionCandidate("invalid_json", { message: "Unexpected token" });
    const planner = createTracePlanner([
      {
        actionCandidate: invalidAction,
        parsedAction: undefined,
        parseStatus: "invalid_json",
        failureCode: "invalid_json",
      },
      {
        actionCandidate: invalidAction,
        parsedAction: undefined,
        parseStatus: "invalid_json",
        failureCode: "invalid_json",
      },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({ latestUserMessage: "你好", conversationSummary: "" }),
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(events).toEqual([
      {
        type: "error",
        error: expect.objectContaining({
          code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          message: "聊天服务暂时没能完成这次回复。你可以稍后重试，或把问题缩小后再发一次。",
        }),
      },
      { type: "done" },
    ]);
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "failed",
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "model_response",
          status: "failed",
          output: expect.objectContaining({
            parseStatus: "invalid_json",
            failureCode: "invalid_json",
            runtimeLinkage: expect.objectContaining({
              terminalStatus: "failed",
              terminalErrorCode: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
            }),
          }),
        }),
      ]),
    });
  });
});

function createTracePlanner(candidates: TraceAdapterCandidate[]) {
  return new LlmPlanner(new TraceModelAdapter(candidates));
}

function readActionType(action: unknown) {
  return isRecord(action) && typeof action.type === "string" ? action.type : undefined;
}

function readToolName(action: unknown) {
  return isRecord(action) && typeof action.toolName === "string" ? action.toolName : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function createExerciseResourceSearchResult(overrides: Record<string, unknown> = {}) {
  const exercise = createExerciseResourceSummary();

  const queryOverrides = isRecord(overrides.query) ? overrides.query : {};

  return {
    query: {
      suitability: "training",
      published: true,
      sort: "name_asc",
      ...queryOverrides,
    },
    appliedFilters: [{ field: "published", value: true }],
    filterSemantics: [],
    totalMatches: 1,
    returnedCount: 1,
    maxReturned: 12,
    truncated: false,
    excludedCount: 0,
    exercises: [exercise],
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "query")),
  };
}

function createExerciseResourceFacetCatalog(): ExerciseResourceFacetCatalog {
  return {
    muscles: ["胸部", "背部", "肱三头肌", "股四头肌", "臀部", "腹肌"],
    categories: ["strength", "力量"],
    levels: ["beginner", "初级"],
    forces: ["push", "推"],
    mechanics: ["compound", "复合"],
    equipment: ["body only", "自重"],
    homeRequirements: ["none", "无器械"],
    goalTags: ["strength"],
    riskTags: ["shoulder_pain"],
    suitabilities: ["warmup", "training", "stretch"],
  };
}

function createNoEquipmentFilterSemantic(requestedValue: string) {
  return {
    field: "equipment" as const,
    requestedValue,
    databaseMapping: {
      equipment: ["body only", "bodyweight"],
      equipmentZh: ["自重"],
    },
    note: "equipment=no_equipment/无器械 表示不需要外部器械；repository 只映射到自重动作字段，不自动附加 homeRequirement 条件。",
  };
}

function createExerciseResourceMentionResult(overrides: Record<string, unknown> = {}) {
  return {
    text: "俯卧撑",
    totalMatches: 1,
    returnedCount: 1,
    maxMatches: 5,
    truncated: false,
    exactMatchCount: 1,
    exercises: [createExerciseResourceSummary()],
    ...overrides,
  };
}

function createExerciseResourceSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "push-up",
    nameEn: "Push-up",
    nameZh: "俯卧撑",
    category: "strength",
    categoryZh: "力量",
    level: "beginner",
    levelZh: "初级",
    force: "push",
    forceZh: "推",
    mechanic: "compound",
    mechanicZh: "复合",
    equipment: "body only",
    equipmentZh: "自重",
    homeRequirement: "home_friendly",
    homeRequirementZh: "适合居家",
    primaryMuscles: ["chest"],
    primaryMusclesZh: ["胸部"],
    secondaryMuscles: ["triceps"],
    secondaryMusclesZh: ["肱三头肌"],
    imageUrls: ["/push-up.png"],
    allowedSections: ["training"],
    goalTags: ["strength"],
    riskTags: [],
    reviewStatus: "human_reviewed",
    isPublished: true,
    ...overrides,
  };
}

function createExerciseRecordForValidation(id: string) {
  const records = {
    "jumping-jack": {
      id,
      nameEn: "Jumping Jack",
      nameZh: "开合跳",
      equipmentZh: "自重",
      primaryMusclesZh: ["全身"],
      imageUrls: [],
      allowedSections: ["warmup"],
      isPublished: true,
    },
    "push-up": {
      id,
      nameEn: "Push-up",
      nameZh: "俯卧撑",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸部"],
      imageUrls: ["/push-up.png"],
      allowedSections: ["training"],
      isPublished: true,
    },
    Pushups: {
      id,
      nameEn: "Pushups",
      nameZh: "俯卧撑",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸部"],
      imageUrls: [],
      allowedSections: ["training"],
      isPublished: true,
    },
    "chest-stretch": {
      id,
      nameEn: "Chest Stretch",
      nameZh: "胸部拉伸",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸部"],
      imageUrls: [],
      allowedSections: ["stretch"],
      isPublished: true,
    },
    "dynamic-back-stretch": {
      id,
      nameEn: "Dynamic Back Stretch",
      nameZh: "动态背部热身",
      equipmentZh: "自重",
      primaryMusclesZh: ["背部"],
      imageUrls: [],
      allowedSections: ["warmup"],
      isPublished: true,
    },
    superman: {
      id,
      nameEn: "Superman",
      nameZh: "超人式",
      equipmentZh: "自重",
      primaryMusclesZh: ["背部"],
      imageUrls: [],
      allowedSections: ["training"],
      isPublished: true,
    },
    "back-stretch": {
      id,
      nameEn: "Back Stretch",
      nameZh: "背部拉伸",
      equipmentZh: "自重",
      primaryMusclesZh: ["背部"],
      imageUrls: [],
      allowedSections: ["stretch"],
      isPublished: true,
    },
    "step-up": {
      id,
      nameEn: "Step-up",
      nameZh: "台阶踏上",
      equipmentZh: "自重",
      primaryMusclesZh: ["股四头肌"],
      imageUrls: [],
      allowedSections: ["training"],
      isPublished: true,
    },
    squat: {
      id,
      nameEn: "Squat",
      nameZh: "深蹲",
      equipmentZh: "自重",
      primaryMusclesZh: ["股四头肌"],
      imageUrls: [],
      allowedSections: ["training"],
      isPublished: true,
    },
    lunge: {
      id,
      nameEn: "Lunge",
      nameZh: "箭步蹲",
      equipmentZh: "自重",
      primaryMusclesZh: ["股四头肌"],
      imageUrls: [],
      allowedSections: ["training"],
      isPublished: true,
    },
    plank: {
      id,
      nameEn: "Plank",
      nameZh: "平板支撑",
      equipmentZh: "自重",
      primaryMusclesZh: ["腹肌"],
      imageUrls: [],
      allowedSections: ["training"],
      isPublished: true,
    },
  } as const;

  return records[id as keyof typeof records];
}

function createRecentVisibleTrainingProposalSummary() {
  return {
    factRef: "fact-previous",
    messageId: "assistant-previous",
    kind: "visible_training_proposal_displayed",
    status: "active",
    schemaVersion: 1,
    createdAt: "2026-06-03T14:30:00.000Z",
    proposalKind: "exercise_selection",
    exerciseItems: [
      { exerciseId: "squat", section: "training", order: 1, nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { exerciseId: "lunge", section: "training", order: 2, nameZh: "箭步蹲", nameEn: "Lunge", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
    ],
  };
}

function createReadableVisibleTrainingProposalFact() {
  const payload = {
    kind: "exercise_selection" as const,
    exerciseItems: [
      { exerciseId: "squat", section: "training" as const, order: 1 },
      { exerciseId: "lunge", section: "training" as const, order: 2 },
    ],
  };

  return {
    ...createRecentVisibleTrainingProposalSummary(),
    userId: "user-1",
    conversationId: "conversation-refresh",
    payload,
    exerciseDetails: [
      { exerciseId: "squat", nameZh: "深蹲", nameEn: "Squat", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
      { exerciseId: "lunge", nameZh: "箭步蹲", nameEn: "Lunge", equipmentZh: "自重", primaryMusclesZh: ["股四头肌"], allowedSections: ["training"], imageUrl: null },
    ],
  };
}

function createVisibleExerciseSelectionOutput(exerciseId: string) {
  return {
    outputType: "visibleTrainingProposal" as const,
    schemaVersion: "1",
    payload: {
      kind: "exercise_selection" as const,
      exerciseItems: [
        { exerciseId, section: "training" as const, order: 1 },
      ],
    },
  };
}

function createVisibleRoutineOutput() {
  return {
    outputType: "visibleTrainingProposal" as const,
    schemaVersion: "1",
    payload: {
      kind: "routine" as const,
      exerciseItems: [
        { exerciseId: "jumping-jack", section: "warmup" as const, order: 1, prescription: createVisiblePrescription("reps", 20) },
        { exerciseId: "push-up", section: "training" as const, order: 1, prescription: createVisiblePrescription("reps", 12) },
        { exerciseId: "chest-stretch", section: "stretch" as const, order: 1, prescription: createVisiblePrescription("duration", 30) },
      ],
    },
  };
}

function createRoutineOutputWithTrainingExercise(trainingExerciseId: string) {
  return createVisibleRoutineOutputForExercises({
    warmupExerciseId: "jumping-jack",
    trainingExerciseId,
    stretchExerciseId: "chest-stretch",
  });
}

function createVisibleRoutineOutputForExercises(input: {
  warmupExerciseId: string;
  trainingExerciseId: string;
  stretchExerciseId: string;
}) {
  return {
    outputType: "visibleTrainingProposal" as const,
    schemaVersion: "1",
    payload: {
      kind: "routine" as const,
      exerciseItems: [
        { exerciseId: input.warmupExerciseId, section: "warmup" as const, order: 1, prescription: createVisiblePrescription("reps", 20) },
        { exerciseId: input.trainingExerciseId, section: "training" as const, order: 1, prescription: createVisiblePrescription("reps", 12) },
        { exerciseId: input.stretchExerciseId, section: "stretch" as const, order: 1, prescription: createVisiblePrescription("duration", 30) },
      ],
    },
  };
}

function createTrainingOnlyRoutineOutput() {
  return {
    outputType: "visibleTrainingProposal" as const,
    schemaVersion: "1",
    payload: {
      kind: "routine" as const,
      exerciseItems: [
        { exerciseId: "push-up", section: "training" as const, order: 1, prescription: createVisiblePrescription("reps", 12) },
      ],
    },
  };
}

function createVisiblePlanOutput() {
  return {
    outputType: "visibleTrainingProposal" as const,
    schemaVersion: "1",
    payload: {
      kind: "plan" as const,
      exerciseItems: [
        { exerciseId: "jumping-jack", section: "warmup" as const, order: 1, prescription: createVisiblePrescription("reps", 20) },
        { exerciseId: "push-up", section: "training" as const, order: 1, prescription: createVisiblePrescription("reps", 12) },
        { exerciseId: "chest-stretch", section: "stretch" as const, order: 1, prescription: createVisiblePrescription("duration", 30) },
      ],
      schedule: {
        cycleLengthDays: 7,
        assignments: [
          { cycleDayIndex: 1, type: "training" as const },
          { cycleDayIndex: 2, type: "rest" as const },
          { cycleDayIndex: 3, type: "training" as const },
          { cycleDayIndex: 4, type: "rest" as const },
          { cycleDayIndex: 5, type: "training" as const },
          { cycleDayIndex: 6, type: "rest" as const },
          { cycleDayIndex: 7, type: "rest" as const },
        ],
      },
    },
  };
}

function createInvalidWarmupRoutineOutput() {
  return {
    outputType: "visibleTrainingProposal" as const,
    schemaVersion: "1",
    payload: {
      kind: "routine" as const,
      exerciseItems: [
        { exerciseId: "Pushups", section: "warmup" as const, order: 1, prescription: createVisiblePrescription("reps", 10) },
        { exerciseId: "squat", section: "training" as const, order: 1, prescription: createVisiblePrescription("reps", 12) },
        { exerciseId: "chest-stretch", section: "stretch" as const, order: 1, prescription: createVisiblePrescription("duration", 30) },
      ],
    },
  };
}

function createVisiblePrescription(mode: "reps" | "duration", target: number) {
  return {
    mode,
    sets: 2,
    target,
    setRestSeconds: 45,
    transitionRestSeconds: 30,
  };
}
