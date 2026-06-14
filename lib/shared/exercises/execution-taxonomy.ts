import { z } from "zod";

export const exerciseRequiredEquipmentTagValues = [
  "dumbbell",
  "barbell",
  "resistance_band",
  "machine",
  "cable",
  "kettlebell",
  "medicine_ball",
  "foam_roller",
  "ez_bar",
  "stability_ball",
  "other_equipment",
] as const;

export const exerciseSupportRequirementTagValues = [
  "none",
  "floor_or_mat",
  "chair_or_wall",
  "gym_fixture",
  "partner",
  "outdoor_space",
] as const;

export const exerciseSetupComplexityValues = [
  "zero_setup",
  "floor_or_mat",
  "home_support",
  "small_equipment",
  "gym_fixture",
  "partner",
  "outdoor",
  "unknown",
] as const;

export const exerciseKnownSetupComplexityValues = [
  "zero_setup",
  "floor_or_mat",
  "home_support",
  "small_equipment",
  "gym_fixture",
  "partner",
  "outdoor",
] as const;

export const exerciseImpactLevelValues = ["low", "medium", "high"] as const;
export const exerciseNoiseLevelValues = ["quiet", "normal", "loud"] as const;

export type ExerciseRequiredEquipmentTag = (typeof exerciseRequiredEquipmentTagValues)[number];
export type ExerciseSupportRequirementTag = (typeof exerciseSupportRequirementTagValues)[number];
export type ExerciseSetupComplexity = (typeof exerciseSetupComplexityValues)[number];
export type ExerciseKnownSetupComplexity = (typeof exerciseKnownSetupComplexityValues)[number];
export type ExerciseImpactLevel = (typeof exerciseImpactLevelValues)[number];
export type ExerciseNoiseLevel = (typeof exerciseNoiseLevelValues)[number];

export type ExerciseExecutionTaxonomy = {
  requiresExternalEquipment: boolean | null;
  requiredEquipmentTags: ExerciseRequiredEquipmentTag[];
  supportRequirementTags: ExerciseSupportRequirementTag[];
  setupComplexity: ExerciseSetupComplexity;
  impactLevel: ExerciseImpactLevel | null;
  noiseLevel: ExerciseNoiseLevel | null;
};

export type ExerciseTaxonomyOption<TValue extends string> = {
  value: TValue;
  labelZh: string;
  descriptionZh: string;
};

/** exerciseRequiredEquipmentTagOptions 是训练器械 taxonomy 的唯一展示与说明来源。 */
export const exerciseRequiredEquipmentTagOptions = [
  { value: "dumbbell", labelZh: "哑铃", descriptionZh: "动作需要一只或一组哑铃。" },
  { value: "barbell", labelZh: "杠铃", descriptionZh: "动作需要标准杠铃、杠铃片或等价杠铃装置。" },
  { value: "resistance_band", labelZh: "弹力带", descriptionZh: "动作需要弹力带、阻力带或弹力绳。" },
  { value: "machine", labelZh: "固定器械", descriptionZh: "动作需要健身房固定训练器械或综合训练机。" },
  { value: "cable", labelZh: "绳索", descriptionZh: "动作需要龙门架、滑轮或绳索训练装置。" },
  { value: "kettlebell", labelZh: "壶铃", descriptionZh: "动作需要壶铃。" },
  { value: "medicine_ball", labelZh: "药球", descriptionZh: "动作需要药球或重力球。" },
  { value: "foam_roller", labelZh: "泡沫轴", descriptionZh: "动作需要泡沫轴或按摩滚筒。" },
  { value: "ez_bar", labelZh: "曲杆", descriptionZh: "动作需要 EZ 杆或同类曲杆。" },
  { value: "stability_ball", labelZh: "稳定球", descriptionZh: "动作需要瑞士球、瑜伽球或稳定球。" },
  { value: "other_equipment", labelZh: "其他外部器械", descriptionZh: "动作确定需要外部训练器械，但当前 taxonomy 不能进一步细分。" },
] as const satisfies readonly ExerciseTaxonomyOption<ExerciseRequiredEquipmentTag>[];

