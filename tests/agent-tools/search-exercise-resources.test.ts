import { afterEach, describe, expect, it, vi } from "vitest";

import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { createToolObservation } from "@/lib/server/agent-core/observation";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createToolResultId, executeTool, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import type { ExerciseResourceSearchResult } from "@/lib/server/exercises/exercise-repository";

const repositoryPath = "@/lib/server/exercises/exercise-repository";
const dbPath = "@/lib/server/db/prisma";
type SearchResultOverrides = Omit<Partial<ExerciseResourceSearchResult>, "query"> & {
  query?: Partial<ExerciseResourceSearchResult["query"]>;
};

describe("searchExerciseResources tool", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
    vi.doUnmock(dbPath);
  });

  it("executes through the real tool boundary and returns published exercise summaries", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        muscle: "胸部",
        equipment: "body only",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "muscle", value: "胸部" },
        { field: "equipment", value: "body only" },
        { field: "suitability", value: "training" },
        { field: "published", value: true },
      ],
      totalMatches: 2,
      returnedCount: 1,
      exercises: [createExerciseSummary({ id: "push-up", nameZh: "俯卧撑" })],
    }));

    const result = await executeTool({
      tool,
      input: { muscle: "胸部", equipment: "body only", suitability: "training" },
      run: { runId: "run-search", actor: { userId: "user-1" }, userInput: "找几个徒手胸部训练动作" },
      timeoutMs: 100,
      toolCallId: "tc_search",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
        query: {
          published: true,
          sort: "name_asc",
          totalMatches: 2,
          returnedCount: 1,
          truncated: false,
        },
        exercises: [
          expect.objectContaining({
            id: "push-up",
            nameZh: "俯卧撑",
            imageUrl: "/push-up.png",
            allowedSections: ["training"],
            isPublished: true,
          }),
        ],
      },
      fulfillment: {
        satisfied: true,
        summary: "查询到 2 个发布态动作，返回 1 个摘要。",
      },
    });
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith({
      q: undefined,
      category: undefined,
      suitability: "training",
      level: undefined,
      force: undefined,
      mechanic: undefined,
      equipment: "body only",
      homeRequirement: undefined,
      muscle: "胸部",
      bodyRegions: undefined,
      goalTag: undefined,
      riskTag: undefined,
      excludeExerciseIds: undefined,
      published: true,
      sort: "name_asc",
    });
    expect(JSON.stringify(result)).not.toContain("candidateSetId");
    expect(JSON.stringify(result)).not.toContain("candidate_set");
  });

  it("queries broad lower-body requests through bodyRegions and exposes deterministic expansion", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        bodyRegions: ["lower_body"],
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "suitability", value: "training" },
        { field: "bodyRegions", value: ["lower_body"] },
        { field: "published", value: true },
      ],
      expandedMuscles: ["臀部", "股四头肌", "腘绳肌", "小腿"],
      totalMatches: 2,
      returnedCount: 1,
      exercises: [createExerciseSummary({
        id: "band-squat",
        nameZh: "弹力带深蹲",
        primaryMuscles: ["quadriceps"],
        primaryMusclesZh: ["股四头肌"],
        secondaryMuscles: ["glutes", "hamstrings"],
        secondaryMusclesZh: ["臀部", "腘绳肌"],
      })],
    }));

    const result = await executeTool({
      tool,
      input: { bodyRegions: ["lower_body"], suitability: "training" },
      run: { runId: "run-lower-body", actor: { userId: "user-1" }, userInput: "我想练腿，给我推荐几个动作" },
      timeoutMs: 100,
      toolCallId: "tc_lower_body",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          bodyRegions: ["lower_body"],
          expandedMuscles: ["臀部", "股四头肌", "腘绳肌", "小腿"],
          totalMatches: 2,
          returnedCount: 1,
        },
        exercises: [expect.objectContaining({ id: "band-squat", primaryMusclesZh: ["股四头肌"] })],
      },
      fulfillment: {
        satisfied: true,
      },
    });
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      bodyRegions: ["lower_body"],
      muscle: undefined,
      suitability: "training",
      published: true,
    }));
  });

  it("deduplicates excludeExerciseIds and keeps excluded summaries out of returned exercises", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        bodyRegions: ["lower_body"],
        excludeExerciseIds: ["squat", "lunge"],
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "suitability", value: "training" },
        { field: "bodyRegions", value: ["lower_body"] },
        { field: "excludeExerciseIds", value: ["squat", "lunge"] },
        { field: "published", value: true },
      ],
      excludedCount: 2,
      totalMatches: 1,
      returnedCount: 1,
      exercises: [createExerciseSummary({ id: "step-up", nameZh: "台阶上步" })],
    }));

    const result = await executeTool({
      tool,
      input: {
        bodyRegions: ["lower_body"],
        suitability: "training",
        excludeExerciseIds: ["squat", "squat", "lunge"],
      },
      run: { runId: "run-exclude", actor: { userId: "user-1" }, userInput: "再推荐一批腿部动作，不要重复" },
      timeoutMs: 100,
      toolCallId: "tc_exclude",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          excludeExerciseIds: ["squat", "lunge"],
          excludedCount: 2,
          totalMatches: 1,
          returnedCount: 1,
        },
        exercises: [expect.objectContaining({ id: "step-up" })],
      },
    });
    expect(JSON.stringify(result)).not.toContain("\"id\":\"squat\"");
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      excludeExerciseIds: ["squat", "lunge"],
    }));
  });

  it("rejects invalid or oversized excludeExerciseIds before the handler runs", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult());
    const invalidInputs = [
      { excludeExerciseIds: ["bad id with spaces"] },
      { excludeExerciseIds: Array.from({ length: 51 }, (_, index) => `exercise-${index}`) },
    ];

    for (const input of invalidInputs) {
      const result = await executeTool({
        tool,
        input,
        run: { runId: `run-invalid-exclude-${hashNormalizedInput(input)}`, actor: { userId: "user-1" }, userInput: "invalid" },
        timeoutMs: 100,
        toolCallId: "tc_invalid_exclude",
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT },
      });
    }

    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();
  });

  it("reports zero results after exclusions as completed facts without refilling excluded exercises", async () => {
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        bodyRegions: ["lower_body"],
        excludeExerciseIds: ["squat"],
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      appliedFilters: [
        { field: "suitability", value: "training" },
        { field: "bodyRegions", value: ["lower_body"] },
        { field: "excludeExerciseIds", value: ["squat"] },
        { field: "published", value: true },
      ],
      excludedCount: 1,
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }));

    const result = await executeTool({
      tool,
      input: { bodyRegions: ["lower_body"], suitability: "training", excludeExerciseIds: ["squat"] },
      run: { runId: "run-shortage", actor: { userId: "user-1" }, userInput: "再推荐一批腿部动作" },
      timeoutMs: 100,
      toolCallId: "tc_shortage",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          totalMatches: 0,
          returnedCount: 0,
          excludedCount: 1,
        },
        exercises: [],
      },
      fulfillment: {
        satisfied: true,
        summary: "查询已执行，排除用户已看到动作后当前发布态动作库没有更多匹配结果。",
      },
    });
    expect(JSON.stringify(result)).not.toContain("\"id\":\"squat\"");
    expect(JSON.stringify(result)).not.toContain("candidateSetId");
    expect(JSON.stringify(result)).not.toContain("candidate_set");
  });

  it("rejects unpublished, unknown, pagination and consumption-side fields before the handler runs", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult());
    const invalidInputs = [
      { published: false },
      { bodyRegions: ["legs"] },
      { page: 1 },
      { limit: 20 },
      { maxReturned: 20 },
      { take: 20 },
      { offset: 20 },
      { pageSize: 20 },
      { candidateUse: "routine" },
      { purpose: "existence_check" },
      { queryIntent: "recommendation" },
      { existenceCheck: true },
      { recommendationMode: "list" },
      { resultRequirements: { minCandidates: 3 } },
      { sort: "semantic_desc" },
      { suitability: "cooldown" },
      { unknown: "value" },
    ];

    for (const input of invalidInputs) {
      const result = await executeTool({
        tool,
        input,
        run: { runId: `run-invalid-${hashNormalizedInput(input)}`, actor: { userId: "user-1" }, userInput: "invalid" },
        timeoutMs: 100,
        toolCallId: "tc_invalid",
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT },
      });
    }

    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();
  });

  it("exposes real exact facet guidance and examples without stale homeRequirement values", async () => {
    const { searchExerciseResourcesTool } = await import("@/lib/server/agent-tools/exercises/search-exercise-resources.tool");
    const registry = new ToolRegistry();
    registry.register(searchExerciseResourcesTool);
    const [manifest] = registry.serializeForPlanner();
    const manifestJson = JSON.stringify(manifest);

    expect(manifestJson).toContain("none/无器械");
    expect(manifestJson).toContain("floor/地面/瑜伽垫");
    expect(manifestJson).toContain("small_equipment/居家小器械");
    expect(manifestJson).toContain("body only/自重");
    expect(manifestJson).toContain("dumbbell/哑铃");
    expect(manifestJson).toContain("beginner/初级");
    expect(manifestJson).toContain("totalMatches=0");
    expect(manifestJson).toContain("0 条事实查询结果");
    expect(manifestJson).not.toContain("home_friendly");
    expect(manifestJson).not.toContain("no_equipment");
    expect(manifestJson).not.toContain("existence_check");
    expect(manifestJson).not.toContain("recommendationMode");
    expect(manifest.examples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        input: expect.objectContaining({
          homeRequirement: "none",
        }),
      }),
    ]));
  });

  it("normalizes zero-match facts, handler exceptions and invalid outputs at the tool boundary", async () => {
    const empty = await importToolWithRepositoryResult(createSearchResult({
      query: { q: "不存在动作", published: true, sort: "name_asc" },
      appliedFilters: [
        { field: "q", value: "不存在动作" },
        { field: "published", value: true },
      ],
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }));
    const emptyResult = await executeTool({
      tool: empty.tool,
      input: { q: "不存在动作" },
      run: { runId: "run-empty", actor: { userId: "user-1" }, userInput: "找不存在动作" },
      timeoutMs: 100,
      toolCallId: "tc_empty",
    });

    expect(emptyResult).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
        query: {
          totalMatches: 0,
          returnedCount: 0,
        },
        exercises: [],
      },
      fulfillment: {
        satisfied: true,
        summary: "查询已执行，当前发布态动作库没有匹配结果。",
      },
    });

    const unknownMuscle = await importToolWithRepositoryResult(createSearchResult({
      query: { muscle: "腿部", suitability: "training", published: true, sort: "name_asc" },
      appliedFilters: [
        { field: "suitability", value: "training" },
        { field: "muscle", value: "腿部" },
        { field: "published", value: true },
      ],
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }));
    const unknownMuscleResult = await executeTool({
      tool: unknownMuscle.tool,
      input: { muscle: "腿部", suitability: "training" },
      run: { runId: "run-unknown-muscle", actor: { userId: "user-1" }, userInput: "我想练腿" },
      timeoutMs: 100,
      toolCallId: "tc_unknown_muscle",
    });

    expect(unknownMuscleResult).toMatchObject({
      ok: true,
      output: {
        query: {
          muscle: "腿部",
          totalMatches: 0,
          returnedCount: 0,
        },
      },
      fulfillment: {
        satisfied: true,
        summary: "查询已执行，当前发布态动作库没有匹配结果。",
      },
    });
    expect(createToolObservation(unknownMuscleResult)).toMatchObject({
      ok: true,
      content: expect.objectContaining({
        totalMatches: 0,
        fulfillment: expect.objectContaining({ satisfied: true }),
      }),
    });

    const failing = await importToolWithRepositoryImplementation(async () => {
      throw new Error("database unavailable");
    });
    await expect(executeTool({
      tool: failing.tool,
      input: { q: "胸" },
      run: { runId: "run-handler-fails", actor: { userId: "user-1" }, userInput: "找胸部动作" },
      timeoutMs: 100,
      toolCallId: "tc_fail",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: AGENT_ERROR_CODES.HANDLER_ERROR },
    });

    const invalidOutput = await importToolWithRepositoryResult({
      ...createSearchResult(),
      totalMatches: -1,
    } as never);
    await expect(executeTool({
      tool: invalidOutput.tool,
      input: {},
      run: { runId: "run-invalid-output", actor: { userId: "user-1" }, userInput: "找动作" },
      timeoutMs: 100,
      toolCallId: "tc_invalid_output",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: AGENT_ERROR_CODES.INVALID_TOOL_OUTPUT },
    });
  });

  it("keeps model observation, user projection and rendered events redacted to summaries", async () => {
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      totalMatches: 1,
      returnedCount: 1,
      exercises: [createExerciseSummary({
        id: "stretch-1",
        nameZh: "肩部拉伸",
        allowedSections: ["stretch"],
        imageUrls: ["/stretch.png"],
      })],
    }));
    const result = await executeTool({
      tool,
      input: { q: "肩部", suitability: "stretch" },
      run: { runId: "run-projection", actor: { userId: "user-1" }, userInput: "肩部拉伸动作" },
      timeoutMs: 100,
      toolCallId: "tc_projection",
    });

    if (!result.ok) {
      throw new Error("searchExerciseResources should succeed for projection test");
    }

    const observation = createToolObservation(result);
    const events = renderAgentResponseEvents({
      runId: "run-projection",
      status: "completed",
      terminalAction: {
        type: "final_answer",
        content: "找到 1 个肩部拉伸动作。",
        usedToolResultIds: [result.toolResultId],
      },
      toolResults: [result],
      observations: [observation],
      traceEvents: [],
      steps: 2,
    });
    const surfaces = JSON.stringify({ observation, events });
    const modelObservationJson = JSON.stringify(observation);
    const userProjectionEventJson = JSON.stringify(events[0]);

    expect(observation).toMatchObject({
      toolResultId: result.toolResultId,
      toolName: "searchExerciseResources",
      ok: true,
      content: expect.objectContaining({
        totalMatches: 1,
        returnedCount: 1,
        truncated: false,
        outputSummaryNote: expect.stringContaining("不是下一轮 searchExerciseResources input"),
        finalAnswerGrounding: expect.stringContaining("final_answer.usedToolResultIds"),
        candidateConsumptionBoundary: expect.stringContaining("不是 routine"),
      }),
    });
    expect(events[0]).toMatchObject({
      type: "tool_result",
      toolName: "searchExerciseResources",
      content: expect.objectContaining({
        totalMatches: 1,
        returnedCount: 1,
        maxReturned: 12,
      }),
    });
    expect(modelObservationJson).not.toContain("maxReturned");
    expect(modelObservationJson).not.toContain("pageSize");
    expect(userProjectionEventJson).toContain("maxReturned");
    expect(surfaces).not.toContain("reviewStatus");
    expect(surfaces).not.toContain("secondaryMuscles");
    expect(surfaces).not.toContain("instructionsZh");
    expect(surfaces).not.toContain("candidateSetId");
    expect(surfaces).not.toContain("candidate_set");
    expect(userProjectionEventJson).not.toContain("routine");
    expect(userProjectionEventJson).not.toContain("plan");
  });

  it("runs inside Agent runtime and grounds final answers through usedToolResultIds", async () => {
    const toolInput = { muscle: "核心", suitability: "training" };
    const expectedToolResultId = createToolResultId(
      "run-runtime",
      "searchExerciseResources",
      hashNormalizedInput(toolInput),
    );
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: { muscle: "核心", suitability: "training", published: true, sort: "name_asc" },
      appliedFilters: [
        { field: "muscle", value: "核心" },
        { field: "suitability", value: "training" },
        { field: "published", value: true },
      ],
      totalMatches: 1,
      returnedCount: 1,
      exercises: [createExerciseSummary({ id: "plank", nameZh: "平板支撑", primaryMusclesZh: ["核心"] })],
    }));
    const registry = new ToolRegistry();
    registry.register(tool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
      { type: "final_answer", content: "找到平板支撑这类核心训练动作。", usedToolResultIds: [expectedToolResultId] },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-runtime",
        actor: { userId: "user-1" },
        userInput: "查核心训练动作",
        limits: { maxToolCalls: 1, maxPlannerCalls: 3, maxSteps: 3 },
      },
    });

    expect(planner.calls[0].manifests.map((manifest) => manifest.name)).toEqual(["searchExerciseResources"]);
    expect(result).toMatchObject({
      status: "completed",
      terminalAction: {
        type: "final_answer",
        usedToolResultIds: [expectedToolResultId],
      },
      toolResults: [
        expect.objectContaining({
          toolResultId: expectedToolResultId,
          ok: true,
          fulfillment: expect.objectContaining({ satisfied: true }),
        }),
      ],
    });
    expect(result.replaySummary?.toolResults).toEqual([
      expect.objectContaining({
        toolResultId: expectedToolResultId,
        toolName: "searchExerciseResources",
        ok: true,
      }),
    ]);
  });

  it("grounds zero-match facts through usedToolResultIds without treating them as candidate resources", async () => {
    const toolInput = { q: "铅球" };
    const expectedToolResultId = createToolResultId(
      "run-zero-match",
      "searchExerciseResources",
      hashNormalizedInput(toolInput),
    );
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: { q: "铅球", published: true, sort: "name_asc" },
      appliedFilters: [
        { field: "q", value: "铅球" },
        { field: "published", value: true },
      ],
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }));
    const registry = new ToolRegistry();
    registry.register(tool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
      { type: "final_answer", content: "当前发布态动作库没有找到铅球相关动作。", usedToolResultIds: [expectedToolResultId] },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-zero-match",
        actor: { userId: "user-1" },
        userInput: "有没有铅球动作",
        limits: { maxToolCalls: 1, maxPlannerCalls: 3, maxSteps: 3 },
      },
    });
    const serializedResult = JSON.stringify(result);

    expect(result).toMatchObject({
      status: "completed",
      terminalAction: {
        type: "final_answer",
        usedToolResultIds: [expectedToolResultId],
      },
      toolResults: [
        expect.objectContaining({
          toolResultId: expectedToolResultId,
          ok: true,
          fulfillment: expect.objectContaining({
            satisfied: true,
            summary: "查询已执行，当前发布态动作库没有匹配结果。",
          }),
          output: expect.objectContaining({
            query: expect.objectContaining({
              totalMatches: 0,
              returnedCount: 0,
            }),
            exercises: [],
          }),
        }),
      ],
    });
    expect(serializedResult).not.toContain("candidateSetId");
    expect(serializedResult).not.toContain("candidate_set");
  });

  it("records duplicate tool calls with the same normalized input in trace and replay summaries", async () => {
    const toolInput = { muscle: "核心", suitability: "training" };
    const expectedInputHash = hashNormalizedInput(toolInput);
    const expectedToolResultId = createToolResultId(
      "run-duplicate-trace",
      "searchExerciseResources",
      expectedInputHash,
    );
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: { muscle: "核心", suitability: "training", published: true, sort: "name_asc" },
      appliedFilters: [
        { field: "muscle", value: "核心" },
        { field: "suitability", value: "training" },
        { field: "published", value: true },
      ],
      totalMatches: 1,
      returnedCount: 1,
      exercises: [createExerciseSummary({ id: "plank", nameZh: "平板支撑", primaryMusclesZh: ["核心"] })],
    }));
    const registry = new ToolRegistry();
    registry.register(tool);
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
      { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
      { type: "final_answer", content: "找到平板支撑这类核心训练动作。", usedToolResultIds: [expectedToolResultId] },
    ]);

    const result = await runAgentRuntime({
      registry,
      planner,
      run: {
        runId: "run-duplicate-trace",
        actor: { userId: "user-1" },
        userInput: "查核心训练动作",
        limits: { maxToolCalls: 3, maxPlannerCalls: 4, maxSteps: 4 },
      },
    });

    expect(result.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "duplicate_tool_call",
        toolName: "searchExerciseResources",
        toolVersion: "0.3.1",
        normalizedInputHash: expectedInputHash,
        previousCount: 1,
      }),
    ]));
    expect(result.replaySummary?.duplicateToolCalls).toEqual([
      expect.objectContaining({
        toolName: "searchExerciseResources",
        normalizedInputHash: expectedInputHash,
        previousCount: 1,
      }),
    ]);
  });
});

