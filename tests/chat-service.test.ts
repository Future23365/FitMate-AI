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

vi.mock("@/lib/server/exercises/exercise-repository", () => exerciseResourceRepositoryMocks);

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
    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(["searchExerciseResources"]);
    expect(planner.calls[0].run).toMatchObject({
      actor: { userId: "user-1" },
      userInput: "今天练胸",
      metadata: {
        hydration: expect.objectContaining({ source: "latest_message" }),
      },
      limits: expect.objectContaining({
        maxToolCalls: 1,
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
          toolCount: 1,
          toolNames: ["searchExerciseResources"],
        },
      }),
      steps: expect.arrayContaining([
        expect.objectContaining({
          type: "user_input",
          input: expect.objectContaining({ latestUserMessage: "今天练胸" }),
        }),
        expect.objectContaining({
          type: "runtime_event",
          output: expect.objectContaining({ type: "registry_snapshot", toolCount: 1 }),
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
    const toolInput = { q: "胸", suitability: "training" };
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
      published: true,
      sort: "name_asc",
    });
    expect(listAiTracesForUser("user-1")[0]).toMatchObject({
      status: "success",
      input: expect.objectContaining({
        registry: expect.objectContaining({
          toolCount: 1,
          toolNames: ["searchExerciseResources"],
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

    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(["searchExerciseResources"]);
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
          toolCount: 1,
          toolNames: ["searchExerciseResources"],
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

    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(["searchExerciseResources"]);
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

  return {
    query: {
      published: true,
      sort: "name_asc",
    },
    appliedFilters: [{ field: "published", value: true }],
    expandedMuscles: [],
    totalMatches: 1,
    returnedCount: 1,
    maxReturned: 12,
    truncated: false,
    exercises: [exercise],
    ...overrides,
  };
}
