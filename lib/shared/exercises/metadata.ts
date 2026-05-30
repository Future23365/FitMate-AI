import {
  exerciseMetadataSchema,
  type Exercise,
  type ExerciseAllowedSection,
  type ExerciseDifficulty,
  type ExerciseIntensityRole,
  type ExerciseMovementPattern,
} from "@/lib/shared/exercises/types";

type ExerciseMetadataInput = Pick<
  Partial<Exercise>,
  | "id"
  | "nameEn"
  | "nameZh"
  | "category"
  | "categoryZh"
  | "level"
  | "force"
  | "mechanic"
  | "equipment"
  | "equipmentZh"
  | "primaryMuscles"
  | "primaryMusclesZh"
  | "secondaryMuscles"
  | "secondaryMusclesZh"
  | "goalTags"
  | "riskTags"
> & {
  allowedSections?: string[];
  intensityRole?: string | null;
  movementPattern?: string | null;
  difficulty?: string | null;
  contraindications?: string[];
  regressionExerciseIds?: string[];
  progressionExerciseIds?: string[];
  substitutionGroupId?: string | null;
};

// 动作元数据归一化为历史动作库提供保守默认，保证候选分池和 Validator 使用同一事实来源。
export function normalizeExerciseMetadata(exercise: ExerciseMetadataInput) {
  const inferred = inferExerciseMetadata(exercise);

  return exerciseMetadataSchema.parse({
    allowedSections: exercise.allowedSections?.length ? exercise.allowedSections : inferred.allowedSections,
    intensityRole: exercise.intensityRole ?? inferred.intensityRole,
    movementPattern: exercise.movementPattern ?? inferred.movementPattern,
    difficulty: exercise.difficulty ?? inferred.difficulty,
    riskTags: exercise.riskTags ?? [],
    contraindications: exercise.contraindications ?? inferred.contraindications,
    regressionExerciseIds: exercise.regressionExerciseIds ?? [],
    progressionExerciseIds: exercise.progressionExerciseIds ?? [],
    substitutionGroupId: exercise.substitutionGroupId ?? inferred.substitutionGroupId,
  });
}

// 判断动作是否允许进入指定训练阶段，缺失 allowedSections 时先走归一化默认。
export function isExerciseAllowedInSection(
  exercise: ExerciseMetadataInput,
  section: ExerciseAllowedSection,
) {
  return normalizeExerciseMetadata(exercise).allowedSections.includes(section);
}

function inferExerciseMetadata(exercise: ExerciseMetadataInput) {
  const text = normalizeText([
    exercise.id,
    exercise.nameEn,
    exercise.nameZh,
    exercise.category,
    exercise.categoryZh,
    exercise.level,
    exercise.force,
    exercise.mechanic,
    exercise.equipment,
    exercise.equipmentZh,
    ...(exercise.primaryMuscles ?? []),
    ...(exercise.primaryMusclesZh ?? []),
    ...(exercise.secondaryMuscles ?? []),
    ...(exercise.secondaryMusclesZh ?? []),
    ...(exercise.goalTags ?? []),
    ...(exercise.riskTags ?? []),
  ].filter(Boolean).join(" "));
  const isStretch = /拉伸|伸展|放松|stretch|stretching|mobility/.test(text);
  const isWarmup = /热身|激活|动态|warmup|warm-up|activation|dynamic|开合跳|jumpingjack|跑步|running|步行|walk|跳绳|rope|单车|bike|treadmill/.test(text);
  const highWarmupRisk = /高冲击|high_impact|高风险|high_risk|奥林匹克|olympic|大力士|strongman|力量举|powerlifting|advanced|expert/.test(text);
  const allowedSections: ExerciseAllowedSection[] = [];

  if (isWarmup && !highWarmupRisk) {
    allowedSections.push("warmup");
  }

  if (!isStretch) {
    allowedSections.push("training");
  }

  if (isStretch) {
    allowedSections.push("stretch");
  }

  if (allowedSections.length === 0) {
    allowedSections.push("training");
  }

  return {
    allowedSections,
    intensityRole: inferIntensityRole(text),
    movementPattern: inferMovementPattern(text),
    difficulty: inferDifficulty(exercise.level),
    contraindications: inferContraindications(text),
    substitutionGroupId: inferSubstitutionGroupId(exercise),
  };
}

function inferIntensityRole(text: string): ExerciseIntensityRole {
  if (/拉伸|伸展|stretch|stretching/.test(text)) {
    return "recovery";
  }

  if (/热身|激活|warmup|activation|dynamic/.test(text)) {
    return "activation";
  }

  if (/有氧|cardio|跑步|running|步行|walk|跳绳|rope|单车|bike/.test(text)) {
    return "cardio";
  }

  if (/增强式|爆发|power|plyometric|jump/.test(text)) {
    return "power";
  }

  return "strength";
}

function inferMovementPattern(text: string): ExerciseMovementPattern {
  if (/拉伸|stretch|mobility/.test(text)) {
    return "stretch";
  }

  if (/俯卧撑|卧推|推举|push|press/.test(text)) {
    return "push";
  }

  if (/划船|引体|下拉|pull|row|chin/.test(text)) {
    return "pull";
  }

  if (/深蹲|squat/.test(text)) {
    return "squat";
  }

  if (/硬拉|臀桥|hinge|deadlift|bridge/.test(text)) {
    return "hinge";
  }

  if (/弓步|lunge/.test(text)) {
    return "lunge";
  }

  if (/平板|卷腹|仰卧起坐|核心|腹肌|plank|crunch|sit-up|situp|core|abdominal/.test(text)) {
    return "core";
  }

  if (/跑步|步行|开合跳|jumpingjack|running|walk|gait/.test(text)) {
    return "gait";
  }

  if (/旋转|rotation|twist/.test(text)) {
    return "rotation";
  }

  return "other";
}

function inferDifficulty(level?: string | null): ExerciseDifficulty {
  if (level === "intermediate") {
    return "intermediate";
  }

  if (level === "expert" || level === "advanced") {
    return "advanced";
  }

  return "beginner";
}

function inferContraindications(text: string) {
  const contraindications: string[] = [];

  if (/knee|膝|跳|jump|高冲击|high_impact|squat|lunge/.test(text)) {
    contraindications.push("knee_pain");
  }

  if (/shoulder|肩|press|推举|俯卧撑|push-up|pushup/.test(text)) {
    contraindications.push("shoulder_pain");
  }

  if (/back|腰|下背|硬拉|deadlift|sit-up|situp/.test(text)) {
    contraindications.push("low_back_pain");
  }

  return [...new Set(contraindications)];
}

function inferSubstitutionGroupId(exercise: ExerciseMetadataInput) {
  const pattern = inferMovementPattern(normalizeText([
    exercise.id,
    exercise.nameEn,
    exercise.nameZh,
    exercise.category,
    exercise.categoryZh,
    ...(exercise.primaryMuscles ?? []),
    ...(exercise.primaryMusclesZh ?? []),
  ].filter(Boolean).join(" ")));
  const primaryMuscle = normalizeText(exercise.primaryMuscles?.[0] ?? exercise.primaryMusclesZh?.[0] ?? "general");

  return `${pattern}:${primaryMuscle || "general"}`;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
