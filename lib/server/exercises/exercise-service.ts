import "server-only";

import {
  getExerciseRecordById,
  listExerciseFacetsFromStore,
  listExerciseListItems,
  listExerciseRecords,
} from "@/lib/server/exercises/exercise-repository";
import { normalizeExerciseMetadata } from "@/lib/shared/exercises/metadata";
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
  ExerciseFacets,
  ExerciseListQuery,
  ExerciseListResult,
  ExerciseSuitability,
} from "@/lib/shared/exercises/types";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
export const exerciseBodyRegionValues = ["upper_body", "lower_body", "core", "full_body"] as const;

export type ExerciseBodyRegion = (typeof exerciseBodyRegionValues)[number];

// bodyRegions 是 Agent 已结构化后的身体区域合同，服务端只做枚举到动作库 facet 的确定性展开。
export const exerciseBodyRegionTargetMuscles: Record<ExerciseBodyRegion, string[]> = {
  upper_body: ["肩部", "胸部", "背阔肌", "中背部", "背部", "肱二头肌", "肱三头肌", "前臂"],
  lower_body: ["臀部", "股四头肌", "腘绳肌", "小腿", "髋部", "内收肌", "外展肌"],
  core: ["核心", "腹肌", "下背部"],
  full_body: [],
};

const DEFAULT_SORT = "name_asc" as const;

export type ExerciseSuitabilityFlags = Record<ExerciseSuitability, boolean>;

export type ExerciseSearchInput = {
  operation?: "build_exercise_candidate_set";
  query?: string;
  candidateUse?: "answer_only" | "recommendation" | "routine" | "plan" | "patch";
  limit?: number;
  visibility?: "all" | "published";
  filters?: ExerciseSearchFilters;
  resultRequirements?: ExerciseSearchResultRequirements;
  softPreferences?: ExerciseSearchSoftPreferences;
  projection?: ExerciseSearchProjection;
  allowedSections?: ExerciseSuitability[];
  bodyRegions?: ExerciseBodyRegion[];
  goal?: string;
  targetMuscles?: string[];
  equipmentRequired?: string[];
  equipmentAvoided?: string[];
  equipment?: string[];
  homeRequirements?: string[];
  levels?: string[];
  difficulty?: string[];
  riskTagsNotIn?: string[];
  goalTags?: string[];
  movementPatterns?: string[];
  intensityRoles?: string[];
  location?: string;
  level?: string;
  sessionMinutes?: number;
  preferences?: string[];
  avoidances?: string[];
  excludedRiskTags?: string[];
  injuryLimitations?: string[];
};

// ExerciseSearchFilters 是 searchExercises 可执行候选集合的硬过滤合同，不能从 query 隐式推导。
export type ExerciseSearchFilters = {
  bodyRegions?: ExerciseBodyRegion[];
  allowedSections?: ExerciseSuitability[];
  targetMuscles?: string[];
  equipment?: {
    in?: string[];
    notIn?: string[];
  };
  homeRequirements?: string[];
  levels?: string[];
  difficulty?: string[];
  riskTagsNotIn?: string[];
  goalTags?: string[];
  movementPatterns?: string[];
  intensityRoles?: string[];
  visibility?: "all" | "published";
};

// ExerciseSearchResultRequirements 描述候选集合必须证明满足的数量、阶段覆盖和 proof 要求。
export type ExerciseSearchResultRequirements = {
  minCandidates?: number;
  sectionCoverage?: Partial<Record<ExerciseSuitability, { min: number }>>;
  mustBeUsableFor?: "answer" | "routine" | "plan" | "patch";
  requireProof?: boolean;
  requireUnique?: boolean;
};

// ExerciseSearchSoftPreferences 只影响排序或偏好展示，不会绕过硬过滤边界。
export type ExerciseSearchSoftPreferences = {
  preferredEquipment?: string[];
  preferredMuscles?: string[];
  preferredDifficulty?: string[];
};

// ExerciseSearchProjection 控制返回给模型的字段范围，避免投影影响搜索事实。
export type ExerciseSearchProjection = {
  fields?: string[];
  maxCandidatesForModel?: number;
};

// ExerciseSearchInvalidFilter 记录不可执行的结构化 facet，供工具返回可恢复失败。
export type ExerciseSearchInvalidFilter = {
  field: string;
  value?: string;
  reason: "unknown_field" | "invalid_enum" | "unknown_facet";
  allowedValues?: string[];
};

// ExerciseCandidateConstraintProof 证明单个动作命中了哪些已执行 hard filters。
export type ExerciseCandidateConstraintProof = {
  exerciseId: string;
  matchedFilters: string[];
};

// ExerciseSearchResultRequirementProof 记录候选集合对 resultRequirements 的逐项履约状态。
export type ExerciseSearchResultRequirementProof = {
  minCandidates?: { required: number; actual: number; satisfied: boolean };
  sectionCoverage?: Partial<Record<ExerciseSuitability, { required: number; actual: number; satisfied: boolean }>>;
  mustBeUsableFor?: { requirement: string; satisfied: boolean };
  requireProof?: { required: boolean; satisfied: boolean };
  requireUnique?: { required: boolean; actual: number; satisfied: boolean };
};

export type ExerciseControlledSupplementalCandidate = {
  exerciseId: string;
  section: ExerciseSuitability;
  appliedFilters: Record<string, unknown>;
  reason: "section_coverage_supplement";
};

