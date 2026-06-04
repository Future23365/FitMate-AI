import { z } from "zod";

/** exerciseBodyRegionValues 是 Agent 已结构化后的高层身体区域枚举，不承载自然语言解析。 */
export const exerciseBodyRegionValues = ["upper_body", "lower_body", "core", "full_body"] as const;

/** exerciseBodyRegionSchema 约束模型只能提交受控身体区域，避免把范围词塞进真实肌群 facet。 */
export const exerciseBodyRegionSchema = z.enum(exerciseBodyRegionValues);

export type ExerciseBodyRegion = (typeof exerciseBodyRegionValues)[number];

/** exerciseBodyRegionTargetMuscles 将受控区域确定性展开到动作库真实肌群 facet。 */
export const exerciseBodyRegionTargetMuscles: Record<ExerciseBodyRegion, string[]> = {
  upper_body: ["肩部", "胸部", "背阔肌", "中背部", "背部", "肱二头肌", "肱三头肌", "前臂"],
  lower_body: ["臀部", "股四头肌", "腘绳肌", "小腿", "髋部", "内收肌", "外展肌"],
  core: ["核心", "腹肌", "下背部"],
  full_body: [],
};

/** expandExerciseBodyRegionTargetMuscles 只消费结构化枚举，可选按当前可用 facet 收窄展开结果。 */
export function expandExerciseBodyRegionTargetMuscles(
  bodyRegions: ExerciseBodyRegion[],
  availableTargetMuscles?: Set<string>,
) {
  const expanded = uniqueStrings(bodyRegions.flatMap((region) => exerciseBodyRegionTargetMuscles[region] ?? []));

  return availableTargetMuscles ? expanded.filter((muscle) => availableTargetMuscles.has(muscle)) : expanded;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
