import "server-only";

import { Prisma } from "@prisma/client";

import {
  resolveExerciseImageUrls,
  withResolvedExerciseImageUrls,
} from "@/lib/server/exercise-images/exercise-image-resolver";
import { agentRuntimeConfig } from "@/lib/server/config";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";
import {
  buildExerciseResourceFilterApplication,
  isExerciseResourceHardFilterApplied,
  type ExerciseResourceFilterApplication,
} from "@/lib/server/exercises/exercise-resource-filter-policy";
import {
  parseExerciseExecutionTaxonomy,
  type ExerciseExecutionTaxonomy,
} from "@/lib/shared/exercises/execution-taxonomy";
import { normalizeExerciseMetadata } from "@/lib/shared/exercises/metadata";
import { getExerciseTagLabel } from "@/lib/shared/exercises/tag-labels";
import type {
  Exercise,
  ExerciseFacets,
  ExerciseFacetItem,
  ExerciseListItem,
  ExerciseListQuery,
  ExerciseSort,
  ExerciseSuitability,
} from "@/lib/shared/exercises/types";

/** EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED 是动作查询 payload 的安全上限，防止配置误调撑爆模型上下文。 */
export const EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED = 24;
/** EXERCISE_RESOURCE_NO_EQUIPMENT_QUERY_VALUES 是 Planner 可见的无外部器械 canonical 查询值，不是 homeRequirement facet。 */
export const EXERCISE_RESOURCE_NO_EQUIPMENT_QUERY_VALUES = ["no_equipment"] as const;

const bodyweightEquipmentValues = ["body only", "bodyweight"] as const;
const bodyweightEquipmentZhValues = ["自重"] as const;
const removedHomeRequirementNoEquipmentValues = ["none", "no_equipment", "无器械"] as const;

export type ExerciseResourceSummary = Pick<
  Exercise,
  | "id"
  | "nameEn"
  | "nameZh"
  | "category"
  | "categoryZh"
  | "level"
  | "levelZh"
  | "force"
  | "forceZh"
  | "mechanic"
  | "mechanicZh"
  | "equipment"
  | "equipmentZh"
  | "homeRequirement"
  | "homeRequirementZh"
  | "primaryMuscles"
  | "primaryMusclesZh"
  | "secondaryMuscles"
  | "secondaryMusclesZh"
  | "imageUrls"
  | "allowedSections"
  | "goalTags"
  | "riskTags"
  | "reviewStatus"
  | "isPublished"
>;

export type ExerciseResourceSearchInput = {
  exerciseNames?: string[];
  category?: string;
  suitability?: ExerciseSuitability;
  level?: string;
  force?: string;
  mechanic?: string;
  equipment?: string;
  homeRequirement?: string;
  muscles?: string[];
  goalTag?: string;
  riskTag?: string;
  requiredExerciseIds?: string[];
  excludeExerciseIds?: string[];
  maxReturned?: number;
  sort: ExerciseSort;
};

export type ExerciseResourceFilterField = Exclude<keyof ExerciseResourceSearchInput, "sort" | "maxReturned">;

export type ExerciseResourceAppliedFilter = {
  field: ExerciseResourceFilterField;
  value: string | string[];
};

export type ExerciseResourceFilterSemantic = {
  field: "equipment";
  requestedValue: string;
  databaseMapping: {
    equipment: string[];
    equipmentZh: string[];
  };
  note: string;
};

export type ExerciseResourceSearchResult = {
  query: ExerciseResourceSearchInput;
  appliedFilters: ExerciseResourceAppliedFilter[];
  filterApplication: ExerciseResourceFilterApplication;
  filterSemantics: ExerciseResourceFilterSemantic[];
  diagnostics: ExerciseResourceNameDiagnostic[];
  zeroMatchMuscles: string[];
  totalMatches: number;
  returnedCount: number;
  maxReturned: number;
  truncated: boolean;
  excludedCount: number;
  exercises: ExerciseResourceSummary[];
};

export type ExerciseResourceFacetCatalog = {
  muscles: string[];
  categories: string[];
  levels: string[];
  forces: string[];
  mechanics: string[];
  equipment: string[];
  homeRequirements: string[];
  goalTags: string[];
  riskTags: string[];
  suitabilities: ExerciseSuitability[];
};

export type ExerciseResourceNameDiagnostic = {
  code:
    | "exercise_name_not_found"
    | "exercise_name_section_conflict"
    | "exercise_name_filter_mismatch"
    | "exercise_name_ambiguous"
    | "exercise_name_too_broad";
  exerciseName: string;
  totalMatches?: number;
  returnedCount?: number;
  conflictFields?: string[];
};

type ExerciseExecutionTaxonomyRecord = {
  requiresExternalEquipment: boolean | null;
  requiredEquipmentTags: string[];
  supportRequirementTags: string[];
  setupComplexity: string;
  impactLevel: string | null;
  noiseLevel: string | null;
};

type ExerciseRecord = Omit<
  Exercise,
  | keyof ExerciseExecutionTaxonomyRecord
  | "allowedSections"
  | "intensityRole"
  | "movementPattern"
  | "difficulty"
  | "contraindications"
  | "regressionExerciseIds"
  | "progressionExerciseIds"
  | "substitutionGroupId"
  | "embedding"
> & {
  allowedSections?: string[];
  intensityRole?: string | null;
  movementPattern?: string | null;
  difficulty?: string | null;
  contraindications?: string[];
  regressionExerciseIds?: string[];
  progressionExerciseIds?: string[];
  substitutionGroupId?: string | null;
  embeddingText?: string | null;
  embedding?: unknown;
} & ExerciseExecutionTaxonomyRecord;

const exerciseListSelect = {
  id: true,
  nameEn: true,
  nameZh: true,
  category: true,
  categoryZh: true,
  level: true,
  levelZh: true,
  force: true,
  forceZh: true,
  mechanic: true,
  mechanicZh: true,
  equipment: true,
  equipmentZh: true,
  homeRequirement: true,
  homeRequirementZh: true,
  requiresExternalEquipment: true,
  requiredEquipmentTags: true,
  supportRequirementTags: true,
  setupComplexity: true,
  impactLevel: true,
  noiseLevel: true,
  primaryMuscles: true,
  primaryMusclesZh: true,
  images: true,
  imageUrls: true,
  allowedSections: true,
  intensityRole: true,
  movementPattern: true,
  difficulty: true,
  goalTags: true,
  riskTags: true,
  reviewStatus: true,
  isPublished: true,
} satisfies Prisma.ExerciseSelect;

