import "server-only";

import { getExerciseRecordById, listExerciseRecords } from "@/lib/server/exercises/exercise-repository";
import { normalizeExerciseMetadata } from "@/lib/shared/exercises/metadata";
import { getExerciseTagLabel } from "@/lib/shared/exercises/tag-labels";
import {
  buildEmbeddingText,
  cosineSimilarity,
  createSearchEmbedding,
  parseSearchEmbedding,
  scoreHybridTextMatch,
  type HybridSearchScore,
} from "@/lib/shared/search/hybrid-search";
import type {
  Exercise,
  ExerciseFacetItem,
  ExerciseFacets,
  ExerciseListQuery,
  ExerciseListResult,
  ExerciseSort,
  ExerciseSuitability,
} from "@/lib/shared/exercises/types";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const DEFAULT_SORT: ExerciseSort = "name_asc";
const levelRank: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  expert: 3,
};

export type ExerciseSuitabilityFlags = Record<ExerciseSuitability, boolean>;

export type ExerciseSearchInput = {
  query?: string;
  limit?: number;
  visibility?: "all" | "published";
  allowedSections?: ExerciseSuitability[];
  equipment?: string[];
  level?: string;
  excludedRiskTags?: string[];
  injuryLimitations?: string[];
};

export type ExerciseSearchDiagnostics = {
  query?: string;
  filters: Omit<ExerciseSearchInput, "query" | "limit">;
  recalledCount: number;
  filteredCount: number;
  rerank: Array<{
    exerciseId: string;
    score: HybridSearchScore;
  }>;
  finalExerciseIds: string[];
  failureReasons: string[];
};

