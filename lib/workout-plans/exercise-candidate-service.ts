import { listAllExercises } from "@/lib/exercises/exercise-service";
import type { Exercise } from "@/lib/exercises/types";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
} from "./draft-schema";

export type ExerciseCandidate = {
  exercise: Exercise;
  score: number;
  reasons: string[];
};

export type ExcludedExercise = {
  exerciseId: string;
  nameZh: string;
  reasons: string[];
};

export type ExerciseCandidateResult = {
  intent: WorkoutPlanIntent;
  candidates: ExerciseCandidate[];
  excluded: ExcludedExercise[];
  warnings: string[];
  isEnoughCandidates: boolean;
};

export type ExerciseCandidateOptions = {
  exercises?: Exercise[];
  minCandidates?: number;
  maxCandidates?: number;
};

export type WorkoutPlanExerciseIdValidationResult = {
  valid: boolean;
  exerciseIds: string[];
  invalidExerciseIds: string[];
  outsideCandidateExerciseIds: string[];
};

const defaultMinCandidates = 12;
const defaultMaxCandidates = 80;
const bodyweightEquipment = new Set(["自重"]);
const genericLowEquipment = new Set(["自重", "其他", "泡沫轴"]);

export function selectExerciseCandidates(
  rawIntent: WorkoutPlanIntent,
  exercises: Exercise[],
  options: Omit<ExerciseCandidateOptions, "exercises"> = {},
): ExerciseCandidateResult {
  const intent = workoutPlanIntentSchema.parse(rawIntent);
  const minCandidates = options.minCandidates ?? defaultMinCandidates;
  const maxCandidates = options.maxCandidates ?? defaultMaxCandidates;
  const requestedEquipment = resolveRequestedEquipment(intent.equipment);
  const riskTagsToExclude = resolveRiskTagsToExclude(intent);
  const goalTags = resolveGoalTags(intent);
  const excluded: ExcludedExercise[] = [];
  const warnings = new Set<string>();

  if (intent.injuryLimitations.length > 0) {
    warnings.add("用户存在疼痛或伤病限制，已排除高冲击或相关风险动作。");
  }

  const candidates = exercises
    .flatMap((exercise) => {
      const exclusionReasons = getExerciseExclusionReasons(exercise, intent, {
        requestedEquipment,
        riskTagsToExclude,
      });

      if (exclusionReasons.length > 0) {
        excluded.push({
          exerciseId: exercise.id,
          nameZh: exercise.nameZh,
          reasons: exclusionReasons,
        });
        return [];
      }

      return [
        {
          exercise,
          ...scoreExercise(exercise, intent, {
            requestedEquipment,
            goalTags,
          }),
        },
      ];
    })
    .sort(compareCandidates)
    .slice(0, maxCandidates);

  if (requestedEquipment.size > 0 && candidates.length < minCandidates) {
    warnings.add("按当前器械限制筛选后候选动作偏少，可能需要放宽器械条件。");
  }

  if (candidates.length < minCandidates) {
    warnings.add("候选动作不足，暂不建议直接生成完整训练计划。");
  }

  return {
    intent,
    candidates,
    excluded,
    warnings: [...warnings],
    isEnoughCandidates: candidates.length >= minCandidates,
  };
}

export async function selectExerciseCandidatesFromStore(
  rawIntent: WorkoutPlanIntent,
  options: Omit<ExerciseCandidateOptions, "exercises"> = {},
): Promise<ExerciseCandidateResult> {
  return selectExerciseCandidates(rawIntent, await listAllExercises(), options);
}