const exerciseResourceSummarySelect = {
  id: true,
  sourceId: true,
  nameEn: true,
  nameZh: true,
  category: true,
  categoryZh: true,
  level: true,
  levelZh: true,
  force: true,
  forceZh: true,
  mechanic: true,
  mechanicZh: true,
  equipment: true,
  equipmentZh: true,
  homeRequirement: true,
  homeRequirementZh: true,
  primaryMuscles: true,
  primaryMusclesZh: true,
  secondaryMuscles: true,
  secondaryMusclesZh: true,
  images: true,
  imageUrls: true,
  allowedSections: true,
  goalTags: true,
  riskTags: true,
  reviewStatus: true,
  isPublished: true,
} satisfies Prisma.ExerciseSelect;

type ExerciseResourceSummaryRecord = Prisma.ExerciseGetPayload<{ select: typeof exerciseResourceSummarySelect }>;

type ExerciseListRecord = Prisma.ExerciseGetPayload<{ select: typeof exerciseListSelect }>;

export type ExerciseListPageInput = {
  query: ExerciseListQuery;
  limit: number;
  offset: number;
  sort: ExerciseSort;
};

export type ExerciseListPageRecords = {
  items: ExerciseListItem[];
  total: number;
};

type ScalarFacetField =
  | "category"
  | "categoryZh"
  | "level"
  | "levelZh"
  | "force"
  | "forceZh"
  | "mechanic"
  | "mechanicZh"
  | "equipment"
  | "equipmentZh"
  | "homeRequirement"
  | "homeRequirementZh";

type ScalarFacetConfig = {
  valueField: ScalarFacetField;
  labelField: ScalarFacetField;
  nullable: boolean;
};

type ArrayFacetConfig = {
  valueColumn: "primaryMuscles" | "goalTags" | "riskTags";
  labelColumn?: "primaryMusclesZh";
  tagKind?: "goalTags" | "riskTags";
};

type RawFacetRow = {
  value: string | null;
  label: string | null;
  count: number | bigint;
};

type ExerciseImageFields = Pick<Exercise, "id" | "images" | "imageUrls">;

const scalarFacetConfigs = {
  categories: { valueField: "category", labelField: "categoryZh", nullable: true },
  levels: { valueField: "level", labelField: "levelZh", nullable: true },
  force: { valueField: "force", labelField: "forceZh", nullable: true },
  mechanics: { valueField: "mechanic", labelField: "mechanicZh", nullable: true },
  equipment: { valueField: "equipment", labelField: "equipmentZh", nullable: true },
  homeRequirements: { valueField: "homeRequirement", labelField: "homeRequirementZh", nullable: false },
} satisfies Record<
  "categories" | "levels" | "force" | "mechanics" | "equipment" | "homeRequirements",
  ScalarFacetConfig
>;

const exerciseResourceFacetCatalogSelect = {
  category: true,
  categoryZh: true,
  level: true,
  levelZh: true,
  force: true,
  forceZh: true,
  mechanic: true,
  mechanicZh: true,
  equipment: true,
  equipmentZh: true,
  homeRequirement: true,
  homeRequirementZh: true,
  primaryMuscles: true,
  primaryMusclesZh: true,
  secondaryMuscles: true,
  secondaryMusclesZh: true,
  allowedSections: true,
  goalTags: true,
  riskTags: true,
} satisfies Prisma.ExerciseSelect;

// The repository is the only place that reads exercise facts from PostgreSQL.
export async function listExerciseRecords(): Promise<Exercise[]> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const exercises = await prisma.exercise.findMany({
    orderBy: { nameZh: "asc" },
  });

  return exercises.map(mapExerciseRecord);
}

// 列表查询只读取动作卡片需要的摘要字段，并在数据库层完成筛选、排序、计数和分页。
export async function listExerciseListItems(input: ExerciseListPageInput): Promise<ExerciseListPageRecords> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const where = createExerciseListWhere(input.query);
  const [total, records] = await Promise.all([
    prisma.exercise.count({ where }),
    prisma.exercise.findMany({
      where,
      select: exerciseListSelect,
      orderBy: createExerciseListOrderBy(input.sort),
      skip: input.offset,
      take: input.limit,
    }),
  ]);

  return {
    items: records.map(mapExerciseListRecord),
    total,
  };
}

// facets 统计是动作库筛选项的事实来源，使用数据库聚合避免读取完整动作详情集合。
export async function listExerciseFacetsFromStore(
  scope: Pick<ExerciseListQuery, "suitability"> = {},
): Promise<ExerciseFacets> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const [categories, levels, force, mechanics, equipment, homeRequirements, muscles, goalTags, riskTags] =
    await Promise.all([
      collectScalarFacet(scalarFacetConfigs.categories, scope),
      collectScalarFacet(scalarFacetConfigs.levels, scope),
      collectScalarFacet(scalarFacetConfigs.force, scope),
      collectScalarFacet(scalarFacetConfigs.mechanics, scope),
      collectScalarFacet(scalarFacetConfigs.equipment, scope),
      collectScalarFacet(scalarFacetConfigs.homeRequirements, scope),
      collectArrayFacet({ valueColumn: "primaryMuscles", labelColumn: "primaryMusclesZh" }, scope),
      collectArrayFacet({ valueColumn: "goalTags", tagKind: "goalTags" }, scope),
      collectArrayFacet({ valueColumn: "riskTags", tagKind: "riskTags" }, scope),
    ]);

  return {
    categories,
    levels,
    force,
    mechanics,
    equipment,
    homeRequirements,
    muscles,
    goalTags,
    riskTags,
  };
}

export async function getExerciseRecordById(id: string): Promise<Exercise | null> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const exercise = await prisma.exercise.findUnique({
    where: { id },
  });

  return exercise ? mapExerciseRecord(exercise) : null;
}

/** getExerciseRecordsByIds 按 exerciseId 批量读取动作事实，供终态输出校验复用数据库事实源。 */
export async function getExerciseRecordsByIds(ids: readonly string[]): Promise<Exercise[]> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const prisma = getPrismaClient();
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: uniqueIds } },
  });

  return exercises.map(mapExerciseRecord);
}

