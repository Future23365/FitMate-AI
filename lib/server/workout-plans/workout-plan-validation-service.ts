import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import type { Exercise } from "@/lib/shared/exercises/types";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  workoutRoutineDraftSchema,
  type WorkoutRoutineDraft,
  type WorkoutDayDraft,
  type WorkoutPlanItemDraft,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
} from "@/lib/shared/workout-plans/draft-schema";
import {
  defaultTrainingLoopRestSeconds,
  estimateWorkoutMinutes,
  type WorkoutItem,
} from "@/lib/shared/workouts/composition";
import {
  validateWorkoutPlanDraftExerciseIds,
  validateWorkoutRoutineDraftExerciseIds,
} from "./exercise-candidate-service";

export type WorkoutPlanValidationIssueCode =
  | "invalid_exercise_id"
  | "outside_candidate_exercise_id"
  | "empty_candidate_set"
  | "cycle_structure_mismatch"
  | "day_similarity_high"
  | "weekly_frequency_mismatch"
  | "session_too_long"
  | "day_estimate_mismatch"
  | "too_many_daily_sets"
  | "beginner_volume_high"
  | "rest_too_short"
  | "missing_safety_notes"
  | "missing_routine_section"
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

  if (draft.cycleLengthDays !== draft.days.length) {
    errors.push({
      code: "cycle_structure_mismatch",
      message: `计划周期为 ${draft.cycleLengthDays} 天，但 days 包含 ${draft.days.length} 天。`,
    });
  }

  if (draft.trainingDayCount !== draft.days.filter((day) => !day.isRestDay).length) {
    errors.push({
      code: "cycle_structure_mismatch",
      message: "trainingDayCount 必须与非休息训练日数量一致。",
    });
  }

  if (draft.restDayCount !== draft.days.filter((day) => day.isRestDay).length) {
    errors.push({
      code: "cycle_structure_mismatch",
      message: "restDayCount 必须与休息日数量一致。",
    });
  }

  if (draft.weeklyFrequency && draft.weeklyFrequency !== intent.weeklyFrequency) {
    warnings.push({
      code: "weekly_frequency_mismatch",
      message: `计划周频率为 ${draft.weeklyFrequency}，用户意图为 ${intent.weeklyFrequency}。`,
    });
  }

  if (
    draft.weeklyFrequency &&
    draft.trainingDayCount !== draft.weeklyFrequency &&
    !intent.calendarHorizonDays
  ) {
    warnings.push({
      code: "weekly_frequency_mismatch",
      message: `计划周期包含 ${draft.trainingDayCount} 个训练日，用户期望每周 ${intent.weeklyFrequency} 次。`,
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

  const trainingDaySignatures = new Map<string, number>();
  for (const [dayIndex, day] of draft.days.entries()) {
    const dayItems = getWorkoutDayItems(day);

    if (!day.isRestDay) {
      const signature = dayItems.map((item) => item.exerciseId).sort().join("|");
      const previousIndex = trainingDaySignatures.get(signature);

      if (previousIndex !== undefined && signature) {
        errors.push({
          code: "day_similarity_high",
          dayIndex: dayIndex + 1,
          message: `训练日「${day.title}」与第 ${previousIndex} 天动作组合高度重复。`,
        });
      }

      trainingDaySignatures.set(signature, dayIndex + 1);
    }

    for (const item of dayItems) {
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

// 校验聊天推送的三段式 routine 草稿，确保它能无损转换为 WorkoutRoutine。
export function validateWorkoutRoutineDraft(
  rawDraft: WorkoutRoutineDraft,
  rawIntent: WorkoutPlanIntent,
  options: WorkoutPlanValidationOptions,
): WorkoutPlanValidationResult {
  const draft = workoutRoutineDraftSchema.parse(rawDraft);
  const intent = workoutPlanIntentSchema.parse(rawIntent);
  const candidateIds = [...new Set(options.candidateExerciseIds)];
  const exerciseIdValidation = validateWorkoutRoutineDraftExerciseIds(
    draft,
    candidateIds,
    options.exercises,
  );
  const errors: WorkoutPlanValidationIssue[] = [];
  const warnings: WorkoutPlanValidationIssue[] = [];
  const allItems = draft.sections.flatMap((section) => section.items);
  const workoutItemsForEstimate: WorkoutItem[] = allItems.map((item) => ({
    id: item.exerciseId,
    exerciseId: item.exerciseId,
    nameZh: item.exerciseId,
    nameEn: item.exerciseId,
    categoryZh: item.section,
    equipmentZh: "",
    musclesZh: [],
    instructionsZh: [],
    imageUrl: "",
    mode: item.mode,
    target: item.target,
    sets: item.sets,
    setRestSeconds: item.setRestSeconds,
    transitionRestSeconds: item.transitionRestSeconds,
    section: item.section,
  }));
  const estimatedMinutes = estimateWorkoutMinutes(workoutItemsForEstimate, {
    trainingLoopRounds: draft.trainingLoopRounds,
    trainingLoopRestSeconds: draft.trainingLoopRestSeconds ?? defaultTrainingLoopRestSeconds,
  });
  const totalSets = allItems.reduce((total, item) => total + item.sets, 0);
  const dayEstimates: WorkoutPlanDayEstimate[] = [
    {
      dayIndex: 1,
      title: draft.title,
      estimatedMinutes,
      declaredEstimatedMinutes: draft.estimatedSessionMinutes,
      totalSets,
      exerciseCount: allItems.length,
    },
  ];

  if (candidateIds.length === 0) {
    errors.push({
      code: "empty_candidate_set",
      message: "候选动作集合为空，不能校验或生成单次训练编排。",
    });
  }

  for (const section of ["warmup", "training", "stretch"] as const) {
    if (!draft.sections.some((candidate) => candidate.section === section && candidate.items.length > 0)) {
      errors.push({
        code: "missing_routine_section",
        message: `单次训练编排缺少 ${section} 阶段动作。`,
      });
    }
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

  if (estimatedMinutes > intent.sessionMinutes + 15) {
    errors.push({
      code: "session_too_long",
      dayIndex: 1,
      message: `单次训练编排估算 ${estimatedMinutes} 分钟，明显超过用户每次 ${intent.sessionMinutes} 分钟。`,
    });
  }

  if (Math.abs(estimatedMinutes - draft.estimatedSessionMinutes) > 10) {
    warnings.push({
      code: "day_estimate_mismatch",
      dayIndex: 1,
      message: `单次训练编排声明 ${draft.estimatedSessionMinutes} 分钟，实际估算约 ${estimatedMinutes} 分钟。`,
    });
  }

  if (totalSets > 24) {
    warnings.push({
      code: "too_many_daily_sets",
      dayIndex: 1,
      message: `单次训练编排共 ${totalSets} 组，训练量偏高。`,
    });
  }

  if (intent.experience === "beginner" && totalSets > 16) {
    warnings.push({
      code: "beginner_volume_high",
      dayIndex: 1,
      message: `单次训练编排对新手可能偏高，建议降低组数或动作数量。`,
    });
  }

  for (const item of allItems) {
    if (item.sets >= 5 && intent.experience === "beginner") {
      warnings.push({
        code: "beginner_volume_high",
        dayIndex: 1,
        exerciseId: item.exerciseId,
        message: `动作 ${item.exerciseId} 为 ${item.sets} 组，对新手可能偏高。`,
      });
    }

    if (item.setRestSeconds < 20 && item.sets >= 3) {
      warnings.push({
        code: "rest_too_short",
        dayIndex: 1,
        exerciseId: item.exerciseId,
        message: `动作 ${item.exerciseId} 组间休息 ${item.setRestSeconds} 秒，可能不足。`,
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
    maxEstimatedMinutes: estimatedMinutes,
    totalWeeklySets: totalSets,
  };
}

function estimateWorkoutDay(day: WorkoutDayDraft, fallbackDayIndex: number): WorkoutPlanDayEstimate {
  const items = getWorkoutDayItems(day);
  const seconds = items.reduce((total, item, index) => {
    const activeSeconds = item.mode === "duration" ? item.target : item.target * 4;
    const setRestSeconds = item.setRestSeconds * Math.max(0, item.sets - 1);
    const transitionRestSeconds = index < items.length - 1 ? item.transitionRestSeconds : 0;

    return total + activeSeconds * item.sets + setRestSeconds + transitionRestSeconds;
  }, 0);

  return {
    dayIndex: day.cycleDayIndex ?? fallbackDayIndex,
    title: day.title,
    estimatedMinutes: items.length === 0 ? 0 : Math.max(1, Math.round(seconds / 60)),
    declaredEstimatedMinutes: day.estimatedMinutes,
    totalSets: items.reduce((total, item) => total + item.sets, 0),
    exerciseCount: items.length,
  };
}

function getWorkoutDayItems(day: WorkoutDayDraft): WorkoutPlanItemDraft[] {
  return day.sections.flatMap((section) => section.items);
}
