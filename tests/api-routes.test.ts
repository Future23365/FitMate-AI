import { beforeEach, describe, expect, it, vi } from "vitest";

import { createChatConversation, createExercise, createWorkoutRoutine, createWorkoutSchedule } from "./fixtures/domain";

const traceMocks = vi.hoisted(() => ({
  startAiTrace: vi.fn(() => ({
    id: "trace-1",
    addStep: vi.fn(),
    finish: vi.fn(),
    update: vi.fn(),
  })),
  summarizeLatestUserMessage: vi.fn(() => "最新用户消息"),
}));
const exerciseServiceMocks = vi.hoisted(() => ({
  exerciseBodyRegionValues: ["upper_body", "lower_body", "core", "full_body"],
  getExerciseById: vi.fn(),
  getExerciseFacets: vi.fn(),
  listAllExercises: vi.fn(),
  listExercises: vi.fn(),
}));
const exerciseRepositoryMocks = vi.hoisted(() => ({
  getExerciseRecordsByIds: vi.fn(),
  getExerciseResourceSummariesByIds: vi.fn(async () => []),
  isBodyweightExerciseResourceEquipment: vi.fn((exercise) => exercise.equipment === "body only" || exercise.equipmentZh === "自重"),
  isNoEquipmentResourceQueryValue: vi.fn((value) => value === "no_equipment" || value === "无器械"),
  isRemovedNoEquipmentHomeRequirementValue: vi.fn((value) => ["none", "no_equipment", "无器械"].includes(value)),
  normalizeExerciseResourceFacetCatalogForPlanner: vi.fn((catalog) => catalog),
  readExerciseResourceFacetCatalog: vi.fn(async () => ({
    muscles: [],
    categories: [],
    levels: [],
    forces: [],
    mechanics: [],
    equipment: [],
    homeRequirements: [],
    goalTags: [],
    riskTags: [],
    suitabilities: ["warmup", "training", "stretch"],
  })),
  resolveExerciseResourceMentionSummaries: vi.fn(),
  searchExerciseResourceSummaries: vi.fn(),
}));
const workoutPersistenceMocks = vi.hoisted(() => ({
  createWorkoutSchedule: vi.fn(),
  deleteWorkoutRoutine: vi.fn(),
  deleteWorkoutSchedule: vi.fn(),
  getWorkoutRoutineById: vi.fn(),
  getWorkoutScheduleById: vi.fn(),
  listWorkoutRoutines: vi.fn(),
  listWorkoutSchedules: vi.fn(),
  saveWorkoutSessionResult: vi.fn(),
  saveWorkoutRoutine: vi.fn(),
  updateWorkoutScheduleStatus: vi.fn(),
}));
const chatHistoryMocks = vi.hoisted(() => ({
  deleteChatConversation: vi.fn(),
  getChatConversationById: vi.fn(),
  listChatConversations: vi.fn(),
  saveChatConversation: vi.fn(),
}));
const artifactMocks = vi.hoisted(() => ({
  listRecentArtifactSummariesForCurrentUser: vi.fn(),
}));
const visibleTrainingProposalFactStoreMocks = vi.hoisted(() => ({
  listRecentVisibleTrainingProposalSummaries: vi.fn(async () => []),
  persistVisibleTrainingProposalFactsFromEvents: vi.fn(async () => ({ ok: true, savedCount: 0 })),
  readVisibleTrainingProposalFact: vi.fn(),
}));
const usageSummaryServiceMocks = vi.hoisted(() => ({
  recordAiTokenUsageSummary: vi.fn(async () => ({ ok: true as const })),
}));
const currentUserMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({
  authErrorToApiResponse: vi.fn(() => Response.json(
    { ok: false, code: "unauthenticated", error: "Authentication is required.", message: "Authentication is required." },
    { status: 401 },
  )),
  requireCurrentUser: vi.fn(async () => ({ id: "user-1", displayName: "匿名用户" })),
}));