describe("searchExerciseResourceSummaries repository", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
    vi.doUnmock(dbPath);
  });

  it("pushes filters into Prisma where/count/take/select without full-table reads or vector rerank", async () => {
    const prisma = {
      exercise: {
        count: vi.fn().mockResolvedValue(13),
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 13 }, (_, index) => createRepositoryExerciseRecord({
            id: `exercise-${index + 1}`,
            nameZh: `动作 ${index + 1}`,
          })),
        ),
      },
    };
    vi.doMock(dbPath, () => ({
      isDatabaseConfigured: () => true,
      getPrismaClient: () => prisma,
    }));
    vi.doUnmock(repositoryPath);
    const {
      EXERCISE_RESOURCE_SEARCH_MAX_RETURNED,
      searchExerciseResourceSummaries,
    } = await import("@/lib/server/exercises/exercise-repository");

    const result = await searchExerciseResourceSummaries({
      q: "俯卧撑",
      category: "strength",
      suitability: "training",
      level: "beginner",
      force: "push",
      mechanic: "compound",
      equipment: "body only",
      homeRequirement: "none",
      muscle: "胸部",
      goalTag: "strength",
      riskTag: "shoulder_pain",
      excludeExerciseIds: ["push-up", "squat"],
      bodyRegions: ["lower_body"],
      published: true,
      sort: "name_asc",
    });
    const countArgs = prisma.exercise.count.mock.calls[0][0];
    const findManyArgs = prisma.exercise.findMany.mock.calls[0][0];
    const serializedFindMany = JSON.stringify(findManyArgs);

    expect(countArgs.where).toEqual(findManyArgs.where);
    expect(findManyArgs.take).toBe(EXERCISE_RESOURCE_SEARCH_MAX_RETURNED + 1);
    expect(findManyArgs).not.toHaveProperty("skip");
    expect(findManyArgs.select).toMatchObject({
      id: true,
      nameZh: true,
      imageUrls: true,
      allowedSections: true,
      isPublished: true,
    });
    expect(findManyArgs.select).not.toHaveProperty("instructionsEn");
    expect(findManyArgs.select).not.toHaveProperty("instructionsZh");
    expect(findManyArgs.select).not.toHaveProperty("embedding");
    expect(findManyArgs.where).toMatchObject({
      AND: expect.arrayContaining([
        { isPublished: true },
        { allowedSections: { has: "training" } },
        { goalTags: { has: "strength" } },
        { riskTags: { has: "shoulder_pain" } },
        { id: { notIn: ["push-up", "squat"] } },
      ]),
    });
    expect(serializedFindMany).toContain("\"primaryMusclesZh\":{\"has\":\"股四头肌\"}");
    expect(serializedFindMany).toContain("\"secondaryMusclesZh\":{\"has\":\"腘绳肌\"}");
    expect(serializedFindMany).toContain("\"embeddingText\"");
    expect(serializedFindMany).toContain("\"contains\":\"俯卧撑\"");
    expect(serializedFindMany).not.toContain("pgvector");
    expect(serializedFindMany).not.toContain("Vector DB");
    expect(serializedFindMany).not.toContain("rerank");
    expect(result).toMatchObject({
      totalMatches: 13,
      returnedCount: EXERCISE_RESOURCE_SEARCH_MAX_RETURNED,
      maxReturned: EXERCISE_RESOURCE_SEARCH_MAX_RETURNED,
      truncated: true,
      excludedCount: 2,
      expandedMuscles: expect.arrayContaining(["股四头肌", "腘绳肌", "臀部", "小腿"]),
    });
    expect(result.exercises).toHaveLength(EXERCISE_RESOURCE_SEARCH_MAX_RETURNED);
    expect(result.exercises[0]).toMatchObject({
      id: "exercise-1",
      allowedSections: ["training"],
      isPublished: true,
    });
  });
});

