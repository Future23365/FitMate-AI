import type {
  ExerciseImpactLevel,
  ExerciseNoiseLevel,
  ExerciseRequiredEquipmentTag,
} from "./execution-taxonomy";

/** exerciseExecutionProfileValues 是 Agent 动作查询可见的执行场景枚举，不暴露底层数据库 taxonomy 组合。 */
export const exerciseExecutionProfileValues = [
  "no_equipment",
  "home_support",
  "small_equipment",
  "gym_equipment",
  "partner_required",
  "outdoor_required",
] as const;

/** exerciseEquipmentScopeModeValues 区分“用户可用器械上限”和“必须使用某类器械”的查询语义。 */
export const exerciseEquipmentScopeModeValues = [
  "compatible_with_available",
  "must_use_any",
] as const;

export type ExerciseExecutionProfile = (typeof exerciseExecutionProfileValues)[number];
export type ExerciseEquipmentScopeMode = (typeof exerciseEquipmentScopeModeValues)[number];

/** ExerciseEquipmentScope 是模型可见的器械集合约束，由服务端映射为内部 taxonomy 查询。 */
export type ExerciseEquipmentScope = {
  mode: ExerciseEquipmentScopeMode;
  tags: ExerciseRequiredEquipmentTag[];
};

/** ExerciseExecutionConstraintInput 是动作资源查询 tool 的高层执行条件输入边界。 */
export type ExerciseExecutionConstraintInput = {
  executionProfile?: ExerciseExecutionProfile;
  equipmentScope?: ExerciseEquipmentScope;
  impactLimit?: ExerciseImpactLevel;
  noiseLimit?: ExerciseNoiseLevel;
};

/** exerciseExecutionProfileDescriptionsZh 为 tool description 和测试提供稳定中文解释来源。 */
export const exerciseExecutionProfileDescriptionsZh: Record<ExerciseExecutionProfile, string> = {
  no_equipment: "完整无器械口径，允许地面或瑜伽垫，但不允许外部训练器械、椅子/墙面、健身房固定设施、搭档或户外空间。",
  home_support: "不需要外部训练器械，但允许地面/垫子、椅子、墙面或台阶等常见居家支撑。",
  small_equipment: "需要可移动的小型训练器械。",
  gym_equipment: "需要健身房固定设施或典型健身房器械。",
  partner_required: "需要搭档、保护者或人工辅助。",
  outdoor_required: "需要户外或大面积开放空间。",
};
