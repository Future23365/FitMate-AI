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
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import type { JsonValue } from "@/lib/server/agent-core/contracts";
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
      factRef: summary.factRef,
      messageId: summary.messageId,
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
    expect(planner.calls[0].manifests.find((manifest) => manifest.name === "searchExerciseResources")).toMatchObject({
      metadata: {
        facetCatalog: expect.objectContaining({
          muscles: expect.arrayContaining(["胸部", "股四头肌"]),
          equipment: expect.arrayContaining(["body only", "自重"]),
          suitabilities: ["warmup", "training", "stretch"],
        }),
      },
    });
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
      { type: "final_answer", content: "可以参考俯卧撑。", usedToolResultIds: [expectedToolResultId] },
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
      muscle: undefined,
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
      equipment: "body only",
      homeRequirement: "none",
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
        equipment: "body only",
        homeRequirement: "none",
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
        usedToolResultIds: [expectedSearchToolResultId],
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
      equipment: "body only",
      homeRequirement: "none",
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
    const readInput = { operation: "read_recent" as const, factRef: "fact-previous" };
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
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);
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
        usedToolResultIds: [expectedSearchToolResultId],
        visibleOutputs: [createVisibleExerciseSelectionOutput("step-up")],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const listObservationForPlanner = planner.calls[1].observations.find((observation) => (
      observation.toolName === "inspectVisibleTrainingProposals" &&
      JSON.stringify(observation.content).includes("\"list_recent\"")
    ));
    const readObservationForPlanner = planner.calls[2].observations.find((observation) => (
      observation.toolName === "inspectVisibleTrainingProposals" &&
      JSON.stringify(observation.content).includes("\"read_recent\"")
    ));
    const searchObservationForPlanner = planner.calls[3].observations.find((observation) => (
      observation.toolName === "searchExerciseResources"
    ));

    expect(planner.calls[0].run.metadata).toMatchObject({
      recentVisibleTrainingProposals: [
        expect.objectContaining({
          factRef: "fact-previous",
          proposalKind: "exercise_selection",
          sectionSummary: { warmup: 0, training: 2, stretch: 0 },
          reusableTrainingExerciseCount: 2,
        }),
      ],
    });
    expect(planner.calls[0].run.userInput).toBe("不要刚才那套，重新来一套");
    expect(planner.calls).toHaveLength(4);
    expect(listObservationForPlanner).toMatchObject({
      ok: true,
      content: expect.objectContaining({ operation: "list_recent" }),
    });
    expect(readObservationForPlanner).toMatchObject({
      ok: true,
      content: expect.objectContaining({
        operation: "read_recent",
        currentRunImport: expect.objectContaining({ imported: true }),
      }),
    });
    expect(searchObservationForPlanner).toMatchObject({
      ok: true,
      content: expect.objectContaining({
        status: "succeeded",
      }),
    });
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("exerciseItems");
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("prescription");
    expect(JSON.stringify(planner.calls[0].run.metadata)).not.toContain("imageUrl");
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
    const readInput = { operation: "read_recent" as const, factRef: "fact-previous" };
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
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);
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
        usedToolResultIds: [expectedSearchToolResultId],
        visibleOutputs: [createVisibleExerciseSelectionOutput("squat")],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const searchObservationForPlanner = planner.calls[3].observations.find((observation) => (
      observation.toolName === "searchExerciseResources"
    ));
    const searchObservationJson = JSON.stringify(searchObservationForPlanner?.content);
    const eventsJson = JSON.stringify(events);

    expect(exerciseResourceRepositoryMocks.getExerciseResourceSummariesByIds).toHaveBeenCalledWith(["squat"]);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      suitability: "training",
      excludeExerciseIds: undefined,
      published: true,
    }));
    expect(searchObservationJson).toContain("positiveAnchorBoundary");
    expect(searchObservationJson).toContain("requiredExerciseIds");
    expect(searchObservationJson).toContain("正向锚点");
    expect(searchObservationJson).not.toContain("本次查询已应用 excludeExerciseIds");
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

  it("keeps section_not_allowed details in visible output repair observations", async () => {
    exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mockResolvedValueOnce(createExerciseResourceSearchResult({
      query: {
        suitability: "training",
        muscle: "胸部",
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
    const searchInput = { muscle: "胸部", suitabilities: ["training" as const] };
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
    const searchObservationJson = JSON.stringify(secondPlannerInput.observations);
    const repairObservation = repairPlannerInput.observations.find((observation) => (
      observation.type === "invalid_action"
      && observation.source === "validator"
      && JSON.stringify(observation.content).includes("section_not_allowed")
    ));
    const repairObservationJson = JSON.stringify(repairObservation?.content);

    expect(searchObservationJson).toContain("groups");
    expect(searchObservationJson).toContain("training");
    expect(searchObservationJson).toContain("Pushups");
    expect(searchObservationJson).toContain("allowedSections");
    expect(searchObservationJson).toContain("groupSemantics");
    expect(repairObservation).toMatchObject({
      ok: false,
      content: {
        code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
        details: {
          index: 0,
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          details: {
            code: "section_not_allowed",
            path: "payload.exerciseItems[0].section",
            exerciseId: "Pushups",
            section: "warmup",
            allowedSections: ["training"],
            currentVisibleCoverage: expect.objectContaining({
              availableSections: ["training"],
              missingSectionsForRoutineOrPlan: ["warmup", "stretch"],
            }),
            recoveryDirections: expect.arrayContaining([
              "继续获取缺失 section 的可消费动作事实。",
              "输出当前事实可支撑的结构。",
            ]),
          },
        },
      },
    });
    expect(repairObservationJson).not.toContain("必须调用 searchExerciseResources");
    expect(repairObservationJson).not.toContain("stack");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_result", toolName: "searchExerciseResources" }),
      { type: "content", content: "当前动作 section 校验没有通过，我会重新基于可用动作事实调整。" },
      { type: "done" },
    ]));
  });

  it("recovers from duplicate successful read/import without resource duplicate hard failure", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, factRef: "fact-previous" };
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
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);
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
        usedToolResultIds: [expectedSearchToolResultId],
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
      && JSON.stringify(observation.content).includes(AGENT_ERROR_CODES.DUPLICATE_TOOL_SUCCESS)
    ));

    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledTimes(1);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["股四头肌", "臀部"],
      suitability: "training",
      excludeExerciseIds: ["squat", "lunge"],
      published: true,
    }));
    expect(duplicateFeedback).toMatchObject({
      toolName: "inspectVisibleTrainingProposals",
      content: expect.objectContaining({
        code: AGENT_ERROR_CODES.DUPLICATE_TOOL_SUCCESS,
      }),
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
    expect(serializedTrace).toContain(AGENT_ERROR_CODES.DUPLICATE_TOOL_SUCCESS);
    expect(serializedTrace).not.toContain("Resource id is already registered in the current run.");
    expect(serializedTrace).not.toContain("\"invalid_action\"");
    expect(JSON.stringify(events)).not.toContain("聊天生成失败");
  });

  it("settles a satisfied exercise search final answer through usedToolResultIds", async () => {
    const searchInput = {
      muscle: "胸部",
      muscles: ["股四头肌"],
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
        muscle: "胸部",
        muscles: ["股四头肌"],
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "muscle", value: "胸部" },
        { field: "muscles", value: ["股四头肌"] },
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
      { type: "final_answer", content: "可以参考三点支撑胸推动作。", usedToolResultIds: [expectedToolResultId] },
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

  it("settles a zero-match exercise search final answer through usedToolResultIds", async () => {
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
      { type: "final_answer", content: "当前发布态动作库没有找到铅球相关动作。", usedToolResultIds: [expectedToolResultId] },
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
      homeRequirement: "none",
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
          homeRequirement: "none",
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
        usedToolResultIds: [expectedToolResultId],
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

  it("renders a plan visible output after composing multiple exercise search observations", async () => {
    const trainingSearchInput = {
      muscle: "胸部",
      equipment: "body only",
      homeRequirement: "none",
      level: "beginner",
      suitabilities: ["training"],
      sort: "name_asc",
    };
    const supportSearchInput = {
      homeRequirement: "none",
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
          muscle: isRecord(input) && typeof input.muscle === "string" ? input.muscle : undefined,
          equipment: isRecord(input) && typeof input.equipment === "string" ? input.equipment : undefined,
          homeRequirement: "none",
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
        usedToolResultIds: [expectedTrainingToolResultId, expectedSupportToolResultId],
        visibleOutputs: [createVisiblePlanOutput()],
      },
    ]);

    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);
    const supportPlannerObservationJson = JSON.stringify(planner.calls[1].observations);
    const finalPlannerObservationJson = JSON.stringify(planner.calls[2].observations);

    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledTimes(3);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries.mock.calls.map(([input]) => (
      isRecord(input) ? input.suitability : undefined
    ))).toEqual(["training", "warmup", "stretch"]);
    expect(supportPlannerObservationJson).toContain("当前结果只提供 training 动作事实");
    expect(supportPlannerObservationJson).toContain("还需要当前 run 可消费的 warmup 和 stretch 动作事实");
    expect(supportPlannerObservationJson).toContain("suitabilities = [\\\"warmup\\\"");
    expect(finalPlannerObservationJson).toContain("push-up");
    expect(finalPlannerObservationJson).toContain("jumping-jack");
    expect(finalPlannerObservationJson).toContain("chest-stretch");
    expect(finalPlannerObservationJson).toContain("missingSectionsForRoutineOrPlan");
    expect(finalPlannerObservationJson).toContain("groups.<section>.exercises[*].exerciseId 可作为 visibleTrainingProp");
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
  });

  it("explains shortage when no more exercises remain after excluding displayed ids", async () => {
    const listInput = { operation: "list_recent" as const };
    const readInput = { operation: "read_recent" as const, factRef: "fact-previous" };
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
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([
      createRecentVisibleTrainingProposalSummary(),
    ]);
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
      { type: "final_answer", content: "当前条件下没有更多未重复的腿部训练动作了，可以放宽器械或训练阶段再找。", usedToolResultIds: [expectedSearchToolResultId] },
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
      { type: "final_answer", content: "我这里没有可读取的上一轮推荐记录，你可以告诉我想换哪类动作，我再按条件帮你找。", usedToolResultIds: [expectedListToolResultId] },
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

  it("projects ask_user into clarification content and assistant_suggestions", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "帮我安排训练",
      conversationSummary: "",
    });
    const planner = createTracePlanner([
      {
        actionCandidate: { type: "ask_user", question: "你今天有多少时间？", suggestions: ["20 分钟", "40 分钟"] },
      },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });

    await expect(readNdjsonEvents(response)).resolves.toEqual([
      { type: "content", content: "你今天有多少时间？" },
      { type: "assistant_suggestions", suggestions: ["20 分钟", "40 分钟"] },
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
            eventTypes: ["content", "assistant_suggestions", "done"],
            suggestionCount: 2,
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

  it("keeps unknown tool requests inside validator and repair boundaries when production registry is non-empty", async () => {
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
      {
        type: "error",
        error: expect.objectContaining({
          code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          message: "聊天生成失败，请稍后重试。",
        }),
      },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("当前未接入的工具");
    expect(JSON.stringify(events)).not.toContain("直接生成、保存或执行训练计划");
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
        status: "hard_failure",
        code: AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
        responseType: "error",
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
            eventTypes: ["error", "done"],
            errorCodes: [AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED],
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
          message: "聊天生成失败，请稍后重试。",
        }),
      },
      { type: "done" },
    ]);
    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).not.toHaveBeenCalled();
    expect(repairContext).toContain("factRef");
    expect(repairContext).toContain("messageId");
    expect(repairContext).toContain("真实引用");
    expect(repairContext).toContain("list_recent");
    expect(repairContext).not.toContain("payload");
    expect(serializedTrace).toContain(AGENT_ERROR_CODES.INVALID_TOOL_INPUT);
    expect(serializedTrace).not.toContain("handler_error");
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
          output: expect.objectContaining({ ok: false, code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT }),
        }),
        expect.objectContaining({
          type: "response_write",
          output: expect.objectContaining({
            eventTypes: ["error", "done"],
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
          message: "聊天生成失败，请稍后重试。",
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
    muscles: ["胸部", "肱三头肌", "股四头肌", "臀部", "腹肌"],
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
