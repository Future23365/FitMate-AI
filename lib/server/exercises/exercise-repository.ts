import "server-only";

import { Prisma } from "@prisma/client";

import {
  resolveExerciseImageUrls,
  withResolvedExerciseImageUrls,
} from "@/lib/server/exercise-images/exercise-image-resolver";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";
import {
  expandExerciseBodyRegionTargetMuscles,
  type ExerciseBodyRegion,
} from "@/lib/shared/exercises/body-regions";
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

export const EXERCISE_RESOURCE_SEARCH_MAX_RETURNED = 12;
export const EXERCISE_RESOURCE_MENTION_MAX_MATCHES = 5;

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
  q?: string;
  category?: string;
  suitability?: ExerciseSuitability;
  level?: string;
  force?: string;
  mechanic?: string;
  equipment?: string;
  homeRequirement?: string;
  muscle?: string;
  bodyRegions?: ExerciseBodyRegion[];
  goalTag?: string;
  riskTag?: string;
  excludeExerciseIds?: string[];
  published: boolean;
  sort: ExerciseSort;
};

export type ExerciseResourceFilterField = Exclude<keyof ExerciseResourceSearchInput, "sort">;

export type ExerciseResourceMentionResolutionInput = {
  text: string;
  maxMatches?: number;
};

export type ExerciseResourceAppliedFilter = {
  field: ExerciseResourceFilterField;
  value: string | boolean | string[];
};

export type ExerciseResourceSearchResult = {
  query: ExerciseResourceSearchInput;
  appliedFilters: ExerciseResourceAppliedFilter[];
  totalMatches: number;
  returnedCount: number;
  maxReturned: number;
  truncated: boolean;
  excludedCount: number;
  expandedMuscles: string[];
  exercises: ExerciseResourceSummary[];
};

export type ExerciseResourceMentionResolutionResult = {
  text: string;
  totalMatches: number;
  returnedCount: number;
  maxMatches: number;
  truncated: boolean;
  exactMatchCount: number;
  exercises: ExerciseResourceSummary[];
};

type ExerciseRecord = Omit<
  Exercise,
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
};

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
  const expandedMuscles = expandExerciseBodyRegionTargetMuscles(input.bodyRegions ?? []);
  const where = buildExerciseResourceWhere(input, expandedMuscles);
  const orderBy = buildExerciseResourceOrderBy(input.sort);
  const [totalMatches, records] = await Promise.all([
    prisma.exercise.count({ where }),
    prisma.exercise.findMany({
      where,
      orderBy,
      take: EXERCISE_RESOURCE_SEARCH_MAX_RETURNED + 1,
      select: exerciseResourceSummarySelect,
    }),
  ]);
  const visibleRecords = records.slice(0, EXERCISE_RESOURCE_SEARCH_MAX_RETURNED);

  return {
    query: input,
    appliedFilters: collectExerciseResourceAppliedFilters(input),
    totalMatches,
    returnedCount: visibleRecords.length,
    maxReturned: EXERCISE_RESOURCE_SEARCH_MAX_RETURNED,
    truncated: records.length > EXERCISE_RESOURCE_SEARCH_MAX_RETURNED,
    excludedCount: input.excludeExerciseIds?.length ?? 0,
    expandedMuscles,
    exercises: visibleRecords.map(mapExerciseResourceSummary),
  };
}

/** resolveExerciseResourceMentionSummaries 只把结构化 mention 文本解析为发布态 Exercise 摘要，不读取聊天原文做拆词。 */
export async function resolveExerciseResourceMentionSummaries(
  input: ExerciseResourceMentionResolutionInput,
): Promise<ExerciseResourceMentionResolutionResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const text = input.text.trim();
  const maxMatches = Math.min(
    Math.max(input.maxMatches ?? EXERCISE_RESOURCE_MENTION_MAX_MATCHES, 1),
    EXERCISE_RESOURCE_MENTION_MAX_MATCHES,
  );
  const exactWhere = buildExerciseMentionExactWhere(text);
  const mentionWhere = buildExerciseMentionWhere(text);
  const [totalMatches, exactRecords, records] = await Promise.all([
    prisma.exercise.count({ where: mentionWhere }),
    prisma.exercise.findMany({
      where: exactWhere,
      orderBy: [{ nameZh: "asc" }, { id: "asc" }],
      take: maxMatches + 1,
      select: exerciseResourceSummarySelect,
    }),
    prisma.exercise.findMany({
      where: mentionWhere,
      orderBy: [{ nameZh: "asc" }, { id: "asc" }],
      take: maxMatches + 1,
      select: exerciseResourceSummarySelect,
    }),
  ]);
  const orderedRecords = [...uniqueExerciseSummaryRecords([...exactRecords, ...records])]
    .sort((a, b) => scoreMentionRecord(text, a) - scoreMentionRecord(text, b)
      || a.nameZh.localeCompare(b.nameZh, "zh-Hans")
      || a.id.localeCompare(b.id));
  const visibleRecords = orderedRecords.slice(0, maxMatches);

  return {
    text,
    totalMatches,
    returnedCount: visibleRecords.length,
    maxMatches,
    truncated: totalMatches > maxMatches,
    exactMatchCount: exactRecords.length,
    exercises: visibleRecords.map(mapExerciseResourceSummary),
  };
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

