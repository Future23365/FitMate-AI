import {
  exerciseImpactLevelRank,
  exerciseNoiseLevelRank,
  exerciseRequiredEquipmentTagValues,
  type ExerciseImpactLevel,
  type ExerciseNoiseLevel,
  type ExerciseRequiredEquipmentTag,
  type ExerciseSetupComplexity,
  type ExerciseSupportRequirementTag,
} from "@/lib/shared/exercises/execution-taxonomy";
import type {
  ExerciseEquipmentScope,
  ExerciseExecutionProfile,
} from "@/lib/shared/exercises/execution-constraints";

/** ExerciseResourceExecutionTaxonomyCandidate 是执行条件 adapter 可判断的最小动作 taxonomy 事实。 */
export type ExerciseResourceExecutionTaxonomyCandidate = {
  requiresExternalEquipment: boolean | null;
  requiredEquipmentTags: ExerciseRequiredEquipmentTag[];
  supportRequirementTags: ExerciseSupportRequirementTag[];
  setupComplexity: ExerciseSetupComplexity;
  impactLevel: ExerciseImpactLevel | null;
  noiseLevel: ExerciseNoiseLevel | null;
};

/** noEquipmentProfileSetupComplexities 固定完整无器械口径允许的准备复杂度。 */
export const noEquipmentProfileSetupComplexities = ["zero_setup", "floor_or_mat"] as const satisfies readonly ExerciseSetupComplexity[];

/** homeSupportProfileSetupComplexities 固定居家支撑口径允许的准备复杂度。 */
export const homeSupportProfileSetupComplexities = ["zero_setup", "floor_or_mat", "home_support"] as const satisfies readonly ExerciseSetupComplexity[];

/** noEquipmentExcludedSupportTags 表达完整无器械口径不能依赖的支撑、固定设施和场地。 */
export const noEquipmentExcludedSupportTags = ["chair_or_wall", "gym_fixture", "partner", "outdoor_space"] as const satisfies readonly ExerciseSupportRequirementTag[];

/** homeSupportExcludedSupportTags 表达居家支撑口径不能依赖的固定设施、搭档和户外空间。 */
export const homeSupportExcludedSupportTags = ["gym_fixture", "partner", "outdoor_space"] as const satisfies readonly ExerciseSupportRequirementTag[];

/** smallEquipmentExcludedSupportTags 表达小型器械口径不能同时要求特殊设施、搭档或户外空间。 */
export const smallEquipmentExcludedSupportTags = ["gym_fixture", "partner", "outdoor_space"] as const satisfies readonly ExerciseSupportRequirementTag[];

/** gymEquipmentRequiredEquipmentTags 是被视为典型健身房器械的 requiredEquipmentTags 子集。 */
export const gymEquipmentRequiredEquipmentTags = ["machine", "cable"] as const satisfies readonly ExerciseRequiredEquipmentTag[];
const noEquipmentSetupComplexitySet = new Set<ExerciseSetupComplexity>(noEquipmentProfileSetupComplexities);
const homeSupportSetupComplexitySet = new Set<ExerciseSetupComplexity>(homeSupportProfileSetupComplexities);

/** normalizeExerciseEquipmentScope 去重器械 tag，保持模型 input 语义但避免重复条件影响摘要。 */
export function normalizeExerciseEquipmentScope(
  scope: ExerciseEquipmentScope | undefined,
): ExerciseEquipmentScope | undefined {
  if (!scope) {
    return undefined;
  }

  return {
    mode: scope.mode,
    tags: [...new Set(scope.tags)],
  };
}

/** getUnavailableEquipmentTags 将用户可用器械集合转换为 repository 子集查询需要的不可用 tag。 */
export function getUnavailableEquipmentTags(
  availableTags: readonly ExerciseRequiredEquipmentTag[],
) {
  const available = new Set(availableTags);

  return exerciseRequiredEquipmentTagValues.filter((tag) => !available.has(tag));
}

/** matchesExecutionProfile 复用 adapter 语义检查单个动作是否满足高层执行场景。 */
export function matchesExecutionProfile(
  exercise: ExerciseResourceExecutionTaxonomyCandidate,
  profile: ExerciseExecutionProfile,
) {
  switch (profile) {
    case "no_equipment":
      return exercise.requiresExternalEquipment === false
        && exercise.requiredEquipmentTags.length === 0
        && noEquipmentSetupComplexitySet.has(exercise.setupComplexity)
        && !hasAnySupportTag(exercise, noEquipmentExcludedSupportTags);
    case "home_support":
      return exercise.requiresExternalEquipment === false
        && exercise.requiredEquipmentTags.length === 0
        && homeSupportSetupComplexitySet.has(exercise.setupComplexity)
        && !hasAnySupportTag(exercise, homeSupportExcludedSupportTags);
    case "small_equipment":
      return exercise.requiresExternalEquipment === true
        && exercise.setupComplexity === "small_equipment"
        && !hasAnySupportTag(exercise, smallEquipmentExcludedSupportTags);
    case "gym_equipment":
      return exercise.setupComplexity === "gym_fixture"
        || exercise.supportRequirementTags.includes("gym_fixture")
        || gymEquipmentRequiredEquipmentTags.some((tag) => exercise.requiredEquipmentTags.includes(tag));
    case "partner_required":
      return exercise.setupComplexity === "partner"
        || exercise.supportRequirementTags.includes("partner");
    case "outdoor_required":
      return exercise.setupComplexity === "outdoor"
        || exercise.supportRequirementTags.includes("outdoor_space");
  }
}