export type ExerciseSearchDiagnostics = {
  query?: string;
  filters: Omit<ExerciseSearchInput, "query" | "limit">;
  normalizedQueryInput: {
    operation?: ExerciseSearchInput["operation"];
    candidateUse: NonNullable<ExerciseSearchInput["candidateUse"]>;
    query?: string;
    filters: Record<string, unknown>;
    resultRequirements: ExerciseSearchResultRequirements;
    softPreferences: ExerciseSearchSoftPreferences;
    projection: ExerciseSearchProjection;
  };
  appliedFilters: Record<string, unknown>;
  invalidFilters: ExerciseSearchInvalidFilter[];
  constraintProof: ExerciseCandidateConstraintProof[];
  resultRequirementProof: ExerciseSearchResultRequirementProof;
  satisfied: boolean;
  queryMode: "none" | "hard_recall" | "ranking_signal";
  unmetResultRequirements: string[];
  expandedTargetMuscles: string[];
  recalledCount: number;
  filteredCount: number;
  rerank: Array<{
    exerciseId: string;
    score: HybridSearchScore;
  }>;
  finalExerciseIds: string[];
  failureReasons: string[];
  unmatchedTargetMuscles: string[];
  unmatchedEquipment: string[];
  suggestedTargetMuscles: string[];
  suggestedEquipment: string[];
  retryable: boolean;
  recoveredFrom?: ExerciseSearchDiagnostics;
  controlledSupplementalCandidates?: ExerciseControlledSupplementalCandidate[];
};

export type ExerciseSearchResult = {
  candidates: Exercise[];
  diagnostics: ExerciseSearchDiagnostics;
};

// ExerciseCandidateSetEvidence 是下游生成、校验和保存链路消费候选集合的证据包。
export type ExerciseCandidateSetEvidence = {
  normalizedQueryInput: ExerciseSearchDiagnostics["normalizedQueryInput"];
  appliedFilters: ExerciseSearchDiagnostics["appliedFilters"];
  invalidFilters: ExerciseSearchDiagnostics["invalidFilters"];
  constraintProof: ExerciseSearchDiagnostics["constraintProof"];
  resultRequirementProof: ExerciseSearchDiagnostics["resultRequirementProof"];
  diagnostics: Pick<ExerciseSearchDiagnostics, "queryMode" | "failureReasons" | "unmetResultRequirements" | "finalExerciseIds">;
  satisfied: boolean;
  exerciseIds: string[];
  controlledSupplementalCandidates?: ExerciseControlledSupplementalCandidate[];
};

export async function listAllExercises(): Promise<Exercise[]> {
  return listExerciseRecords();
}

