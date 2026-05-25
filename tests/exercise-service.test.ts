import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise } from "./fixtures/domain";

const repositoryMocks = vi.hoisted(() => ({
  getExerciseRecordById: vi.fn(),
  listExerciseRecords: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-repository", () => repositoryMocks);

const { getExerciseById, getExerciseFacets, listExercises } = await import(
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
      total: 3,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it("returns details and facet counts from repository data", async () => {
    await expect(getExerciseById("push-up")).resolves.toMatchObject({ id: "push-up" });

    const facets = await getExerciseFacets();
    expect(facets.categories).toEqual(
      expect.arrayContaining([
        { value: "strength", label: "力量", count: 2 },
        { value: "cardio", label: "有氧", count: 1 },
      ]),
    );
    expect(facets.equipment).toEqual(
      expect.arrayContaining([
        { value: "bodyweight", label: "自重", count: 2 },
        { value: "dumbbell", label: "哑铃", count: 1 },
      ]),
    );
    expect(facets.homeRequirements).toEqual(
      expect.arrayContaining([{ value: "no_equipment", label: "无器械", count: 1 }]),
    );
    expect(facets.muscles).toEqual(
      expect.arrayContaining([{ value: "chest", label: "胸部", count: 1 }]),
    );
    expect(facets.riskTags).toEqual(expect.arrayContaining([{ value: "high_impact", label: "high_impact", count: 1 }]));
  });
});