vi.mock("@/lib/server/dev/ai-trace-logger", () => traceMocks);
vi.mock("@/lib/server/exercises/exercise-service", () => exerciseServiceMocks);
vi.mock("@/lib/server/exercises/exercise-repository", () => exerciseRepositoryMocks);
vi.mock("@/lib/server/workouts/workout-persistence-service", () => workoutPersistenceMocks);
vi.mock("@/lib/server/chat/chat-history-service", () => chatHistoryMocks);
vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactMocks);
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
vi.mock("@/lib/server/usage/ai-token-usage-summary-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/usage/ai-token-usage-summary-service")>();

  return {
    ...actual,
    recordAiTokenUsageSummary: usageSummaryServiceMocks.recordAiTokenUsageSummary,
  };
});
vi.mock("@/lib/server/users/current-user", () => currentUserMocks);
vi.mock("@/lib/server/auth/local-anonymous-auth", () => authMocks);

const chatRoute = await import("@/app/api/chat/route");
const exercisesRoute = await import("@/app/api/exercises/route");
const exerciseDetailRoute = await import("@/app/api/exercises/[id]/route");
const workoutRoutinesRoute = await import("@/app/api/workout-routines/route");
const workoutRoutineDetailRoute = await import("@/app/api/workout-routines/[id]/route");
const workoutSchedulesRoute = await import("@/app/api/workout-schedules/route");
const workoutScheduleDetailRoute = await import("@/app/api/workout-schedules/[id]/route");
const workoutScheduleResultRoute = await import("@/app/api/workout-schedules/[id]/result/route");
const conversationsRoute = await import("@/app/api/chat/conversations/route");
const conversationDetailRoute = await import("@/app/api/chat/conversations/[id]/route");

