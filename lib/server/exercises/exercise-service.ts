import "server-only";

import { getExerciseRecordById, listExerciseRecords } from "@/lib/server/exercises/exercise-repository";
import type {
  Exercise,
  ExerciseFacetItem,
  ExerciseFacets,
  ExerciseListQuery,
  ExerciseListResult,
  ExerciseSort,
} from "@/lib/shared/exercises/types";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const DEFAULT_SORT: ExerciseSort = "name_asc";
const levelRank: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  expert: 3,
};

export async function listAllExercises(): Promise<Exercise[]> {
  return listExerciseRecords();
}

export async function listExercises(query: ExerciseListQuery = {}): Promise<ExerciseListResult> {
  const exercises = await listExerciseRecords();
  const pagination = resolvePagination(query);
  const filtered = exercises
    .filter((exercise) => matchesExerciseQuery(exercise, query))
    .sort(createExerciseSorter(query.sort ?? DEFAULT_SORT));
  const totalPages = Math.ceil(filtered.length / pagination.limit);

  return {
    items: filtered.slice(pagination.offset, pagination.offset + pagination.limit),
    total: filtered.length,
    limit: pagination.limit,
    offset: pagination.offset,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages,
    hasNextPage: pagination.offset + pagination.limit < filtered.length,
    hasPreviousPage: pagination.offset > 0,
  };
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  return getExerciseRecordById(id);
}

export async function getExerciseFacets(): Promise<ExerciseFacets> {
  const exercises = await listExerciseRecords();

  return {
    categories: collectFacet(exercises, "category", "categoryZh"),
    levels: collectFacet(exercises, "level", "levelZh"),
    force: collectFacet(exercises, "force", "forceZh"),
    mechanics: collectFacet(exercises, "mechanic", "mechanicZh"),
    equipment: collectFacet(exercises, "equipment", "equipmentZh"),
    homeRequirements: collectFacet(exercises, "homeRequirement", "homeRequirementZh"),
    muscles: collectArrayFacet(exercises, "primaryMuscles", "primaryMusclesZh"),
    goalTags: collectTagFacet(exercises, "goalTags"),
    riskTags: collectTagFacet(exercises, "riskTags"),
  };
}

function matchesExerciseQuery(exercise: Exercise, query: ExerciseListQuery) {
  if (query.published !== undefined && exercise.isPublished !== query.published) {
    return false;
  }

  if (query.category && exercise.category !== query.category && exercise.categoryZh !== query.category) {
    return false;
  }

  if (query.workoutSection && inferExerciseWorkoutSection(exercise) !== query.workoutSection) {
    return false;
  }

  if (query.level && exercise.level !== query.level && exercise.levelZh !== query.level) {
    return false;
  }

  if (query.force && exercise.force !== query.force && exercise.forceZh !== query.force) {
    return false;
  }

  if (
    query.mechanic &&
    exercise.mechanic !== query.mechanic &&
    exercise.mechanicZh !== query.mechanic
  ) {
    return false;
  }

  if (
    query.equipment &&
    exercise.equipment !== query.equipment &&
    exercise.equipmentZh !== query.equipment
  ) {
    return false;
  }

  if (
    query.homeRequirement &&
    exercise.homeRequirement !== query.homeRequirement &&
    exercise.homeRequirementZh !== query.homeRequirement
  ) {
    return false;
  }

  if (query.muscle && !matchesMuscle(exercise, query.muscle)) {
    return false;
  }

  if (query.goalTag && !exercise.goalTags.includes(query.goalTag)) {
    return false;
  }

  if (query.riskTag && !exercise.riskTags.includes(query.riskTag)) {
    return false;
  }

  if (query.q && !matchesSearchText(exercise, query.q)) {
    return false;
  }

  return true;
}