async function importToolWithRepositoryResult(result: ExerciseResourceSearchResult) {
  return importToolWithRepositoryImplementation(async () => result);
}

async function importToolWithRepositoryImplementation(
  implementation: (...args: unknown[]) => Promise<ExerciseResourceSearchResult>,
) {
  vi.resetModules();
  const searchExerciseResourceSummaries = vi.fn(implementation);
  vi.doMock(repositoryPath, () => ({
    searchExerciseResourceSummaries,
  }));
  const toolModule = await import("@/lib/server/agent-tools/exercises/search-exercise-resources.tool");

  return {
    tool: toolModule.searchExerciseResourcesTool,
    repository: {
      searchExerciseResourceSummaries,
    },
  };
}

function createSearchResult(overrides: SearchResultOverrides = {}): ExerciseResourceSearchResult {
  const query = {
    published: true,
    sort: "name_asc" as const,
    ...overrides.query,
  };
  const exercises = overrides.exercises ?? [createExerciseSummary()];

  return {
    query,
    appliedFilters: overrides.appliedFilters ?? [{ field: "published", value: true }],
    totalMatches: overrides.totalMatches ?? exercises.length,
    returnedCount: overrides.returnedCount ?? exercises.length,
    maxReturned: overrides.maxReturned ?? 12,
    truncated: overrides.truncated ?? false,
    excludedCount: overrides.excludedCount ?? 0,
    expandedMuscles: overrides.expandedMuscles ?? [],
    exercises,
  };
}