/** matchesEquipmentScope 检查动作器械需求是否满足模型声明的可用集合或 must-use 语义。 */
export function matchesEquipmentScope(
  exercise: ExerciseResourceExecutionTaxonomyCandidate,
  scope: ExerciseEquipmentScope,
) {
  const tags = [...new Set(scope.tags)];

  if (scope.mode === "must_use_any") {
    return exercise.requiresExternalEquipment === true
      && tags.some((tag) => exercise.requiredEquipmentTags.includes(tag));
  }

  if (tags.length === 0) {
    return exercise.requiresExternalEquipment === false && exercise.requiredEquipmentTags.length === 0;
  }

  if (exercise.requiresExternalEquipment === false && exercise.requiredEquipmentTags.length === 0) {
    return true;
  }

  if (exercise.requiresExternalEquipment !== true) {
    return false;
  }

  const available = new Set(tags);

  return exercise.requiredEquipmentTags.every((tag) => available.has(tag));
}

/** matchesImpactLimit 保持 unknown-safe：null 冲击等级不匹配任何上限。 */
export function matchesImpactLimit(
  value: ExerciseImpactLevel | null,
  max: ExerciseImpactLevel,
) {
  if (value === null) {
    return false;
  }

  return exerciseImpactLevelRank[value] <= exerciseImpactLevelRank[max];
}

/** matchesNoiseLimit 保持 unknown-safe：null 噪音等级不匹配任何上限。 */
export function matchesNoiseLimit(
  value: ExerciseNoiseLevel | null,
  max: ExerciseNoiseLevel,
) {
  if (value === null) {
    return false;
  }

  return exerciseNoiseLevelRank[value] <= exerciseNoiseLevelRank[max];
}

/** getImpactLimitMatchedValues 将高层 impactLimit 转换为数据库可下推的已知等级集合。 */
export function getImpactLimitMatchedValues(max: ExerciseImpactLevel) {
  return (Object.keys(exerciseImpactLevelRank) as ExerciseImpactLevel[]).filter((value) =>
    exerciseImpactLevelRank[value] <= exerciseImpactLevelRank[max],
  );
}

/** getNoiseLimitMatchedValues 将高层 noiseLimit 转换为数据库可下推的已知等级集合。 */
export function getNoiseLimitMatchedValues(max: ExerciseNoiseLevel) {
  return (Object.keys(exerciseNoiseLevelRank) as ExerciseNoiseLevel[]).filter((value) =>
    exerciseNoiseLevelRank[value] <= exerciseNoiseLevelRank[max],
  );
}

/** describeExecutionProfileMapping 输出 trace 诊断用的内部 taxonomy 映射摘要，不作为 Planner input。 */
export function describeExecutionProfileMapping(profile: ExerciseExecutionProfile) {
  switch (profile) {
    case "no_equipment":
      return [
        "requiresExternalEquipment=false",
        "requiredEquipmentTags isEmpty",
        `setupComplexity in ${noEquipmentProfileSetupComplexities.join(",")}`,
        `supportRequirementTags not hasSome ${noEquipmentExcludedSupportTags.join(",")}`,
      ];
    case "home_support":
      return [
        "requiresExternalEquipment=false",
        "requiredEquipmentTags isEmpty",
        `setupComplexity in ${homeSupportProfileSetupComplexities.join(",")}`,
        `supportRequirementTags not hasSome ${homeSupportExcludedSupportTags.join(",")}`,
      ];
    case "small_equipment":
      return [
        "requiresExternalEquipment=true",
        "setupComplexity=small_equipment",
        `supportRequirementTags not hasSome ${smallEquipmentExcludedSupportTags.join(",")}`,
      ];
    case "gym_equipment":
      return [
        "setupComplexity=gym_fixture",
        "supportRequirementTags has gym_fixture",
        `requiredEquipmentTags hasSome ${gymEquipmentRequiredEquipmentTags.join(",")}`,
      ];
    case "partner_required":
      return ["setupComplexity=partner", "supportRequirementTags has partner"];
    case "outdoor_required":
      return ["setupComplexity=outdoor", "supportRequirementTags has outdoor_space"];
  }
}

/** describeEquipmentScopeMapping 输出器械集合语义对应的内部数组查询摘要。 */
export function describeEquipmentScopeMapping(scope: ExerciseEquipmentScope) {
  if (scope.mode === "must_use_any") {
    return [
      "requiresExternalEquipment=true",
      `requiredEquipmentTags hasSome ${scope.tags.join(",")}`,
    ];
  }

  const unavailable = getUnavailableEquipmentTags(scope.tags);

  return [
    "allow requiresExternalEquipment=false with empty requiredEquipmentTags",
    unavailable.length > 0
      ? `external equipment must not include ${unavailable.join(",")}`
      : "allow any canonical requiredEquipmentTags",
  ];
}

function hasAnySupportTag(
  exercise: ExerciseResourceExecutionTaxonomyCandidate,
  tags: readonly ExerciseSupportRequirementTag[],
) {
  return tags.some((tag) => exercise.supportRequirementTags.includes(tag));
}