describe("API route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue([createExercise({ id: "push-up" })]);
    exerciseServiceMocks.listExercises.mockResolvedValue({ items: [], total: 0 });
    exerciseServiceMocks.getExerciseFacets.mockResolvedValue({ categories: [] });
    exerciseServiceMocks.getExerciseById.mockResolvedValue(createExercise({ id: "push-up" }));
    workoutPersistenceMocks.listWorkoutRoutines.mockResolvedValue([createWorkoutRoutine()]);
    workoutPersistenceMocks.getWorkoutRoutineById.mockResolvedValue(createWorkoutRoutine({ id: "workout-1" }));
    workoutPersistenceMocks.saveWorkoutRoutine.mockImplementation(async (workout) => workout);
    workoutPersistenceMocks.listWorkoutSchedules.mockResolvedValue([createWorkoutSchedule()]);
    workoutPersistenceMocks.getWorkoutScheduleById.mockResolvedValue(createWorkoutSchedule({ id: "session-1" }));
    workoutPersistenceMocks.createWorkoutSchedule.mockImplementation(async (session) => session);
    workoutPersistenceMocks.updateWorkoutScheduleStatus.mockResolvedValue(createWorkoutSchedule({ status: "completed" }));
    workoutPersistenceMocks.saveWorkoutSessionResult.mockResolvedValue({ id: "result-1", status: "completed" });
    chatHistoryMocks.listChatConversations.mockResolvedValue([createChatConversation()]);
    chatHistoryMocks.getChatConversationById.mockResolvedValue(createChatConversation({ id: "conversation-1" }));
    chatHistoryMocks.saveChatConversation.mockImplementation(async (conversation) => conversation);
    artifactMocks.listRecentArtifactSummariesForCurrentUser.mockResolvedValue([]);
    currentUserMocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    authMocks.requireCurrentUser.mockResolvedValue({ id: "user-1", displayName: "匿名用户" });
    usageSummaryServiceMocks.recordAiTokenUsageSummary.mockResolvedValue({ ok: true });
    exerciseRepositoryMocks.resolveExerciseResourceMentionSummaries.mockResolvedValue(createMentionResolutionResult());
    exerciseRepositoryMocks.getExerciseRecordsByIds.mockImplementation(async (ids: readonly string[]) => (
      ids.flatMap((id) => (id === "push-up" ? [createExerciseFactRecord(id)] : []))
    ));
  });

  it("validates /api/chat body and returns stable configuration errors without model configuration", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const invalid = await chatRoute.POST(jsonRequest("/api/chat", { latestUserMessage: "" }));
    await expect(invalid.json()).resolves.toMatchObject({ code: "validation_failed" });

    const valid = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "练胸",
      conversationSummary: "用户想练胸。",
    }));
    expect(valid.status).toBe(503);
    const events = parseNdjson(await valid.text());

    expect(events).toMatchObject([
      { type: "error", error: { code: "chat_ai_not_configured" } },
      { type: "done" },
    ]);
    expect(exerciseRepositoryMocks.readExerciseResourceFacetCatalog).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain("chat_ai_disabled");
    expect(traceMocks.startAiTrace).toHaveBeenCalledTimes(1);
    expect(traceMocks.startAiTrace).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/chat",
      userId: "user-1",
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "LangChain Agent Runtime 摘要",
      type: "error",
      status: "failed",
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.finish).toHaveBeenCalledWith(
      "failed",
      expect.objectContaining({ reason: "transport_config_failure", responseType: "error" }),
    );
  });

  it("streams /api/chat final answers from the production text Agent flow", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      model: "deepseek-v4-flash",
      choices: [
          {
            message: {
              role: "assistant",
              content: "可以，今天先做低强度胸部训练。",
            },
          },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 8,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "练胸",
      conversationSummary: "用户想练胸。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-1",
    }));
    const rawEvents = parseNdjson(await response.text());
    const events = rawEvents.filter((event) => event.type !== "agent_progress" && event.type !== "agent_loop");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(rawEvents[0]).toMatchObject({
      type: "agent_progress",
      stage: "preparing_context",
    });
    expect(events).toEqual([
      { type: "content", content: "可以，今天先做低强度胸部训练。" },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("assistant_action");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const modelRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(modelRequest).toMatchObject({
      model: "deepseek-v4-flash",
      tools: expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "searchExerciseResources" }),
        }),
      ]),
    });
    expect(JSON.stringify(modelRequest)).not.toContain("readFixture");
    expect(JSON.stringify(modelRequest)).not.toContain("m1ResourceProducer");
    expect(traceMocks.startAiTrace).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/chat",
      userId: "user-1",
      sessionId: "conversation-1",
      messageId: "assistant-1",
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "LangChain Agent Runtime 摘要",
      type: "runtime_event",
      output: expect.objectContaining({
        traceSummary: expect.objectContaining({
          runtimeVersion: "langchain-agent-runtime-v1",
        }),
      }),
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "response_write",
      output: expect.objectContaining({ eventTypes: ["content", "done"] }),
      metadata: expect.objectContaining({
        projectionType: "content",
        pipeline: "langchain-agent-text-chat",
      }),
    }));
  });

  it("runs native DeepSeek tool calls through the LangChain production tool catalog", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_resolve_1",
                  type: "function",
                  function: {
                    name: "resolveExerciseResourceMentions",
                    arguments: JSON.stringify({
                      mentions: [{ text: "俯卧撑", sectionHint: "training" }],
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: "已确认动作库里有俯卧撑，可以作为主训练候选。",
            },
          },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "我想做俯卧撑",
      conversationSummary: "用户想练上肢。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-tool-1",
    }));
    const rawEvents = parseNdjson(await response.text());
    const events = rawEvents.filter((event) => event.type !== "agent_progress" && event.type !== "agent_loop");

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: "content", content: "已确认动作库里有俯卧撑，可以作为主训练候选。" },
      { type: "done" },
    ]);
    expect(exerciseRepositoryMocks.resolveExerciseResourceMentionSummaries).toHaveBeenCalledWith({
      text: "俯卧撑",
      maxMatches: 5,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstModelRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const secondModelRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(firstModelRequest.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function: expect.objectContaining({ name: "resolveExerciseResourceMentions" }),
      }),
    ]));
    expect(JSON.stringify(secondModelRequest.messages)).toContain("tool");
    expect(JSON.stringify(secondModelRequest.messages)).toContain("Pushups");
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "LangChain Agent Runtime 摘要",
      output: expect.objectContaining({
        traceSummary: expect.objectContaining({
          providerToolCalls: [
            expect.objectContaining({
              id: "call_resolve_1",
              name: "resolveExerciseResourceMentions",
            }),
          ],
          toolCallCount: 1,
        }),
      }),
    }));
  });

  it("projects provider failures into safe NDJSON fallback events", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("provider connection failed"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "练胸",
      conversationSummary: "用户想练胸。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-provider-failure",
    }));
    const rawEvents = parseNdjson(await response.text());
    const events = rawEvents.filter((event) => event.type !== "agent_progress" && event.type !== "agent_loop");

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: "content", content: expect.stringContaining("模型服务暂时不可用") },
      { type: "suggested_questions", suggestedQuestions: ["为什么没成功？", "你再试试", "要不换个别的？"] },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("provider connection failed");
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "LangChain Agent Runtime 摘要",
      type: "error",
      status: "failed",
    }));
  });

  it("keeps trace write failures non-fatal for /api/chat responses", async () => {
    traceMocks.startAiTrace.mockReturnValueOnce({
      id: "trace-throws",
      addStep: vi.fn(() => {
        throw new Error("trace write failed");
      }),
      finish: vi.fn(),
      update: vi.fn(),
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      model: "deepseek-v4-flash",
      choices: [
        {
          message: {
            role: "assistant",
            content: "trace 写入失败也不影响回复。",
          },
        },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "练胸",
      conversationSummary: "用户想练胸。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-trace-failure",
    }));
    const rawEvents = parseNdjson(await response.text());
    const events = rawEvents.filter((event) => event.type !== "agent_progress" && event.type !== "agent_loop");

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: "content", content: "trace 写入失败也不影响回复。" },
      { type: "done" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps invalid provider tool arguments inside the LangChain repair loop", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_invalid_search",
                  type: "function",
                  function: {
                    name: "searchExerciseResources",
                    arguments: JSON.stringify({
                      muscles: ["胸部"],
                      published: false,
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: "工具参数需要修正，我不会把这次查询当作成功事实。",
            },
          },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "练胸",
      conversationSummary: "用户想练胸。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-invalid-tool",
    }));
    const rawEvents = parseNdjson(await response.text());
    const events = rawEvents.filter((event) => event.type !== "agent_progress" && event.type !== "agent_loop");

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: "content", content: "工具参数需要修正，我不会把这次查询当作成功事实。" },
      { type: "done" },
    ]);
    expect(exerciseRepositoryMocks.searchExerciseResourceSummaries).not.toHaveBeenCalled();
    const secondModelRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(JSON.stringify(secondModelRequest.messages)).toContain("tool_schema_invalid");
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "LangChain Agent Runtime 摘要",
      output: expect.objectContaining({
        traceSummary: expect.objectContaining({
          providerToolCalls: [
            expect.objectContaining({
              id: "call_invalid_search",
              name: "searchExerciseResources",
            }),
          ],
          toolCallCount: 1,
        }),
        toolExecutions: [
          expect.objectContaining({
            toolName: "searchExerciseResources",
            status: "failed",
            failureCode: "tool_schema_invalid",
          }),
        ],
      }),
    }));
  });

  it("projects validated visible training proposals from the LangChain finalization tool", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_submit_visible_1",
                  type: "function",
                  function: {
                    name: "submitVisibleTrainingProposal",
                    arguments: JSON.stringify({
                      outputType: "visibleTrainingProposal",
                      schemaVersion: "1",
                      payload: {
                        kind: "exercise_selection",
                        exerciseItems: [
                          { exerciseId: "push-up", section: "training", order: 1 },
                        ],
                      },
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: "已生成一个经过校验的训练动作卡片。",
            },
          },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "给我一个练胸动作卡片",
      conversationSummary: "用户想练胸。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-visible-output",
    }));
    const rawEvents = parseNdjson(await response.text());
    const events = rawEvents.filter((event) => event.type !== "agent_progress" && event.type !== "agent_loop");

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: "content", content: "已生成一个经过校验的训练动作卡片。" },
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: expect.objectContaining({
          kind: "exercise_selection",
          exerciseItems: [expect.objectContaining({ exerciseId: "push-up", section: "training" })],
        }),
        content: expect.objectContaining({
          sections: [
            expect.objectContaining({
              section: "training",
              items: [
                expect.objectContaining({
                  exerciseId: "push-up",
                  exercise: expect.objectContaining({ nameZh: "俯卧撑" }),
                }),
              ],
            }),
          ],
        }),
      }),
      { type: "done" },
    ]);
    expect(exerciseRepositoryMocks.getExerciseRecordsByIds).toHaveBeenCalledWith(["push-up"]);
    expect(visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "assistant-visible-output",
      events: [expect.objectContaining({ type: "visible_output" })],
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "LangChain Agent Runtime 摘要",
      output: expect.objectContaining({
        structuredOutputValidation: { validatedVisibleOutputCount: 1 },
      }),
    }));
    expect(traceMocks.startAiTrace.mock.results[0].value.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "response_write",
      metadata: expect.objectContaining({ visibleOutputCount: 1 }),
    }));
  });

  it("keeps rejected visible training proposals out of NDJSON visible outputs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_submit_invalid_visible",
                  type: "function",
                  function: {
                    name: "submitVisibleTrainingProposal",
                    arguments: JSON.stringify({
                      outputType: "visibleTrainingProposal",
                      schemaVersion: "1",
                      payload: {
                        kind: "exercise_selection",
                        exerciseItems: [
                          { exerciseId: "missing-exercise", section: "training", order: 1 },
                        ],
                      },
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              role: "assistant",
              content: "这个动作没通过数据库校验，我不会生成训练卡片。",
            },
          },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await chatRoute.POST(jsonRequest("/api/chat", {
      latestUserMessage: "给我一个不存在动作的卡片",
      conversationSummary: "用户想练胸。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-visible-output-invalid",
    }));
    const rawEvents = parseNdjson(await response.text());
    const events = rawEvents.filter((event) => event.type !== "agent_progress" && event.type !== "agent_loop");
    const secondModelRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: "content", content: "这个动作没通过数据库校验，我不会生成训练卡片。" },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("visible_output");
    expect(JSON.stringify(secondModelRequest.messages)).toContain("structured_output_validation_failed");
    expect(visibleTrainingProposalFactStoreMocks.persistVisibleTrainingProposalFactsFromEvents).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "assistant-visible-output-invalid",
      events: [],
    }));
  });

  it("handles exercise resource routes", async () => {
    const badList = await exercisesRoute.GET(new Request("http://localhost/api/exercises?page=0"));
    expect(badList.status).toBe(400);

    const list = await exercisesRoute.GET(new Request("http://localhost/api/exercises?q=push&page=1&suitability=stretch"));
    await expect(list.json()).resolves.toMatchObject({ items: [], facets: { categories: [] } });
    expect(exerciseServiceMocks.listExercises).toHaveBeenCalledWith(expect.objectContaining({ q: "push", page: 1, suitability: "stretch" }));
    expect(exerciseServiceMocks.getExerciseFacets).toHaveBeenCalledWith(expect.objectContaining({ suitability: "stretch" }));

    const detail = await exerciseDetailRoute.GET(new Request("http://localhost/api/exercises/push-up"), params("push-up"));
    await expect(detail.json()).resolves.toMatchObject({ item: { id: "push-up" } });

    exerciseServiceMocks.getExerciseById.mockResolvedValueOnce(null);
    const missing = await exerciseDetailRoute.GET(new Request("http://localhost/api/exercises/missing"), params("missing"));
    expect(missing.status).toBe(404);
  });

  it("handles workout and workout session resource routes", async () => {
    await expect((await workoutRoutinesRoute.GET(new Request("http://localhost/api/workout-routines"))).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await workoutRoutinesRoute.POST(jsonRequest("/api/workout-routines", createWorkoutRoutine()))).json()).resolves.toMatchObject({
      item: { id: "workout-routine-1" },
    });
    await expect((await workoutRoutineDetailRoute.GET(new Request("http://localhost"), params("workout-1"))).json()).resolves.toMatchObject({
      item: { id: "workout-1" },
    });
    await workoutRoutineDetailRoute.PUT(jsonRequest("/api/workout-routines/workout-1", createWorkoutRoutine({ id: "ignored" })), params("workout-1"));
    expect(workoutPersistenceMocks.saveWorkoutRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "workout-1" }),
      expect.objectContaining({ id: "user-1" }),
    );
    expect((await workoutRoutineDetailRoute.DELETE(new Request("http://localhost"), params("workout-1"))).status).toBe(204);

    await expect((await workoutSchedulesRoute.GET(new Request("http://localhost/api/workout-schedules"))).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await workoutSchedulesRoute.POST(jsonRequest("/api/workout-schedules", createWorkoutSchedule()))).json()).resolves.toMatchObject({
      item: { id: "schedule-1" },
    });
    await expect((await workoutScheduleDetailRoute.PATCH(jsonRequest("/api/workout-schedules/session-1", { status: "completed" }), params("session-1"))).json()).resolves.toMatchObject({
      item: { status: "completed" },
    });
    await expect(
      (await workoutScheduleResultRoute.PUT(jsonRequest("/api/workout-schedules/session-1/result", {
        completedExerciseCount: 1,
        completedStepCount: 2,
        durationSeconds: 120,
        endedAt: "2026-05-25T10:02:00.000Z",
        estimatedCalories: 20,
        startedAt: "2026-05-25T10:00:00.000Z",
        totalExerciseCount: 1,
        totalStepCount: 2,
      }), params("session-1"))).json(),
    ).resolves.toMatchObject({ item: { id: "result-1" } });
    expect((await workoutScheduleDetailRoute.DELETE(new Request("http://localhost"), params("session-1"))).status).toBe(204);
  });

  it("handles chat conversation resource routes", async () => {
    await expect((await conversationsRoute.GET(new Request("http://localhost/api/chat/conversations"))).json()).resolves.toMatchObject({ items: [expect.any(Object)] });
    await expect((await conversationsRoute.POST(jsonRequest("/api/chat/conversations", createChatConversation()))).json()).resolves.toMatchObject({
      item: { id: "conversation-1" },
    });
    await expect((await conversationDetailRoute.GET(new Request("http://localhost"), params("conversation-1"))).json()).resolves.toMatchObject({
      item: { id: "conversation-1" },
    });
    await conversationDetailRoute.PUT(
      jsonRequest("/api/chat/conversations/conversation-1", createChatConversation({ id: "ignored" })),
      params("conversation-1"),
    );
    expect(chatHistoryMocks.saveChatConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
      expect.objectContaining({ id: "user-1" }),
    );
    expect((await conversationDetailRoute.DELETE(new Request("http://localhost"), params("conversation-1"))).status).toBe(204);
  });

  it("rejects private API routes before calling business services when unauthenticated", async () => {
    authMocks.requireCurrentUser.mockRejectedValueOnce(new Error("Authentication is required."));

    const response = await conversationsRoute.GET(new Request("http://localhost/api/chat/conversations"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "unauthenticated" });
    expect(chatHistoryMocks.listChatConversations).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function params(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}

function parseNdjson(text: string) {
  return text.trim().split("\n").map((line) => JSON.parse(line));
}

function createMentionResolutionResult() {
  return {
    text: "俯卧撑",
    totalMatches: 1,
    returnedCount: 1,
    maxMatches: 5,
    truncated: false,
    exactMatchCount: 1,
    exercises: [
      {
        id: "Pushups",
        nameEn: "Pushups",
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
        homeRequirement: "none",
        homeRequirementZh: "无器械",
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
      },
    ],
  };
}

function createExerciseFactRecord(id: string) {
  return {
    id,
    nameZh: "俯卧撑",
    nameEn: "Push-Up",
    equipmentZh: "自重",
    primaryMusclesZh: ["胸大肌"],
    allowedSections: ["training"],
    imageUrls: ["https://example.test/push-up.jpg"],
    isPublished: true,
  };
}
