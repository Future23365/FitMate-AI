import { afterEach, describe, expect, it, vi } from "vitest";

import { agentRuntimeConfig } from "@/lib/server/config";
import { buildExerciseResourceFilterApplication } from "@/lib/server/exercises/exercise-resource-filter-policy";
import type {
  ExerciseResourceSearchInput,
  ExerciseResourceSearchResult,
  ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";

const repositoryPath = "@/lib/server/exercises/exercise-repository";

describe("searchExerciseResources LangChain tool", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
  });

  it("returns section-scoped exercise facts with model/user/trace projections", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary()],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部"],
        equipment: "no_equipment",
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
      { toolCallId: "tc_search" },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["胸部"],
      equipment: "no_equipment",
      suitability: "training",
      maxReturned: agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection,
      sort: "name_asc",
    }));
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.not.objectContaining({
      published: expect.anything(),
    }));
    expect(result.record).toMatchObject({
      toolCallId: "tc_search",
      toolName: "searchExerciseResources",
      status: "succeeded",
      userProjection: {
        status: "succeeded",
        suitabilities: ["training"],
        totalMatches: 1,
        returnedCount: 1,
      },
      traceSummary: {
        status: "succeeded",
        suitabilities: ["training"],
        totalMatches: 1,
        returnedCount: 1,
        groups: {
          training: {
            zeroMatchMuscles: [],
          },
        },
      },
    });
    expect(modelMessage).toMatchObject({
      status: "succeeded",
      factLevel: "section_scoped_exercise_facts",
      suitabilities: ["training"],
      query: {
        muscles: ["胸部"],
        equipment: "no_equipment",
        sort: "name_asc",
      },
      returnedCount: 1,
      groups: {
        training: {
          returnedCount: 1,
          zeroMatchMuscles: [],
          exercises: [
            {
              exerciseId: "Pushups",
              nameZh: "俯卧撑",
              allowedSections: ["training"],
            },
          ],
        },
      },
      groupSemantics: {
        groupKey: "groups.<section>",
      },
    });
    expect(modelMessage).not.toHaveProperty("totalMatches");
    expect(modelMessage).not.toHaveProperty("maxReturned");
    expect(modelMessage).not.toHaveProperty("truncated");
    expect(modelMessage.groups.training).not.toHaveProperty("totalMatches");
    expect(modelMessage.groups.training).not.toHaveProperty("maxReturned");
    expect(modelMessage.groups.training).not.toHaveProperty("truncated");
    expect(modelMessage).not.toHaveProperty("fulfillment");
    expect(modelMessage).not.toHaveProperty("satisfied");
    expect(modelMessage).not.toHaveProperty("supportSectionCompletionBoundary");
    expect(modelMessage).not.toHaveProperty("visibleDeliveryBoundary");
    expect(modelMessage).not.toHaveProperty("supportsOutputKinds");
    expect(modelMessage).not.toHaveProperty("published");
    expect(modelMessage.appliedFilters).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ field: "published" }),
      ]),
    );
    const modelJson = JSON.stringify(modelMessage);
    expect(modelJson).not.toContain("instructionsZh");
    expect(modelJson).not.toContain("embedding");
    expect(modelJson).not.toContain("缺少 warmup 或 stretch");
    expect(modelJson).not.toContain("结构化收口工具");
    expect(modelJson).not.toContain("continue_tool_call");
  });

  it("projects zeroMatchMuscles in model, user and trace summaries without exposing handler internals", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [
          createExerciseSummary({ id: "Pushups", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
          createExerciseSummary({ id: "InvertedRow", nameZh: "反向划船", nameEn: "Inverted Row", primaryMusclesZh: ["背部"], primaryMuscles: ["back"] }),
        ],
        totalMatches: 2,
        zeroMatchMuscles: ["肩部"],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部", "背部", "肩部"],
        equipment: "no_equipment",
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(modelMessage.groups.training.zeroMatchMuscles).toEqual(["肩部"]);
    expect(modelMessage.groupSemantics.zeroMatchMusclesBoundary).toContain("当前 section");
    expect(modelMessage.groupSemantics.zeroMatchMusclesBoundary).toContain("诊断事实");
    expect(modelMessage.groupSemantics.zeroMatchMusclesBoundary).toContain("解释、澄清或调整查询");
    expect(modelMessage.groupSemantics.zeroMatchMusclesBoundary).toContain("不表示动作库永久缺失");
    expect(modelMessage.groupSemantics.zeroMatchMusclesBoundary).toContain("必须继续补查每个肌群");
    expect(result.record.userProjection).toMatchObject({
      groups: {
        training: {
          zeroMatchMuscles: ["肩部"],
          exercises: [
            { exerciseId: "Pushups" },
            { exerciseId: "InvertedRow" },
          ],
        },
      },
    });
    expect(result.record.traceSummary).toMatchObject({
      groups: {
        training: {
          zeroMatchMuscles: ["肩部"],
          returnedCount: 2,
        },
      },
    });
    const projectedJson = JSON.stringify(result.record);
    expect(projectedJson).not.toContain("instructionsZh");
    expect(projectedJson).not.toContain("embedding");
    expect(projectedJson).not.toContain("candidatePool");
    expect(projectedJson).not.toContain("handlerOutput");
  });

  it("keeps zeroMatchMuscles empty when the query has one or no muscle filters", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary()],
      }),
    });

    for (const input of [
      { muscles: ["胸部"], suitabilities: ["training"], sort: "name_asc" },
      { suitabilities: ["training"], sort: "name_asc" },
    ]) {
      const result = await executeLangChainToolWrapper(
        tool,
        input,
        { actor: { userId: "user-1", conversationId: "conversation-1" } },
      );
      const modelMessage = JSON.parse(result.modelMessage);

      expect(modelMessage.groups.training.zeroMatchMuscles).toEqual([]);
    }
  });

  it("does not infer zeroMatchMuscles from muscles missing in the final returned list", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary({ id: "Pushups", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] })],
        totalMatches: 4,
        zeroMatchMuscles: [],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部", "背部"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(modelMessage.groups.training.exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual(["Pushups"]);
    expect(modelMessage.groups.training.zeroMatchMuscles).toEqual([]);
  });

  it("prioritizes requiredExerciseIds and reports filter mismatch diagnostics", async () => {
    const requiredExercise = createExerciseSummary({
      id: "Plank",
      nameZh: "平板支撑",
      nameEn: "Plank",
      primaryMusclesZh: ["腹肌"],
      primaryMuscles: ["abdominals"],
    });
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      getByIdsImplementation: async () => [requiredExercise],
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary()],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部"],
        equipment: "no_equipment",
        suitabilities: ["training"],
        requiredExerciseIds: ["Plank"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.getExerciseResourceSummariesByIds).toHaveBeenCalledWith(["Plank"]);
    expect(modelMessage.groups.training.exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual([
      "Plank",
      "Pushups",
    ]);
    expect(modelMessage.diagnostics).toEqual([
      expect.objectContaining({
        suitability: "training",
        code: "required_exercise_filter_mismatch",
        exerciseId: "Plank",
        conflictFields: ["muscles"],
      }),
    ]);
    expect(modelMessage.positiveAnchorBoundary).toContain("requiredExerciseIds");
  });

  it("marks default-only searches as diagnostic instead of fulfilled facts", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary()],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      { sort: "name_asc" },
      { actor: { userId: "user-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(modelMessage).toMatchObject({
      factLevel: "diagnostic",
      querySpecificity: {
        status: "too_broad",
      },
    });
    expect(modelMessage).not.toHaveProperty("fulfillment");
    expect(JSON.stringify(modelMessage)).not.toContain("satisfied");
  });

  it("rejects invalid fields and removed published input before repository execution", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({ query: input }),
    });

    for (const input of [
      { muscles: ["胸部"], limit: 10 },
      { muscles: ["胸部"], homeRequirement: "无器械" },
    ]) {
      const result = await executeLangChainToolWrapper(
        tool,
        input,
        { actor: { userId: "user-1" } },
      );

      expect(result.record).toMatchObject({
        toolName: "searchExerciseResources",
        status: "failed",
        failureCode: "tool_schema_invalid",
      });
    }

    const removedPublishedResult = await executeLangChainToolWrapper(
      tool,
      { muscles: ["胸部"], published: false },
      { actor: { userId: "user-1" } },
    );
    const modelMessage = JSON.parse(removedPublishedResult.modelMessage);

    expect(removedPublishedResult.record).toMatchObject({
      toolName: "searchExerciseResources",
      status: "failed",
      failureCode: "tool_schema_invalid",
      schemaIssues: [
        expect.objectContaining({
          path: "$",
          code: "unrecognized_keys",
          keys: ["published"],
        }),
      ],
    });
    expect(modelMessage).toMatchObject({
      status: "failed",
      code: "tool_schema_invalid",
      issues: [
        expect.objectContaining({
          path: "$",
          code: "unrecognized_keys",
          keys: ["published"],
        }),
      ],
    });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();
  });

  it("keeps excluded exercises out of section groups when balanced candidates fill the result", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [
          createExerciseSummary({ id: "Pushups", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
          createExerciseSummary({ id: "InvertedRow", nameZh: "反向划船", nameEn: "Inverted Row", primaryMusclesZh: ["背部"], primaryMuscles: ["back"] }),
        ],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部", "背部"],
        excludeExerciseIds: ["ExcludedPushup"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      excludeExerciseIds: ["ExcludedPushup"],
    }));
    expect(modelMessage.groups.training.exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).not.toContain("ExcludedPushup");
  });

  it("keeps multi-muscle coverage guidance inside the tool contract without phrasing triggers", async () => {
    const { tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({ query: input }),
    });
    const modelVisibleText = [
      tool.description,
      JSON.stringify(tool.inputSchema),
    ].join("\n");

    expect(modelVisibleText).toContain("多 muscles 查询用于获得代表性候选覆盖");
    expect(modelVisibleText).toContain("zeroMatchMuscles 是诊断事实");
    expect(modelVisibleText).toContain("不是必须继续补查每个肌群的义务");
    expect(modelVisibleText).toContain("homeRequirement 只表示环境、场地或支撑条件");
    expect(modelVisibleText).toContain("只在用户目标、上下文、已验证事实或当前规划确实需要该条件时填写");
    expect(modelVisibleText).not.toContain("全身");
    expect(modelVisibleText).not.toContain("当用户说");
    expect(modelVisibleText).not.toContain("关键词");
    expect(modelVisibleText).not.toContain("短句模板");
  });
});

