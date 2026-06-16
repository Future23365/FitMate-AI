import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import { buildExerciseResourceFilterApplication } from "@/lib/server/exercises/exercise-resource-filter-policy";
import type {
  ExerciseResourceNameDiagnostic,
  ExerciseResourceSearchInput,
  ExerciseResourceSearchResult,
  ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";

const repositoryPath = "@/lib/server/exercises/exercise-repository";
const prismaPath = "@/lib/server/db/prisma";

describe("searchExerciseResources LangChain tool", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
    vi.doUnmock(prismaPath);
  });

  it("returns candidate exercise facts with model/user/trace projections", async () => {
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
        executionProfile: "no_equipment",
        impactLimit: "low",
        noiseLimit: "quiet",
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
      { toolCallId: "tc_search" },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["胸部"],
      muscleMatchRole: "primary",
      executionProfile: "no_equipment",
      impactLimit: "low",
      noiseLimit: "quiet",
      suitability: "training",
      maxReturned: agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection,
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
        candidateCountPerSection: agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection,
        totalMatches: 1,
        returnedCount: 1,
      },
      traceSummary: {
        status: "succeeded",
        query: expect.objectContaining({
          muscleMatchRole: "primary",
        }),
        suitabilities: ["training"],
        candidateCountPerSection: agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection,
        totalMatches: 1,
        returnedCount: 1,
        candidateGroups: [
          expect.objectContaining({
            suitability: "training",
            zeroMatchMuscles: [],
          }),
        ],
      },
    });
    expect(modelMessage).toMatchObject({
      status: "succeeded",
      factLevel: "candidate",
      query: {
        suitabilities: ["training"],
        muscles: ["胸部"],
        muscleMatchRole: "primary",
        executionProfile: "no_equipment",
        impactLimit: "low",
        noiseLimit: "quiet",
      },
      coverage: {
        hasCandidates: true,
        sectionsWithCandidates: ["training"],
        sectionsWithoutCandidates: [],
        allRequestedSectionsHaveCandidates: true,
        repeatQueryBoundary: expect.stringContaining("重复调用不会新增事实"),
      },
      resourceBoundary: {
        catalogRole: expect.stringContaining("产品可渲染动作资源"),
        emptyResultMeaning: expect.stringContaining("不表示现实训练动作或训练知识不存在"),
        plainTextKnowledgeBoundary: expect.stringContaining("普通文本建议"),
        structuredOutputBoundary: expect.stringContaining("exerciseId 必须来自"),
      },
      candidateGroups: [
        {
          suitability: "training",
          exercises: [
            {
              exerciseId: "Pushups",
              nameZh: "俯卧撑",
              nameEn: "Pushups",
              equipmentZh: "自重",
              homeRequirementZh: "无器械",
              executionTaxonomy: {
                requiresExternalEquipment: false,
                requiredEquipmentTags: [],
                supportRequirementTags: ["none"],
                setupComplexity: "zero_setup",
                impactLevel: "low",
                noiseLevel: "quiet",
              },
              primaryMusclesZh: ["胸部"],
              secondaryMusclesZh: ["肱三头肌"],
              imageUrl: "/push-up.png",
            },
          ],
        },
      ],
    });
    expect(modelMessage).not.toHaveProperty("totalMatches");
    expect(modelMessage).not.toHaveProperty("returnedCount");
    expect(modelMessage).not.toHaveProperty("truncated");
    expect(modelMessage).not.toHaveProperty("excludedCount");
    expect(modelMessage).not.toHaveProperty("maxReturned");
    expect(modelMessage).not.toHaveProperty("querySpecificity");
    expect(modelMessage).not.toHaveProperty("filterSemantics");
    expect(modelMessage).not.toHaveProperty("positiveAnchorBoundary");
    expect(modelMessage).not.toHaveProperty("refreshExclusionBoundary");
    expect(modelMessage).not.toHaveProperty("appliedFilters");
    expect(modelMessage).not.toHaveProperty("filterApplicationBoundary");
    expect(modelMessage).not.toHaveProperty("filterApplications");
    expect(modelMessage).not.toHaveProperty("groups");
    expect(modelMessage).not.toHaveProperty("availableSections");
    expect(modelMessage).not.toHaveProperty("sectionSummary");
    expect(modelMessage).not.toHaveProperty("missingSections");
    expect(modelMessage).not.toHaveProperty("groupSemantics");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("totalMatches");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("returnedCount");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("truncated");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("zeroMatchMuscles");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("maxReturned");
    expect(modelMessage.candidateGroups[0].exercises[0]).not.toHaveProperty("allowedSections");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("allowedSectionsRelation");
    expect(modelMessage).not.toHaveProperty("fulfillment");
    expect(modelMessage).not.toHaveProperty("satisfied");
    expect(modelMessage).not.toHaveProperty("supportSectionCompletionBoundary");
    expect(modelMessage).not.toHaveProperty("visibleDeliveryBoundary");
    expect(modelMessage).not.toHaveProperty("supportsOutputKinds");
    expect(modelMessage).not.toHaveProperty("published");
    expect(modelMessage.coverage).not.toHaveProperty("availableSections");
    expect(modelMessage.coverage).not.toHaveProperty("missingSections");
    expect(modelMessage.coverage.repeatQueryBoundary).not.toContain("searchExerciseResources");
    expect(modelMessage.coverage.repeatQueryBoundary).not.toContain("submitVisibleTrainingProposal");
    expect(modelMessage.resourceBoundary).not.toHaveProperty("missingExerciseNames");
    expect(modelMessage.query).not.toHaveProperty("candidateCountPerSection");
    expect(modelMessage.query).not.toHaveProperty("sort");
    expect(modelMessage.query).not.toHaveProperty("equipment");
    expect(modelMessage.query).not.toHaveProperty("homeRequirement");
    const modelJson = JSON.stringify(modelMessage);
    expectModelVisibleSummaryDoesNotContainMisleadingSearchFields(modelMessage);
    expect(modelJson).not.toContain("instructionsZh");
    expect(modelJson).not.toContain("embedding");
    expect(modelJson).not.toContain("缺少 warmup 或 stretch");
    expect(modelJson).not.toContain("allowedSections");
    expect(modelJson).not.toContain("allowedSectionsRelation");
    expect(modelJson).not.toContain("结构化收口工具");
    expect(modelJson).not.toContain("continue_tool_call");
  });

  it("uses explicit candidateCountPerSection as the repository candidate budget", async () => {
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
        candidateCountPerSection: 10,
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      maxReturned: 10,
    }));
    expect(result.record.userProjection).toMatchObject({
      candidateCountPerSection: 10,
    });
    expect(result.record.traceSummary).toMatchObject({
      candidateCountPerSection: 10,
    });
    expect(modelMessage.query).not.toHaveProperty("candidateCountPerSection");
    expect(modelMessage).not.toHaveProperty("maxReturned");
  });

  it("keeps internal truncation statistics outside the Planner-visible summary", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary()],
        totalMatches: 6,
        truncated: true,
        excludedCount: 2,
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部"],
        candidateCountPerSection: 1,
        excludeExerciseIds: ["OldPushup", "OldRow"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(result.record.userProjection).toMatchObject({
      candidateCountPerSection: 1,
      totalMatches: 6,
      returnedCount: 1,
      truncated: true,
      excludedCount: 2,
    });
    expect(result.record.traceSummary).toMatchObject({
      candidateCountPerSection: 1,
      totalMatches: 6,
      returnedCount: 1,
      candidateGroups: [
        expect.objectContaining({
          totalMatches: 6,
          returnedCount: 1,
          truncated: true,
        }),
      ],
    });
    expectModelVisibleSummaryDoesNotContainMisleadingSearchFields(modelMessage);
  });

  it("keeps zeroMatchMuscles in user and trace summaries without exposing it to Planner", async () => {
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
        executionProfile: "no_equipment",
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    const trainingGroup = findCandidateGroup(modelMessage, "training");

    expect(trainingGroup.exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual([
      "Pushups",
      "InvertedRow",
    ]);
    expect(result.record.userProjection).toMatchObject({
      candidateGroups: expect.arrayContaining([
        expect.objectContaining({
          suitability: "training",
          zeroMatchMuscles: ["肩部"],
          exercises: expect.arrayContaining([
            expect.objectContaining({ exerciseId: "Pushups" }),
            expect.objectContaining({ exerciseId: "InvertedRow" }),
          ]),
        }),
      ]),
    });
    expect(result.record.traceSummary).toMatchObject({
      candidateGroups: [
        expect.objectContaining({
          suitability: "training",
          zeroMatchMuscles: ["肩部"],
          returnedCount: 2,
        }),
      ],
    });
    const projectedJson = JSON.stringify(result.record);
    expect(JSON.stringify(modelMessage)).not.toContain("zeroMatchMuscles");
    expect(projectedJson).not.toContain("instructionsZh");
    expect(projectedJson).not.toContain("embedding");
    expect(projectedJson).not.toContain("candidatePool");
    expect(projectedJson).not.toContain("handlerOutput");
    expect(JSON.stringify(modelMessage)).not.toContain("必须继续补查每个肌群");
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

      expect(findCandidateGroup(modelMessage, "training")).not.toHaveProperty("zeroMatchMuscles");
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

    const trainingGroup = findCandidateGroup(modelMessage, "training");

    expect(trainingGroup.exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual(["Pushups"]);
    expect(trainingGroup).not.toHaveProperty("zeroMatchMuscles");
  });

  it("prioritizes requiredExerciseIds and reports filter mismatch diagnostics", async () => {
    const requiredExercise = createExerciseSummary({
      id: "Plank",
      nameZh: "平板支撑",
      nameEn: "Plank",
      primaryMusclesZh: ["腹肌"],
      primaryMuscles: ["abdominals"],
      requiresExternalEquipment: true,
      requiredEquipmentTags: ["dumbbell"],
      supportRequirementTags: ["floor_or_mat"],
      setupComplexity: "small_equipment",
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
        executionProfile: "no_equipment",
        suitabilities: ["training"],
        requiredExerciseIds: ["Plank"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.getExerciseResourceSummariesByIds).toHaveBeenCalledWith(["Plank"]);
    expect(findCandidateGroup(modelMessage, "training").exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual([
      "Plank",
      "Pushups",
    ]);
    expect(modelMessage).not.toHaveProperty("diagnostics");
    expect(result.record.traceSummary).toMatchObject({
      diagnostics: [
        expect.objectContaining({
          suitability: "training",
          code: "required_exercise_filter_mismatch",
          exerciseId: "Plank",
          conflictFields: ["executionProfile", "muscles"],
        }),
      ],
    });
    expect(result.record.userProjection).toMatchObject({
      diagnostics: [
        expect.objectContaining({
          suitability: "training",
          code: "required_exercise_filter_mismatch",
          exerciseId: "Plank",
          conflictFields: ["executionProfile", "muscles"],
        }),
      ],
    });
    expect(modelMessage).not.toHaveProperty("positiveAnchorBoundary");
  });

  it("queries multiple exerciseNames through candidate groups without parallel name result structures", async () => {
    const namedExercises = [
      createExerciseSummary({ id: "Pushups", nameZh: "俯卧撑", nameEn: "Pushups" }),
      createExerciseSummary({ id: "Bodyweight_Squat", nameZh: "深蹲", nameEn: "Bodyweight Squat", primaryMusclesZh: ["股四头肌"], primaryMuscles: ["quadriceps"] }),
      createExerciseSummary({ id: "Plank", nameZh: "平板支撑", nameEn: "Plank", primaryMusclesZh: ["腹肌"], primaryMuscles: ["abdominals"] }),
    ];
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: namedExercises,
        totalMatches: 3,
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        exerciseNames: ["俯卧撑", "深蹲", "平板支撑"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      exerciseNames: ["俯卧撑", "深蹲", "平板支撑"],
      suitability: "training",
    }));
    expect(modelMessage.query.exerciseNames).toEqual(["俯卧撑", "深蹲", "平板支撑"]);
    expect(findCandidateGroup(modelMessage, "training").exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual([
      "Pushups",
      "Bodyweight_Squat",
      "Plank",
    ]);
    expect(modelMessage).not.toHaveProperty("appliedFilters");
    expect(result.record.userProjection).toMatchObject({
      appliedFilters: expect.arrayContaining([
        { field: "exerciseNames", value: ["俯卧撑", "深蹲", "平板支撑"] },
      ]),
    });
    expect(JSON.stringify(modelMessage)).not.toContain("exerciseNameResults");
    expect(JSON.stringify(modelMessage)).not.toContain("resolvedMentions");
    expect(JSON.stringify(modelMessage)).not.toContain("nameMatches");
  });

  it("keeps exerciseNames diagnostics out of Planner-visible facts while preserving trace diagnostics", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary({ id: "Pushups", nameZh: "俯卧撑" })],
        diagnostics: [
          { code: "exercise_name_not_found", exerciseName: "火星跳跃", totalMatches: 0 },
          { code: "exercise_name_ambiguous", exerciseName: "划船", totalMatches: 3, returnedCount: 2 },
          { code: "exercise_name_filter_mismatch", exerciseName: "平板支撑", conflictFields: ["muscles"], totalMatches: 1 },
          { code: "exercise_name_too_broad", exerciseName: "推", totalMatches: 12, returnedCount: 3 },
        ],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        exerciseNames: ["俯卧撑", "火星跳跃", "划船", "平板支撑"],
        muscles: ["胸部"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(modelMessage).not.toHaveProperty("diagnostics");
    expect(modelMessage.resourceBoundary).toMatchObject({
      missingExerciseNames: ["火星跳跃"],
      emptyResultMeaning: expect.stringContaining("产品动作库没有匹配的可渲染资源"),
    });
    expect(JSON.stringify(modelMessage)).not.toContain("exercise_name_not_found");
    expect(JSON.stringify(modelMessage)).not.toContain("exercise_name_ambiguous");
    expect(JSON.stringify(modelMessage)).not.toContain("exercise_name_filter_mismatch");
    expect(JSON.stringify(modelMessage)).not.toContain("exercise_name_too_broad");
    expect(result.record.traceSummary).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "exercise_name_not_found", exerciseName: "火星跳跃" }),
        expect.objectContaining({ code: "exercise_name_ambiguous", exerciseName: "划船", totalMatches: 3, returnedCount: 2 }),
        expect.objectContaining({ code: "exercise_name_too_broad", exerciseName: "推", totalMatches: 12, returnedCount: 3 }),
      ]),
    });
    expect(result.record.userProjection).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "exercise_name_ambiguous", exerciseName: "划船", totalMatches: 3, returnedCount: 2 }),
        expect.objectContaining({ code: "exercise_name_too_broad", exerciseName: "推", totalMatches: 12, returnedCount: 3 }),
      ]),
    });
    expectModelVisibleSummaryDoesNotContainMisleadingSearchFields(modelMessage);
    expect(JSON.stringify(result.record)).not.toContain("exerciseNameResults");
    expect(JSON.stringify(result.record)).not.toContain("resolvedMentions");
    expect(JSON.stringify(result.record)).not.toContain("nameMatches");
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
    });
    expect(modelMessage).not.toHaveProperty("querySpecificity");
    expect(modelMessage).not.toHaveProperty("fulfillment");
    expect(modelMessage).not.toHaveProperty("groups");
    expect(JSON.stringify(modelMessage)).not.toContain("too_broad");
    expect(JSON.stringify(modelMessage)).not.toContain("satisfied");
  });

  it("projects empty candidates as neutral diagnostics without counts or readiness wording", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [],
        totalMatches: 0,
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(modelMessage).not.toHaveProperty("diagnostics");
    expect(modelMessage.resourceBoundary).toMatchObject({
      catalogRole: expect.stringContaining("产品可渲染动作资源"),
      emptyResultMeaning: expect.stringContaining("不表示现实训练动作或训练知识不存在"),
    });
    expect(modelMessage.coverage).toMatchObject({
      hasCandidates: false,
      sectionsWithCandidates: [],
      sectionsWithoutCandidates: ["training"],
      allRequestedSectionsHaveCandidates: false,
    });
    expect(JSON.stringify(modelMessage)).not.toContain("no_candidates");
    expect(result.record.userProjection).toMatchObject({
      totalMatches: 0,
      returnedCount: 0,
      diagnostics: [
        expect.objectContaining({
          suitability: "training",
          code: "no_candidates",
        }),
      ],
      candidateGroups: [
        expect.objectContaining({
          totalMatches: 0,
          returnedCount: 0,
          truncated: false,
        }),
      ],
    });
    expectModelVisibleSummaryDoesNotContainMisleadingSearchFields(modelMessage);
  });

  it("rejects invalid fields and removed published input before repository execution", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({ query: input }),
    });

    for (const input of [
      { muscles: ["胸部"], limit: 10 },
      { q: "俯卧撑" },
      { muscles: ["胸部"], equipment: "no_equipment" },
      { muscles: ["胸部"], homeRequirement: "无器械" },
      { muscles: ["胸部"], requiresExternalEquipment: false },
      { muscles: ["胸部"], requiredEquipmentTags: ["dumbbell"] },
      { muscles: ["胸部"], supportRequirementTags: ["none", "floor_or_mat"] },
      { muscles: ["胸部"], setupComplexityMax: "zero_setup" },
      { muscles: ["胸部"], impactLevelMax: "low" },
      { muscles: ["胸部"], noiseLevelMax: "quiet" },
      { muscles: ["胸部"], where: { isPublished: true } },
      { muscles: ["胸部"], OR: [{ id: "Pushups" }] },
      { muscles: ["胸部"], candidateCountPerSection: agentRuntimeConfig.tools.searchExerciseResources.maxCandidateCountPerSection + 1 },
      {
        muscles: ["胸部"],
        executionProfile: "no_equipment",
        equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
      },
      {
        muscles: ["胸部"],
        equipmentScope: { mode: "must_use_any", tags: [] },
      },
      { muscles: ["胸部"], muscleMatchRole: "secondary" },
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

  it("keeps excluded exercises out of candidate groups when balanced candidates fill the result", async () => {
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
    expect(findCandidateGroup(modelMessage, "training").exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).not.toContain("ExcludedPushup");
  });

  it.each([
    "no_equipment",
    "home_support",
    "small_equipment",
    "gym_equipment",
    "partner_required",
    "outdoor_required",
  ] as const)("passes executionProfile %s through handler and query summary", async (executionProfile) => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: executionProfile === "outdoor_required"
          ? []
          : [createExerciseSummary({ id: `${executionProfile}_exercise`, nameZh: executionProfile })],
        totalMatches: executionProfile === "outdoor_required" ? 0 : 1,
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        executionProfile,
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      executionProfile,
      suitability: "training",
    }));
    expect(modelMessage.query).toMatchObject({
      suitabilities: ["training"],
      executionProfile,
    });

    if (executionProfile === "outdoor_required") {
      expect(modelMessage).not.toHaveProperty("diagnostics");
      expect(result.record.userProjection).toMatchObject({
        diagnostics: [
          expect.objectContaining({ code: "no_candidates" }),
        ],
      });
    } else {
      expect(findCandidateGroup(modelMessage, "training").exercises[0]).toMatchObject({
        exerciseId: `${executionProfile}_exercise`,
      });
    }
  });

  it("passes equipmentScope, impactLimit and noiseLimit through handler and projections", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [
          createExerciseSummary({
            id: "Dumbbell_Row",
            nameZh: "哑铃划船",
            nameEn: "Dumbbell Row",
            requiresExternalEquipment: true,
            requiredEquipmentTags: ["dumbbell"],
            setupComplexity: "small_equipment",
            impactLevel: "low",
            noiseLevel: "quiet",
          }),
        ],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
        impactLimit: "low",
        noiseLimit: "quiet",
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
      impactLimit: "low",
      noiseLimit: "quiet",
    }));
    expect(modelMessage.query).toMatchObject({
      equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
      impactLimit: "low",
      noiseLimit: "quiet",
    });
    expect(result.record.userProjection).toMatchObject({
      query: expect.objectContaining({
        equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
        impactLimit: "low",
        noiseLimit: "quiet",
      }),
    });
    expect(result.record.traceSummary).toMatchObject({
      query: expect.objectContaining({
        equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
        impactLimit: "low",
        noiseLimit: "quiet",
      }),
    });
  });

  it("passes explicit muscleMatchRole any through handler and query projections", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [
          createExerciseSummary({
            id: "RingSupport",
            nameZh: "吊环支撑",
            nameEn: "Ring Support",
            primaryMusclesZh: ["胸部"],
            secondaryMusclesZh: ["腹肌"],
          }),
        ],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["腹肌"],
        muscleMatchRole: "any",
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["腹肌"],
      muscleMatchRole: "any",
    }));
    expect(modelMessage.query).toMatchObject({
      muscles: ["腹肌"],
      muscleMatchRole: "any",
    });
    expect(findCandidateGroup(modelMessage, "training").exercises[0]).toMatchObject({
      exerciseId: "RingSupport",
      primaryMusclesZh: ["胸部"],
      secondaryMusclesZh: ["腹肌"],
    });
    expect(result.record.userProjection).toMatchObject({
      query: expect.objectContaining({
        muscles: ["腹肌"],
        muscleMatchRole: "any",
      }),
    });
    expect(result.record.traceSummary).toMatchObject({
      query: expect.objectContaining({
        muscles: ["腹肌"],
        muscleMatchRole: "any",
      }),
    });
  });

  it.each([
    "今天我要减肥，想多练练核心，有没有推荐的动作",
    "帮我筛几个腹肌主练动作",
  ])("regression: target-muscle recommendation defaults to primary role for %s", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [
          createExerciseSummary({
            id: "Plank",
            nameZh: "平板支撑",
            nameEn: "Plank",
            primaryMusclesZh: ["腹肌"],
            secondaryMusclesZh: ["肩部"],
          }),
        ],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["腹肌"],
        suitabilities: ["training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["腹肌"],
      muscleMatchRole: "primary",
      suitability: "training",
    }));
    expect(modelMessage.query).toMatchObject({
      muscles: ["腹肌"],
      muscleMatchRole: "primary",
    });
    expect(findCandidateGroup(modelMessage, "training").exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual(["Plank"]);
    expect(JSON.stringify(modelMessage)).not.toContain("必须继续");
    expect(JSON.stringify(modelMessage)).not.toContain("扩大 candidateCountPerSection");
  });

  it("keeps each requested suitability as a separate candidate group without coverage gaps", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: input.suitability === "warmup"
          ? [createExerciseSummary({ id: "JumpingJack", nameZh: "开合跳", nameEn: "Jumping Jack", allowedSections: ["warmup"] })]
          : [createExerciseSummary({ id: "Pushups", allowedSections: ["training"] })],
      }),
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        muscles: ["胸部"],
        candidateCountPerSection: 2,
        suitabilities: ["warmup", "training"],
        sort: "name_asc",
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledTimes(2);
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      suitability: "warmup",
      maxReturned: 2,
    }));
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      suitability: "training",
      maxReturned: 2,
    }));
    expect(modelMessage.candidateGroups.map((group: { suitability: string }) => group.suitability)).toEqual([
      "warmup",
      "training",
    ]);
    expect(modelMessage.coverage).toMatchObject({
      hasCandidates: true,
      sectionsWithCandidates: ["warmup", "training"],
      sectionsWithoutCandidates: [],
      allRequestedSectionsHaveCandidates: true,
    });
    expect(JSON.stringify(modelMessage)).not.toContain("missingSections");
    expect(JSON.stringify(modelMessage)).not.toContain("allowedSections");
    expect(JSON.stringify(modelMessage)).not.toContain("必须调用");
  });

  it("keeps multi-muscle coverage guidance inside the tool contract without phrasing triggers", async () => {
    const { tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({ query: input }),
    });
    const modelVisibleText = [
      tool.description,
      JSON.stringify(z.toJSONSchema(tool.inputSchema)),
    ].join("\n");

    expect(modelVisibleText).toContain("suitabilities 可声明 warmup、training、stretch");
    expect(modelVisibleText).toContain("候选用途查询口径，不是最终训练编排命令");
    expect(modelVisibleText).toContain("candidateCountPerSection");
    expect(modelVisibleText).toContain("不是分页、offset、cursor 或最终展示数量承诺");
    expect(modelVisibleText).toContain("candidateGroups[].suitability 只表示该组候选来自哪个 suitabilities 查询口径");
    expect(modelVisibleText).toContain("不是动作 placement eligibility 或最终训练阶段指令");
    expect(modelVisibleText).toContain("candidateGroups[].exercises 是动作候选池，不是最终推荐清单");
    expect(modelVisibleText).toContain("候选动作可以被选择、跳过或用于后续结构化输出");
    expect(modelVisibleText).toContain("training 候选用于支撑主训练动作选择");
    expect(modelVisibleText).toContain("warmup / stretch 候选用于支撑辅助阶段选择");
    expect(modelVisibleText).toContain("辅助阶段不要求每个目标肌群都有 primary 候选");
    expect(modelVisibleText).toContain("辅助阶段的局部窄查询缺口");
    expect(modelVisibleText).toContain("它不等于整体 routine 或 plan 不可提交");
    expect(modelVisibleText).toContain("本 tool 只返回动作候选事实");
    expect(modelVisibleText).toContain("不返回 prescription、schedule、routine 或 plan");
    expect(modelVisibleText).toContain("缺口是 prescription 或 schedule 时");
    expect(modelVisibleText).toContain("重复查询动作库不会新增该类事实");
    expect(modelVisibleText).toContain("coverage 只说明本次查询结果中哪些 suitabilities 有候选、哪些没有候选");
    expect(modelVisibleText).toContain("重复等价 input 不会补充新事实");
    expect(modelVisibleText).toContain("应基于已有候选、用户目标和结构化收口合同构造、澄清或失败收口");
    expect(modelVisibleText).toContain("不要求最终输出使用全部候选");
    expect(modelVisibleText).toContain("动作候选用途查询口径数组，只允许 warmup、training 或 stretch");
    expect(modelVisibleText).toContain("模型需要主训练、热身或拉伸候选时自行选择对应值");
    expect(modelVisibleText).toContain("多 muscles 查询用于获得覆盖多个请求肌群的候选");
    expect(modelVisibleText).toContain("不保证每个候选都同等适合作为最终推荐");
    expect(modelVisibleText).toContain("executionProfile 用于选择动作执行场景");
    expect(modelVisibleText).toContain("no_equipment");
    expect(modelVisibleText).toContain("完整无器械口径");
    expect(modelVisibleText).toContain("默认使用 no_equipment 作为低门槛无器械口径");
    expect(modelVisibleText).toContain("仅在用户明确可用椅子、墙面、台阶等常见居家支撑时使用");
    expect(modelVisibleText).toContain("equipmentScope.mode=compatible_with_available");
    expect(modelVisibleText).toContain("动作不得要求集合外器械");
    expect(modelVisibleText).toContain("equipmentScope.mode=must_use_any");
    expect(modelVisibleText).toContain("impactLimit 和 noiseLimit 是上限筛选");
    expect(modelVisibleText).toContain("适合用户明确低冲击、膝关节压力、跳跃、公寓、夜间或低噪音限制时使用");
    expect(modelVisibleText).toContain("candidateGroups[].exercises[].executionTaxonomy 是动作执行条件的候选事实摘要");
    expect(modelVisibleText).toContain("exerciseNames");
    expect(modelVisibleText).toContain("模型已经结构化提取出的点名动作名称数组");
    expect(modelVisibleText).toContain("不是语义搜索、向量召回、肌群推断、标签推断或自然语言搜索字段");
    expect(modelVisibleText).not.toContain("服务端不根据用户原文分流");
    expect(modelVisibleText).not.toContain("服务端配置");
    expect(modelVisibleText).not.toContain("服务端数据库");
    expect(modelVisibleText).not.toContain("数据库筛选");
    expect(modelVisibleText).not.toContain("底层");
    expect(modelVisibleText).not.toContain("确定性映射");
    expect(modelVisibleText).not.toContain("hard filter");
    expect(modelVisibleText).not.toContain("support_section");
    expect(modelVisibleText).not.toContain("where 条件");
    expect(modelVisibleText).not.toContain("全库读取能力");
    expect(modelVisibleText).not.toContain("全身");
    expect(modelVisibleText).not.toContain("当用户说");
    expect(modelVisibleText).not.toContain("关键词");
    expect(modelVisibleText).not.toContain("短句模板");
    expect(modelVisibleText).not.toContain("必须调用");
    expect(modelVisibleText).not.toContain("zeroMatchMuscles");
    expect(modelVisibleText).not.toContain("sectionSummary、availableSections、missingSections");
    expect(modelVisibleText).not.toContain("groups.<section>");
    expect(modelVisibleText).not.toContain("requiresExternalEquipment=false");
    expect(modelVisibleText).not.toContain("requiredEquipmentTags 表示");
    expect(modelVisibleText).not.toContain("supportRequirementTags 表示");
    expect(modelVisibleText).not.toContain("setupComplexityMax");
    expect(modelVisibleText).not.toContain("impactLevelMax");
    expect(modelVisibleText).not.toContain("noiseLevelMax");
  });
});

