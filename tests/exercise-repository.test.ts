import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  exercise: {
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/server/db/prisma", () => ({
  getPrismaClient: () => prismaMock,
  isDatabaseConfigured: () => true,
}));

const { listExerciseFacetsFromStore } = await import("@/lib/server/exercises/exercise-repository");

describe("exercise repository", () => {
  beforeEach(() => {
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
});