function createExerciseListWhere(query: ExerciseListQuery): Prisma.ExerciseWhereInput {
  const filters: Prisma.ExerciseWhereInput[] = [];

  if (query.published !== undefined) {
    filters.push({ isPublished: query.published });
  }

  if (query.category) {
    filters.push(matchNullableLabelField("category", "categoryZh", query.category));
  }

  if (query.suitability) {
    filters.push({ allowedSections: { has: query.suitability } });
  }

  if (query.level) {
    filters.push(matchNullableLabelField("level", "levelZh", query.level));
  }

  if (query.force) {
    filters.push(matchNullableLabelField("force", "forceZh", query.force));
  }

  if (query.mechanic) {
    filters.push(matchNullableLabelField("mechanic", "mechanicZh", query.mechanic));
  }

  if (query.equipment) {
    filters.push(matchNullableLabelField("equipment", "equipmentZh", query.equipment));
  }

  if (query.homeRequirement) {
    filters.push(matchRequiredLabelField("homeRequirement", "homeRequirementZh", query.homeRequirement));
  }

  if (query.muscle) {
    filters.push({
      OR: [
        { primaryMuscles: { has: query.muscle } },
        { primaryMusclesZh: { has: query.muscle } },
        { secondaryMuscles: { has: query.muscle } },
        { secondaryMusclesZh: { has: query.muscle } },
      ],
    });
  }

  if (query.goalTag) {
    filters.push({ goalTags: { has: query.goalTag } });
  }

  if (query.riskTag) {
    filters.push({ riskTags: { has: query.riskTag } });
  }

  if (query.q) {
    filters.push(createExerciseKeywordWhere(query.q));
  }

  return filters.length > 0 ? { AND: filters } : {};
}

function matchNullableLabelField(
  valueField: Extract<ScalarFacetField, "category" | "level" | "force" | "mechanic" | "equipment">,
  labelField: Extract<ScalarFacetField, "categoryZh" | "levelZh" | "forceZh" | "mechanicZh" | "equipmentZh">,
  value: string,
): Prisma.ExerciseWhereInput {
  return {
    OR: [
      { [valueField]: value },
      { [labelField]: value },
    ],
  };
}

function matchRequiredLabelField(
  valueField: "homeRequirement",
  labelField: "homeRequirementZh",
  value: string,
): Prisma.ExerciseWhereInput {
  return {
    OR: [
      { [valueField]: value },
      { [labelField]: value },
    ],
  };
}

function createExerciseKeywordWhere(keyword: string): Prisma.ExerciseWhereInput {
  const contains = {
    contains: keyword,
    mode: "insensitive" as const,
  };

  return {
    OR: [
      { id: contains },
      { nameEn: contains },
      { nameZh: contains },
      { category: contains },
      { categoryZh: contains },
      { equipment: contains },
      { equipmentZh: contains },
      { homeRequirement: contains },
      { homeRequirementZh: contains },
      { level: contains },
      { levelZh: contains },
      { primaryMuscles: { has: keyword } },
      { primaryMusclesZh: { has: keyword } },
      { secondaryMuscles: { has: keyword } },
      { secondaryMusclesZh: { has: keyword } },
      { goalTags: { has: keyword } },
      { riskTags: { has: keyword } },
    ],
  };
}

function createExerciseListOrderBy(sort: ExerciseSort): Prisma.ExerciseOrderByWithRelationInput[] {
  switch (sort) {
    case "name_desc":
      return [{ nameZh: "desc" }, { id: "asc" }];
    case "level_asc":
      return [{ level: "asc" }, { nameZh: "asc" }, { id: "asc" }];
    case "level_desc":
      return [{ level: "desc" }, { nameZh: "asc" }, { id: "asc" }];
    case "category_asc":
      return [{ categoryZh: "asc" }, { nameZh: "asc" }, { id: "asc" }];
    case "category_desc":
      return [{ categoryZh: "desc" }, { nameZh: "asc" }, { id: "asc" }];
    case "name_asc":
    default:
      return [{ nameZh: "asc" }, { id: "asc" }];
  }
}

function mapExerciseListRecord(record: ExerciseListRecord): ExerciseListItem {
  const metadata = normalizeExerciseMetadata(record);
  const executionTaxonomy = mapExerciseExecutionTaxonomy(record);

  return {
    id: record.id,
    nameEn: record.nameEn,
    nameZh: record.nameZh,
    category: record.category,
    categoryZh: record.categoryZh,
    level: record.level,
    levelZh: record.levelZh,
    force: record.force,
    forceZh: record.forceZh,
    mechanic: record.mechanic,
    mechanicZh: record.mechanicZh,
    equipment: record.equipment,
    equipmentZh: record.equipmentZh,
    homeRequirement: record.homeRequirement,
    homeRequirementZh: record.homeRequirementZh,
    ...executionTaxonomy,
    primaryMuscles: record.primaryMuscles,
    primaryMusclesZh: record.primaryMusclesZh,
    imageUrls: resolveSelectedExerciseImageUrls(record),
    allowedSections: metadata.allowedSections,
    intensityRole: metadata.intensityRole,
    movementPattern: metadata.movementPattern,
    difficulty: metadata.difficulty,
    goalTags: record.goalTags,
    riskTags: metadata.riskTags,
    reviewStatus: record.reviewStatus,
    isPublished: record.isPublished,
  };
}

async function collectScalarFacet(
  config: ScalarFacetConfig,
  scope: Pick<ExerciseListQuery, "suitability">,
): Promise<ExerciseFacetItem[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.exercise.groupBy({
    by: [config.valueField, config.labelField],
    where: createScalarFacetWhere(config, scope),
    _count: { _all: true },
  });

  return rows
    .map((row) => {
      const rawRow = row as Record<string, unknown> & { _count: { _all: number } };
      const value = rawRow[config.valueField];
      const label = rawRow[config.labelField];

      if (typeof value !== "string" || !value || typeof label !== "string" || !label) {
        return null;
      }

      return {
        value,
        label,
        count: rawRow._count._all,
      };
    })
    .filter((item): item is ExerciseFacetItem => Boolean(item))
    .sort(compareFacetByLabel);
}

function createScalarFacetWhere(
  config: ScalarFacetConfig,
  scope: Pick<ExerciseListQuery, "suitability">,
): Prisma.ExerciseWhereInput {
  return {
    AND: [
      createExerciseListWhere(scope),
      ...createNonEmptyScalarFieldFilters(config.valueField, config.nullable),
      ...createNonEmptyScalarFieldFilters(config.labelField, config.nullable),
    ],
  };
}