// 动作库阶段筛选复用现有动作元数据做服务端推断，确保先过滤再分页。
function inferExerciseWorkoutSection(exercise: Exercise): NonNullable<ExerciseListQuery["workoutSection"]> {
  const text = normalizeSearchText(
    [
      exercise.category,
      exercise.categoryZh,
      exercise.nameEn,
      exercise.nameZh,
      ...exercise.goalTags,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (/拉伸|伸展|放松|stretch|stretching|mobility/.test(text)) {
    return "stretch";
  }

  if (/热身|激活|动态|warmup|warm-up|activation|dynamic|有氧|cardio|开合跳|jumping jack|跑步|running|步行|walk|跳绳|rope|单车|bike|treadmill/.test(text)) {
    return "warmup";
  }

  return "training";
}

function matchesMuscle(exercise: Exercise, muscle: string) {
  return [
    ...exercise.primaryMuscles,
    ...exercise.primaryMusclesZh,
    ...exercise.secondaryMuscles,
    ...exercise.secondaryMusclesZh,
  ].includes(muscle);
}

function matchesSearchText(exercise: Exercise, keyword: string) {
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return true;
  }

  const haystack = normalizeSearchText(
    [
      exercise.id,
      exercise.nameEn,
      exercise.nameZh,
      exercise.category,
      exercise.categoryZh,
      exercise.equipment,
      exercise.equipmentZh,
      exercise.homeRequirement,
      exercise.homeRequirementZh,
      exercise.level,
      exercise.levelZh,
      ...exercise.primaryMuscles,
      ...exercise.primaryMusclesZh,
      ...exercise.secondaryMuscles,
      ...exercise.secondaryMusclesZh,
      ...exercise.goalTags,
      ...exercise.riskTags,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return haystack.includes(normalizedKeyword);
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
}

function resolvePagination(query: ExerciseListQuery) {
  const limit = clampLimit(query.pageSize ?? query.limit);
  const page = Number.isFinite(query.page)
    ? Math.max(1, Math.trunc(query.page ?? 1))
    : Math.max(1, Math.floor(Math.max(0, query.offset ?? 0) / limit) + 1);
  const offset = Number.isFinite(query.offset)
    ? Math.max(0, Math.trunc(query.offset ?? 0))
    : (page - 1) * limit;

  return {
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
  };
}

function createExerciseSorter(sort: ExerciseSort) {
  return (left: Exercise, right: Exercise) => {
    switch (sort) {
      case "name_desc":
        return compareText(right.nameZh, left.nameZh);
      case "level_asc":
        return compareLevel(left, right);
      case "level_desc":
        return compareLevel(right, left);
      case "category_asc":
        return compareText(left.categoryZh ?? "", right.categoryZh ?? "") || compareText(left.nameZh, right.nameZh);
      case "category_desc":
        return compareText(right.categoryZh ?? "", left.categoryZh ?? "") || compareText(left.nameZh, right.nameZh);
      case "name_asc":
      default:
        return compareText(left.nameZh, right.nameZh);
    }
  };
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN");
}

function compareLevel(left: Exercise, right: Exercise) {
  const leftRank = left.level ? levelRank[left.level] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  const rightRank = right.level
    ? levelRank[right.level] ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER;

  return leftRank - rightRank || compareText(left.nameZh, right.nameZh);
}

function collectFacet(
  exercises: Exercise[],
  valueKey: keyof Exercise,
  labelKey: keyof Exercise,
): ExerciseFacetItem[] {
  const values = new Map<string, ExerciseFacetItem>();

  for (const exercise of exercises) {
    const value = exercise[valueKey];
    const label = exercise[labelKey];

    if (typeof value === "string" && value && typeof label === "string" && label) {
      const current = values.get(value);
      values.set(value, {
        value,
        label,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function collectArrayFacet(
  exercises: Exercise[],
  valueKey: keyof Exercise,
  labelKey: keyof Exercise,
): ExerciseFacetItem[] {
  const values = new Map<string, ExerciseFacetItem>();

  for (const exercise of exercises) {
    const rawValues = exercise[valueKey];
    const labels = exercise[labelKey];

    if (!Array.isArray(rawValues) || !Array.isArray(labels)) {
      continue;
    }

    for (const [index, value] of rawValues.entries()) {
      const label = labels[index];

      if (typeof value === "string" && value && typeof label === "string" && label) {
        const current = values.get(value);
        values.set(value, {
          value,
          label,
          count: (current?.count ?? 0) + 1,
        });
      }
    }
  }

  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function collectTagFacet(exercises: Exercise[], key: "goalTags" | "riskTags"): ExerciseFacetItem[] {
  const values = new Map<string, ExerciseFacetItem>();

  for (const exercise of exercises) {
    for (const tag of exercise[key]) {
      const current = values.get(tag);
      values.set(tag, {
        value: tag,
        label: tag,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...values.values()].sort((a, b) => a.value.localeCompare(b.value));
}
