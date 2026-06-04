import { afterEach, describe, expect, it, vi } from "vitest";

import { createToolResultId, executeTool, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
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

  it("executes through the real tool boundary and exposes exerciseId grouped by training", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        muscle: "胸部",
        equipment: "body only",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 2,
      returnedCount: 1,
      exercises: [createExerciseSummary({ id: "push-up", nameZh: "俯卧撑" })],
    }));

    const result = await executeTool({
      tool,
      input: { muscle: "胸部", equipment: "body only", suitabilities: ["training"] },
      run: { runId: "run-search", actor: { userId: "user-1" }, userInput: "找几个徒手胸部训练动作" },
      timeoutMs: 100,
      toolCallId: "tc_search",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
        query: {
          suitabilities: ["training"],
          published: true,
          sort: "name_asc",
          totalMatches: 2,
          returnedCount: 1,
          truncated: false,
          appliedFilters: expect.arrayContaining([
            { field: "suitabilities", value: ["training"] },
            { field: "published", value: true },
          ]),
        },
        groups: {
          training: {
            suitability: "training",
            exercises: [
              expect.objectContaining({
                exerciseId: "push-up",
                nameZh: "俯卧撑",
                imageUrl: "/push-up.png",
                allowedSections: ["training"],
                isPublished: true,
              }),
            ],
          },
        },
        diagnostics: [],
      },
      fulfillment: {
        satisfied: true,
        summary: "按 training 查询到 2 个发布态动作，返回 1 个摘要。",
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

    if (!result.ok) {
      throw new Error("searchExerciseResources should succeed");
    }
    const modelObservation = tool.toModelObservation?.(
      result.output as Parameters<NonNullable<typeof tool.toModelObservation>>[0],
      {
      runId: "run-search",
      actor: { userId: "user-1" },
      toolCallId: "tc_search",
      },
    );
    const serializedObservation = JSON.stringify(modelObservation);
    expect(serializedObservation).toContain("exerciseId");
    expect(serializedObservation).not.toContain("\"id\"");
    expect(serializedObservation).not.toContain("visibleTrainingProposal\":{\"");
    expect(serializedObservation).toContain("最终训练事实只能来自 final_answer.visibleOutputs[]");
  });

  it("queries warmup and stretch in one tool call and returns structured empty diagnostics", async () => {
    const { tool, repository } = await importToolWithRepositoryImplementation(async (input) => {
      const suitability = (input as { suitability?: string }).suitability;
      return createSearchResult({
        query: {
          suitability: suitability as "warmup" | "stretch",
          homeRequirement: "none",
          published: true,
          sort: "name_asc",
        },
        totalMatches: suitability === "warmup" ? 1 : 0,
        returnedCount: suitability === "warmup" ? 1 : 0,
        exercises: suitability === "warmup"
          ? [createExerciseSummary({ id: "jumping-jack", nameZh: "开合跳", allowedSections: ["warmup"] })]
          : [],
      });
    });

    const result = await executeTool({
      tool,
      input: { suitabilities: ["warmup", "stretch"], homeRequirement: "none" },
      run: { runId: "run-groups", actor: { userId: "user-1" }, userInput: "把这些动作编排一下" },
      timeoutMs: 100,
      toolCallId: "tc_groups",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          suitabilities: ["warmup", "stretch"],
          totalMatches: 1,
          returnedCount: 1,
        },
        groups: {
          warmup: {
            exercises: [expect.objectContaining({ exerciseId: "jumping-jack" })],
          },
          stretch: {
            exercises: [],
          },
        },
        diagnostics: [
          {
            suitability: "stretch",
            code: "no_candidates",
            message: expect.stringContaining("stretch 用途当前没有匹配候选"),
          },
        ],
      },
    });
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledTimes(2);
    expect(repository.searchExerciseResourceSummaries.mock.calls.map(([input]) => (input as { suitability: string }).suitability)).toEqual([
      "warmup",
      "stretch",
    ]);
  });

  it("prioritizes requiredExerciseIds inside the existing grouped exercises output", async () => {
    const requiredExercises = [
      createExerciseSummary({ id: "Pushups", nameZh: "俯卧撑", nameEn: "Pushups" }),
      createExerciseSummary({ id: "Bodyweight_Squat", nameZh: "深蹲", nameEn: "Bodyweight Squat", primaryMusclesZh: ["股四头肌"] }),
      createExerciseSummary({ id: "Plank", nameZh: "平板支撑", nameEn: "Plank", primaryMusclesZh: ["腹肌"] }),
    ];
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        q: "俯卧撑",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 1,
      returnedCount: 1,
      exercises: [requiredExercises[0]],
    }), requiredExercises);

    const result = await executeTool({
      tool,
      input: {
        q: "俯卧撑",
        suitabilities: ["training"],
        requiredExerciseIds: ["Pushups", "Bodyweight_Squat", "Plank"],
      },
      run: { runId: "run-required-exercises", actor: { userId: "user-1" }, userInput: "包含俯卧撑、深蹲和平板支撑" },
      timeoutMs: 100,
      toolCallId: "tc_required",
    });

    expect(repository.getExerciseResourceSummariesByIds).toHaveBeenCalledWith(["Pushups", "Bodyweight_Squat", "Plank"]);
    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          requiredExerciseIds: ["Pushups", "Bodyweight_Squat", "Plank"],
          appliedFilters: expect.arrayContaining([
            { field: "q", value: "俯卧撑" },
            { field: "requiredExerciseIds", value: ["Pushups", "Bodyweight_Squat", "Plank"] },
          ]),
          totalMatches: 3,
          returnedCount: 3,
        },
        groups: {
          training: {
            totalMatches: 3,
            returnedCount: 3,
            exercises: [
              { exerciseId: "Pushups" },
              { exerciseId: "Bodyweight_Squat" },
              { exerciseId: "Plank" },
            ],
          },
        },
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "required_exercise_filter_mismatch", exerciseId: "Bodyweight_Squat", conflictFields: ["q"] }),
          expect.objectContaining({ code: "required_exercise_filter_mismatch", exerciseId: "Plank", conflictFields: ["q"] }),
        ]),
      },
    });

    if (!result.ok) {
      throw new Error("searchExerciseResources should succeed");
    }
    const projectionJson = JSON.stringify(result.projection);
    expect(projectionJson).toContain("groups");
    expect(projectionJson).toContain("requiredExerciseIds");
    expect(projectionJson).not.toContain("requiredMatches");
    expect(projectionJson).not.toContain("supplementalMatches");
    expect(projectionJson).not.toContain("selectedRequiredExercises");
    expect(projectionJson).not.toContain("embedding");
  });

  it("diagnoses required exercise boundary conflicts without adding parallel output fields", async () => {
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        level: "beginner",
        equipment: "body only",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }), [
      createExerciseSummary({ id: "draft-exercise", isPublished: false }),
      createExerciseSummary({ id: "warmup-only", allowedSections: ["warmup"] }),
      createExerciseSummary({ id: "excluded-exercise" }),
      createExerciseSummary({ id: "Dumbbell_Bench", nameZh: "哑铃卧推", level: "intermediate", levelZh: "中级", equipment: "dumbbell", equipmentZh: "哑铃" }),
    ]);

    const result = await executeTool({
      tool,
      input: {
        suitabilities: ["training"],
        level: "beginner",
        equipment: "body only",
        excludeExerciseIds: ["excluded-exercise"],
        requiredExerciseIds: [
          "missing-exercise",
          "draft-exercise",
          "warmup-only",
          "excluded-exercise",
          "Dumbbell_Bench",
        ],
      },
      run: { runId: "run-required-diagnostics", actor: { userId: "user-1" }, userInput: "指定动作冲突测试" },
      timeoutMs: 100,
      toolCallId: "tc_required_diagnostics",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        groups: {
          training: {
            exercises: [{ exerciseId: "Dumbbell_Bench" }],
          },
        },
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "required_exercise_not_found", exerciseId: "missing-exercise" }),
          expect.objectContaining({ code: "required_exercise_unpublished", exerciseId: "draft-exercise" }),
          expect.objectContaining({ code: "required_exercise_section_conflict", exerciseId: "warmup-only", conflictFields: ["suitabilities"] }),
          expect.objectContaining({ code: "required_exercise_excluded", exerciseId: "excluded-exercise" }),
          expect.objectContaining({
            code: "required_exercise_filter_mismatch",
            exerciseId: "Dumbbell_Bench",
            conflictFields: ["level", "equipment"],
          }),
        ]),
      },
    });
  });

  it("rejects legacy suitability input and unsupported suitabilities before handler execution", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult());

    await expect(executeTool({
      tool,
      input: { suitability: "training" },
      run: { runId: "run-legacy-input", actor: { userId: "user-1" }, userInput: "练胸" },
      timeoutMs: 100,
      toolCallId: "tc_legacy",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();

    await expect(executeTool({
      tool,
      input: { suitabilities: ["cooldown"] },
      run: { runId: "run-bad-input", actor: { userId: "user-1" }, userInput: "放松" },
      timeoutMs: 100,
      toolCallId: "tc_bad",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();
  });

  it("renders search results as tool_result only and does not save final proposal facts from candidates", async () => {
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: { suitability: "training", published: true, sort: "name_asc" },
      exercises: [createExerciseSummary({ id: "plank", nameZh: "平板支撑" })],
    }));
    const registry = new ToolRegistry();
    registry.register(tool);
    const toolInput = { muscle: "核心", suitabilities: ["training"] };
    const expectedToolResultId = createToolResultId("run-runtime-search", "searchExerciseResources", hashNormalizedInput(toolInput));
    const result = await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
        { type: "final_answer", content: "找到平板支撑这类核心训练动作。", usedToolResultIds: [expectedToolResultId] },
      ]),
      run: {
        runId: "run-runtime-search",
        actor: { userId: "user-1" },
        userInput: "找几个核心训练动作",
        limits: { maxSteps: 3 },
      },
    });
    const events = renderAgentResponseEvents(result);
    const serializedEvents = JSON.stringify(events);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_result", toolName: "searchExerciseResources" }),
      { type: "content", content: "找到平板支撑这类核心训练动作。" },
      { type: "done" },
    ]));
    expect(serializedEvents).toContain("exerciseId");
    expect(serializedEvents).not.toContain("visibleTrainingProposal");
    expect(serializedEvents).not.toContain("prescription");
    expect(serializedEvents).not.toContain("schedule");
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

async function importToolWithRepositoryResult(
  result: ExerciseResourceSearchResult,
  requiredExercises: ExerciseResourceSearchResult["exercises"] = [],
) {
  return importToolWithRepositoryImplementation(async () => result, requiredExercises);
}

async function importToolWithRepositoryImplementation(
  implementation: (...args: unknown[]) => Promise<ExerciseResourceSearchResult>,
  requiredExercises: ExerciseResourceSearchResult["exercises"] = [],
) {
  vi.resetModules();
  const searchExerciseResourceSummaries = vi.fn(implementation);
  const getExerciseResourceSummariesByIds = vi.fn(async () => requiredExercises);
  vi.doMock(repositoryPath, () => ({
    searchExerciseResourceSummaries,
    getExerciseResourceSummariesByIds,
  }));
  const toolModule = await import("@/lib/server/agent-tools/exercises/search-exercise-resources.tool");

  return {
    tool: toolModule.searchExerciseResourcesTool,
    repository: {
      searchExerciseResourceSummaries,
      getExerciseResourceSummariesByIds,
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