describe("searchExerciseResources repository execution constraints", () => {
  it.each([
    [
      "no_equipment",
      {
        AND: [
          { requiresExternalEquipment: false },
          { requiredEquipmentTags: { isEmpty: true } },
          { setupComplexity: { in: ["zero_setup", "floor_or_mat"] } },
          { NOT: { supportRequirementTags: { hasSome: ["chair_or_wall", "gym_fixture", "partner", "outdoor_space"] } } },
        ],
      },
    ],
    [
      "home_support",
      {
        AND: [
          { requiresExternalEquipment: false },
          { requiredEquipmentTags: { isEmpty: true } },
          { setupComplexity: { in: ["zero_setup", "floor_or_mat", "home_support"] } },
          { NOT: { supportRequirementTags: { hasSome: ["gym_fixture", "partner", "outdoor_space"] } } },
        ],
      },
    ],
    [
      "small_equipment",
      {
        AND: [
          { requiresExternalEquipment: true },
          { setupComplexity: "small_equipment" },
          { NOT: { supportRequirementTags: { hasSome: ["gym_fixture", "partner", "outdoor_space"] } } },
        ],
      },
    ],
    [
      "gym_equipment",
      {
        OR: [
          { setupComplexity: "gym_fixture" },
          { supportRequirementTags: { has: "gym_fixture" } },
          { requiredEquipmentTags: { hasSome: ["machine", "cable"] } },
        ],
      },
    ],
    [
      "partner_required",
      {
        OR: [
          { setupComplexity: "partner" },
          { supportRequirementTags: { has: "partner" } },
        ],
      },
    ],
    [
      "outdoor_required",
      {
        OR: [
          { setupComplexity: "outdoor" },
          { supportRequirementTags: { has: "outdoor_space" } },
        ],
      },
    ],
  ] as const)("maps executionProfile %s to taxonomy where filters", async (executionProfile, expectedWhere) => {
    const { where, result } = await captureRepositoryWhere({ executionProfile });

    expect(where).toMatchObject({
      AND: [
        { allowedSections: { has: "training" } },
        expectedWhere,
      ],
    });
    expect(result.filterSemantics).toEqual([
      expect.objectContaining({
        field: "executionProfile",
        requestedValue: executionProfile,
      }),
    ]);
  });

  it("maps compatible_with_available to equipment subset semantics", async () => {
    const { where } = await captureRepositoryWhere({
      equipmentScope: { mode: "compatible_with_available", tags: ["dumbbell"] },
    });

    expect(where).toMatchObject({
      AND: [
        { allowedSections: { has: "training" } },
        {
          OR: [
            {
              AND: [
                { requiresExternalEquipment: false },
                { requiredEquipmentTags: { isEmpty: true } },
              ],
            },
            {
              AND: [
                { requiresExternalEquipment: true },
                { NOT: { requiredEquipmentTags: { hasSome: expect.arrayContaining(["resistance_band"]) } } },
              ],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(where)).not.toContain('"requiredEquipmentTags":{"hasSome":["dumbbell"]}');
  });

  it("maps empty compatible_with_available to confirmed no external equipment", async () => {
    const { where } = await captureRepositoryWhere({
      equipmentScope: { mode: "compatible_with_available", tags: [] },
    });

    expect(where).toMatchObject({
      AND: [
        { allowedSections: { has: "training" } },
        {
          AND: [
            { requiresExternalEquipment: false },
            { requiredEquipmentTags: { isEmpty: true } },
          ],
        },
      ],
    });
  });

  it("maps must_use_any to equipment overlap semantics", async () => {
    const { where } = await captureRepositoryWhere({
      equipmentScope: { mode: "must_use_any", tags: ["dumbbell"] },
    });

    expect(where).toMatchObject({
      AND: [
        { allowedSections: { has: "training" } },
        {
          AND: [
            { requiresExternalEquipment: true },
            { requiredEquipmentTags: { hasSome: ["dumbbell"] } },
          ],
        },
      ],
    });
  });

  it("defaults muscleMatchRole to primary and excludes secondary muscle fields", async () => {
    const { where } = await captureRepositoryWhere({
      muscles: ["腹肌"],
    });
    const serializedWhere = JSON.stringify(where);

    expect(serializedWhere).toContain("\"primaryMuscles\":{\"has\":\"腹肌\"}");
    expect(serializedWhere).toContain("\"primaryMusclesZh\":{\"has\":\"腹肌\"}");
    expect(serializedWhere).not.toContain("secondaryMuscles");
    expect(serializedWhere).not.toContain("secondaryMusclesZh");
  });

  it("maps muscleMatchRole any to primary and secondary muscle fields", async () => {
    const { where } = await captureRepositoryWhere({
      muscles: ["腹肌"],
      muscleMatchRole: "any",
    });
    const serializedWhere = JSON.stringify(where);

    expect(serializedWhere).toContain("\"primaryMuscles\":{\"has\":\"腹肌\"}");
    expect(serializedWhere).toContain("\"primaryMusclesZh\":{\"has\":\"腹肌\"}");
    expect(serializedWhere).toContain("\"secondaryMuscles\":{\"has\":\"腹肌\"}");
    expect(serializedWhere).toContain("\"secondaryMusclesZh\":{\"has\":\"腹肌\"}");
  });

  it("maps impactLimit and noiseLimit to known value upper bounds without null matches", async () => {
    const { where, result } = await captureRepositoryWhere({
      impactLimit: "medium",
      noiseLimit: "normal",
    });

    expect(where).toMatchObject({
      AND: [
        { allowedSections: { has: "training" } },
        { impactLevel: { in: ["low", "medium"] } },
        { noiseLevel: { in: ["quiet", "normal"] } },
      ],
    });
    expect(JSON.stringify(where)).not.toContain("null");
    expect(result.filterSemantics).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "impactLimit", requestedValue: "medium" }),
      expect.objectContaining({ field: "noiseLimit", requestedValue: "normal" }),
    ]));
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
    exerciseResourceMuscleMatchRoleValues: ["primary", "any"],
    getExerciseResourceSummariesByIds,
    normalizeExerciseResourceFacetCatalogForPlanner: (catalog: unknown) => catalog,
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

async function captureRepositoryWhere(
  input: Partial<ExerciseResourceSearchInput>,
) {
  vi.resetModules();
  const count = vi.fn().mockResolvedValue(0);
  const findMany = vi.fn().mockResolvedValue([]);
  vi.doMock(prismaPath, () => ({
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      exercise: {
        count,
        findMany,
      },
    }),
  }));
  const repository = await import("@/lib/server/exercises/exercise-repository");
  const result = await repository.searchExerciseResourceSummaries({
    suitability: "training",
    maxReturned: 3,
    sort: "name_asc",
    ...input,
  });

  return {
    where: count.mock.calls[0]?.[0]?.where,
    result,
  };
}

function createSearchResult(input: {
  query: ExerciseResourceSearchInput;
  exercises?: ExerciseResourceSummary[];
  totalMatches?: number;
  zeroMatchMuscles?: string[];
  truncated?: boolean;
  excludedCount?: number;
  diagnostics?: ExerciseResourceNameDiagnostic[];
}): ExerciseResourceSearchResult {
  const exercises = input.exercises ?? [];
  const filterApplication = buildExerciseResourceFilterApplication(input.query);

  return {
    query: input.query,
    appliedFilters: [],
    filterApplication,
    filterSemantics: input.query.executionProfile
      ? [{
        field: "executionProfile",
        requestedValue: input.query.executionProfile,
        databaseMapping: {
          matchedValues: ["requiresExternalEquipment=false"],
        },
        note: "executionProfile 已按动作库执行条件应用约束；该字段仅用于 trace 诊断。",
      }]
      : [],
    diagnostics: input.diagnostics ?? [],
    zeroMatchMuscles: input.zeroMatchMuscles ?? [],
    totalMatches: input.totalMatches ?? exercises.length,
    returnedCount: exercises.length,
    maxReturned: input.query.maxReturned ?? agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection,
    truncated: input.truncated ?? false,
    excludedCount: input.excludedCount ?? input.query.excludeExerciseIds?.length ?? 0,
    exercises,
  };
}

function findCandidateGroup(modelMessage: { candidateGroups: Array<{ suitability: string }> }, suitability: string) {
  const group = modelMessage.candidateGroups.find((candidateGroup) => candidateGroup.suitability === suitability);

  expect(group).toBeDefined();

  return group as {
    suitability: string;
    exercises: Array<{ exerciseId: string }>;
  };
}

function expectModelVisibleSummaryDoesNotContainMisleadingSearchFields(modelMessage: unknown) {
  const summaryJson = JSON.stringify(modelMessage);
  for (const forbiddenText of [
    "totalMatches",
    "returnedCount",
    "truncated",
    "excludedCount",
    "candidateCountPerSection",
    "sort",
    "maxReturned",
    "limit",
    "take",
    "offset",
    "page",
    "pageSize",
    "cursor",
    "querySpecificity",
    "filterSemantics",
    "appliedFilters",
    "filterApplicationBoundary",
    "filterApplications",
    "positiveAnchorBoundary",
    "refreshExclusionBoundary",
    "sectionSummary",
    "availableSections",
    "missingSections",
    "allowedSectionsRelation",
    "groupSemantics",
    "allowedSections",
    "zeroMatchMuscles",
    "diagnostics",
    "exercise_name_ambiguous",
    "exercise_name_too_broad",
    "too_broad",
    "sufficient",
    "insufficient",
    "ready",
    "canProceed",
    "canDeliverPlan",
    "goalSatisfied",
    "businessGoalSatisfied",
    "complete",
  ]) {
    expect(summaryJson).not.toContain(forbiddenText);
  }
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
    requiresExternalEquipment: overrides.requiresExternalEquipment ?? false,
    requiredEquipmentTags: overrides.requiredEquipmentTags ?? [],
    supportRequirementTags: overrides.supportRequirementTags ?? ["none"],
    setupComplexity: overrides.setupComplexity ?? "zero_setup",
    impactLevel: overrides.impactLevel ?? "low",
    noiseLevel: overrides.noiseLevel ?? "quiet",
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