export async function listExercises(query: ExerciseListQuery = {}): Promise<ExerciseListResult> {
  const pagination = resolvePagination(query);
  const result = await listExerciseListItems({
    query,
    limit: pagination.limit,
    offset: pagination.offset,
    sort: query.sort ?? DEFAULT_SORT,
  });
  const totalPages = Math.ceil(result.total / pagination.limit);

  return {
    items: result.items,
    total: result.total,
    limit: pagination.limit,
    offset: pagination.offset,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages,
    hasNextPage: pagination.offset + pagination.limit < result.total,
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
  const request = normalizeExerciseSearchToolRequest(input);
  const invalidFilters = usesStructuredExecutableCandidateSet(request.effectiveInput)
    ? collectInvalidExerciseSearchFilters(exercises, request.effectiveInput)
    : [];
  const normalized = normalizeExerciseSearchInput(exercises, request.effectiveInput);
  if (invalidFilters.length > 0) {
    return {
      candidates: [],
      diagnostics: buildExerciseSearchDiagnostics({
        input,
        request,
        normalized,
        ranked: [],
        candidates: [],
        query,
        queryMode: "none",
        invalidFilters,
        filteredCount: 0,
        failureReasons: uniqueStrings(["invalid_parameter", ...invalidFilters.map((filter) => `${filter.field}:unknown_facet`)]),
        retryable: true,
      }),
    };
  }
  const queryRequiresHybridMatch = shouldUseQueryAsHybridRecallGate(query, normalized.effectiveInput);
  const scoringQuery = queryRequiresHybridMatch ? query : undefined;
  const filtered = exercises.filter((exercise) => matchesExerciseHardFilters(exercise, normalized.effectiveInput));
  const ranked = filtered
    .map((exercise) => ({
      exercise,
      score: scoreExerciseHybridSearch(exercise, scoringQuery),
    }))
    .filter(({ score }) => !queryRequiresHybridMatch || score.totalScore > 0)
    .sort((left, right) => {
      if (right.score.totalScore !== left.score.totalScore) {
        return right.score.totalScore - left.score.totalScore;
      }

      return compareText(left.exercise.nameZh, right.exercise.nameZh);
    })
    .slice(0, limit);
  const initialCandidates = ranked.map(({ exercise }) => exercise);
  const supplement = createSectionCoverageSupplement({
    exercises,
    candidates: initialCandidates,
    input: normalized.effectiveInput,
    requirements: request.resultRequirements,
  });
  const candidates = supplement.candidates;
  const rankedWithSupplement = ranked.concat(
    supplement.addedCandidates.map((exercise) => ({
      exercise,
      score: scoreExerciseHybridSearch(exercise, undefined),
    })),
  );
  const queryMode = queryRequiresHybridMatch ? "hard_recall" : query ? "ranking_signal" : "none";
  const failureReasons = candidates.length > 0
    ? []
    : buildExerciseSearchFailureReasons(queryRequiresHybridMatch ? query : undefined, normalized);

  return {
    candidates,
    diagnostics: buildExerciseSearchDiagnostics({
      input,
      request,
      normalized,
      ranked: rankedWithSupplement,
      candidates,
      query,
      queryMode,
      invalidFilters,
      filteredCount: Math.max(exercises.length - filtered.length, 0),
      failureReasons,
      retryable: candidates.length === 0 && isRetryableSearchMiss(normalized),
      controlledSupplementalCandidates: supplement.evidence,
    }),
  };
}

export async function getExerciseFacets(scope: Pick<ExerciseListQuery, "suitability"> = {}): Promise<ExerciseFacets> {
  return listExerciseFacetsFromStore(scope);
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

  const levels = uniqueStrings([...(input.levels ?? []), ...(input.level ? [input.level] : [])]);
  if (levels.length && !levels.some((level) => exercise.level === level || exercise.levelZh === level)) {
    return false;
  }

  if (input.allowedSections?.length && !input.allowedSections.some((section) => metadata.allowedSections.includes(section))) {
    return false;
  }

  const requiredEquipment = uniqueStrings([
    ...(input.equipment ?? []),
    ...(input.equipmentRequired ?? []),
  ]);
  if (requiredEquipment.length && !matchesRequestedEquipment(exercise, new Set(requiredEquipment))) {
    return false;
  }

  if (input.equipmentAvoided?.length && matchesAnyEquipment(exercise, new Set(input.equipmentAvoided))) {
    return false;
  }

  if (input.homeRequirements?.length && !matchesAnyHomeRequirement(exercise, new Set(input.homeRequirements))) {
    return false;
  }

  if (input.targetMuscles?.length && !input.targetMuscles.some((muscle) => matchesMuscle(exercise, muscle))) {
    return false;
  }

  if (input.difficulty?.length && (!metadata.difficulty || !input.difficulty.includes(metadata.difficulty))) {
    return false;
  }

  if (input.riskTagsNotIn?.some((risk) => exercise.riskTags.includes(risk))) {
    return false;
  }

  if (input.avoidances?.length && matchesAnyStructuredText(exercise, input.avoidances)) {
    return false;
  }

  if (input.excludedRiskTags?.some((risk) => exercise.riskTags.includes(risk))) {
    return false;
  }

  if (input.goalTags?.length && !input.goalTags.some((tag) => exercise.goalTags.includes(tag))) {
    return false;
  }

  if (input.movementPatterns?.length && (!metadata.movementPattern || !input.movementPatterns.includes(metadata.movementPattern))) {
    return false;
  }

  if (input.intensityRoles?.length && (!metadata.intensityRole || !input.intensityRoles.includes(metadata.intensityRole))) {
    return false;
  }

  return true;
}

// exerciseMatchesCandidateSetFilters 供 Validator 用已登记查询证据复核最终 draft / patch 动作边界。
export function exerciseMatchesCandidateSetFilters(exercise: Exercise, filters: Record<string, unknown>) {
  return matchesExerciseHardFilters(exercise, {
    visibility: readString(filters.visibility) === "published" ? "published" : readString(filters.visibility) === "all" ? "all" : undefined,
    allowedSections: readStringArray(filters.allowedSections).filter(isExerciseSuitability),
    bodyRegions: readStringArray(filters.bodyRegions).filter(isExerciseBodyRegion),
    targetMuscles: readStringArray(filters.targetMuscles),
    equipmentRequired: readStringArray(filters.equipmentRequired),
    equipmentAvoided: readStringArray(filters.equipmentAvoided),
    equipment: readStringArray(filters.equipment),
    homeRequirements: readStringArray(filters.homeRequirements),
    levels: readStringArray(filters.levels),
    level: readString(filters.level),
    difficulty: readStringArray(filters.difficulty),
    riskTagsNotIn: readStringArray(filters.riskTagsNotIn),
    excludedRiskTags: readStringArray(filters.excludedRiskTags),
    goalTags: readStringArray(filters.goalTags),
    movementPatterns: readStringArray(filters.movementPatterns),
    intensityRoles: readStringArray(filters.intensityRoles),
  });
}

type NormalizedExerciseSearchInput = {
  effectiveInput: ExerciseSearchInput;
  expandedTargetMuscles: string[];
  unmatchedTargetMuscles: string[];
  unmatchedEquipment: string[];
  suggestedTargetMuscles: string[];
  suggestedEquipment: string[];
};

type NormalizedExerciseSearchToolRequest = {
  effectiveInput: ExerciseSearchInput;
  normalizedQueryInput: ExerciseSearchDiagnostics["normalizedQueryInput"];
  appliedFilters: Record<string, unknown>;
  resultRequirements: ExerciseSearchResultRequirements;
  softPreferences: ExerciseSearchSoftPreferences;
  projection: ExerciseSearchProjection;
};

function normalizeExerciseSearchToolRequest(input: ExerciseSearchInput): NormalizedExerciseSearchToolRequest {
  const filters = input.filters ?? {};
  const equipmentRequired = uniqueStrings([
    ...(filters.equipment?.in ?? []),
    ...(input.equipmentRequired ?? []),
    ...(input.equipment ?? []),
  ]);
  const equipmentAvoided = uniqueStrings([
    ...(filters.equipment?.notIn ?? []),
    ...(input.equipmentAvoided ?? []),
  ]);
  const allowedSections = uniqueStrings([
    ...(filters.allowedSections ?? []),
    ...(input.allowedSections ?? []),
  ]).filter(isExerciseSuitability);
  const bodyRegions = uniqueStrings([
    ...(filters.bodyRegions ?? []),
    ...(input.bodyRegions ?? []),
  ]).filter(isExerciseBodyRegion);
  const levels = uniqueStrings([
    ...(filters.levels ?? []),
    ...(input.levels ?? []),
    ...(input.level ? [input.level] : []),
  ]);
  const riskTagsNotIn = uniqueStrings([
    ...(filters.riskTagsNotIn ?? []),
    ...(input.riskTagsNotIn ?? []),
    ...(input.excludedRiskTags ?? []),
  ]);
  const effectiveInput: ExerciseSearchInput = {
    ...input,
    operation: input.operation,
    candidateUse: input.candidateUse ?? "answer_only",
    visibility: filters.visibility ?? input.visibility ?? "published",
    allowedSections: allowedSections.length > 0 ? allowedSections : undefined,
    bodyRegions: bodyRegions.length > 0 ? bodyRegions : undefined,
    targetMuscles: uniqueStrings([...(filters.targetMuscles ?? []), ...(input.targetMuscles ?? [])]),
    equipmentRequired: equipmentRequired.length > 0 ? equipmentRequired : undefined,
    equipmentAvoided: equipmentAvoided.length > 0 ? equipmentAvoided : undefined,
    equipment: undefined,
    homeRequirements: uniqueStrings([...(filters.homeRequirements ?? []), ...(input.homeRequirements ?? [])]),
    levels: levels.length > 0 ? levels : undefined,
    level: levels[0] ?? input.level,
    difficulty: uniqueStrings([...(filters.difficulty ?? []), ...(input.difficulty ?? [])]),
    riskTagsNotIn: riskTagsNotIn.length > 0 ? riskTagsNotIn : undefined,
    goalTags: uniqueStrings([...(filters.goalTags ?? []), ...(input.goalTags ?? [])]),
    movementPatterns: uniqueStrings([...(filters.movementPatterns ?? []), ...(input.movementPatterns ?? [])]),
    intensityRoles: uniqueStrings([...(filters.intensityRoles ?? []), ...(input.intensityRoles ?? [])]),
  };
  const appliedFilters = compactFilterRecord({
    visibility: effectiveInput.visibility,
    allowedSections: effectiveInput.allowedSections,
    bodyRegions: effectiveInput.bodyRegions,
    targetMuscles: effectiveInput.targetMuscles,
    equipmentRequired: effectiveInput.equipmentRequired,
    equipmentAvoided: effectiveInput.equipmentAvoided,
    homeRequirements: effectiveInput.homeRequirements,
    levels: effectiveInput.levels,
    difficulty: effectiveInput.difficulty,
    riskTagsNotIn: effectiveInput.riskTagsNotIn,
    goalTags: effectiveInput.goalTags,
    movementPatterns: effectiveInput.movementPatterns,
    intensityRoles: effectiveInput.intensityRoles,
  });
  const resultRequirements = input.resultRequirements ?? {};
  const softPreferences = input.softPreferences ?? {};
  const projection = input.projection ?? {};

  return {
    effectiveInput,
    appliedFilters,
    resultRequirements,
    softPreferences,
    projection,
    normalizedQueryInput: {
      operation: input.operation,
      candidateUse: effectiveInput.candidateUse ?? "answer_only",
      query: input.query?.trim() || undefined,
      filters: appliedFilters,
      resultRequirements,
      softPreferences,
      projection,
    },
  };
}

function normalizeExerciseSearchInput(exercises: Exercise[], input: ExerciseSearchInput): NormalizedExerciseSearchInput {
  const availableTargetMuscles = collectAvailableTargetMuscles(exercises);
  const availableEquipment = collectAvailableEquipment(exercises);
  const expandedTargetMuscles = expandBodyRegionTargetMuscles(input.bodyRegions ?? [], availableTargetMuscles);
  const requestedTargetMuscles = uniqueStrings(input.targetMuscles ?? []);
  const requestedEquipment = uniqueStrings([...(input.equipment ?? []), ...(input.equipmentRequired ?? [])]);
  const unmatchedTargetMuscles = requestedTargetMuscles.filter((muscle) => !availableTargetMuscles.has(muscle));
  const unmatchedEquipment = requestedEquipment.filter((equipment) => !availableEquipment.has(equipment));
  const canonicalTargetMuscles = uniqueStrings(
    unmatchedTargetMuscles.flatMap((muscle) => canonicalTargetMusclesForUnknownFacet(muscle, availableTargetMuscles)),
  );
  const suggestedTargetMuscles = uniqueStrings(
    unmatchedTargetMuscles.flatMap((muscle) => suggestTargetMusclesForUnknownFacet(muscle, availableTargetMuscles)),
  );
  const suggestedEquipment = uniqueStrings(
    unmatchedEquipment.flatMap((equipment) => suggestEquipmentForUnknownFacet(equipment, availableEquipment)),
  );
  const effectiveTargetMuscles = uniqueStrings([
    ...requestedTargetMuscles.filter((muscle) => availableTargetMuscles.has(muscle)),
    ...canonicalTargetMuscles,
    ...expandedTargetMuscles,
  ]);

  return {
    effectiveInput: {
      ...input,
      targetMuscles: effectiveTargetMuscles.length > 0 ? effectiveTargetMuscles : input.targetMuscles,
    },
    expandedTargetMuscles,
    unmatchedTargetMuscles,
    unmatchedEquipment,
    suggestedTargetMuscles,
    suggestedEquipment,
  };
}

function buildExerciseSearchDiagnostics(input: {
  input: ExerciseSearchInput;
  request: NormalizedExerciseSearchToolRequest;
  normalized: NormalizedExerciseSearchInput;
  ranked: Array<{ exercise: Exercise; score: HybridSearchScore }>;
  candidates: Exercise[];
  query: string | undefined;
  queryMode: ExerciseSearchDiagnostics["queryMode"];
  invalidFilters: ExerciseSearchInvalidFilter[];
  filteredCount: number;
  failureReasons: string[];
  retryable: boolean;
  controlledSupplementalCandidates?: ExerciseControlledSupplementalCandidate[];
}): ExerciseSearchDiagnostics {
  const requirementProof = evaluateExerciseResultRequirements(input.candidates, input.request.resultRequirements);
  const unmetResultRequirements = collectUnmetResultRequirements(requirementProof);
  const failureReasons = uniqueStrings([
    ...input.failureReasons,
    ...(unmetResultRequirements.length > 0 ? unmetResultRequirements : []),
  ]);
  const satisfied =
    input.invalidFilters.length === 0
    && input.candidates.length > 0
    && unmetResultRequirements.length === 0;

  return {
    query: input.query,
    filters: {
      operation: input.input.operation,
      visibility: input.request.effectiveInput.visibility,
      candidateUse: input.request.effectiveInput.candidateUse,
      filters: input.input.filters,
      resultRequirements: input.input.resultRequirements,
      softPreferences: input.input.softPreferences,
      projection: input.input.projection,
      allowedSections: input.request.effectiveInput.allowedSections,
      bodyRegions: input.request.effectiveInput.bodyRegions,
      goal: input.request.effectiveInput.goal,
      targetMuscles: input.request.effectiveInput.targetMuscles,
      equipmentRequired: input.request.effectiveInput.equipmentRequired,
      equipmentAvoided: input.request.effectiveInput.equipmentAvoided,
      homeRequirements: input.request.effectiveInput.homeRequirements,
      levels: input.request.effectiveInput.levels,
      difficulty: input.request.effectiveInput.difficulty,
      riskTagsNotIn: input.request.effectiveInput.riskTagsNotIn,
      goalTags: input.request.effectiveInput.goalTags,
      movementPatterns: input.request.effectiveInput.movementPatterns,
      intensityRoles: input.request.effectiveInput.intensityRoles,
      location: input.request.effectiveInput.location,
      level: input.request.effectiveInput.level,
      sessionMinutes: input.request.effectiveInput.sessionMinutes,
      preferences: input.request.effectiveInput.preferences,
      avoidances: input.request.effectiveInput.avoidances,
      excludedRiskTags: input.request.effectiveInput.excludedRiskTags,
      injuryLimitations: input.request.effectiveInput.injuryLimitations,
    },
    normalizedQueryInput: input.request.normalizedQueryInput,
    appliedFilters: input.request.appliedFilters,
    invalidFilters: input.invalidFilters,
    constraintProof: input.candidates.map((exercise) => buildCandidateConstraintProof(exercise, input.request.appliedFilters)),
    resultRequirementProof: requirementProof,
    satisfied,
    queryMode: input.queryMode,
    unmetResultRequirements,
    expandedTargetMuscles: input.normalized.expandedTargetMuscles,
    recalledCount: input.ranked.length > 0 ? input.ranked.length : input.candidates.length,
    filteredCount: input.filteredCount,
    rerank: input.ranked.map(({ exercise, score }) => ({
      exerciseId: exercise.id,
      score,
    })),
    finalExerciseIds: input.candidates.map((exercise) => exercise.id),
    failureReasons,
    unmatchedTargetMuscles: input.normalized.unmatchedTargetMuscles,
    unmatchedEquipment: input.normalized.unmatchedEquipment,
    suggestedTargetMuscles: input.normalized.suggestedTargetMuscles,
    suggestedEquipment: input.normalized.suggestedEquipment,
    retryable: input.retryable || input.invalidFilters.length > 0 || unmetResultRequirements.length > 0,
    controlledSupplementalCandidates: input.controlledSupplementalCandidates ?? [],
  };
}

// createSectionCoverageSupplement 只用动作库结构化事实补齐 routine/plan/patch 的非主训练 section，不读取用户原文。
function createSectionCoverageSupplement(input: {
  exercises: Exercise[];
  candidates: Exercise[];
  input: ExerciseSearchInput;
  requirements: ExerciseSearchResultRequirements;
}): {
  candidates: Exercise[];
  addedCandidates: Exercise[];
  evidence: ExerciseControlledSupplementalCandidate[];
} {
  if (!shouldUseSectionAwareSupplement(input.input, input.requirements) || input.candidates.length === 0) {
    return { candidates: input.candidates, addedCandidates: [], evidence: [] };
  }

  const selectedIds = new Set(input.candidates.map((exercise) => exercise.id));
  const candidates = [...input.candidates];
  const addedCandidates: Exercise[] = [];
  const evidence: ExerciseControlledSupplementalCandidate[] = [];
  const currentProof = evaluateExerciseResultRequirements(candidates, input.requirements);

  for (const [section, requirement] of Object.entries(input.requirements.sectionCoverage ?? {})) {
    if (!isExerciseSuitability(section) || !requirement) {
      continue;
    }

    const current = currentProof.sectionCoverage?.[section]?.actual ?? 0;
    const missingCount = Math.max(0, requirement.min - current);

    for (let index = 0; index < missingCount; index += 1) {
      const supplement = pickSectionSupplementalExercise(input.exercises, selectedIds, section, input.input);
      if (!supplement) {
        break;
      }

      selectedIds.add(supplement.exercise.id);
      candidates.push(supplement.exercise);
      addedCandidates.push(supplement.exercise);
      evidence.push({
        exerciseId: supplement.exercise.id,
        section,
        appliedFilters: supplement.appliedFilters,
        reason: "section_coverage_supplement",
      });
    }
  }

  return { candidates, addedCandidates, evidence };
}

function shouldUseSectionAwareSupplement(
  input: ExerciseSearchInput,
  requirements: ExerciseSearchResultRequirements,
) {
  return (
    input.candidateUse === "routine" ||
    input.candidateUse === "plan" ||
    input.candidateUse === "patch"
  ) && Boolean(requirements.sectionCoverage);
}

function pickSectionSupplementalExercise(
  exercises: Exercise[],
  selectedIds: Set<string>,
  section: ExerciseSuitability,
  input: ExerciseSearchInput,
): { exercise: Exercise; appliedFilters: Record<string, unknown> } | null {
  const baseFilters = createSupplementalSectionFilters(section, input, false);
  const strictMatches = exercises
    .filter((exercise) => !selectedIds.has(exercise.id))
    .filter((exercise) => exerciseMatchesCandidateSetFilters(exercise, baseFilters));

  const preferred = strictMatches.find(isNoEquipmentOrBodyweightExercise) ?? strictMatches[0];
  if (preferred) {
    return { exercise: preferred, appliedFilters: baseFilters };
  }

  const relaxedFilters = createSupplementalSectionFilters(section, input, true);
  const relaxed = exercises
    .filter((exercise) => !selectedIds.has(exercise.id))
    .find((exercise) => exerciseMatchesCandidateSetFilters(exercise, relaxedFilters));

  return relaxed ? { exercise: relaxed, appliedFilters: relaxedFilters } : null;
}

function createSupplementalSectionFilters(
  section: ExerciseSuitability,
  input: ExerciseSearchInput,
  relaxBodyRegion: boolean,
) {
  return compactFilterRecord({
    visibility: input.visibility,
    allowedSections: [section],
    bodyRegions: relaxBodyRegion ? undefined : input.bodyRegions,
    targetMuscles: relaxBodyRegion ? undefined : input.targetMuscles,
    equipmentAvoided: input.equipmentAvoided,
    homeRequirements: input.homeRequirements,
    levels: input.levels,
    difficulty: input.difficulty,
    riskTagsNotIn: input.riskTagsNotIn,
    excludedRiskTags: input.excludedRiskTags,
    goalTags: input.goalTags,
    movementPatterns: input.movementPatterns,
    intensityRoles: input.intensityRoles,
  });
}

function isNoEquipmentOrBodyweightExercise(exercise: Exercise) {
  return ["bodyweight", "自重", "no_equipment", "无器械"].some((value) => (
    exercise.equipment === value ||
    exercise.equipmentZh === value ||
    exercise.homeRequirement === value ||
    exercise.homeRequirementZh === value
  ));
}

function evaluateExerciseResultRequirements(
  candidates: Exercise[],
  requirements: ExerciseSearchResultRequirements,
): ExerciseSearchResultRequirementProof {
  const sectionCoverage: ExerciseSearchResultRequirementProof["sectionCoverage"] = {};

  for (const [section, requirement] of Object.entries(requirements.sectionCoverage ?? {})) {
    if (!isExerciseSuitability(section) || !requirement) {
      continue;
    }
    const actual = candidates.filter((exercise) => normalizeExerciseMetadata(exercise).allowedSections.includes(section)).length;
    sectionCoverage[section] = {
      required: requirement.min,
      actual,
      satisfied: actual >= requirement.min,
    };
  }

  return {
    minCandidates: requirements.minCandidates !== undefined
      ? {
          required: requirements.minCandidates,
          actual: candidates.length,
          satisfied: candidates.length >= requirements.minCandidates,
        }
      : undefined,
    sectionCoverage: Object.keys(sectionCoverage).length > 0 ? sectionCoverage : undefined,
    mustBeUsableFor: requirements.mustBeUsableFor
      ? {
          requirement: requirements.mustBeUsableFor,
          satisfied: candidates.length > 0,
        }
      : undefined,
    requireProof: requirements.requireProof !== undefined
      ? {
          required: requirements.requireProof,
          satisfied: true,
        }
      : undefined,
    requireUnique: requirements.requireUnique !== undefined
      ? {
          required: requirements.requireUnique,
          actual: candidates.length,
          satisfied: !requirements.requireUnique || candidates.length === 1,
        }
      : undefined,
  };
}

function collectUnmetResultRequirements(proof: ExerciseSearchResultRequirementProof) {
  const unmet: string[] = [];

  if (proof.minCandidates && !proof.minCandidates.satisfied) {
    unmet.push(proof.minCandidates.actual === 0 ? "insufficient_candidates" : "result_requirement_unmet:minCandidates");
  }

  for (const [section, coverage] of Object.entries(proof.sectionCoverage ?? {})) {
    if (coverage && !coverage.satisfied) {
      unmet.push(`result_requirement_unmet:sectionCoverage.${section}`);
    }
  }

  if (proof.mustBeUsableFor && !proof.mustBeUsableFor.satisfied) {
    unmet.push("result_requirement_unmet:mustBeUsableFor");
  }

  if (proof.requireUnique && !proof.requireUnique.satisfied) {
    unmet.push("ambiguous_resource");
  }

  return unmet;
}

function buildCandidateConstraintProof(exercise: Exercise, filters: Record<string, unknown>): ExerciseCandidateConstraintProof {
  const metadata = normalizeExerciseMetadata(exercise);
  const matchedFilters: string[] = [];

  for (const key of Object.keys(filters)) {
    if (key === "allowedSections" && readStringArray(filters[key]).some((section) => metadata.allowedSections.includes(section as ExerciseSuitability))) {
      matchedFilters.push(key);
      continue;
    }
    if (key === "visibility" && (!filters[key] || filters[key] === "all" || exercise.isPublished)) {
      matchedFilters.push(key);
      continue;
    }
    if (key !== "allowedSections" && key !== "visibility" && exerciseMatchesCandidateSetFilters(exercise, { [key]: filters[key] })) {
      matchedFilters.push(key);
    }
  }

  return {
    exerciseId: exercise.id,
    matchedFilters,
  };
}

function collectInvalidExerciseSearchFilters(exercises: Exercise[], input: ExerciseSearchInput) {
  const availableTargetMuscles = collectAvailableTargetMuscles(exercises);
  const availableEquipment = collectAvailableEquipment(exercises);
  const availableHomeRequirements = collectAvailableHomeRequirements(exercises);
  const availableLevels = collectAvailableLevels(exercises);
  const availableDifficulty = collectAvailableMetadataValues(exercises, "difficulty");
  const availableRiskTags = new Set(exercises.flatMap((exercise) => exercise.riskTags));
  const availableGoalTags = new Set(exercises.flatMap((exercise) => exercise.goalTags));
  const availableMovementPatterns = collectAvailableMetadataValues(exercises, "movementPattern");
  const availableIntensityRoles = collectAvailableMetadataValues(exercises, "intensityRole");
  const invalid: ExerciseSearchInvalidFilter[] = [];

  pushUnknownFacetIssues(invalid, "targetMuscles", input.targetMuscles, availableTargetMuscles);
  pushUnknownFacetIssues(invalid, "equipmentRequired", input.equipmentRequired, availableEquipment);
  pushUnknownFacetIssues(invalid, "equipmentAvoided", input.equipmentAvoided, availableEquipment);
  pushUnknownFacetIssues(invalid, "homeRequirements", input.homeRequirements, availableHomeRequirements);
  pushUnknownFacetIssues(invalid, "levels", input.levels, availableLevels);
  pushUnknownFacetIssues(invalid, "difficulty", input.difficulty, availableDifficulty);
  pushUnknownFacetIssues(invalid, "riskTagsNotIn", input.riskTagsNotIn, availableRiskTags);
  pushUnknownFacetIssues(invalid, "goalTags", input.goalTags, availableGoalTags);
  pushUnknownFacetIssues(invalid, "movementPatterns", input.movementPatterns, availableMovementPatterns);
  pushUnknownFacetIssues(invalid, "intensityRoles", input.intensityRoles, availableIntensityRoles);

  return invalid;
}

function expandBodyRegionTargetMuscles(bodyRegions: ExerciseBodyRegion[], availableTargetMuscles: Set<string>) {
  return uniqueStrings(
    bodyRegions.flatMap((region) => exerciseBodyRegionTargetMuscles[region] ?? []),
  ).filter((muscle) => availableTargetMuscles.has(muscle));
}

function collectAvailableTargetMuscles(exercises: Exercise[]) {
  return new Set(
    exercises.flatMap((exercise) => [
      ...exercise.primaryMuscles,
      ...exercise.primaryMusclesZh,
      ...exercise.secondaryMuscles,
      ...exercise.secondaryMusclesZh,
    ]).filter(Boolean),
  );
}

function collectAvailableEquipment(exercises: Exercise[]) {
  return new Set(
    exercises.flatMap((exercise) => [
      exercise.equipment,
      exercise.equipmentZh,
      exercise.homeRequirement,
      exercise.homeRequirementZh,
    ]).filter(Boolean) as string[],
  );
}

function collectAvailableHomeRequirements(exercises: Exercise[]) {
  return new Set(
    exercises.flatMap((exercise) => [
      exercise.homeRequirement,
      exercise.homeRequirementZh,
    ]).filter(Boolean) as string[],
  );
}

function collectAvailableLevels(exercises: Exercise[]) {
  return new Set(
    exercises.flatMap((exercise) => [
      exercise.level,
      exercise.levelZh,
    ]).filter(Boolean) as string[],
  );
}

function collectAvailableMetadataValues(exercises: Exercise[], key: "difficulty" | "movementPattern" | "intensityRole") {
  const values = new Set<string>();

  for (const exercise of exercises) {
    const value = normalizeExerciseMetadata(exercise)[key];
    if (typeof value === "string" && value.trim()) {
      values.add(value);
    }
  }

  return values;
}

function pushUnknownFacetIssues(
  issues: ExerciseSearchInvalidFilter[],
  field: string,
  values: string[] | undefined,
  allowedValues: Set<string>,
) {
  for (const value of values ?? []) {
    if (!allowedValues.has(value)) {
      issues.push({
        field,
        value,
        reason: "unknown_facet",
        allowedValues: Array.from(allowedValues).slice(0, 40),
      });
    }
  }
}

function compactFilterRecord(filters: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null && value !== "";
    }),
  );
}

