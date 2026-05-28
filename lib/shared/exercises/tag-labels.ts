export type ExerciseTagKind = "goalTags" | "riskTags";

const exerciseGoalTagLabels: Record<string, string> = {
  beginner_friendly: "新手友好",
  cardio: "心肺训练",
  home_friendly: "居家友好",
  mobility: "灵活性与活动度",
  power: "爆发力",
  strength: "力量训练",
};

const exerciseRiskTagLabels: Record<string, string> = {
  high_impact: "高冲击",
  knee_attention: "膝关节注意",
  lower_back_attention: "下背部注意",
  shoulder_attention: "肩部注意",
  spine_load: "脊柱负荷",
};

const exerciseTagLabelMaps: Record<ExerciseTagKind, Record<string, string>> = {
  goalTags: exerciseGoalTagLabels,
  riskTags: exerciseRiskTagLabels,
};

// 统一维护动作标签的展示文案，数据库和筛选参数继续使用稳定英文 code。
export function getExerciseTagLabel(kind: ExerciseTagKind, tag: string) {
  return exerciseTagLabelMaps[kind][tag] ?? tag;
}