export function validateWorkoutPlanDraftExerciseIds(
  rawDraft: WorkoutPlanDraft,
  candidateExerciseIds: Iterable<string>,
  exercises: Exercise[],
): WorkoutPlanExerciseIdValidationResult {
  const draft = workoutPlanDraftSchema.parse(rawDraft);
  const allExerciseIds = new Set(exercises.map((exercise) => exercise.id));
  const candidateIds = new Set(candidateExerciseIds);
  const exerciseIds = [
    ...new Set(draft.days.flatMap((day) => day.items.map((item) => item.exerciseId))),
  ];
  const invalidExerciseIds = exerciseIds.filter((exerciseId) => !allExerciseIds.has(exerciseId));
  const outsideCandidateExerciseIds = exerciseIds.filter(
    (exerciseId) => allExerciseIds.has(exerciseId) && !candidateIds.has(exerciseId),
  );

  return {
    valid: invalidExerciseIds.length === 0 && outsideCandidateExerciseIds.length === 0,
    exerciseIds,
    invalidExerciseIds,
    outsideCandidateExerciseIds,
  };
}

export async function validateWorkoutPlanDraftExerciseIdsFromStore(
  rawDraft: WorkoutPlanDraft,
  candidateExerciseIds: Iterable<string>,
): Promise<WorkoutPlanExerciseIdValidationResult> {
  return validateWorkoutPlanDraftExerciseIds(
    rawDraft,
    candidateExerciseIds,
    await listAllExercises(),
  );
}

export function getCandidateExerciseIds(result: ExerciseCandidateResult) {
  return result.candidates.map((candidate) => candidate.exercise.id);
}

function getExerciseExclusionReasons(
  exercise: Exercise,
  intent: WorkoutPlanIntent,
  context: {
    requestedEquipment: Set<string>;
    riskTagsToExclude: Set<string>;
  },
) {
  const reasons: string[] = [];

  if (intent.experience === "beginner" && exercise.level === "expert") {
    reasons.push("新手用户排除 expert 动作");
  }

  if (hasExcludedRiskTag(exercise, context.riskTagsToExclude)) {
    reasons.push("命中疼痛或伤病相关风险标签");
  }

  if (!matchesRequestedEquipment(exercise, context.requestedEquipment)) {
    reasons.push("不符合用户可用器械");
  }

  if (matchesAvoidance(exercise, intent.avoidances)) {
    reasons.push("命中用户避开项");
  }

  return reasons;
}

function scoreExercise(
  exercise: Exercise,
  intent: WorkoutPlanIntent,
  context: {
    requestedEquipment: Set<string>;
    goalTags: Set<string>;
  },
) {
  let score = 0;
  const reasons: string[] = [];

  if (exercise.level === "beginner") {
    score += intent.experience === "beginner" ? 30 : 10;
    reasons.push("难度适合新手");
  }

  if (exercise.goalTags.includes("beginner_friendly")) {
    score += intent.experience === "beginner" ? 20 : 5;
    reasons.push("带有 beginner_friendly 标签");
  }

  for (const tag of exercise.goalTags) {
    if (context.goalTags.has(tag)) {
      score += 18;
      reasons.push(`匹配目标标签 ${tag}`);
    }
  }

  if (matchesRequestedEquipment(exercise, context.requestedEquipment)) {
    score += context.requestedEquipment.size > 0 ? 16 : 4;
    if (exercise.equipmentZh) {
      reasons.push(`匹配器械 ${exercise.equipmentZh}`);
    }
  }

  if (matchesPreference(exercise, intent.preferences)) {
    score += 10;
    reasons.push("匹配用户偏好");
  }

  if (exercise.riskTags.length === 0) {
    score += 8;
    reasons.push("无风险标签");
  }

  if (exercise.categoryZh === "拉伸") {
    score += intent.injuryLimitations.length > 0 ? 6 : 0;
  }

  return {
    score,
    reasons,
  };
}

function compareCandidates(left: ExerciseCandidate, right: ExerciseCandidate) {
  return (
    right.score - left.score ||
    compareLevel(left.exercise, right.exercise) ||
    left.exercise.nameZh.localeCompare(right.exercise.nameZh, "zh-Hans-CN")
  );
}

function compareLevel(left: Exercise, right: Exercise) {
  const rank: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    expert: 3,
  };

  return (rank[left.level ?? ""] ?? 99) - (rank[right.level ?? ""] ?? 99);
}

