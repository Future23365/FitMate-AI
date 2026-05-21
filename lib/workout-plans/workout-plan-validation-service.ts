import { listAllExercises } from "@/lib/exercises/exercise-service";
import type { Exercise } from "@/lib/exercises/types";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  type WorkoutDayDraft,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
} from "./draft-schema";
import { validateWorkoutPlanDraftExerciseIds } from "./exercise-candidate-service";

export type WorkoutPlanValidationIssueCode =
  | "invalid_exercise_id"
  | "outside_candidate_exercise_id"
  | "empty_candidate_set"
  | "weekly_frequency_mismatch"
  | "session_too_long"
  | "day_estimate_mismatch"
  | "too_many_daily_sets"
  | "beginner_volume_high"
  | "rest_too_short"
  | "missing_safety_notes"
  | "high_risk_exercise";

export type WorkoutPlanValidationIssue = {
  code: WorkoutPlanValidationIssueCode;
  message: string;
  dayIndex?: number;
  exerciseId?: string;
};

export type WorkoutPlanDayEstimate = {
  dayIndex: number;
  title: string;
  estimatedMinutes: number;
  declaredEstimatedMinutes: number;
  totalSets: number;
  exerciseCount: number;
};

export type WorkoutPlanValidationResult = {
  valid: boolean;
  errors: WorkoutPlanValidationIssue[];
  warnings: WorkoutPlanValidationIssue[];
  exerciseIds: string[];
  invalidExerciseIds: string[];
  outsideCandidateExerciseIds: string[];
  dayEstimates: WorkoutPlanDayEstimate[];
  maxEstimatedMinutes: number;
  totalWeeklySets: number;
};

export type WorkoutPlanValidationOptions = {
  exercises: Exercise[];
  candidateExerciseIds: Iterable<string>;
};

export async function validateWorkoutPlanDraftFromStore(
  rawDraft: WorkoutPlanDraft,
  rawIntent: WorkoutPlanIntent,
  candidateExerciseIds: Iterable<string>,
): Promise<WorkoutPlanValidationResult> {
  return validateWorkoutPlanDraft(rawDraft, rawIntent, {
    exercises: await listAllExercises(),
    candidateExerciseIds,
  });
}

