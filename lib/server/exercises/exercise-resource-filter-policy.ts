import type { ExerciseSuitability } from "@/lib/shared/exercises/types";

/** ExerciseResourceHardFilterPolicy 表达单个 section 的数据库 hard filter 执行口径。 */
export type ExerciseResourceHardFilterPolicy = "training" | "support_section";

/** ExerciseResourceFilterApplicationField 是 query.filterApplications 暴露的稳定输入字段名集合。 */
export type ExerciseResourceFilterApplicationField = (typeof EXERCISE_RESOURCE_FILTER_APPLICATION_FIELDS)[number];

/** ExerciseResourceUnappliedInputFilterCode 是未作为 hard filter 使用时的稳定原因码。 */
export type ExerciseResourceUnappliedInputFilterCode = typeof EXERCISE_RESOURCE_SUPPORT_SECTION_UNAPPLIED_FILTER_CODE;

/** ExerciseResourceUnappliedInputFilter 记录 Planner 传入但该 section policy 未作为 hard filter 使用的字段。 */
export type ExerciseResourceUnappliedInputFilter = {
  field: ExerciseResourceFilterApplicationField;
  code: ExerciseResourceUnappliedInputFilterCode;
  valueSummary?: string;
};

/** ExerciseResourceFilterApplication 是单个 section 查询实际 filter 执行事实的模型安全摘要。 */
export type ExerciseResourceFilterApplication = {
  section: ExerciseSuitability;
  hardFilterPolicy: ExerciseResourceHardFilterPolicy;
  appliedHardFilters: ExerciseResourceFilterApplicationField[];
  unappliedInputFilters: ExerciseResourceUnappliedInputFilter[];
};

/** ExerciseResourceFilterPolicyInput 是 policy helper 读取的结构化 tool input 子集。 */
export type ExerciseResourceFilterPolicyInput = {
  q?: string;
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
  excludeExerciseIds?: string[];
  requiredExerciseIds?: string[];
  published?: boolean;
};

type FilterValue = string | boolean | string[] | undefined;

export const EXERCISE_RESOURCE_FILTER_APPLICATION_FIELDS = [
  "published",
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
] as const;

export const EXERCISE_RESOURCE_SUPPORT_SECTION_UNAPPLIED_FILTER_CODE =
  "not_applied_as_hard_filter_for_support_section" as const;

const supportSectionAppliedHardFilters = new Set<ExerciseResourceFilterApplicationField>([
  "published",
  "suitabilities",
  "equipment",
  "homeRequirement",
  "muscles",
  "requiredExerciseIds",
  "excludeExerciseIds",
]);

const trainingAppliedHardFilters = new Set<ExerciseResourceFilterApplicationField>([
  "published",
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
]);

const fieldReaders: Array<{
  field: ExerciseResourceFilterApplicationField;
  read: (input: ExerciseResourceFilterPolicyInput) => FilterValue;
}> = [
  { field: "published", read: (input) => input.published },
  { field: "suitabilities", read: (input) => input.suitability ? [input.suitability] : undefined },
  { field: "q", read: (input) => input.q },
  { field: "category", read: (input) => input.category },
  { field: "level", read: (input) => input.level },
  { field: "force", read: (input) => input.force },
  { field: "mechanic", read: (input) => input.mechanic },
  { field: "equipment", read: (input) => input.equipment },
  { field: "homeRequirement", read: (input) => input.homeRequirement },
  { field: "muscles", read: (input) => input.muscles },
  { field: "goalTag", read: (input) => input.goalTag },
  { field: "riskTag", read: (input) => input.riskTag },
  { field: "requiredExerciseIds", read: (input) => input.requiredExerciseIds },
  { field: "excludeExerciseIds", read: (input) => input.excludeExerciseIds },
];

/** getExerciseResourceHardFilterPolicy 在查询前只按 section 决定 hard filter policy。 */
export function getExerciseResourceHardFilterPolicy(section: ExerciseSuitability): ExerciseResourceHardFilterPolicy {
  return section === "training" ? "training" : "support_section";
}

/** buildExerciseResourceFilterApplication 同时服务 repository where 构造和 tool output 执行摘要。 */
export function buildExerciseResourceFilterApplication(
  input: ExerciseResourceFilterPolicyInput,
): ExerciseResourceFilterApplication {
  const section = input.suitability ?? "training";
  const hardFilterPolicy = getExerciseResourceHardFilterPolicy(section);
  const appliedFields = hardFilterPolicy === "training"
    ? trainingAppliedHardFilters
    : supportSectionAppliedHardFilters;
  const appliedHardFilters: ExerciseResourceFilterApplicationField[] = [];
  const unappliedInputFilters: ExerciseResourceUnappliedInputFilter[] = [];

  for (const { field, read } of fieldReaders) {
    const value = read(input);
    if (!hasFilterValue(value)) {
      continue;
    }

    if (appliedFields.has(field)) {
      appliedHardFilters.push(field);
      continue;
    }

    unappliedInputFilters.push({
      field,
      code: EXERCISE_RESOURCE_SUPPORT_SECTION_UNAPPLIED_FILTER_CODE,
      ...summarizeUnappliedFilterValue(field, value),
    });
  }

  return {
    section,
    hardFilterPolicy,
    appliedHardFilters,
    unappliedInputFilters,
  };
}

/** isExerciseResourceHardFilterApplied 判断某字段是否进入该 section 的 hard filter 口径。 */
export function isExerciseResourceHardFilterApplied(
  application: ExerciseResourceFilterApplication,
  field: ExerciseResourceFilterApplicationField,
) {
  return application.appliedHardFilters.includes(field);
}

function hasFilterValue(value: FilterValue): value is Exclude<FilterValue, undefined> {
  if (value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

function summarizeUnappliedFilterValue(
  field: ExerciseResourceFilterApplicationField,
  value: Exclude<FilterValue, undefined>,
): Pick<ExerciseResourceUnappliedInputFilter, "valueSummary"> {
  if (field === "q") {
    return {};
  }

  const summary = Array.isArray(value)
    ? summarizeStringArray(value)
    : String(value).trim();

  return summary ? { valueSummary: truncateSummary(summary) } : {};
}

function summarizeStringArray(values: string[]) {
  const compactValues = values.map((value) => value.trim()).filter(Boolean);
  const visibleValues = compactValues.slice(0, 3);
  const suffix = compactValues.length > visibleValues.length
    ? ` +${compactValues.length - visibleValues.length}`
    : "";

  return `${visibleValues.join(", ")}${suffix}`;
}

function truncateSummary(value: string) {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}