function mapExerciseRecord(exercise: ExerciseRecord): Exercise {
  const metadata = normalizeExerciseMetadata(exercise);

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

function buildExerciseResourceWhere(
  input: ExerciseResourceSearchInput,
  expandedMuscles: string[],
): Prisma.ExerciseWhereInput {
  const and: Prisma.ExerciseWhereInput[] = [
    { isPublished: input.published },
  ];

  pushTextFacetFilter(and, "category", "categoryZh", input.category);
  pushTextFacetFilter(and, "level", "levelZh", input.level);
  pushTextFacetFilter(and, "force", "forceZh", input.force);
  pushTextFacetFilter(and, "mechanic", "mechanicZh", input.mechanic);
  pushTextFacetFilter(and, "equipment", "equipmentZh", input.equipment);
  pushTextFacetFilter(and, "homeRequirement", "homeRequirementZh", input.homeRequirement);

  if (input.suitability) {
    and.push({ allowedSections: { has: input.suitability } });
  }

  const muscleFilters = uniqueStrings([input.muscle, ...expandedMuscles]);
  if (muscleFilters.length > 0) {
    and.push(buildExerciseResourceMuscleWhere(muscleFilters));
  }

  if (input.goalTag) {
    and.push({ goalTags: { has: input.goalTag } });
  }

  if (input.riskTag) {
    and.push({ riskTags: { has: input.riskTag } });
  }

  if (input.q) {
    and.push(buildExerciseResourceTextWhere(input.q));
  }

  if (input.excludeExerciseIds?.length) {
    and.push({ id: { notIn: input.excludeExerciseIds } });
  }

  return { AND: and };
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

function buildExerciseResourceTextWhere(q: string): Prisma.ExerciseWhereInput {
  const contains = { contains: q, mode: "insensitive" as const };

  return {
    OR: [
      { nameEn: contains },
      { nameZh: { contains: q } },
      { category: contains },
      { categoryZh: { contains: q } },
      { level: contains },
      { levelZh: { contains: q } },
      { force: contains },
      { forceZh: { contains: q } },
      { mechanic: contains },
      { mechanicZh: { contains: q } },
      { equipment: contains },
      { equipmentZh: { contains: q } },
      { homeRequirement: contains },
      { homeRequirementZh: { contains: q } },
      { primaryMuscles: { has: q } },
      { primaryMusclesZh: { has: q } },
      { secondaryMuscles: { has: q } },
      { secondaryMusclesZh: { has: q } },
      { goalTags: { has: q } },
      { riskTags: { has: q } },
      { embeddingText: contains },
    ],
  };
}

function buildExerciseMentionWhere(text: string): Prisma.ExerciseWhereInput {
  const contains = { contains: text, mode: "insensitive" as const };

  return {
    AND: [
      { isPublished: true },
      {
        OR: [
          { id: text },
          { sourceId: text },
          { nameZh: { contains: text } },
          { nameEn: contains },
        ],
      },
    ],
  };
}

function buildExerciseMentionExactWhere(text: string): Prisma.ExerciseWhereInput {
  return {
    AND: [
      { isPublished: true },
      {
        OR: [
          { id: text },
          { sourceId: text },
          { nameZh: text },
          { nameEn: { equals: text, mode: "insensitive" } },
        ],
      },
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

function collectExerciseResourceAppliedFilters(input: ExerciseResourceSearchInput): ExerciseResourceAppliedFilter[] {
  return ([
    "q",
    "category",
    "suitability",
    "level",
    "force",
    "mechanic",
    "equipment",
    "homeRequirement",
    "muscle",
    "bodyRegions",
    "goalTag",
    "riskTag",
    "excludeExerciseIds",
    "published",
  ] satisfies ExerciseResourceFilterField[])
    .flatMap((field) => {
      const value = input[field];
      return value === undefined ? [] : [{ field, value }];
    });
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function uniqueExerciseSummaryRecords(
  records: Array<Prisma.ExerciseGetPayload<{ select: typeof exerciseResourceSummarySelect }>>,
) {
  const byId = new Map<string, Prisma.ExerciseGetPayload<{ select: typeof exerciseResourceSummarySelect }>>();
  for (const record of records) {
    byId.set(record.id, record);
  }
  return [...byId.values()];
}

function scoreMentionRecord(
  text: string,
  record: Prisma.ExerciseGetPayload<{ select: typeof exerciseResourceSummarySelect }>,
) {
  const normalizedText = text.toLowerCase();
  const nameEn = record.nameEn.toLowerCase();

  if (
    record.id === text
    || record.sourceId === text
    || record.nameZh === text
    || nameEn === normalizedText
  ) {
    return 0;
  }

  if (record.nameZh.startsWith(text) || nameEn.startsWith(normalizedText)) {
    return 1;
  }

  return 2;
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
