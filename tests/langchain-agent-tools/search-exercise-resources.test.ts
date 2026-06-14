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

describe("searchExerciseResources LangChain tool", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
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
        equipment: "no_equipment",
        candidateCountPerSection: agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection,
        sort: "name_asc",
      },
      returnedCount: 1,
      truncated: false,
      candidateGroups: [
        {
          suitability: "training",
          returnedCount: 1,
          truncated: false,
          zeroMatchMuscles: [],
          exercises: [
            {
              exerciseId: "Pushups",
              nameZh: "俯卧撑",
              imageUrl: "/push-up.png",
            },
          ],
        },
      ],
    });
    expect(modelMessage).not.toHaveProperty("totalMatches");
    expect(modelMessage).not.toHaveProperty("maxReturned");
    expect(modelMessage).not.toHaveProperty("groups");
    expect(modelMessage).not.toHaveProperty("availableSections");
    expect(modelMessage).not.toHaveProperty("sectionSummary");
    expect(modelMessage).not.toHaveProperty("missingSections");
    expect(modelMessage).not.toHaveProperty("groupSemantics");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("totalMatches");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("maxReturned");
    expect(modelMessage.candidateGroups[0].exercises[0]).not.toHaveProperty("allowedSections");
    expect(modelMessage.candidateGroups[0]).not.toHaveProperty("allowedSectionsRelation");
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
    expect(modelMessage.query.candidateCountPerSection).toBe(10);
    expect(modelMessage).not.toHaveProperty("maxReturned");
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

    const trainingGroup = findCandidateGroup(modelMessage, "training");

    expect(trainingGroup.zeroMatchMuscles).toEqual(["肩部"]);
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

      expect(findCandidateGroup(modelMessage, "training").zeroMatchMuscles).toEqual([]);
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
    expect(trainingGroup.zeroMatchMuscles).toEqual([]);
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
    expect(findCandidateGroup(modelMessage, "training").exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual([
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
    expect(modelMessage.appliedFilters).toEqual(expect.arrayContaining([
      { field: "exerciseNames", value: ["俯卧撑", "深蹲", "平板支撑"] },
    ]));
    expect(JSON.stringify(modelMessage)).not.toContain("exerciseNameResults");
    expect(JSON.stringify(modelMessage)).not.toContain("resolvedMentions");
    expect(JSON.stringify(modelMessage)).not.toContain("nameMatches");
  });

  it("projects exerciseNames diagnostics as facts without exposing parallel result structures", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({
        query: input,
        exercises: [createExerciseSummary({ id: "Pushups", nameZh: "俯卧撑" })],
        diagnostics: [
          { code: "exercise_name_not_found", exerciseName: "火星跳跃", totalMatches: 0 },
          { code: "exercise_name_ambiguous", exerciseName: "划船", totalMatches: 3, returnedCount: 2 },
          { code: "exercise_name_filter_mismatch", exerciseName: "平板支撑", conflictFields: ["muscles"], totalMatches: 1 },
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

    expect(modelMessage.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "exercise_name_not_found", exerciseName: "火星跳跃" }),
      expect.objectContaining({ code: "exercise_name_ambiguous", exerciseName: "划船", totalMatches: 3 }),
      expect.objectContaining({ code: "exercise_name_filter_mismatch", exerciseName: "平板支撑", conflictFields: ["muscles"] }),
    ]));
    expect(result.record.traceSummary).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "exercise_name_not_found", exerciseName: "火星跳跃" }),
      ]),
    });
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
      querySpecificity: {
        status: "too_broad",
      },
    });
    expect(modelMessage).not.toHaveProperty("fulfillment");
    expect(modelMessage).not.toHaveProperty("groups");
    expect(JSON.stringify(modelMessage)).not.toContain("satisfied");
  });

  it("rejects invalid fields and removed published input before repository execution", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation({
      searchImplementation: async (input) => createSearchResult({ query: input }),
    });

    for (const input of [
      { muscles: ["胸部"], limit: 10 },
      { q: "俯卧撑" },
      { muscles: ["胸部"], homeRequirement: "无器械" },
      { muscles: ["胸部"], candidateCountPerSection: agentRuntimeConfig.tools.searchExerciseResources.maxCandidateCountPerSection + 1 },
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
    expect(modelVisibleText).toContain("不是分页、offset、cursor、全库读取能力或最终展示数量承诺");
    expect(modelVisibleText).toContain("candidateGroups[].suitability 只表示该组候选来自哪个 suitabilities 查询口径");
    expect(modelVisibleText).toContain("不是动作 placement eligibility 或最终训练阶段指令");
    expect(modelVisibleText).toContain("动作候选用途查询口径数组，只允许 warmup、training 或 stretch");
    expect(modelVisibleText).toContain("模型需要主训练、热身或拉伸候选时自行选择对应值");
    expect(modelVisibleText).toContain("服务端不根据用户原文分流");
    expect(modelVisibleText).toContain("多 muscles 查询用于获得代表性候选覆盖");
    expect(modelVisibleText).toContain("zeroMatchMuscles 是诊断事实");
    expect(modelVisibleText).toContain("不是必须继续补查每个肌群的义务");
    expect(modelVisibleText).toContain("homeRequirement 只表示环境、场地或支撑条件");
    expect(modelVisibleText).toContain("只在用户目标、上下文、已验证事实或当前规划确实需要该条件时填写");
    expect(modelVisibleText).toContain("exerciseNames");
    expect(modelVisibleText).toContain("模型已经结构化提取出的点名动作名称数组");
    expect(modelVisibleText).toContain("不是语义搜索、向量召回、肌群推断、标签推断或自然语言搜索字段");
    expect(modelVisibleText).not.toContain("全身");
    expect(modelVisibleText).not.toContain("当用户说");
    expect(modelVisibleText).not.toContain("关键词");
    expect(modelVisibleText).not.toContain("短句模板");
    expect(modelVisibleText).not.toContain("必须调用");
    expect(modelVisibleText).not.toContain("sectionSummary、availableSections、missingSections");
    expect(modelVisibleText).not.toContain("groups.<section>");
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
  diagnostics?: ExerciseResourceNameDiagnostic[];
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
    diagnostics: input.diagnostics ?? [],
    zeroMatchMuscles: input.zeroMatchMuscles ?? [],
    totalMatches: input.totalMatches ?? exercises.length,
    returnedCount: exercises.length,
    maxReturned: input.query.maxReturned ?? agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection,
    truncated: false,
    excludedCount: input.query.excludeExerciseIds?.length ?? 0,
    exercises,
  };
}

function findCandidateGroup(modelMessage: { candidateGroups: Array<{ suitability: string }> }, suitability: string) {
  const group = modelMessage.candidateGroups.find((candidateGroup) => candidateGroup.suitability === suitability);

  expect(group).toBeDefined();

  return group as {
    suitability: string;
    returnedCount: number;
    truncated: boolean;
    zeroMatchMuscles: string[];
    exercises: Array<{ exerciseId: string }>;
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