export function validateWorkoutPlanDraft(
  rawDraft: WorkoutPlanDraft,
  rawIntent: WorkoutPlanIntent,
  options: WorkoutPlanValidationOptions,
): WorkoutPlanValidationResult {
  const draft = workoutPlanDraftSchema.parse(rawDraft);
  const intent = workoutPlanIntentSchema.parse(rawIntent);
  const candidateIds = [...new Set(options.candidateExerciseIds)];
  const exerciseIdValidation = validateWorkoutPlanDraftExerciseIds(
    draft,
    candidateIds,
    options.exercises,
  );
  const exerciseById = new Map(options.exercises.map((exercise) => [exercise.id, exercise]));
  const errors: WorkoutPlanValidationIssue[] = [];
  const warnings: WorkoutPlanValidationIssue[] = [];
  const dayEstimates = draft.days.map((day, index) => estimateWorkoutDay(day, index + 1));
  const maxEstimatedMinutes = Math.max(...dayEstimates.map((estimate) => estimate.estimatedMinutes));
  const totalWeeklySets = dayEstimates.reduce((total, estimate) => total + estimate.totalSets, 0);

  if (candidateIds.length === 0) {
    errors.push({
      code: "empty_candidate_set",
      message: "候选动作集合为空，不能校验或生成训练计划。",
    });
  }

  for (const exerciseId of exerciseIdValidation.invalidExerciseIds) {
    errors.push({
      code: "invalid_exercise_id",
      exerciseId,
      message: `动作 ID 不存在于动作库：${exerciseId}`,
    });
  }

  for (const exerciseId of exerciseIdValidation.outsideCandidateExerciseIds) {
    errors.push({
      code: "outside_candidate_exercise_id",
      exerciseId,
      message: `动作 ID 不在本次候选集中：${exerciseId}`,
    });
  }

  if (draft.weeklyFrequency !== intent.weeklyFrequency) {
    warnings.push({
      code: "weekly_frequency_mismatch",
      message: `计划周频率为 ${draft.weeklyFrequency}，用户意图为 ${intent.weeklyFrequency}。`,
    });
  }

  if (draft.days.length !== intent.weeklyFrequency) {
    warnings.push({
      code: "weekly_frequency_mismatch",
      message: `计划包含 ${draft.days.length} 个训练日，用户期望每周 ${intent.weeklyFrequency} 次。`,
    });
  }

  for (const estimate of dayEstimates) {
    if (estimate.estimatedMinutes > intent.sessionMinutes + 15) {
      errors.push({
        code: "session_too_long",
        dayIndex: estimate.dayIndex,
        message: `训练日「${estimate.title}」估算 ${estimate.estimatedMinutes} 分钟，明显超过用户每次 ${intent.sessionMinutes} 分钟。`,
      });
    }

    if (Math.abs(estimate.estimatedMinutes - estimate.declaredEstimatedMinutes) > 10) {
      warnings.push({
        code: "day_estimate_mismatch",
        dayIndex: estimate.dayIndex,
        message: `训练日「${estimate.title}」声明 ${estimate.declaredEstimatedMinutes} 分钟，实际估算约 ${estimate.estimatedMinutes} 分钟。`,
      });
    }

    if (estimate.totalSets > 24) {
      warnings.push({
        code: "too_many_daily_sets",
        dayIndex: estimate.dayIndex,
        message: `训练日「${estimate.title}」共 ${estimate.totalSets} 组，单次训练量偏高。`,
      });
    }

    if (intent.experience === "beginner" && estimate.totalSets > 16) {
      warnings.push({
        code: "beginner_volume_high",
        dayIndex: estimate.dayIndex,
        message: `训练日「${estimate.title}」对新手可能偏高，建议降低组数或动作数量。`,
      });
    }
  }

  for (const [dayIndex, day] of draft.days.entries()) {
    for (const item of day.items) {
      const exercise = exerciseById.get(item.exerciseId);

      if (item.sets >= 5 && intent.experience === "beginner") {
        warnings.push({
          code: "beginner_volume_high",
          dayIndex: dayIndex + 1,
          exerciseId: item.exerciseId,
          message: `动作 ${item.exerciseId} 为 ${item.sets} 组，对新手可能偏高。`,
        });
      }

      if (item.setRestSeconds < 20 && item.sets >= 3) {
        warnings.push({
          code: "rest_too_short",
          dayIndex: dayIndex + 1,
          exerciseId: item.exerciseId,
          message: `动作 ${item.exerciseId} 组间休息 ${item.setRestSeconds} 秒，可能不足。`,
        });
      }

      if (exercise && hasRelevantRisk(exercise, intent)) {
        warnings.push({
          code: "high_risk_exercise",
          dayIndex: dayIndex + 1,
          exerciseId: item.exerciseId,
          message: `动作「${exercise.nameZh}」带有风险标签，需确认符合用户限制。`,
        });
      }
    }
  }

  if (intent.injuryLimitations.length > 0 && draft.safetyNotes.length === 0) {
    warnings.push({
      code: "missing_safety_notes",
      message: "用户存在疼痛或伤病限制，但计划缺少整体安全提示。",
    });
  }

  for (const [index, day] of draft.days.entries()) {
    if (intent.injuryLimitations.length > 0 && day.safetyNotes.length === 0) {
      warnings.push({
        code: "missing_safety_notes",
        dayIndex: index + 1,
        message: `训练日「${day.title}」缺少安全提示。`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    exerciseIds: exerciseIdValidation.exerciseIds,
    invalidExerciseIds: exerciseIdValidation.invalidExerciseIds,
    outsideCandidateExerciseIds: exerciseIdValidation.outsideCandidateExerciseIds,
    dayEstimates,
    maxEstimatedMinutes,
    totalWeeklySets,
  };
}

function estimateWorkoutDay(day: WorkoutDayDraft, fallbackDayIndex: number): WorkoutPlanDayEstimate {
  const seconds = day.items.reduce((total, item, index) => {
    const activeSeconds = item.mode === "duration" ? item.target : item.target * 4;
    const setRestSeconds = item.setRestSeconds * Math.max(0, item.sets - 1);
    const transitionRestSeconds = index < day.items.length - 1 ? item.transitionRestSeconds : 0;

    return total + activeSeconds * item.sets + setRestSeconds + transitionRestSeconds;
  }, 0);

  return {
    dayIndex: day.dayIndex ?? fallbackDayIndex,
    title: day.title,
    estimatedMinutes: Math.max(1, Math.round(seconds / 60)),
    declaredEstimatedMinutes: day.estimatedMinutes,
    totalSets: day.items.reduce((total, item) => total + item.sets, 0),
    exerciseCount: day.items.length,
  };
}

function hasRelevantRisk(exercise: Exercise, intent: WorkoutPlanIntent) {
  if (exercise.riskTags.length === 0 || intent.injuryLimitations.length === 0) {
    return false;
  }

  const text = normalizeText(intent.injuryLimitations.join(" "));

  return exercise.riskTags.some((tag) => {
    if (tag === "high_impact") {
      return /(疼|痛|伤|不适|恢复|术后|膝|腰|背)/.test(text);
    }

    if (tag === "knee_attention") {
      return /(膝|膝盖|髌|半月板)/.test(text);
    }

    if (tag === "lower_back_attention" || tag === "spine_load") {
      return /(腰|下背|背|脊柱|椎间盘)/.test(text);
    }

    if (tag === "shoulder_attention") {
      return /(肩|肩膀|肩袖)/.test(text);
    }

    return false;
  });
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
