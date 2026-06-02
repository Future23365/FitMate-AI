import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise } from "./fixtures/domain";

const repositoryMocks = vi.hoisted(() => ({
  getExerciseRecordById: vi.fn(),
  listExerciseRecords: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-repository", () => repositoryMocks);

const { getExerciseById, getExerciseFacets, getExerciseSuitability, listExercises, searchExercises } = await import(
  "@/lib/server/exercises/exercise-service"
);

describe("exercise service", () => {
  beforeEach(() => {
    repositoryMocks.listExerciseRecords.mockResolvedValue([
      createExercise({
        id: "push-up",
        nameZh: "俯卧撑",
        category: "strength",
        categoryZh: "力量",
        level: "beginner",
        levelZh: "新手",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        primaryMuscles: ["chest"],
        primaryMusclesZh: ["胸部"],
        goalTags: ["strength", "home_friendly"],
      }),
      createExercise({
        id: "triceps-extension",
        nameZh: "肱三头肌臂屈伸",
        category: "strength",
        categoryZh: "力量",
        level: "beginner",
        levelZh: "新手",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        primaryMuscles: ["triceps"],
        primaryMusclesZh: ["肱三头肌"],
        goalTags: ["strength"],
      }),
      createExercise({
        id: "dead-bug",
        nameZh: "死虫式",
        category: "strength",
        categoryZh: "力量",
        level: "beginner",
        levelZh: "新手",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        primaryMuscles: ["core"],
        primaryMusclesZh: ["核心"],
        movementPattern: "anti_rotation",
        goalTags: ["stability"],
      }),
      createExercise({
        id: "band-pull-apart",
        nameZh: "弹力带拉开",
        category: "mobility",
        categoryZh: "灵活性",
        level: "beginner",
        levelZh: "新手",
        equipment: "resistance_band",
        equipmentZh: "弹力带",
        homeRequirement: "equipment",
        homeRequirementZh: "需要器械",
        primaryMuscles: ["shoulders"],
        primaryMusclesZh: ["肩部"],
        secondaryMuscles: ["back"],
        secondaryMusclesZh: ["背部"],
        movementPattern: "pull",
        goalTags: ["mobility"],
      }),
      createExercise({
        id: "band-squat",
        nameZh: "弹力带深蹲",
        category: "strength",
        categoryZh: "力量",
        level: "beginner",
        levelZh: "新手",
        equipment: "resistance_band",
        equipmentZh: "弹力带",
        homeRequirement: "equipment",
        homeRequirementZh: "需要器械",
        primaryMuscles: ["quadriceps"],
        primaryMusclesZh: ["股四头肌"],
        secondaryMuscles: ["glutes", "hamstrings"],
        secondaryMusclesZh: ["臀部", "腘绳肌"],
        movementPattern: "squat",
        goalTags: ["strength", "beginner_friendly"],
      }),
      createExercise({
        id: "jump-squat",
        nameZh: "跳跃深蹲",
        category: "cardio",
        categoryZh: "有氧",
        level: "intermediate",
        levelZh: "进阶",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "quiet_space",
        homeRequirementZh: "需要空间",
        primaryMuscles: ["quadriceps"],
        primaryMusclesZh: ["股四头肌"],
        goalTags: ["cardio"],
        riskTags: ["high_impact"],
      }),
      createExercise({
        id: "jumping-jack",
        nameEn: "Jumping Jack",
        nameZh: "开合跳",
        category: "cardio",
        categoryZh: "有氧训练",
        level: "beginner",
        levelZh: "新手",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "quiet_space",
        homeRequirementZh: "需要空间",
        primaryMuscles: ["full_body"],
        primaryMusclesZh: ["全身"],
        goalTags: ["cardio"],
      }),
      createExercise({
        id: "dumbbell-row",
        nameZh: "哑铃划船",
        category: "strength",
        categoryZh: "力量",
        level: "beginner",
        levelZh: "新手",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        homeRequirement: "equipment",
        homeRequirementZh: "需要器械",
        primaryMuscles: ["back"],
        primaryMusclesZh: ["背阔肌"],
        goalTags: ["strength"],
        isPublished: false,
      }),
      createExercise({
        id: "hamstring-stretch",
        nameZh: "腘绳肌拉伸",
        category: "stretching",
        categoryZh: "拉伸",
        level: "beginner",
        levelZh: "新手",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        primaryMuscles: ["hamstrings"],
        primaryMusclesZh: ["腘绳肌"],
        goalTags: ["mobility"],
      }),
      createExercise({
        id: "dynamic-stretch",
        nameEn: "World's Greatest Stretch",
        nameZh: "动态世界最伟大拉伸",
        category: "stretching",
        categoryZh: "拉伸",
        level: "beginner",
        levelZh: "新手",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        primaryMuscles: ["hips"],
        primaryMusclesZh: ["髋部"],
        goalTags: ["mobility", "activation"],
      }),
    ]);
    repositoryMocks.getExerciseRecordById.mockResolvedValue(createExercise({ id: "push-up" }));
  });

  it("filters by search, facets, publication state, pagination, and sorting", async () => {
    await expect(listExercises({ q: "俯卧", published: true })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "push-up" })],
      total: 1,
      hasNextPage: false,
    });
    await expect(listExercises({ muscle: "股四头肌", riskTag: "high_impact" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "jump-squat" })],
    });
    await expect(listExercises({ equipment: "哑铃", homeRequirement: "需要器械" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "dumbbell-row" })],
    });

    const paged = await listExercises({ page: 2, pageSize: 1, sort: "level_desc" });
    expect(paged).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 10,
      totalPages: 10,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it("filters by non-exclusive suitability before pagination", async () => {
    await expect(listExercises({ suitability: "warmup" })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: "jumping-jack" }),
        expect.objectContaining({ id: "dynamic-stretch" }),
      ]),
      total: 2,
    });
    await expect(listExercises({ suitability: "stretch" })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: "hamstring-stretch" }),
        expect.objectContaining({ id: "dynamic-stretch" }),
      ]),
      total: 3,
    });
    await expect(listExercises({ suitability: "training" })).resolves.toMatchObject({
      total: 7,
      items: expect.arrayContaining([
        expect.objectContaining({ id: "push-up" }),
        expect.objectContaining({ id: "band-squat" }),
        expect.objectContaining({ id: "jump-squat" }),
        expect.objectContaining({ id: "jumping-jack" }),
        expect.objectContaining({ id: "dumbbell-row" }),
      ]),
    });
  });

  it("derives suitability without treating it as an exclusive section", () => {
    expect(
      getExerciseSuitability(
        createExercise({
          id: "dynamic-stretch",
          nameZh: "动态世界最伟大拉伸",
          category: "stretching",
          categoryZh: "拉伸",
          goalTags: ["mobility", "activation"],
        }),
      ),
    ).toMatchObject({ warmup: true, stretch: true });
    expect(
      getExerciseSuitability(
        createExercise({
          id: "atlas-stone",
          nameZh: "阿特拉斯石",
          category: "strongman",
          categoryZh: "大力士训练",
          riskTags: ["high_risk"],
        }),
      ),
    ).toMatchObject({ warmup: false, training: true });
  });

  it("returns details and facet counts from repository data", async () => {
    await expect(getExerciseById("push-up")).resolves.toMatchObject({ id: "push-up" });

    const facets = await getExerciseFacets();
    expect(facets.categories).toEqual(
      expect.arrayContaining([
        { value: "strength", label: "力量", count: 5 },
        { value: "cardio", label: "有氧训练", count: 2 },
      ]),
    );
    expect(facets.equipment).toEqual(
      expect.arrayContaining([
        { value: "bodyweight", label: "自重", count: 7 },
        { value: "dumbbell", label: "哑铃", count: 1 },
      ]),
    );
    expect(facets.homeRequirements).toEqual(
      expect.arrayContaining([{ value: "no_equipment", label: "无器械", count: 5 }]),
    );
    expect(facets.muscles).toEqual(
      expect.arrayContaining([{ value: "chest", label: "胸部", count: 1 }]),
    );
    expect(facets.goalTags).toEqual(
      expect.arrayContaining([
        { value: "home_friendly", label: "居家友好", count: 1 },
        { value: "strength", label: "力量训练", count: 4 },
      ]),
    );
    expect(facets.riskTags).toEqual(expect.arrayContaining([{ value: "high_impact", label: "高冲击", count: 1 }]));
  });

  it("returns facets scoped to suitability without applying lower-level filters", async () => {
    const warmupFacets = await getExerciseFacets({ suitability: "warmup" });
    expect(warmupFacets.categories).toEqual(
      expect.arrayContaining([
        { value: "cardio", label: "有氧训练", count: 1 },
        { value: "stretching", label: "拉伸", count: 1 },
      ]),
    );
    expect(warmupFacets.riskTags).not.toEqual(
      expect.arrayContaining([{ value: "high_impact", label: "高冲击", count: 1 }]),
    );
  });

  it("uses hybrid search for fuzzy body-part and posture expressions", async () => {
    await expect(searchExercises({ query: "拜拜肉", limit: 3 })).resolves.toMatchObject({
      candidates: expect.arrayContaining([expect.objectContaining({ id: "triceps-extension" })]),
      diagnostics: expect.objectContaining({
        finalExerciseIds: expect.arrayContaining(["triceps-extension"]),
      }),
    });

    await expect(searchExercises({ query: "核心不稳", limit: 3 })).resolves.toMatchObject({
      candidates: expect.arrayContaining([expect.objectContaining({ id: "dead-bug" })]),
    });

    await expect(searchExercises({ query: "圆肩", limit: 3 })).resolves.toMatchObject({
      candidates: expect.arrayContaining([expect.objectContaining({ id: "band-pull-apart" })]),
    });
  });

  it("keeps hard filters ahead of vector recall", async () => {
    await expect(
      searchExercises({
        query: "圆肩",
        equipment: ["自重"],
        visibility: "published",
        limit: 5,
      }),
    ).resolves.toMatchObject({
      candidates: expect.not.arrayContaining([expect.objectContaining({ id: "band-pull-apart" })]),
      diagnostics: expect.objectContaining({
        finalExerciseIds: expect.not.arrayContaining(["band-pull-apart"]),
      }),
    });
  });

  it("returns published beginner band lower-body candidates", async () => {
    await expect(
      searchExercises({
        visibility: "published",
        equipmentRequired: ["弹力带"],
        level: "beginner",
        targetMuscles: ["股四头肌", "腘绳肌"],
        avoidances: ["跳跃"],
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([expect.objectContaining({ id: "band-squat" })]),
      diagnostics: expect.objectContaining({
        finalExerciseIds: expect.arrayContaining(["band-squat"]),
      }),
    });
  });

  it("expands structured body regions into real muscle facets", async () => {
    await expect(
      searchExercises({
        visibility: "all",
        bodyRegions: ["upper_body"],
        equipment: ["哑铃"],
        allowedSections: ["training"],
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([expect.objectContaining({ id: "dumbbell-row" })]),
      diagnostics: expect.objectContaining({
        expandedTargetMuscles: expect.arrayContaining(["背阔肌"]),
        finalExerciseIds: expect.arrayContaining(["dumbbell-row"]),
      }),
    });
  });

  it("does not let generic routine query clear structured upper-body dumbbell candidates", async () => {
    repositoryMocks.listExerciseRecords.mockResolvedValueOnce([
      createExercise({
        id: "dumbbell-row",
        nameZh: "哑铃划船",
        category: "strength",
        categoryZh: "力量",
        level: "beginner",
        levelZh: "新手",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        primaryMuscles: ["back"],
        primaryMusclesZh: ["背阔肌"],
        goalTags: ["strength"],
        isPublished: true,
      }),
    ]);

    await expect(
      searchExercises({
        query: "上肢训练",
        candidateUse: "routine",
        visibility: "published",
        bodyRegions: ["upper_body"],
        equipmentRequired: ["dumbbell"],
        allowedSections: ["training"],
        sessionMinutes: 30,
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: [expect.objectContaining({ id: "dumbbell-row" })],
      diagnostics: expect.objectContaining({
        query: "上肢训练",
        failureReasons: [],
        finalExerciseIds: ["dumbbell-row"],
      }),
    });
  });

  it("does not let generic recommendation query clear structured lower-body band candidates", async () => {
    await expect(
      searchExercises({
        query: "完全不相关的泛化描述",
        candidateUse: "recommendation",
        visibility: "published",
        bodyRegions: ["lower_body"],
        equipmentRequired: ["弹力带"],
        level: "beginner",
        avoidances: ["跳跃"],
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: [expect.objectContaining({ id: "band-squat" })],
      diagnostics: expect.objectContaining({
        query: "完全不相关的泛化描述",
        failureReasons: [],
        finalExerciseIds: ["band-squat"],
      }),
    });
  });

  it("builds a structured no-equipment candidate set with hard filter proof", async () => {
    await expect(
      searchExercises({
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        query: "不用器械，练胸",
        filters: {
          homeRequirements: ["no_equipment"],
          allowedSections: ["training"],
          visibility: "published",
        },
        resultRequirements: {
          minCandidates: 1,
          requireProof: true,
        },
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([expect.objectContaining({ id: "push-up" })]),
      diagnostics: expect.objectContaining({
        queryMode: "ranking_signal",
        satisfied: true,
        appliedFilters: expect.objectContaining({
          homeRequirements: ["no_equipment"],
          allowedSections: ["training"],
        }),
        constraintProof: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: "push-up",
            matchedFilters: expect.arrayContaining(["homeRequirements", "allowedSections"]),
          }),
        ]),
      }),
    });
  });

  it("does not apply Agent no-equipment defaults inside the shared exercise search service", async () => {
    await expect(
      searchExercises({
        operation: "build_exercise_candidate_set",
        candidateUse: "recommendation",
        filters: {
          bodyRegions: ["upper_body"],
          visibility: "published",
        },
        limit: 8,
      }),
    ).resolves.toMatchObject({
      diagnostics: expect.objectContaining({
        appliedFilters: expect.not.objectContaining({
          homeRequirements: ["no_equipment"],
        }),
      }),
    });
  });

  it("reports invalid executable candidate facets instead of silently dropping them", async () => {
    await expect(
      searchExercises({
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        filters: {
          equipment: { in: ["不存在器械"] },
          visibility: "published",
        },
        resultRequirements: {
          minCandidates: 1,
          requireProof: true,
        },
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: [],
      diagnostics: expect.objectContaining({
        satisfied: false,
        invalidFilters: expect.arrayContaining([
          expect.objectContaining({
            field: "equipmentRequired",
            value: "不存在器械",
            reason: "unknown_facet",
          }),
        ]),
        failureReasons: expect.arrayContaining(["invalid_parameter"]),
      }),
    });
  });

  it("marks routine section coverage requirements as unmet when the candidate set misses a section", async () => {
    repositoryMocks.listExerciseRecords.mockResolvedValueOnce([
      createExercise({
        id: "push-up",
        nameZh: "俯卧撑",
        category: "strength",
        categoryZh: "力量",
        level: "beginner",
        levelZh: "新手",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        primaryMuscles: ["chest"],
        primaryMusclesZh: ["胸部"],
        goalTags: ["strength", "home_friendly"],
      }),
    ]);

    await expect(
      searchExercises({
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        filters: {
          allowedSections: ["training"],
          visibility: "published",
        },
        resultRequirements: {
          minCandidates: 1,
          sectionCoverage: {
            warmup: { min: 1 },
            training: { min: 1 },
            stretch: { min: 1 },
          },
          requireProof: true,
        },
        limit: 8,
      }),
    ).resolves.toMatchObject({
      diagnostics: expect.objectContaining({
        satisfied: false,
        unmetResultRequirements: expect.arrayContaining([
          "result_requirement_unmet:sectionCoverage.stretch",
        ]),
        resultRequirementProof: expect.objectContaining({
          sectionCoverage: expect.objectContaining({
            warmup: expect.objectContaining({ satisfied: false }),
            training: expect.objectContaining({ satisfied: true }),
            stretch: expect.objectContaining({ satisfied: false }),
          }),
        }),
      }),
    });
  });

  it("uses controlled no-equipment supplements to satisfy routine warmup and stretch coverage", async () => {
    await expect(
      searchExercises({
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        query: "上肢训练",
        visibility: "all",
        filters: {
          bodyRegions: ["upper_body"],
          equipment: { in: ["dumbbell"] },
          allowedSections: ["training"],
          visibility: "all",
        },
        resultRequirements: {
          minCandidates: 1,
          sectionCoverage: {
            warmup: { min: 1 },
            training: { min: 1 },
            stretch: { min: 1 },
          },
          requireProof: true,
        },
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: "dumbbell-row" }),
        expect.objectContaining({ id: "jumping-jack" }),
        expect.objectContaining({ id: "hamstring-stretch" }),
      ]),
      diagnostics: expect.objectContaining({
        satisfied: true,
        unmetResultRequirements: [],
        controlledSupplementalCandidates: expect.arrayContaining([
          expect.objectContaining({
            section: "warmup",
            reason: "section_coverage_supplement",
          }),
          expect.objectContaining({
            section: "stretch",
            reason: "section_coverage_supplement",
          }),
        ]),
      }),
    });
  });

  it("supplements warmup and stretch when routine search uses all sections with training equipment", async () => {
    await expect(
      searchExercises({
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        query: "上肢训练",
        visibility: "all",
        filters: {
          bodyRegions: ["upper_body"],
          equipment: { in: ["dumbbell"] },
          allowedSections: ["warmup", "training", "stretch"],
          visibility: "all",
        },
        resultRequirements: {
          minCandidates: 3,
          sectionCoverage: {
            warmup: { min: 1 },
            training: { min: 1 },
            stretch: { min: 1 },
          },
          requireProof: true,
        },
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: "dumbbell-row" }),
        expect.objectContaining({ id: "jumping-jack" }),
        expect.objectContaining({ id: "hamstring-stretch" }),
      ]),
      diagnostics: expect.objectContaining({
        satisfied: true,
        unmetResultRequirements: [],
        resultRequirementProof: expect.objectContaining({
          sectionCoverage: expect.objectContaining({
            warmup: expect.objectContaining({ satisfied: true }),
            training: expect.objectContaining({ satisfied: true }),
            stretch: expect.objectContaining({ satisfied: true }),
          }),
        }),
        controlledSupplementalCandidates: expect.arrayContaining([
          expect.objectContaining({
            section: "warmup",
            reason: "section_coverage_supplement",
          }),
          expect.objectContaining({
            section: "stretch",
            reason: "section_coverage_supplement",
          }),
        ]),
      }),
    });
  });

  it("reports retryable diagnostics for unknown target muscle facets", async () => {
    await expect(
      searchExercises({
        visibility: "all",
        targetMuscles: ["upper body"],
        equipment: ["哑铃"],
        allowedSections: ["training"],
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: [],
      diagnostics: expect.objectContaining({
        failureReasons: expect.arrayContaining(["unknown_target_muscle"]),
        unmatchedTargetMuscles: ["upper body"],
        suggestedTargetMuscles: expect.arrayContaining(["背阔肌"]),
        retryable: true,
      }),
    });
  });

  it("recovers common short muscle aliases to real exercise facets", async () => {
    await expect(
      searchExercises({
        visibility: "all",
        targetMuscles: ["胸"],
        equipment: ["自重"],
        allowedSections: ["training"],
        limit: 8,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([expect.objectContaining({ id: "push-up" })]),
      diagnostics: expect.objectContaining({
        unmatchedTargetMuscles: ["胸"],
        suggestedTargetMuscles: expect.arrayContaining(["胸部"]),
        finalExerciseIds: expect.arrayContaining(["push-up"]),
      }),
    });
  });
});