/** exerciseSupportRequirementTagOptions 描述非训练器械但会影响动作可执行性的支撑或场地事实。 */
export const exerciseSupportRequirementTagOptions = [
  { value: "none", labelZh: "无额外支撑", descriptionZh: "已确认动作不需要额外支撑物、固定设施或特殊场地。" },
  { value: "floor_or_mat", labelZh: "地面/垫子", descriptionZh: "动作需要地面空间、瑜伽垫或训练垫。" },
  { value: "chair_or_wall", labelZh: "椅子/墙面", descriptionZh: "动作需要椅子、墙面、台阶或类似家用支撑物。" },
  { value: "gym_fixture", labelZh: "健身房固定设施", descriptionZh: "动作需要单杠、双杠、训练凳、架子或其他固定设施。" },
  { value: "partner", labelZh: "搭档辅助", descriptionZh: "动作需要搭档、保护者或人工辅助。" },
  { value: "outdoor_space", labelZh: "户外空间", descriptionZh: "动作需要户外、跑道、球场或较大开放空间。" },
] as const satisfies readonly ExerciseTaxonomyOption<ExerciseSupportRequirementTag>[];

/** exerciseSetupComplexityOptions 是动作准备复杂度的稳定等级说明，unknown 只表示事实未补齐。 */
export const exerciseSetupComplexityOptions = [
  { value: "zero_setup", labelZh: "零准备", descriptionZh: "无需额外器械、支撑物或特殊场地即可开始。" },
  { value: "floor_or_mat", labelZh: "地面/垫子", descriptionZh: "只需要地面空间或训练垫。" },
  { value: "home_support", labelZh: "居家支撑", descriptionZh: "需要椅子、墙面、台阶等常见支撑物。" },
  { value: "small_equipment", labelZh: "小型器械", descriptionZh: "需要可移动的小型训练器械。" },
  { value: "gym_fixture", labelZh: "固定设施", descriptionZh: "需要健身房固定器械、架子、凳子、单杠或双杠。" },
  { value: "partner", labelZh: "搭档", descriptionZh: "需要搭档协助、保护或传递器械。" },
  { value: "outdoor", labelZh: "户外", descriptionZh: "需要户外或大面积开放空间。" },
  { value: "unknown", labelZh: "未知", descriptionZh: "当前数据源尚未补齐准备复杂度，不能当作低准备事实。" },
] as const satisfies readonly ExerciseTaxonomyOption<ExerciseSetupComplexity>[];

/** exerciseImpactLevelOptions 描述动作冲击程度；null 表示尚未补齐。 */
export const exerciseImpactLevelOptions = [
  { value: "low", labelZh: "低冲击", descriptionZh: "通常不包含跳跃、快速落地或明显关节冲击。" },
  { value: "medium", labelZh: "中等冲击", descriptionZh: "可能包含轻度弹跳、节奏变化或中等落地压力。" },
  { value: "high", labelZh: "高冲击", descriptionZh: "包含跳跃、快速落地、冲刺或较高关节冲击。" },
] as const satisfies readonly ExerciseTaxonomyOption<ExerciseImpactLevel>[];

/** exerciseNoiseLevelOptions 描述动作噪音程度；null 表示尚未补齐。 */
export const exerciseNoiseLevelOptions = [
  { value: "quiet", labelZh: "安静", descriptionZh: "适合低噪音环境，通常没有跳跃、砸地或器械撞击。" },
  { value: "normal", labelZh: "普通", descriptionZh: "可能产生正常训练声音，但不以明显冲击噪音为主。" },
  { value: "loud", labelZh: "较吵", descriptionZh: "可能产生明显落地声、器械碰撞声或户外运动噪音。" },
] as const satisfies readonly ExerciseTaxonomyOption<ExerciseNoiseLevel>[];

export const exerciseRequiredEquipmentTagSchema = z.enum(exerciseRequiredEquipmentTagValues);
export const exerciseSupportRequirementTagSchema = z.enum(exerciseSupportRequirementTagValues);
export const exerciseSetupComplexitySchema = z.enum(exerciseSetupComplexityValues);
export const exerciseKnownSetupComplexitySchema = z.enum(exerciseKnownSetupComplexityValues);
export const exerciseImpactLevelSchema = z.enum(exerciseImpactLevelValues);
export const exerciseNoiseLevelSchema = z.enum(exerciseNoiseLevelValues);