function suggestTargetMusclesForUnknownFacet(value: string, availableTargetMuscles: Set<string>) {
  const canonical = canonicalTargetMusclesForUnknownFacet(value, availableTargetMuscles);
  if (canonical.length > 0) {
    return canonical;
  }

  const normalized = normalizeSearchText(value).replace(/\s+/g, "_");
  const region =
    normalized === "upper_body" || normalized === "upperbody" || normalized === "上肢" || normalized === "上半身"
      ? "upper_body"
      : normalized === "lower_body" || normalized === "lowerbody" || normalized === "下肢" || normalized === "下半身" || normalized === "腿" || normalized === "腿部"
        ? "lower_body"
        : normalized === "core" || normalized === "核心" || normalized === "腹部" || normalized === "腹肌"
          ? "core"
          : normalized === "full_body" || normalized === "fullbody" || normalized === "全身"
            ? "full_body"
            : undefined;

  return region ? expandBodyRegionTargetMuscles([region], availableTargetMuscles) : [];
}

function canonicalTargetMusclesForUnknownFacet(value: string, availableTargetMuscles: Set<string>) {
  const normalized = normalizeSearchText(value).replace(/\s+/g, "_");
  const directAliases =
    normalized === "胸" || normalized === "胸肌" || normalized === "胸部肌群" || normalized === "胸大肌" || normalized === "pectoralis" || normalized === "pectorals"
      ? ["胸部", "chest"]
      : normalized === "背" || normalized === "背部肌群"
        ? ["背部", "背阔肌", "中背部", "lats", "middle_back"]
        : normalized === "肩" || normalized === "肩膀"
          ? ["肩部", "shoulders"]
          : [];

  return directAliases.filter((muscle) => availableTargetMuscles.has(muscle));
}