export type ExerciseSearchResult = {
  candidates: Exercise[];
  diagnostics: ExerciseSearchDiagnostics;
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

export async function searchExercises(input: ExerciseSearchInput = {}): Promise<ExerciseSearchResult> {
  return searchExercisesInMemory(await listExerciseRecords(), input);
}

// 动作 hybrid search 只在结构化过滤后的候选内做全文和向量排序，不能替代分池与 Validator。
export function searchExercisesInMemory(exercises: Exercise[], input: ExerciseSearchInput = {}): ExerciseSearchResult {
  const query = input.query?.trim();
  const limit = clampLimit(input.limit);
  const filtered = exercises.filter((exercise) => matchesExerciseHardFilters(exercise, input));
  const ranked = filtered
    .map((exercise) => ({
      exercise,
      score: scoreExerciseHybridSearch(exercise, query),
    }))
    .filter(({ score }) => !query || score.totalScore > 0)
    .sort((left, right) => {
      if (right.score.totalScore !== left.score.totalScore) {
        return right.score.totalScore - left.score.totalScore;
      }

      return compareText(left.exercise.nameZh, right.exercise.nameZh);
    })
    .slice(0, limit);
  const candidates = ranked.map(({ exercise }) => exercise);

  return {
    candidates,
    diagnostics: {
      query,
      filters: {
        visibility: input.visibility,
        allowedSections: input.allowedSections,
        equipment: input.equipment,
        level: input.level,
        excludedRiskTags: input.excludedRiskTags,
        injuryLimitations: input.injuryLimitations,
      },
      recalledCount: filtered.length,
      filteredCount: Math.max(exercises.length - filtered.length, 0),
      rerank: ranked.map(({ exercise, score }) => ({
        exerciseId: exercise.id,
        score,
      })),
      finalExerciseIds: candidates.map((exercise) => exercise.id),
      failureReasons: candidates.length > 0 ? [] : [query ? "no_hybrid_match" : "no_exercise_after_filters"],
    },
  };
}

export async function getExerciseFacets(scope: Pick<ExerciseListQuery, "suitability"> = {}): Promise<ExerciseFacets> {
  const exercises = await listExerciseRecords();
  const suitability = scope.suitability;
  const scopedExercises = suitability
    ? exercises.filter((exercise) => getExerciseSuitability(exercise)[suitability])
    : exercises;

  return {
    categories: collectFacet(scopedExercises, "category", "categoryZh"),
    levels: collectFacet(scopedExercises, "level", "levelZh"),
    force: collectFacet(scopedExercises, "force", "forceZh"),
    mechanics: collectFacet(scopedExercises, "mechanic", "mechanicZh"),
    equipment: collectFacet(scopedExercises, "equipment", "equipmentZh"),
    homeRequirements: collectFacet(scopedExercises, "homeRequirement", "homeRequirementZh"),
    muscles: collectArrayFacet(scopedExercises, "primaryMuscles", "primaryMusclesZh"),
    goalTags: collectTagFacet(scopedExercises, "goalTags"),
    riskTags: collectTagFacet(scopedExercises, "riskTags"),
  };
}

function matchesExerciseQuery(exercise: Exercise, query: ExerciseListQuery) {
  if (query.published !== undefined && exercise.isPublished !== query.published) {
    return false;
  }

  if (query.category && exercise.category !== query.category && exercise.categoryZh !== query.category) {
    return false;
  }

  if (query.suitability && !getExerciseSuitability(exercise)[query.suitability]) {
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

// 根据现有动作元数据派生非互斥用途适配结果，供右侧动作库筛选和 facets 复用。
export function getExerciseSuitability(exercise: Exercise): ExerciseSuitabilityFlags {
  const metadata = normalizeExerciseMetadata(exercise);

  if (metadata.allowedSections.length > 0) {
    return {
      warmup: metadata.allowedSections.includes("warmup"),
      training: metadata.allowedSections.includes("training"),
      stretch: metadata.allowedSections.includes("stretch"),
    };
  }

  const text = normalizeSearchText(
    [
      exercise.category,
      exercise.categoryZh,
      exercise.level,
      exercise.levelZh,
      exercise.nameEn,
      exercise.nameZh,
      ...exercise.riskTags,
      ...exercise.goalTags,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const hasStretchSignal = /拉伸|伸展|放松|stretch|stretching|mobility/.test(text);
  const hasWarmupSignal =
    /热身|激活|动态|warmup|warm-up|activation|dynamic|有氧|cardio|开合跳|jumping jack|跑步|running|步行|walk|跳绳|rope|单车|bike|treadmill/.test(
      text,
    );
  const hasTrainingSignal =
    /力量|strength|力量举|powerlifting|增强式|plyometric|奥林匹克|olympic|大力士|strongman|有氧|cardio|训练|training/.test(
      text,
    );
  const hasHighWarmupRisk =
    /高冲击|high_impact|高风险|high_risk|奥林匹克|olympic|大力士|strongman|力量举|powerlifting|advanced|expert/.test(
      text,
    );

  const stretch = hasStretchSignal;
  const warmup = hasWarmupSignal && !hasHighWarmupRisk;
  const training = hasTrainingSignal || (!stretch && !warmup);

  return {
    warmup,
    training,
    stretch,
  };
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

// embeddingText 只拼接动作库可公开检索字段，避免把运行时用户上下文写入全局动作索引。
export function buildExerciseEmbeddingText(exercise: Exercise) {
  const metadata = normalizeExerciseMetadata(exercise);

  return buildEmbeddingText([
    exercise.id,
    exercise.nameZh,
    exercise.nameEn,
    exercise.categoryZh,
    exercise.category,
    exercise.levelZh,
    exercise.level,
    exercise.forceZh,
    exercise.force,
    exercise.mechanicZh,
    exercise.mechanic,
    exercise.equipmentZh,
    exercise.equipment,
    exercise.homeRequirementZh,
    exercise.homeRequirement,
    exercise.primaryMusclesZh,
    exercise.primaryMuscles,
    exercise.secondaryMusclesZh,
    exercise.secondaryMuscles,
    exercise.goalTags,
    exercise.riskTags,
    metadata.allowedSections,
    metadata.intensityRole,
    metadata.movementPattern,
    metadata.difficulty,
    metadata.contraindications,
    exercise.instructionsZh.slice(0, 3),
  ]);
}

export function buildExerciseEmbedding(exercise: Exercise) {
  return createSearchEmbedding(buildExerciseEmbeddingText(exercise));
}

function matchesExerciseHardFilters(exercise: Exercise, input: ExerciseSearchInput) {
  const metadata = normalizeExerciseMetadata(exercise);

  if (input.visibility === "published" && !exercise.isPublished) {
    return false;
  }

  if (input.level && exercise.level !== input.level && exercise.levelZh !== input.level) {
    return false;
  }

  if (input.allowedSections?.length && !input.allowedSections.some((section) => metadata.allowedSections.includes(section))) {
    return false;
  }

  if (input.equipment?.length && !matchesRequestedEquipment(exercise, new Set(input.equipment))) {
    return false;
  }

  if (input.excludedRiskTags?.some((risk) => exercise.riskTags.includes(risk))) {
    return false;
  }

  return true;
}

function scoreExerciseHybridSearch(exercise: Exercise, query: string | undefined): HybridSearchScore {
  const embeddingText = exercise.embeddingText ?? buildExerciseEmbeddingText(exercise);
  const textMatch = scoreHybridTextMatch(query, embeddingText);
  const queryEmbedding = query ? createSearchEmbedding(query) : undefined;
  const exerciseEmbedding = parseSearchEmbedding(exercise.embedding) ?? createSearchEmbedding(embeddingText);
  const vectorScore = queryEmbedding ? Math.max(0, cosineSimilarity(queryEmbedding, exerciseEmbedding)) * 40 : 0;
  const metadata = normalizeExerciseMetadata(exercise);
  const businessScore =
    (exercise.isPublished ? 4 : 0) +
    (metadata.difficulty === "beginner" ? 3 : 0) +
    (metadata.allowedSections.includes("training") ? 2 : 0);
  const reasons: string[] = [];

  if (textMatch.matchedTerms.length > 0) {
    reasons.push(`全文匹配 ${textMatch.matchedTerms.join("、")}`);
  }

  if (vectorScore > 0) {
    reasons.push(`向量相似度 ${vectorScore.toFixed(2)}`);
  }

  if (businessScore > 0) {
    reasons.push("业务适配加权");
  }

  const totalScore =
    query && textMatch.score === 0 && vectorScore < 18
      ? 0
      : textMatch.score + vectorScore + businessScore;

  return {
    textScore: textMatch.score,
    vectorScore,
    businessScore,
    totalScore,
    reasons,
  };
}

function matchesRequestedEquipment(exercise: Exercise, requestedEquipment: Set<string>) {
  if (requestedEquipment.size === 0) {
    return true;
  }

  const exerciseEquipment = [exercise.equipment, exercise.equipmentZh, exercise.homeRequirement, exercise.homeRequirementZh]
    .filter(Boolean)
    .map((value) => value?.trim());

  if (exerciseEquipment.some((value) => value && requestedEquipment.has(value))) {
    return true;
  }

  return requestedEquipment.has("自重") && exercise.homeRequirementZh === "无器械";
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
        label: getExerciseTagLabel(key, tag),
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}