function createNonEmptyScalarFieldFilters(field: ScalarFacetField, nullable: boolean): Prisma.ExerciseWhereInput[] {
  const filters: Prisma.ExerciseWhereInput[] = [{ [field]: { not: "" } } as Prisma.ExerciseWhereInput];

  return nullable
    ? ([{ [field]: { not: null } } as Prisma.ExerciseWhereInput, ...filters])
    : filters;
}

async function collectArrayFacet(
  config: ArrayFacetConfig,
  scope: Pick<ExerciseListQuery, "suitability">,
): Promise<ExerciseFacetItem[]> {
  const prisma = getPrismaClient();
  const valueColumn = Prisma.raw(`"${config.valueColumn}"`);
  const scopeSql = createFacetScopeSql(scope);
  const rows = config.labelColumn
    ? await prisma.$queryRaw<RawFacetRow[]>(Prisma.sql`
        SELECT value_items.value AS value, label_items.label AS label, COUNT(*)::int AS count
        FROM "Exercise"
        CROSS JOIN LATERAL unnest(${valueColumn}) WITH ORDINALITY AS value_items(value, index)
        LEFT JOIN LATERAL unnest(${Prisma.raw(`"${config.labelColumn}"`)}) WITH ORDINALITY AS label_items(label, index)
          ON label_items.index = value_items.index
        WHERE ${scopeSql}
          AND value_items.value IS NOT NULL
          AND value_items.value <> ''
        GROUP BY value_items.value, label_items.label
      `)
    : await prisma.$queryRaw<RawFacetRow[]>(Prisma.sql`
        SELECT value_items.value AS value, NULL::text AS label, COUNT(*)::int AS count
        FROM "Exercise"
        CROSS JOIN LATERAL unnest(${valueColumn}) AS value_items(value)
        WHERE ${scopeSql}
          AND value_items.value IS NOT NULL
          AND value_items.value <> ''
        GROUP BY value_items.value
      `);

  return rows
    .map((row) => toFacetItem(row, config.tagKind))
    .filter((item): item is ExerciseFacetItem => Boolean(item))
    .sort(compareFacetByLabel);
}

function createFacetScopeSql(scope: Pick<ExerciseListQuery, "suitability">) {
  if (!scope.suitability) {
    return Prisma.sql`TRUE`;
  }

  return Prisma.sql`${scope.suitability} = ANY("allowedSections")`;
}

function toFacetItem(row: RawFacetRow, tagKind?: "goalTags" | "riskTags"): ExerciseFacetItem | null {
  if (!row.value) {
    return null;
  }

  return {
    value: row.value,
    label: tagKind ? getExerciseTagLabel(tagKind, row.value) : row.label || row.value,
    count: Number(row.count),
  };
}

function compareFacetByLabel(left: ExerciseFacetItem, right: ExerciseFacetItem) {
  return left.label.localeCompare(right.label, "zh-Hans-CN");
}

/** searchExerciseResourceSummaries 是 Agent 只读动作事实查询入口，必须下推 where/count/select，不能走全表读取。 */
export async function searchExerciseResourceSummaries(
  input: ExerciseResourceSearchInput,
): Promise<ExerciseResourceSearchResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const filterApplication = buildExerciseResourceFilterApplication(input);
  const where = buildExerciseResourceWhere(input, filterApplication);
  const orderBy = buildExerciseResourceOrderBy(input.sort);
  const maxReturned = clampExerciseResourceSearchMaxReturned(input.maxReturned);
  const bucketedNameSearch = await searchBucketedExerciseResourceNameBuckets({
    input,
    filterApplication,
    orderBy,
    maxReturned,
  });
  const balancedSearch = bucketedNameSearch
    ? null
    : await searchBalancedExerciseResourceMuscleBuckets({
        input,
        filterApplication,
        orderBy,
        maxReturned,
      });
  const [totalMatches, records] = await Promise.all([
    prisma.exercise.count({ where }),
    bucketedNameSearch ?? balancedSearch ?? prisma.exercise.findMany({
      where,
      orderBy,
      take: maxReturned + 1,
      select: exerciseResourceSummarySelect,
    }).then((defaultRecords) => ({
      records: defaultRecords.slice(0, maxReturned),
      diagnostics: [],
      zeroMatchMuscles: [],
      truncatedByFetch: defaultRecords.length > maxReturned,
    })),
  ]);

  return {
    query: input,
    appliedFilters: collectExerciseResourceAppliedFilters(input, filterApplication),
    filterApplication,
    filterSemantics: collectExerciseResourceFilterSemantics(input),
    diagnostics: records.diagnostics,
    zeroMatchMuscles: records.zeroMatchMuscles,
    totalMatches,
    returnedCount: records.records.length,
    maxReturned,
    truncated: balancedSearch ? totalMatches > records.records.length : records.truncatedByFetch,
    excludedCount: input.excludeExerciseIds?.length ?? 0,
    exercises: records.records.map(mapExerciseResourceSummary),
  };
}

async function searchBucketedExerciseResourceNameBuckets(input: {
  input: ExerciseResourceSearchInput;
  filterApplication: ExerciseResourceFilterApplication;
  orderBy: Prisma.ExerciseOrderByWithRelationInput[];
  maxReturned: number;
}): Promise<{
  records: ExerciseResourceSummaryRecord[];
  diagnostics: ExerciseResourceNameDiagnostic[];
  zeroMatchMuscles: string[];
  truncatedByFetch: boolean;
} | null> {
  const exerciseNames = uniqueStrings(input.input.exerciseNames ?? []);
  if (
    exerciseNames.length === 0
    || !isExerciseResourceHardFilterApplied(input.filterApplication, "exerciseNames")
  ) {
    return null;
  }

  const prisma = getPrismaClient();
  const bucketQueries = exerciseNames.map((exerciseName) => {
    // 名称查询负责候选分布；其他结构化 hard filters 仍在每个名称桶内执行。
    const queryInput = {
      ...input.input,
      exerciseNames: [exerciseName],
    } satisfies ExerciseResourceSearchInput;
    const queryFilterApplication = buildExerciseResourceFilterApplication(queryInput);
    const where = buildExerciseResourceWhere(queryInput, queryFilterApplication);

    return { exerciseName, queryInput, queryFilterApplication, where };
  });
  const bucketCounts = await Promise.all(bucketQueries.map((query) =>
    prisma.exercise.count({ where: query.where }),
  ));
  const nonEmptyQueries = bucketQueries.filter((_, index) => bucketCounts[index] > 0);
  const bucketRecords = await Promise.all(nonEmptyQueries.map((query) =>
    prisma.exercise.findMany({
      where: query.where,
      orderBy: input.orderBy,
      take: input.maxReturned + 1,
      select: exerciseResourceSummarySelect,
    }),
  ));
  const bucketDiagnostics = await collectExerciseNameDiagnostics({
    input: input.input,
    bucketQueries,
    bucketCounts,
    maxReturned: input.maxReturned,
  });

  return {
    records: selectRoundRobinExerciseResourceRecords(bucketRecords, input.maxReturned),
    diagnostics: bucketDiagnostics,
    zeroMatchMuscles: [],
    truncatedByFetch: bucketRecords.some((records) => records.length > input.maxReturned),
  };
}