async function importToolWithRepositoryImplementation(input: {
  searchImplementation: (input: ExerciseResourceSearchInput) => Promise<ExerciseResourceSearchResult>;
  getByIdsImplementation?: (ids: readonly string[]) => Promise<ExerciseResourceSummary[]>;
}) {
  vi.resetModules();
  const searchExerciseResourceSummaries = vi.fn(input.searchImplementation);
  const getExerciseResourceSummariesByIds = vi.fn(input.getByIdsImplementation ?? (async () => []));
  vi.doMock(repositoryPath, () => ({
    getExerciseResourceSummariesByIds,
    isBodyweightExerciseResourceEquipment: (exercise: Pick<ExerciseResourceSummary, "equipment" | "equipmentZh">) => exercise.equipment === "body only" || exercise.equipmentZh === "自重",
    isNoEquipmentResourceQueryValue: (value: string) => value === "no_equipment" || value === "无器械",
    isRemovedNoEquipmentHomeRequirementValue: (value: string) => ["none", "no_equipment", "无器械"].includes(value),
    normalizeExerciseResourceFacetCatalogForPlanner: (catalog: unknown) => catalog,
    resolveExerciseResourceMentionSummaries: vi.fn(),
    searchExerciseResourceSummaries,
  }));
  const [{ executeLangChainToolWrapper }, toolModule] = await Promise.all([
    import("@/lib/server/langchain-agent/tool-wrapper"),
    import("@/lib/server/langchain-agent/tools/exercise-resource-tools"),
  ]);

  return {
    executeLangChainToolWrapper,
    tool: toolModule.searchExerciseResourcesLangChainTool,
    repository: {
      getExerciseResourceSummariesByIds,
      searchExerciseResourceSummaries,
    },
  };
}

