import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise } from "./fixtures/domain";

const repositoryMocks = vi.hoisted(() => ({
  getExerciseRecordById: vi.fn(),
  listExerciseRecords: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-repository", () => repositoryMocks);

const { getExerciseById, getExerciseFacets, getExerciseSuitability, listExercises } = await import(
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
      total: 6,
      totalPages: 6,
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
      total: 2,
    });
    await expect(listExercises({ suitability: "training" })).resolves.toMatchObject({
      total: 4,
      items: expect.arrayContaining([
        expect.objectContaining({ id: "push-up" }),
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
        { value: "strength", label: "力量", count: 2 },
        { value: "cardio", label: "有氧训练", count: 2 },
      ]),
    );
    expect(facets.equipment).toEqual(
      expect.arrayContaining([
        { value: "bodyweight", label: "自重", count: 5 },
        { value: "dumbbell", label: "哑铃", count: 1 },
      ]),
    );
    expect(facets.homeRequirements).toEqual(
      expect.arrayContaining([{ value: "no_equipment", label: "无器械", count: 3 }]),
    );
    expect(facets.muscles).toEqual(
      expect.arrayContaining([{ value: "chest", label: "胸部", count: 1 }]),
    );
    expect(facets.riskTags).toEqual(expect.arrayContaining([{ value: "high_impact", label: "high_impact", count: 1 }]));
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
      expect.arrayContaining([{ value: "high_impact", label: "high_impact", count: 1 }]),
    );
  });
});