function suggestEquipmentForUnknownFacet(value: string, availableEquipment: Set<string>) {
  const normalized = normalizeSearchText(value).replace(/\s+/g, "");
  const candidates =
    normalized === "dumbbells" || normalized === "dumbbell" || normalized === "哑铃"
      ? ["dumbbell", "哑铃"]
      : normalized === "bodyweight" || normalized === "noequipment" || normalized === "自重" || normalized === "无器械"
        ? ["bodyweight", "自重", "no_equipment", "无器械"]
        : normalized === "resistanceband" || normalized === "band" || normalized === "弹力带"
          ? ["resistance_band", "弹力带"]
          : [];

  return candidates.filter((item) => availableEquipment.has(item));
}

function buildExerciseSearchFailureReasons(query: string | undefined, normalized: NormalizedExerciseSearchInput) {
  const reasons = query ? ["no_hybrid_match"] : ["no_exercise_after_filters"];

  if (normalized.unmatchedTargetMuscles.length > 0) {
    reasons.push("unknown_target_muscle");
  }

  if (normalized.unmatchedEquipment.length > 0) {
    reasons.push("unknown_equipment");
  }

  return reasons;
}

function isRetryableSearchMiss(normalized: NormalizedExerciseSearchInput) {
  return normalized.suggestedTargetMuscles.length > 0 || normalized.suggestedEquipment.length > 0;
}

