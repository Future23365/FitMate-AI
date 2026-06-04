import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chatRequestSchema,
  prepareChatRequest,
} from "@/lib/server/chat/chat-service";
import {
  createAgentTextChatResponse,
  createProductionAgentTextChatPlanner,
} from "@/lib/server/chat/agent-text-chat-service";
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
import { createChatConversation } from "./fixtures/domain";

const exerciseResourceRepositoryMocks = vi.hoisted(() => ({
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
  toJsonValue: (value: unknown) => JSON.parse(JSON.stringify(value)),
}));

const productionToolNames = ["readRecentVisibleTrainingProposal", "searchExerciseResources"];

async function readNdjsonEvents(response: Response) {
  const text = await response.text();

  return text.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
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
    const events = await readNdjsonEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(events).toEqual([
      { type: "content", content: "可以，今天先做轻量胸部训练。" },
      { type: "done" },
    ]);
    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(productionToolNames);
    expect(planner.calls[0].run).toMatchObject({
      actor: { userId: "user-1" },
      userInput: "今天练胸",
      metadata: {
        hydration: expect.objectContaining({ source: "latest_message" }),
      },
      limits: expect.objectContaining({
        maxToolCalls: 10,
      }),
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
          toolCount: 2,
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
            toolCount: 2,
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
    const events = await readNdjsonEvents(response);

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
      bodyRegions: undefined,
      goalTag: undefined,
      riskTag: undefined,
      excludeExerciseIds: undefined,
      published: true,
      sort: "name_asc",
    });
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "success",
      input: expect.objectContaining({
        registry: expect.objectContaining({
          toolCount: 2,
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

  it("refreshes visible training proposals by reading prior visible fact and excluding prior exercise ids", async () => {
    const readInput = { factRef: "fact-previous" };
    const searchInput = {
      bodyRegions: ["lower_body"],
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
        bodyRegions: ["lower_body"],
        suitability: "training",
        excludeExerciseIds: ["squat", "lunge"],
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "bodyRegions", value: ["lower_body"] },
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
      latestUserMessage: "再推荐一批",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "readRecentVisibleTrainingProposal", input: readInput },
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

    expect(planner.calls[0].run.metadata).toMatchObject({
      recentVisibleTrainingProposals: [
        expect.objectContaining({
          factRef: "fact-previous",
          proposalKind: "exercise_selection",
        }),
      ],
    });
    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-refresh",
      factRef: "fact-previous",
      messageId: undefined,
    });
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      bodyRegions: ["lower_body"],
      suitability: "training",
      excludeExerciseIds: ["squat", "lunge"],
      published: true,
    }));
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "readRecentVisibleTrainingProposal",
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

  it("recovers from duplicate successful read/import without resource duplicate hard failure", async () => {
    const readInput = { factRef: "fact-previous" };
    const searchInput = {
      bodyRegions: ["lower_body"],
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
        bodyRegions: ["lower_body"],
        suitability: "training",
        excludeExerciseIds: ["squat", "lunge"],
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "bodyRegions", value: ["lower_body"] },
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
      { type: "tool_call", toolName: "readRecentVisibleTrainingProposal", input: readInput },
      { type: "tool_call", toolName: "readRecentVisibleTrainingProposal", input: readInput },
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
    const duplicateFeedback = planner.calls[2].observations.find((observation) => (
      observation.source === "runtime"
      && JSON.stringify(observation.content).includes(AGENT_ERROR_CODES.DUPLICATE_TOOL_SUCCESS)
    ));

    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledTimes(1);
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      bodyRegions: ["lower_body"],
      suitability: "training",
      excludeExerciseIds: ["squat", "lunge"],
      published: true,
    }));
    expect(duplicateFeedback).toMatchObject({
      toolName: "readRecentVisibleTrainingProposal",
      content: expect.objectContaining({
        code: AGENT_ERROR_CODES.DUPLICATE_TOOL_SUCCESS,
      }),
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "readRecentVisibleTrainingProposal",
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
      bodyRegions: ["lower_body"],
      muscle: "胸部",
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
        bodyRegions: ["lower_body"],
        muscle: "胸部",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "bodyRegions", value: ["lower_body"] },
        { field: "muscle", value: "胸部" },
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
      bodyRegions: ["full_body"],
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
          bodyRegions: ["full_body"],
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

  it("explains shortage when no more exercises remain after excluding displayed ids", async () => {
    const readInput = { factRef: "fact-previous" };
    const searchInput = {
      bodyRegions: ["lower_body"],
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
        bodyRegions: ["lower_body"],
        suitability: "training",
        excludeExerciseIds: ["squat", "lunge"],
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "bodyRegions", value: ["lower_body"] },
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
      { type: "tool_call", toolName: "readRecentVisibleTrainingProposal", input: readInput },
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
      expect.objectContaining({ type: "tool_result", toolName: "readRecentVisibleTrainingProposal" }),
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

  it("lets the planner recover when refresh fact lookup fails without server text routing", async () => {
    const invalidReadInput = { factRef: "cbf_previous_response" };
    visibleTrainingProposalFactStoreMocks.listRecentVisibleTrainingProposalSummaries.mockResolvedValueOnce([]);
    visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact.mockRejectedValueOnce(new Error("Prisma read failed."));
    const prepared = prepareChatRequest({
      conversationId: "conversation-refresh-empty",
      responseMessageId: "assistant-refresh-empty",
      latestUserMessage: "换一批",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "readRecentVisibleTrainingProposal", input: invalidReadInput },
      { type: "final_answer", content: "我这里没有可读取的上一轮推荐记录，你可以告诉我想换哪类动作，我再按条件帮你找。", usedToolResultIds: [] },
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
    expect(visibleTrainingProposalFactStoreMocks.readVisibleTrainingProposalFact).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: "conversation-refresh-empty",
      factRef: "cbf_previous_response",
      messageId: undefined,
    });
    expect(exerciseResourceRepositoryMocks.searchExerciseResourceSummaries).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: "content", content: "我这里没有可读取的上一轮推荐记录，你可以告诉我想换哪类动作，我再按条件帮你找。" },
      { type: "done" },
    ]);
    expect(serializedTrace).toContain("fact_store_read_failed");
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
                toolName: "readRecentVisibleTrainingProposal",
                ok: true,
                satisfied: false,
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
          toolCount: 2,
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
    const events = await readNdjsonEvents(response);

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
  const exercise = {
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
  };

  const queryOverrides = isRecord(overrides.query) ? overrides.query : {};

  return {
    query: {
      suitability: "training",
      published: true,
      sort: "name_asc",
      ...queryOverrides,
    },
    appliedFilters: [{ field: "published", value: true }],
    expandedMuscles: [],
    totalMatches: 1,
    returnedCount: 1,
    maxReturned: 12,
    truncated: false,
    excludedCount: 0,
    exercises: [exercise],
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "query")),
  };
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

function createVisiblePrescription(mode: "reps" | "duration", target: number) {
  return {
    mode,
    sets: 2,
    target,
    setRestSeconds: 45,
    transitionRestSeconds: 30,
  };
}
