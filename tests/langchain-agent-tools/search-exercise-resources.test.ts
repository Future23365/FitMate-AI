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
      published: true,
      sort: "name_asc",
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
      },
    });
    expect(modelMessage).toMatchObject({
      status: "succeeded",
      factLevel: "section_scoped_exercise_facts",
      fulfillment: { satisfied: true },
      suitabilities: ["training"],
      totalMatches: 1,
      returnedCount: 1,
      groups: {
        training: {
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
    expect(JSON.stringify(modelMessage)).not.toContain("instructionsZh");
    expect(JSON.stringify(modelMessage)).not.toContain("embedding");
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
      fulfillment: { satisfied: false },
      querySpecificity: {
        status: "too_broad",
      },
    });
  });

  it("rejects invalid fields and unpublished queries before repository execution", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({ query: input }),
    });

    for (const input of [
      { muscles: ["胸部"], limit: 10 },
      { muscles: ["胸部"], published: false },
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
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();
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
