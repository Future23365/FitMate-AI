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
      q: "俯卧撑",
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
        "q",
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

  it("uses support section filters without applying level, q, category, tags or mechanics as hard filters", async () => {
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
      q: "胸部热身文本",
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
    expect(serializedWhere).toContain("\"equipment\":{\"in\":[\"body only\",\"bodyweight\"]}");
    expect(serializedWhere).toContain("\"equipmentZh\":{\"in\":[\"自重\"]}");
    expect(serializedWhere).toContain("\"homeRequirement\":\"floor\"");
    expect(serializedWhere).toContain("\"primaryMuscles\":{\"has\":\"胸部\"}");
    expect(serializedWhere).toContain("\"id\":{\"in\":[\"required-warmup\"]}");
    expect(serializedWhere).toContain("\"id\":{\"notIn\":[\"excluded-warmup\"]}");
    expect(serializedWhere).not.toContain("胸部热身文本");
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
        "equipment",
        "homeRequirement",
        "muscles",
        "requiredExerciseIds",
        "excludeExerciseIds",
      ]),
      unappliedInputFilters: expect.arrayContaining([
        { field: "q", code: "not_applied_as_hard_filter_for_support_section" },
        { field: "category", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "mobility" },
        { field: "level", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "intermediate" },
        { field: "force", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "push" },
        { field: "mechanic", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "compound" },
        { field: "goalTag", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "strength" },
        { field: "riskTag", code: "not_applied_as_hard_filter_for_support_section", valueSummary: "shoulder_pain" },
      ]),
    });
    expect(result.filterApplication.unappliedInputFilters.find((filter) => filter.field === "q")).not.toHaveProperty("valueSummary");
    expect(result.exercises).toEqual([
      expect.objectContaining({
        id: "warmup-bodyweight-chest",
        allowedSections: ["warmup"],
        equipmentZh: "自重",
      }),
    ]);
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