async function collectExerciseNameDiagnostics(input: {
  input: ExerciseResourceSearchInput;
  bucketQueries: Array<{
    exerciseName: string;
    queryInput: ExerciseResourceSearchInput;
    queryFilterApplication: ExerciseResourceFilterApplication;
    where: Prisma.ExerciseWhereInput;
  }>;
  bucketCounts: number[];
  maxReturned: number;
}): Promise<ExerciseResourceNameDiagnostic[]> {
  const prisma = getPrismaClient();
  const diagnostics: ExerciseResourceNameDiagnostic[] = [];
  const zeroMatchDiagnostics = await Promise.all(input.bucketQueries.map(async (query, index): Promise<ExerciseResourceNameDiagnostic | null> => {
    const totalMatches = input.bucketCounts[index] ?? 0;
    if (totalMatches > 0) {
      return null;
    }

    const [nameOnlyCount, sectionOnlyCount] = await Promise.all([
      prisma.exercise.count({ where: buildExerciseResourceNameWhere([query.exerciseName]) }),
      prisma.exercise.count({
        where: buildExerciseResourceNameSectionWhere(
          query.exerciseName,
          query.queryInput.suitability ?? "training",
        ),
      }),
    ]);

    if (nameOnlyCount === 0) {
      return {
        code: "exercise_name_not_found" as const,
        exerciseName: query.exerciseName,
        totalMatches: 0,
      };
    }

    if (sectionOnlyCount === 0) {
      return {
        code: "exercise_name_section_conflict" as const,
        exerciseName: query.exerciseName,
        totalMatches: nameOnlyCount,
        conflictFields: ["suitabilities"],
      };
    }

    return {
      code: "exercise_name_filter_mismatch" as const,
      exerciseName: query.exerciseName,
      totalMatches: nameOnlyCount,
      conflictFields: collectExerciseNameFilterConflictFields(query.queryFilterApplication),
    };
  }));

  diagnostics.push(...zeroMatchDiagnostics.filter(isExerciseResourceNameDiagnostic));

  input.bucketQueries.forEach((query, index) => {
    const totalMatches = input.bucketCounts[index] ?? 0;
    if (totalMatches <= 1) {
      return;
    }

    diagnostics.push({
      code: "exercise_name_ambiguous",
      exerciseName: query.exerciseName,
      totalMatches,
      returnedCount: Math.min(totalMatches, input.maxReturned),
    });

    if (totalMatches > input.maxReturned) {
      diagnostics.push({
        code: "exercise_name_too_broad",
        exerciseName: query.exerciseName,
        totalMatches,
        returnedCount: input.maxReturned,
      });
    }
  });

  return diagnostics;
}

function isExerciseResourceNameDiagnostic(
  diagnostic: ExerciseResourceNameDiagnostic | null,
): diagnostic is ExerciseResourceNameDiagnostic {
  return Boolean(diagnostic);
}

function collectExerciseNameFilterConflictFields(
  filterApplication: ExerciseResourceFilterApplication,
) {
  return filterApplication.appliedHardFilters.filter((field) => ![
    "suitabilities",
    "exerciseNames",
    "requiredExerciseIds",
    "excludeExerciseIds",
  ].includes(field));
}

async function searchBalancedExerciseResourceMuscleBuckets(input: {
  input: ExerciseResourceSearchInput;
  filterApplication: ExerciseResourceFilterApplication;
  orderBy: Prisma.ExerciseOrderByWithRelationInput[];
  maxReturned: number;
}): Promise<{
  records: ExerciseResourceSummaryRecord[];
  diagnostics: ExerciseResourceNameDiagnostic[];
  zeroMatchMuscles: string[];
  truncatedByFetch: boolean;
} | null> {
  const requestedMuscles = uniqueStrings(input.input.muscles ?? []);
  if (
    requestedMuscles.length <= 1
    || !isExerciseResourceHardFilterApplied(input.filterApplication, "muscles")
  ) {
    return null;
  }

  const prisma = getPrismaClient();
  const muscleQueries = requestedMuscles.map((muscle) => {
    // 多肌群均衡只填充普通候选；requiredExerciseIds 仍由 tool wrapper 作为正向锚点优先合并。
    const queryInput = {
      ...input.input,
      muscles: [muscle],
      requiredExerciseIds: undefined,
    } satisfies ExerciseResourceSearchInput;
    const queryFilterApplication = buildExerciseResourceFilterApplication(queryInput);
    const where = buildExerciseResourceWhere(queryInput, queryFilterApplication);

    return { muscle, where };
  });
  const muscleCounts = await Promise.all(muscleQueries.map((query) =>
    prisma.exercise.count({ where: query.where }),
  ));
  const zeroMatchMuscles = muscleQueries
    .filter((_, index) => muscleCounts[index] === 0)
    .map((query) => query.muscle);
  const nonEmptyQueries = muscleQueries.filter((_, index) => muscleCounts[index] > 0);
  const bucketRecords = await Promise.all(nonEmptyQueries.map((query) =>
    prisma.exercise.findMany({
      where: query.where,
      orderBy: input.orderBy,
      take: input.maxReturned + 1,
      select: exerciseResourceSummarySelect,
    }),
  ));

  return {
    records: selectRoundRobinExerciseResourceRecords(bucketRecords, input.maxReturned),
    diagnostics: [],
    zeroMatchMuscles,
    truncatedByFetch: bucketRecords.some((records) => records.length > input.maxReturned),
  };
}

