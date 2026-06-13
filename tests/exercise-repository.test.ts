import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  exercise: {
    count: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/server/db/prisma", () => ({
  getPrismaClient: () => prismaMock,
  isDatabaseConfigured: () => true,
}));

const { listExerciseFacetsFromStore, searchExerciseResourceSummaries } = await import("@/lib/server/exercises/exercise-repository");

describe("exercise repository", () => {
  beforeEach(() => {
    prismaMock.exercise.count.mockReset();
    prismaMock.exercise.count.mockResolvedValue(0);
    prismaMock.exercise.findMany.mockReset();
    prismaMock.exercise.findMany.mockResolvedValue([]);
    prismaMock.exercise.groupBy.mockReset();
    prismaMock.exercise.groupBy.mockResolvedValue([]);
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it("does not add null filters for required scalar facet fields", async () => {
    await listExerciseFacetsFromStore();

    const homeRequirementCall = prismaMock.exercise.groupBy.mock.calls.find(([input]) =>
      Array.isArray(input.by) && input.by.includes("homeRequirement"),
    );

    expect(homeRequirementCall).toBeDefined();
    expect(homeRequirementCall?.[0].where.AND).toEqual(
      expect.arrayContaining([
        { homeRequirement: { not: "" } },
        { homeRequirementZh: { not: "" } },
      ]),
    );
    expect(homeRequirementCall?.[0].where.AND).not.toEqual(
      expect.arrayContaining([
        { homeRequirement: { not: null } },
        { homeRequirementZh: { not: null } },
      ]),
    );
  });

  it("keeps null filters for nullable scalar facet fields", async () => {
    await listExerciseFacetsFromStore();

    const categoryCall = prismaMock.exercise.groupBy.mock.calls.find(([input]) =>
      Array.isArray(input.by) && input.by.includes("category"),
    );

    expect(categoryCall).toBeDefined();
    expect(categoryCall?.[0].where.AND).toEqual(
      expect.arrayContaining([
        { category: { not: null } },
        { categoryZh: { not: null } },
        { category: { not: "" } },
        { categoryZh: { not: "" } },
      ]),
    );
  });

  it("keeps training section filters strict and records the training policy", async () => {
    prismaMock.exercise.count.mockResolvedValue(2);
    prismaMock.exercise.findMany.mockResolvedValue([
      createRepositoryExerciseRecord({ id: "training-1", allowedSections: ["training"] }),
      createRepositoryExerciseRecord({ id: "training-2", allowedSections: ["training"] }),
    ]);

    const result = await searchExerciseResourceSummaries({
      exerciseNames: ["俯卧撑"],
      category: "strength",
      suitability: "training",
      level: "intermediate",
      force: "push",
      mechanic: "compound",
      equipment: "no_equipment",
      homeRequirement: "floor",
      muscles: ["胸部"],
      goalTag: "strength",
      riskTag: "shoulder_pain",
      requiredExerciseIds: ["required-training"],
      excludeExerciseIds: ["excluded-training"],
      sort: "name_asc",
    });
    const countArgs = prismaMock.exercise.count.mock.calls[0][0];
    const findManyArgs = prismaMock.exercise.findMany.mock.calls[0][0];
    const serializedWhere = JSON.stringify(findManyArgs.where);

    expect(countArgs.where).toEqual(findManyArgs.where);
    expect(serializedWhere).toContain("\"allowedSections\":{\"has\":\"training\"}");
    expect(serializedWhere).toContain("\"contains\":\"俯卧撑\"");
    expect(serializedWhere).toContain("\"category\":\"strength\"");
    expect(serializedWhere).toContain("\"level\":\"intermediate\"");
    expect(serializedWhere).toContain("\"force\":\"push\"");
    expect(serializedWhere).toContain("\"mechanic\":\"compound\"");
    expect(serializedWhere).toContain("\"goalTags\":{\"has\":\"strength\"}");
    expect(serializedWhere).toContain("\"riskTags\":{\"has\":\"shoulder_pain\"}");
    expect(serializedWhere).toContain("\"equipment\":{\"in\":[\"body only\",\"bodyweight\"]}");
    expect(serializedWhere).toContain("\"primaryMuscles\":{\"has\":\"胸部\"}");
    expect(serializedWhere).toContain("\"id\":{\"in\":[\"required-training\"]}");
    expect(serializedWhere).toContain("\"id\":{\"notIn\":[\"excluded-training\"]}");
    expect(serializedWhere).not.toContain("isPublished");
    expect(result.filterApplication).toMatchObject({
      section: "training",
      hardFilterPolicy: "training",
      appliedHardFilters: expect.arrayContaining([
        "suitabilities",
        "exerciseNames",
        "category",
        "level",
        "force",
        "mechanic",
        "equipment",
        "homeRequirement",
        "muscles",
        "goalTag",
        "riskTag",
        "requiredExerciseIds",
        "excludeExerciseIds",
      ]),
      unappliedInputFilters: [],
    });
  });

  it("uses support section filters without applying level, category, tags or mechanics as hard filters", async () => {
    prismaMock.exercise.count.mockResolvedValue(1);
    prismaMock.exercise.findMany.mockResolvedValue([
      createRepositoryExerciseRecord({
        id: "warmup-bodyweight-chest",
        nameZh: "胸部动态热身",
        allowedSections: ["warmup"],
        equipment: "body only",
        equipmentZh: "自重",
        primaryMusclesZh: ["胸部"],
      }),
    ]);

    const result = await searchExerciseResourceSummaries({
      exerciseNames: ["胸部动态热身"],
      category: "mobility",
      suitability: "warmup",
      level: "intermediate",
      force: "push",
      mechanic: "compound",
      equipment: "no_equipment",
      homeRequirement: "floor",
      muscles: ["胸部"],
      goalTag: "strength",
      riskTag: "shoulder_pain",
      requiredExerciseIds: ["required-warmup"],
      excludeExerciseIds: ["excluded-warmup"],
      sort: "name_asc",
    });
    const countArgs = prismaMock.exercise.count.mock.calls[0][0];
    const findManyArgs = prismaMock.exercise.findMany.mock.calls[0][0];
    const serializedWhere = JSON.stringify(findManyArgs.where);

    expect(countArgs.where).toEqual(findManyArgs.where);
    expect(findManyArgs.take).toBeGreaterThan(1);
    expect(serializedWhere).not.toContain("isPublished");
    expect(serializedWhere).toContain("\"allowedSections\":{\"has\":\"warmup\"}");
    expect(serializedWhere).toContain("\"contains\":\"胸部动态热身\"");
    expect(serializedWhere).toContain("\"equipment\":{\"in\":[\"body only\",\"bodyweight\"]}");
    expect(serializedWhere).toContain("\"equipmentZh\":{\"in\":[\"自重\"]}");
    expect(serializedWhere).toContain("\"homeRequirement\":\"floor\"");
    expect(serializedWhere).toContain("\"primaryMuscles\":{\"has\":\"胸部\"}");
    expect(serializedWhere).toContain("\"id\":{\"in\":[\"required-warmup\"]}");
    expect(serializedWhere).toContain("\"id\":{\"notIn\":[\"excluded-warmup\"]}");
    expect(serializedWhere).not.toContain("\"category\":\"mobility\"");
    expect(serializedWhere).not.toContain("\"level\":\"intermediate\"");
    expect(serializedWhere).not.toContain("\"force\":\"push\"");
    expect(serializedWhere).not.toContain("\"mechanic\":\"compound\"");
    expect(serializedWhere).not.toContain("\"goalTags\"");
    expect(serializedWhere).not.toContain("\"riskTags\"");
    expect(result.filterApplication).toMatchObject({
      section: "warmup",
      hardFilterPolicy: "support_section",
      appliedHardFilters: expect.arrayContaining([
        "suitabilities",
        "exerciseNames",
        "equipment",
        "homeRequirement",
        "muscles",
        "requiredExerciseIds",
        "excludeExerciseIds",
      ]),
      unappliedInputFilters: expect.arrayContaining([
        { field: "category", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "mobility" },
        { field: "level", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "intermediate" },
        { field: "force", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "push" },
        { field: "mechanic", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "compound" },
        { field: "goalTag", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "strength" },
        { field: "riskTag", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "shoulder_pain" },
      ]),
    });
    expect(result.exercises).toEqual([
      expect.objectContaining({
        id: "warmup-bodyweight-chest",
        allowedSections: ["warmup"],
        equipmentZh: "自重",
      }),
    ]);
  });

  it("balances multi-muscle resource candidates and reports zero-match muscles from independent counts", async () => {
    prismaMock.exercise.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);
    prismaMock.exercise.findMany
      .mockResolvedValueOnce([
        createRepositoryExerciseRecord({ id: "chest-a", nameZh: "胸部 A", primaryMusclesZh: ["胸部"] }),
        createRepositoryExerciseRecord({ id: "chest-b", nameZh: "胸部 B", primaryMusclesZh: ["胸部"] }),
      ])
      .mockResolvedValueOnce([
        createRepositoryExerciseRecord({ id: "back-a", nameZh: "背部 A", primaryMusclesZh: ["背部"], primaryMuscles: ["back"] }),
        createRepositoryExerciseRecord({ id: "back-b", nameZh: "背部 B", primaryMusclesZh: ["背部"], primaryMuscles: ["back"] }),
      ]);

    const result = await searchExerciseResourceSummaries({
      suitability: "training",
      muscles: ["胸部", "背部", "肩部"],
      excludeExerciseIds: ["excluded-training"],
      maxReturned: 3,
      sort: "name_asc",
    });
    const serializedCountWheres = prismaMock.exercise.count.mock.calls.map(([input]) => JSON.stringify(input.where));
    const serializedFindWheres = prismaMock.exercise.findMany.mock.calls.map(([input]) => JSON.stringify(input.where));

    expect(result.exercises.map((exercise) => exercise.id)).toEqual(["chest-a", "back-a", "chest-b"]);
    expect(result.zeroMatchMuscles).toEqual(["肩部"]);
    expect(result.totalMatches).toBe(5);
    expect(result.returnedCount).toBe(3);
    expect(result.truncated).toBe(true);
    expect(prismaMock.exercise.count).toHaveBeenCalledTimes(4);
    expect(prismaMock.exercise.findMany).toHaveBeenCalledTimes(2);
    expect(serializedCountWheres[0]).toContain("\"primaryMuscles\":{\"has\":\"胸部\"}");
    expect(serializedCountWheres[1]).toContain("\"primaryMuscles\":{\"has\":\"背部\"}");
    expect(serializedCountWheres[2]).toContain("\"primaryMuscles\":{\"has\":\"肩部\"}");
    expect(serializedCountWheres[3]).toContain("\"primaryMuscles\":{\"has\":\"胸部\"}");
    expect(serializedCountWheres[3]).toContain("\"primaryMuscles\":{\"has\":\"背部\"}");
    expect(serializedCountWheres[3]).toContain("\"primaryMuscles\":{\"has\":\"肩部\"}");
    for (const serializedWhere of [...serializedCountWheres, ...serializedFindWheres]) {
      expect(serializedWhere).toContain("\"id\":{\"notIn\":[\"excluded-training\"]}");
    }
  });

  it("buckets multiple exerciseNames before applying muscle filters and deduplicates returned candidates", async () => {
    prismaMock.exercise.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);
    prismaMock.exercise.findMany
      .mockResolvedValueOnce([
        createRepositoryExerciseRecord({ id: "push-a", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"] }),
        createRepositoryExerciseRecord({ id: "push-b", nameZh: "上斜俯卧撑", primaryMusclesZh: ["胸部"] }),
      ])
      .mockResolvedValueOnce([
        createRepositoryExerciseRecord({ id: "squat-a", nameZh: "深蹲", primaryMusclesZh: ["胸部"] }),
      ]);

    const result = await searchExerciseResourceSummaries({
      suitability: "training",
      exerciseNames: ["俯卧撑", "深蹲", "平板支撑"],
      muscles: ["胸部"],
      maxReturned: 3,
      sort: "name_asc",
    });
    const serializedFindWheres = prismaMock.exercise.findMany.mock.calls.map(([input]) => JSON.stringify(input.where));

    expect(result.exercises.map((exercise) => exercise.id)).toEqual(["push-a", "squat-a", "push-b"]);
    expect(result.zeroMatchMuscles).toEqual([]);
    expect(result.appliedFilters).toEqual(expect.arrayContaining([
      { field: "exerciseNames", value: ["俯卧撑", "深蹲", "平板支撑"] },
      { field: "muscles", value: ["胸部"] },
    ]));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "exercise_name_not_found",
        exerciseName: "平板支撑",
      }),
      expect.objectContaining({
        code: "exercise_name_ambiguous",
        exerciseName: "俯卧撑",
        totalMatches: 2,
      }),
    ]);
    expect(prismaMock.exercise.findMany).toHaveBeenCalledTimes(2);
    for (const serializedWhere of serializedFindWheres) {
      expect(serializedWhere).toContain("\"primaryMuscles\":{\"has\":\"胸部\"}");
    }
    expect(serializedFindWheres[0]).toContain("\"contains\":\"俯卧撑\"");
    expect(serializedFindWheres[1]).toContain("\"contains\":\"深蹲\"");
  });

  it("does not let requiredExerciseIds turn independent muscle counts into non-zero matches", async () => {
    prismaMock.exercise.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const result = await searchExerciseResourceSummaries({
      suitability: "training",
      muscles: ["胸部", "背部"],
      requiredExerciseIds: ["required-training"],
      maxReturned: 3,
      sort: "name_asc",
    });
    const perMuscleCountWheres = prismaMock.exercise.count.mock.calls.slice(0, 2).map(([input]) => JSON.stringify(input.where));
    const totalCountWhere = JSON.stringify(prismaMock.exercise.count.mock.calls[2][0].where);

    expect(result.exercises).toEqual([]);
    expect(result.zeroMatchMuscles).toEqual(["胸部", "背部"]);
    expect(result.totalMatches).toBe(1);
    expect(prismaMock.exercise.findMany).not.toHaveBeenCalled();
    for (const serializedWhere of perMuscleCountWheres) {
      expect(serializedWhere).not.toContain("required-training");
    }
    expect(totalCountWhere).toContain("required-training");
  });
});

function createRepositoryExerciseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "exercise-1",
    sourceId: overrides.sourceId ?? "exercise-1",
    nameEn: overrides.nameEn ?? "Exercise",
    nameZh: overrides.nameZh ?? "动作",
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
    homeRequirement: overrides.homeRequirement ?? "floor",
    homeRequirementZh: overrides.homeRequirementZh ?? "地面/瑜伽垫",
    primaryMuscles: overrides.primaryMuscles ?? ["chest"],
    primaryMusclesZh: overrides.primaryMusclesZh ?? ["胸部"],
    secondaryMuscles: overrides.secondaryMuscles ?? ["triceps"],
    secondaryMusclesZh: overrides.secondaryMusclesZh ?? ["肱三头肌"],
    images: overrides.images ?? [],
    imageUrls: overrides.imageUrls ?? [],
    allowedSections: overrides.allowedSections ?? ["training"],
    goalTags: overrides.goalTags ?? ["strength"],
    riskTags: overrides.riskTags ?? ["shoulder_pain"],
    reviewStatus: overrides.reviewStatus ?? "human_reviewed",
    isPublished: overrides.isPublished ?? true,
  };
}