// recommendation / routine / plan 已有结构化候选边界时，query 只是排序提示，不能把可执行候选硬清零。
function shouldUseQueryAsHybridRecallGate(query: string | undefined, input: ExerciseSearchInput) {
  if (!query) {
    return false;
  }

  if (usesStructuredExecutableCandidateSet(input) && hasStructuredExecutableSearchBoundary(input)) {
    return false;
  }

  return true;
}

function usesStructuredExecutableCandidateSet(input: ExerciseSearchInput) {
  return input.candidateUse === "recommendation" || input.candidateUse === "routine" || input.candidateUse === "plan" || input.candidateUse === "patch";
}

function hasStructuredExecutableSearchBoundary(input: ExerciseSearchInput) {
  return Boolean(
    input.allowedSections?.length ||
    input.bodyRegions?.length ||
    input.targetMuscles?.length ||
    input.equipmentRequired?.length ||
    input.equipment?.length ||
    input.goal ||
    input.sessionMinutes,
  );
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

function matchesAnyEquipment(exercise: Exercise, avoidedEquipment: Set<string>) {
  if (avoidedEquipment.size === 0) {
    return false;
  }

  const exerciseEquipment = [exercise.equipment, exercise.equipmentZh, exercise.homeRequirement, exercise.homeRequirementZh]
    .filter(Boolean)
    .map((value) => value?.trim());

  return exerciseEquipment.some((value) => value && avoidedEquipment.has(value));
}

function matchesAnyHomeRequirement(exercise: Exercise, homeRequirements: Set<string>) {
  if (homeRequirements.size === 0) {
    return true;
  }

  const exerciseHomeRequirements = [exercise.homeRequirement, exercise.homeRequirementZh]
    .filter(Boolean)
    .map((value) => value?.trim());

  return exerciseHomeRequirements.some((value) => value && homeRequirements.has(value));
}

function matchesAnyStructuredText(exercise: Exercise, values: string[]) {
  const haystack = normalizeSearchText([
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
    ...exercise.contraindications,
  ].filter(Boolean).join(" "));

  return values
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)
    .some((value) => haystack.includes(value));
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isExerciseSuitability(value: string): value is ExerciseSuitability {
  return value === "warmup" || value === "training" || value === "stretch";
}

function isExerciseBodyRegion(value: string): value is ExerciseBodyRegion {
  return (exerciseBodyRegionValues as readonly string[]).includes(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
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

function compareText(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN");
}