function selectRoundRobinExerciseResourceRecords(
  buckets: ExerciseResourceSummaryRecord[][],
  maxReturned: number,
) {
  const byId = new Map<string, ExerciseResourceSummaryRecord>();
  let cursor = 0;

  while (byId.size < maxReturned && buckets.some((bucket) => cursor < bucket.length)) {
    for (const bucket of buckets) {
      const record = bucket[cursor];
      if (!record || byId.has(record.id)) {
        continue;
      }

      byId.set(record.id, record);
      if (byId.size >= maxReturned) {
        break;
      }
    }
    cursor += 1;
  }

  return [...byId.values()];
}

function clampExerciseResourceSearchMaxReturned(maxReturned?: number) {
  return Math.min(
    Math.max(maxReturned ?? agentRuntimeConfig.tools.searchExerciseResources.defaultCandidateCountPerSection, 1),
    EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED,
  );
}

/** getExerciseResourceSummariesByIds 按 id 读取动作摘要，供 requiredExerciseIds 合并和诊断使用。 */
export async function getExerciseResourceSummariesByIds(ids: readonly string[]): Promise<ExerciseResourceSummary[]> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const prisma = getPrismaClient();
  const records = await prisma.exercise.findMany({
    where: { id: { in: uniqueIds } },
    select: exerciseResourceSummarySelect,
  });
  const byId = new Map(records.map((record) => [record.id, record]));

  return uniqueIds
    .map((id) => byId.get(id))
    .filter((record): record is Prisma.ExerciseGetPayload<{ select: typeof exerciseResourceSummarySelect }> => Boolean(record))
    .map(mapExerciseResourceSummary);
}

/** readExerciseResourceFacetCatalog 暴露动作库当前可执行 facet，供 Planner manifest 使用。 */
export async function readExerciseResourceFacetCatalog(): Promise<ExerciseResourceFacetCatalog> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercise facet catalog from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const records = await prisma.exercise.findMany({
    select: exerciseResourceFacetCatalogSelect,
  });

  return normalizeExerciseResourceFacetCatalogForPlanner({
    muscles: collectDistinctFacetValues(records, ["primaryMuscles", "primaryMusclesZh", "secondaryMuscles", "secondaryMusclesZh"]),
    categories: collectDistinctFacetValues(records, ["category", "categoryZh"]),
    levels: collectDistinctFacetValues(records, ["level", "levelZh"]),
    forces: collectDistinctFacetValues(records, ["force", "forceZh"]),
    mechanics: collectDistinctFacetValues(records, ["mechanic", "mechanicZh"]),
    equipment: collectDistinctFacetValues(records, ["equipment", "equipmentZh"]),
    homeRequirements: collectDistinctFacetValues(records, ["homeRequirement", "homeRequirementZh"]),
    goalTags: collectDistinctFacetValues(records, ["goalTags"]),
    riskTags: collectDistinctFacetValues(records, ["riskTags"]),
    suitabilities: collectDistinctSuitabilities(records),
  });
}

/** normalizeExerciseResourceFacetCatalogForPlanner 收紧 Planner 可见 facet，避免把无器械暴露成 homeRequirement。 */
export function normalizeExerciseResourceFacetCatalogForPlanner(
  catalog: ExerciseResourceFacetCatalog,
): ExerciseResourceFacetCatalog {
  return {
    ...catalog,
    equipment: addNoEquipmentQueryValues(catalog.equipment.filter((value) => value.trim() !== "无器械")),
    homeRequirements: catalog.homeRequirements.filter((value) => !isRemovedNoEquipmentHomeRequirementValue(value)),
  };
}

/** isNoEquipmentResourceQueryValue 判断 tool 合同层无器械查询值，不读取用户原文做语义推断。 */
export function isNoEquipmentResourceQueryValue(value: string) {
  const normalized = normalizeFacetKey(value);
  return normalized === "no_equipment" || value.trim() === "无器械";
}

/** isRemovedNoEquipmentHomeRequirementValue 标识不再对 Planner 暴露的旧居家条件值。 */
export function isRemovedNoEquipmentHomeRequirementValue(value: string) {
  const normalized = normalizeFacetKey(value);
  return removedHomeRequirementNoEquipmentValues.some((removedValue) => (
    normalizeFacetKey(removedValue) === normalized || removedValue === value.trim()
  ));
}

/** isBodyweightExerciseResourceEquipment 复用 repository 的无器械映射边界，供 requiredExerciseIds 诊断使用。 */
export function isBodyweightExerciseResourceEquipment(input: Pick<ExerciseResourceSummary, "equipment" | "equipmentZh">) {
  return Boolean(
    input.equipment && bodyweightEquipmentValues.some((value) => normalizeFacetKey(value) === normalizeFacetKey(input.equipment ?? ""))
  ) || Boolean(
    input.equipmentZh && bodyweightEquipmentZhValues.includes(input.equipmentZh as (typeof bodyweightEquipmentZhValues)[number])
  );
}

function mapExerciseRecord(exercise: ExerciseRecord): Exercise {
  const metadata = normalizeExerciseMetadata(exercise);
  const executionTaxonomy = mapExerciseExecutionTaxonomy(exercise);

  return withResolvedExerciseImageUrls({
    id: exercise.id,
    source: exercise.source,
    sourceUrl: exercise.sourceUrl,
    sourceId: exercise.sourceId,
    license: exercise.license,
    nameEn: exercise.nameEn,
    nameZh: exercise.nameZh,
    category: exercise.category,
    categoryZh: exercise.categoryZh,
    level: exercise.level,
    levelZh: exercise.levelZh,
    force: exercise.force,
    forceZh: exercise.forceZh,
    mechanic: exercise.mechanic,
    mechanicZh: exercise.mechanicZh,
    equipment: exercise.equipment,
    equipmentZh: exercise.equipmentZh,
    homeRequirement: exercise.homeRequirement,
    homeRequirementZh: exercise.homeRequirementZh,
    ...executionTaxonomy,
    primaryMuscles: exercise.primaryMuscles,
    primaryMusclesZh: exercise.primaryMusclesZh,
    secondaryMuscles: exercise.secondaryMuscles,
    secondaryMusclesZh: exercise.secondaryMusclesZh,
    instructionsEn: exercise.instructionsEn,
    instructionsZh: exercise.instructionsZh,
    images: exercise.images,
    imageUrls: exercise.imageUrls,
    allowedSections: metadata.allowedSections,
    intensityRole: metadata.intensityRole,
    movementPattern: metadata.movementPattern,
    difficulty: metadata.difficulty,
    riskTags: metadata.riskTags,
    contraindications: metadata.contraindications,
    regressionExerciseIds: metadata.regressionExerciseIds,
    progressionExerciseIds: metadata.progressionExerciseIds,
    substitutionGroupId: metadata.substitutionGroupId,
    goalTags: exercise.goalTags,
    embeddingText: exercise.embeddingText,
    embedding: Array.isArray(exercise.embedding) ? exercise.embedding.filter((value): value is number => typeof value === "number") : null,
    reviewStatus: exercise.reviewStatus,
    isPublished: exercise.isPublished,
  });
}