/** exerciseSetupComplexityRank 固定 setupComplexityMax 使用的排序，unknown 不进入排序。 */
export const exerciseSetupComplexityRank: Record<ExerciseKnownSetupComplexity, number> = {
  zero_setup: 0,
  floor_or_mat: 1,
  home_support: 2,
  small_equipment: 3,
  gym_fixture: 4,
  partner: 5,
  outdoor: 6,
};

/** exerciseExecutionTaxonomySchema 校验 Exercise 执行条件字段的字段级不变量。 */
export const exerciseExecutionTaxonomySchema = z
  .object({
    requiresExternalEquipment: z.boolean().nullable().default(null),
    requiredEquipmentTags: z.array(exerciseRequiredEquipmentTagSchema).default([]),
    supportRequirementTags: z.array(exerciseSupportRequirementTagSchema).default([]),
    setupComplexity: exerciseSetupComplexitySchema.default("unknown"),
    impactLevel: exerciseImpactLevelSchema.nullable().default(null),
    noiseLevel: exerciseNoiseLevelSchema.nullable().default(null),
  })
  .superRefine((taxonomy, ctx) => {
    if (hasDuplicates(taxonomy.requiredEquipmentTags)) {
      ctx.addIssue({
        code: "custom",
        path: ["requiredEquipmentTags"],
        message: "requiredEquipmentTags 不能包含重复 tag。",
      });
    }

    if (hasDuplicates(taxonomy.supportRequirementTags)) {
      ctx.addIssue({
        code: "custom",
        path: ["supportRequirementTags"],
        message: "supportRequirementTags 不能包含重复 tag。",
      });
    }

    if (taxonomy.requiresExternalEquipment === false && taxonomy.requiredEquipmentTags.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["requiredEquipmentTags"],
        message: "requiresExternalEquipment = false 时 requiredEquipmentTags 必须为空。",
      });
    }

    if (taxonomy.requiresExternalEquipment === true && taxonomy.requiredEquipmentTags.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["requiredEquipmentTags"],
        message: "requiresExternalEquipment = true 时 requiredEquipmentTags 必须至少包含一个 tag。",
      });
    }

    if (taxonomy.requiresExternalEquipment === null && taxonomy.requiredEquipmentTags.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["requiresExternalEquipment"],
        message: "requiredEquipmentTags 有值时 requiresExternalEquipment 必须为 true；null 只表示未知。",
      });
    }

    if (taxonomy.supportRequirementTags.includes("none") && taxonomy.supportRequirementTags.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["supportRequirementTags"],
        message: 'supportRequirementTags = ["none"] 必须与其他支撑或场地 tag 互斥。',
      });
    }
  });

/** defaultExerciseExecutionTaxonomy 是迁移和导入缺省值的共享语义，不表示无器械或低门槛。 */
export const defaultExerciseExecutionTaxonomy = {
  requiresExternalEquipment: null,
  requiredEquipmentTags: [],
  supportRequirementTags: [],
  setupComplexity: "unknown",
  impactLevel: null,
  noiseLevel: null,
} as const satisfies ExerciseExecutionTaxonomy;

/** isExerciseSetupComplexityAtMost 只比较已知准备复杂度，unknown 永远不匹配上限。 */
export function isExerciseSetupComplexityAtMost(
  value: ExerciseSetupComplexity,
  max: ExerciseKnownSetupComplexity,
) {
  if (value === "unknown") {
    return false;
  }

  return exerciseSetupComplexityRank[value] <= exerciseSetupComplexityRank[max];
}

/** parseExerciseExecutionTaxonomy 供导入、测试和后续 repository 复用同一字段级校验。 */
export function parseExerciseExecutionTaxonomy(input: unknown): ExerciseExecutionTaxonomy {
  return exerciseExecutionTaxonomySchema.parse(input);
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}