function createExerciseSummary(overrides: Partial<ExerciseResourceSearchResult["exercises"][number]> = {}) {
  return {
    id: overrides.id ?? "push-up",
    nameEn: overrides.nameEn ?? "Push-up",
    nameZh: overrides.nameZh ?? "俯卧撑",
    category: overrides.category ?? "strength",
    categoryZh: overrides.categoryZh ?? "力量",
    level: overrides.level ?? "beginner",
    levelZh: overrides.levelZh ?? "初级",
    force: overrides.force ?? "push",
    forceZh: overrides.forceZh ?? "推",
    mechanic: overrides.mechanic ?? "compound",
    mechanicZh: overrides.mechanicZh ?? "复合",
    equipment: overrides.equipment ?? "body only",
    equipmentZh: overrides.equipmentZh ?? "自重",
    homeRequirement: overrides.homeRequirement ?? "none",
    homeRequirementZh: overrides.homeRequirementZh ?? "无器械",
    primaryMuscles: overrides.primaryMuscles ?? ["chest"],
    primaryMusclesZh: overrides.primaryMusclesZh ?? ["胸部"],
    secondaryMuscles: overrides.secondaryMuscles ?? ["triceps"],
    secondaryMusclesZh: overrides.secondaryMusclesZh ?? ["肱三头肌"],
    imageUrls: overrides.imageUrls ?? ["/push-up.png"],
    allowedSections: overrides.allowedSections ?? ["training"],
    goalTags: overrides.goalTags ?? ["strength"],
    riskTags: overrides.riskTags ?? ["shoulder_pain"],
    reviewStatus: overrides.reviewStatus ?? "human_reviewed",
    isPublished: overrides.isPublished ?? true,
  } satisfies ExerciseResourceSearchResult["exercises"][number];
}

function createRepositoryExerciseRecord(overrides: Partial<ReturnType<typeof createExerciseSummary>> = {}) {
  return createExerciseSummary(overrides);
}
