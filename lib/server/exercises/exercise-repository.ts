import "server-only";

import type { Prisma } from "@prisma/client";

import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";
import { normalizeExerciseMetadata } from "@/lib/shared/exercises/metadata";
import type { Exercise, ExerciseSort, ExerciseSuitability } from "@/lib/shared/exercises/types";

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
  muscles?: string[];
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
  imageUrls: true,
  allowedSections: true,
  goalTags: true,
  riskTags: true,
  reviewStatus: true,
  isPublished: true,
} satisfies Prisma.ExerciseSelect;

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

/** searchExerciseResourceSummaries 是 Agent 只读动作事实查询入口，必须下推 where/count/select，不能走全表读取。 */
export async function searchExerciseResourceSummaries(
  input: ExerciseResourceSearchInput,
): Promise<ExerciseResourceSearchResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const where = buildExerciseResourceWhere(input);
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

/** readExerciseResourceFacetCatalog 暴露发布态动作库当前可执行 facet，供 Planner manifest 使用。 */
export async function readExerciseResourceFacetCatalog(): Promise<ExerciseResourceFacetCatalog> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required before reading exercise facet catalog from PostgreSQL.");
  }

  const prisma = getPrismaClient();
  const records = await prisma.exercise.findMany({
    where: { isPublished: true },
    select: exerciseResourceFacetCatalogSelect,
  });

  return {
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
  };
}

function mapExerciseRecord(exercise: ExerciseRecord): Exercise {
  const metadata = normalizeExerciseMetadata(exercise);

  return {
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
  };
}

function buildExerciseResourceWhere(input: ExerciseResourceSearchInput): Prisma.ExerciseWhereInput {
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

  const muscleFilters = uniqueStrings([input.muscle, ...(input.muscles ?? [])]);
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
    "muscles",
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
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
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
    imageUrls: exercise.imageUrls,
    allowedSections: metadata.allowedSections,
    goalTags: exercise.goalTags,
    riskTags: exercise.riskTags,
    reviewStatus: exercise.reviewStatus,
    isPublished: exercise.isPublished,
  };
}