function createSearchResult(input: {
  query: ExerciseResourceSearchInput;
  exercises?: ExerciseResourceSummary[];
  totalMatches?: number;
  zeroMatchMuscles?: string[];
}): ExerciseResourceSearchResult {
  const exercises = input.exercises ?? [];
  const filterApplication = buildExerciseResourceFilterApplication(input.query);

  return {
    query: input.query,
    appliedFilters: [],
    filterApplication,
    filterSemantics: input.query.equipment === "no_equipment"
      ? [{
        field: "equipment",
        requestedValue: "no_equipment",
        databaseMapping: {
          equipment: ["body only", "bodyweight"],
          equipmentZh: ["自重"],
        },
        note: "no_equipment 映射到自重动作。",
      }]
      : [],
    zeroMatchMuscles: input.zeroMatchMuscles ?? [],
    totalMatches: input.totalMatches ?? exercises.length,
    returnedCount: exercises.length,
    maxReturned: input.query.maxReturned ?? agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection,
    truncated: false,
    excludedCount: input.query.excludeExerciseIds?.length ?? 0,
    exercises,
  };
}

function createExerciseSummary(overrides: Partial<ExerciseResourceSummary> = {}): ExerciseResourceSummary {
  return {
    id: overrides.id ?? "Pushups",
    nameEn: overrides.nameEn ?? "Pushups",
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
    riskTags: overrides.riskTags ?? [],
    reviewStatus: overrides.reviewStatus ?? "human_reviewed",
    isPublished: overrides.isPublished ?? true,
  };
}