// mapExerciseExecutionTaxonomy 是 Prisma 字符串字段到共享 taxonomy 类型的唯一运行时校验边界。
function mapExerciseExecutionTaxonomy(record: ExerciseExecutionTaxonomyRecord): ExerciseExecutionTaxonomy {
  return parseExerciseExecutionTaxonomy({
    requiresExternalEquipment: record.requiresExternalEquipment,
    requiredEquipmentTags: record.requiredEquipmentTags,
    supportRequirementTags: record.supportRequirementTags,
    setupComplexity: record.setupComplexity,
    impactLevel: record.impactLevel,
    noiseLevel: record.noiseLevel,
  });
}

function buildExerciseResourceWhere(
  input: ExerciseResourceSearchInput,
  filterApplication: ExerciseResourceFilterApplication,
): Prisma.ExerciseWhereInput {
  const sharedHardFilters: Prisma.ExerciseWhereInput[] = [];
  const candidateHardFilters: Prisma.ExerciseWhereInput[] = [];

  if (input.suitability && isExerciseResourceHardFilterApplied(filterApplication, "suitabilities")) {
    sharedHardFilters.push({ allowedSections: { has: input.suitability } });
  }

  if (isExerciseResourceHardFilterApplied(filterApplication, "category")) {
    pushTextFacetFilter(candidateHardFilters, "category", "categoryZh", input.category);
  }
  if (isExerciseResourceHardFilterApplied(filterApplication, "level")) {
    pushTextFacetFilter(candidateHardFilters, "level", "levelZh", input.level);
  }
  if (isExerciseResourceHardFilterApplied(filterApplication, "force")) {
    pushTextFacetFilter(candidateHardFilters, "force", "forceZh", input.force);
  }
  if (isExerciseResourceHardFilterApplied(filterApplication, "mechanic")) {
    pushTextFacetFilter(candidateHardFilters, "mechanic", "mechanicZh", input.mechanic);
  }
  if (isExerciseResourceHardFilterApplied(filterApplication, "equipment")) {
    pushEquipmentResourceFilter(candidateHardFilters, input.equipment);
  }
  if (isExerciseResourceHardFilterApplied(filterApplication, "homeRequirement")) {
    pushTextFacetFilter(candidateHardFilters, "homeRequirement", "homeRequirementZh", input.homeRequirement);
  }

  const muscleFilters = uniqueStrings(input.muscles ?? []);
  if (muscleFilters.length > 0 && isExerciseResourceHardFilterApplied(filterApplication, "muscles")) {
    candidateHardFilters.push(buildExerciseResourceMuscleWhere(muscleFilters));
  }

  if (input.goalTag && isExerciseResourceHardFilterApplied(filterApplication, "goalTag")) {
    candidateHardFilters.push({ goalTags: { has: input.goalTag } });
  }

  if (input.riskTag && isExerciseResourceHardFilterApplied(filterApplication, "riskTag")) {
    candidateHardFilters.push({ riskTags: { has: input.riskTag } });
  }

  const exerciseNames = uniqueStrings(input.exerciseNames ?? []);
  if (exerciseNames.length > 0 && isExerciseResourceHardFilterApplied(filterApplication, "exerciseNames")) {
    candidateHardFilters.push(buildExerciseResourceNameWhere(exerciseNames));
  }

  if (input.excludeExerciseIds?.length && isExerciseResourceHardFilterApplied(filterApplication, "excludeExerciseIds")) {
    sharedHardFilters.push({ id: { notIn: input.excludeExerciseIds } });
  }

  const requiredExerciseIds = uniqueStrings(input.requiredExerciseIds ?? []);
  if (requiredExerciseIds.length > 0 && isExerciseResourceHardFilterApplied(filterApplication, "requiredExerciseIds")) {
    const requiredExerciseIdFilter: Prisma.ExerciseWhereInput = { id: { in: requiredExerciseIds } };

    // requiredExerciseIds 是正向锚点：section 和 exclude 仍是共同硬边界，其他 facet 冲突交给 diagnostics 暴露。
    return {
      AND: [
        ...sharedHardFilters,
        candidateHardFilters.length > 0
          ? { OR: [requiredExerciseIdFilter, { AND: candidateHardFilters }] }
          : requiredExerciseIdFilter,
      ],
    };
  }

  return { AND: [...sharedHardFilters, ...candidateHardFilters] };
}

function buildExerciseResourceMuscleWhere(muscles: string[]): Prisma.ExerciseWhereInput {
  return {
    OR: muscles.flatMap((muscle) => [
      { primaryMuscles: { has: muscle } },
      { primaryMusclesZh: { has: muscle } },
      { secondaryMuscles: { has: muscle } },
      { secondaryMusclesZh: { has: muscle } },
    ]),
  };
}

function pushTextFacetFilter(
  and: Prisma.ExerciseWhereInput[],
  valueField: keyof Pick<Exercise, "category" | "level" | "force" | "mechanic" | "equipment" | "homeRequirement">,
  labelField: keyof Pick<Exercise, "categoryZh" | "levelZh" | "forceZh" | "mechanicZh" | "equipmentZh" | "homeRequirementZh">,
  value: string | undefined,
) {
  if (!value) {
    return;
  }

  and.push({
    OR: [
      { [valueField]: value },
      { [labelField]: value },
    ],
  });
}

function pushEquipmentResourceFilter(and: Prisma.ExerciseWhereInput[], value: string | undefined) {
  if (!value) {
    return;
  }

  if (isNoEquipmentResourceQueryValue(value)) {
    and.push(buildNoEquipmentResourceWhere());
    return;
  }

  pushTextFacetFilter(and, "equipment", "equipmentZh", value);
}