function resolveRequestedEquipment(equipment: string[]) {
  const requested = new Set<string>();
  const normalizedText = normalizeText(equipment.join(" "));

  if (!normalizedText) {
    return requested;
  }

  if (/(无器械|徒手|自重|居家|家里|家中)/.test(normalizedText)) {
    for (const item of bodyweightEquipment) {
      requested.add(item);
    }
  }

  const knownEquipment = [
    "哑铃",
    "杠铃",
    "弹力带",
    "壶铃",
    "绳索器械",
    "固定器械",
    "健身球",
    "药球",
    "泡沫轴",
    "EZ 曲杆",
  ];

  for (const item of knownEquipment) {
    if (normalizedText.includes(normalizeText(item))) {
      requested.add(item);
    }
  }

  return requested;
}

function resolveRiskTagsToExclude(intent: WorkoutPlanIntent) {
  const tags = new Set<string>();
  const text = normalizeText([...intent.injuryLimitations, ...intent.avoidances].join(" "));

  if (!text) {
    return tags;
  }

  if (/(疼|痛|伤|不适|恢复|术后)/.test(text)) {
    tags.add("high_impact");
    tags.add("spine_load");
  }

  if (/(膝|膝盖|髌|半月板)/.test(text)) {
    tags.add("knee_attention");
    tags.add("high_impact");
  }

  if (/(腰|下背|背|脊柱|椎间盘)/.test(text)) {
    tags.add("lower_back_attention");
    tags.add("spine_load");
    tags.add("high_impact");
  }

  if (/(肩|肩膀|肩袖)/.test(text)) {
    tags.add("shoulder_attention");
  }

  return tags;
}

function resolveGoalTags(intent: WorkoutPlanIntent) {
  const tags = new Set<string>();
  const text = normalizeText([intent.goal, ...intent.preferences].join(" "));

  if (/(减脂|燃脂|有氧|心肺|耐力)/.test(text)) {
    tags.add("cardio");
  }

  if (/(增肌|力量|塑形|肌肉)/.test(text)) {
    tags.add("strength");
  }

  if (/(灵活|活动度|拉伸|放松|恢复)/.test(text)) {
    tags.add("mobility");
  }

  if (/(爆发|弹跳|速度)/.test(text)) {
    tags.add("power");
  }

  if (/(居家|家里|家中|无器械|徒手|自重)/.test(text)) {
    tags.add("home_friendly");
  }

  return tags;
}

function hasExcludedRiskTag(exercise: Exercise, riskTagsToExclude: Set<string>) {
  return exercise.riskTags.some((tag) => riskTagsToExclude.has(tag));
}

function matchesRequestedEquipment(exercise: Exercise, requestedEquipment: Set<string>) {
  if (requestedEquipment.size === 0) {
    return true;
  }

  if (!exercise.equipmentZh) {
    return false;
  }

  if (requestedEquipment.has(exercise.equipmentZh)) {
    return true;
  }

  if (requestedEquipment.has("自重") && genericLowEquipment.has(exercise.equipmentZh)) {
    return true;
  }

  return false;
}

function matchesPreference(exercise: Exercise, preferences: string[]) {
  return preferences.some((preference) => matchesFreeText(exercise, preference));
}

function matchesAvoidance(exercise: Exercise, avoidances: string[]) {
  return avoidances.some((avoidance) => matchesFreeText(exercise, avoidance));
}

function matchesFreeText(exercise: Exercise, value: string) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return false;
  }

  return normalizeText(
    [
      exercise.id,
      exercise.nameEn,
      exercise.nameZh,
      exercise.category,
      exercise.categoryZh,
      exercise.equipment,
      exercise.equipmentZh,
      exercise.level,
      exercise.levelZh,
      ...exercise.primaryMuscles,
      ...exercise.primaryMusclesZh,
      ...exercise.secondaryMuscles,
      ...exercise.secondaryMusclesZh,
      ...exercise.goalTags,
      ...exercise.riskTags,
    ]
      .filter(Boolean)
      .join(" "),
  ).includes(normalizedValue);
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