function buildNoEquipmentResourceWhere(): Prisma.ExerciseWhereInput {
  return {
    OR: [
      { equipment: { in: [...bodyweightEquipmentValues] } },
      { equipmentZh: { in: [...bodyweightEquipmentZhValues] } },
    ],
  };
}

function buildExerciseResourceNameWhere(exerciseNames: string[]): Prisma.ExerciseWhereInput {
  return {
    OR: exerciseNames.flatMap((exerciseName) => {
      const insensitive = { mode: "insensitive" as const };

      return [
        { nameZh: exerciseName },
        { nameEn: { equals: exerciseName, ...insensitive } },
        { nameZh: { startsWith: exerciseName } },
        { nameEn: { startsWith: exerciseName, ...insensitive } },
        { nameZh: { contains: exerciseName } },
        { nameEn: { contains: exerciseName, ...insensitive } },
      ];
    }),
  };
}

function buildExerciseResourceNameSectionWhere(
  exerciseName: string,
  suitability: ExerciseSuitability,
): Prisma.ExerciseWhereInput {
  return {
    AND: [
      buildExerciseResourceNameWhere([exerciseName]),
      { allowedSections: { has: suitability } },
    ],
  };
}

function buildExerciseResourceOrderBy(sort: ExerciseSort): Prisma.ExerciseOrderByWithRelationInput[] {
  switch (sort) {
    case "name_desc":
      return [{ nameZh: "desc" }, { id: "asc" }];
    case "level_asc":
      return [{ level: "asc" }, { nameZh: "asc" }, { id: "asc" }];
    case "level_desc":
      return [{ level: "desc" }, { nameZh: "asc" }, { id: "asc" }];
    case "category_asc":
      return [{ categoryZh: "asc" }, { nameZh: "asc" }, { id: "asc" }];
    case "category_desc":
      return [{ categoryZh: "desc" }, { nameZh: "asc" }, { id: "asc" }];
    case "name_asc":
    default:
      return [{ nameZh: "asc" }, { id: "asc" }];
  }
}

function collectExerciseResourceAppliedFilters(
  input: ExerciseResourceSearchInput,
  filterApplication: ExerciseResourceFilterApplication,
): ExerciseResourceAppliedFilter[] {
  return ([
    "exerciseNames",
    "category",
    "suitability",
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
  ] satisfies ExerciseResourceFilterField[])
    .flatMap((field) => {
      const applicationField = (field === "suitability" ? "suitabilities" : field) as ExerciseResourceFilterApplication["appliedHardFilters"][number];
      if (!isExerciseResourceHardFilterApplied(filterApplication, applicationField)) {
        return [];
      }
      const value = input[field];
      return value === undefined ? [] : [{ field, value }];
    });
}

function collectExerciseResourceFilterSemantics(input: ExerciseResourceSearchInput): ExerciseResourceFilterSemantic[] {
  if (!input.equipment || !isNoEquipmentResourceQueryValue(input.equipment)) {
    return [];
  }

  return [{
    field: "equipment",
    requestedValue: input.equipment,
    databaseMapping: {
      equipment: [...bodyweightEquipmentValues],
      equipmentZh: [...bodyweightEquipmentZhValues],
    },
    note: "equipment=no_equipment 表示不需要外部器械；repository 只映射到自重动作字段，不自动附加 homeRequirement 条件。",
  }];
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function addNoEquipmentQueryValues(values: string[]) {
  return sortFacetValues([...new Set([...values, ...EXERCISE_RESOURCE_NO_EQUIPMENT_QUERY_VALUES])]);
}

function normalizeFacetKey(value: string) {
  return value.trim().toLowerCase();
}

type ExerciseResourceFacetCatalogRecord = Prisma.ExerciseGetPayload<{ select: typeof exerciseResourceFacetCatalogSelect }>;

function collectDistinctFacetValues(
  records: ExerciseResourceFacetCatalogRecord[],
  fields: Array<keyof ExerciseResourceFacetCatalogRecord>,
) {
  const values = new Set<string>();

  for (const record of records) {
    for (const field of fields) {
      const value = record[field];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && item.trim().length > 0) {
            values.add(item.trim());
          }
        }
        continue;
      }

      if (typeof value === "string" && value.trim().length > 0) {
        values.add(value.trim());
      }
    }
  }

  return sortFacetValues([...values]);
}

function collectDistinctSuitabilities(records: ExerciseResourceFacetCatalogRecord[]): ExerciseSuitability[] {
  const values = new Set(records.flatMap((record) => record.allowedSections));
  const canonicalOrder: ExerciseSuitability[] = ["warmup", "training", "stretch"];

  return canonicalOrder.filter((value) => values.has(value));
}

function sortFacetValues(values: string[]) {
  return values.sort((left, right) => left.localeCompare(right, "zh-Hans-CN") || left.localeCompare(right));
}

function mapExerciseResourceSummary(
  exercise: Prisma.ExerciseGetPayload<{ select: typeof exerciseResourceSummarySelect }>,
): ExerciseResourceSummary {
  const metadata = normalizeExerciseMetadata(exercise);

  return {
    id: exercise.id,
    nameEn: exercise.nameEn,
    nameZh: exercise.nameZh,
    category: exercise.category,
    categoryZh: exercise.categoryZh,
    level: exercise.level,
    levelZh: exercise.levelZh,
    force: exercise.force,
    forceZh: exercise.forceZh,
    mechanic: exercise.mechanic,
    mechanicZh: exercise.mechanicZh,
    equipment: exercise.equipment,
    equipmentZh: exercise.equipmentZh,
    homeRequirement: exercise.homeRequirement,
    homeRequirementZh: exercise.homeRequirementZh,
    primaryMuscles: exercise.primaryMuscles,
    primaryMusclesZh: exercise.primaryMusclesZh,
    secondaryMuscles: exercise.secondaryMuscles,
    secondaryMusclesZh: exercise.secondaryMusclesZh,
    imageUrls: resolveSelectedExerciseImageUrls(exercise),
    allowedSections: metadata.allowedSections,
    goalTags: exercise.goalTags,
    riskTags: exercise.riskTags,
    reviewStatus: exercise.reviewStatus,
    isPublished: exercise.isPublished,
  };
}

function resolveSelectedExerciseImageUrls(exercise: ExerciseImageFields) {
  return resolveExerciseImageUrls({
    id: exercise.id,
    images: Array.isArray(exercise.images) ? exercise.images : [],
    imageUrls: Array.isArray(exercise.imageUrls) ? exercise.imageUrls : [],
  });
}
