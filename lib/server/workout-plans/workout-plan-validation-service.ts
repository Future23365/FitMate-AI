import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { normalizeExerciseMetadata } from "@/lib/shared/exercises/metadata";
import type { Exercise, ExerciseAllowedSection } from "@/lib/shared/exercises/types";
import type { ConversationMemoryState } from "@/lib/shared/user-feedback-memory/schema";
import type { ResolvedFieldSource, ResolvedFieldSources } from "@/lib/shared/chat/resolved-intent";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  workoutRoutineDraftSchema,
  type WorkoutRoutineDraft,
  type WorkoutDayDraft,
  type WorkoutPlanItemDraft,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
  type WorkoutRoutineSection,
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
  | "consecutive_load_high"
  | "weekly_frequency_mismatch"
  | "session_too_long"
  | "session_too_short"
  | "day_estimate_mismatch"
  | "too_many_daily_sets"
  | "beginner_volume_high"
  | "rest_too_short"
  | "missing_safety_notes"
  | "missing_routine_section"
  | "section_exercise_mismatch"
  | "user_memory_constraint"
  | "high_risk_exercise";

export type WorkoutPlanValidationIssue = {
  code: WorkoutPlanValidationIssueCode;
  message: string;
  dayIndex?: number;
  exerciseId?: string;
  section?: WorkoutRoutineSection;
  metadataSections?: ExerciseAllowedSection[];
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
  memoryState?: ConversationMemoryState;
  fieldSources?: ResolvedFieldSources;
  confirmedConstraintFields?: Iterable<WorkoutPlanExplicitConstraintField>;
};

const sessionDurationToleranceMinutes = 10;
const minimumTargetMinutesForShortSessionCheck = 20;

export type WorkoutPlanExplicitConstraintField =
  | "sessionMinutes"
  | "weeklyFrequency"
  | "calendarHorizonDays"
  | "avoidances"
  | "injuryLimitations";

const userExplicitFieldSources = new Set<ResolvedFieldSource>(["current_user_message"]);
const confirmableFieldSources = new Set<ResolvedFieldSource>(["history", "artifact"]);

// 字段来源决定哪些用户约束可以成为 hard fail，避免默认值或旧模型字段反向阻止卡片展示。
function getValidationFieldSources(
  options: WorkoutPlanValidationOptions,
  draftFieldSources: ResolvedFieldSources | undefined = undefined,
): ResolvedFieldSources {
  return {
    ...draftFieldSources,
    ...options.fieldSources,
  };
}

function shouldUseUserConstraintAsHardFail(
  field: WorkoutPlanExplicitConstraintField,
  fieldSources: ResolvedFieldSources,
  options: WorkoutPlanValidationOptions,
) {
  const source = fieldSources[field];
  if (!source) {
    return false;
  }

  if (userExplicitFieldSources.has(source)) {
    return true;
  }

  const confirmedFields = new Set(options.confirmedConstraintFields ?? []);
  return confirmableFieldSources.has(source) && confirmedFields.has(field);
}

function pushFieldSourcedIssue(
  errors: WorkoutPlanValidationIssue[],
  warnings: WorkoutPlanValidationIssue[],
  field: WorkoutPlanExplicitConstraintField,
  fieldSources: ResolvedFieldSources,
  options: WorkoutPlanValidationOptions,
  issue: WorkoutPlanValidationIssue,
) {
  const target = shouldUseUserConstraintAsHardFail(field, fieldSources, options) ? errors : warnings;
  target.push(issue);
}

function pushIssues(
  defaultTarget: WorkoutPlanValidationIssue[],
  hardTarget: WorkoutPlanValidationIssue[],
  issues: WorkoutPlanValidationIssue[],
  hard: boolean,
) {
  (hard ? hardTarget : defaultTarget).push(...issues);
}

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
  const exerciseById = new Map(options.exercises.map((exercise) => [exercise.id, exercise]));
  const fieldSources = getValidationFieldSources(options, draft.planStrategy?.fieldSources);
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

  pushIssues(
    warnings,
    errors,
    validateMemoryConstraints(exerciseIdValidation.exerciseIds, exerciseById, options.memoryState),
    shouldUseUserConstraintAsHardFail("avoidances", fieldSources, options),
  );
  pushAvoidanceIssues({
    target: shouldUseUserConstraintAsHardFail("avoidances", fieldSources, options) ? errors : warnings,
    exerciseIds: exerciseIdValidation.exerciseIds,
    exerciseById,
    avoidances: intent.avoidances,
    sourceLabel: "用户明确避免动作",
  });
  pushAvoidanceIssues({
    target: shouldUseUserConstraintAsHardFail("injuryLimitations", fieldSources, options) ? errors : warnings,
    exerciseIds: exerciseIdValidation.exerciseIds,
    exerciseById,
    avoidances: intent.injuryLimitations,
    sourceLabel: "用户明确训练禁忌",
  });

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
    pushFieldSourcedIssue(errors, warnings, "weeklyFrequency", fieldSources, options, {
      code: "weekly_frequency_mismatch",
      message: `计划周频率为 ${draft.weeklyFrequency}，用户意图为 ${intent.weeklyFrequency}。`,
    });
  }

  if (intent.calendarHorizonDays) {
    const expectedTrainingDays = calculateTrainingDayCountForHorizon(
      intent.calendarHorizonDays,
      intent.weeklyFrequency,
    );

    if (draft.cycleLengthDays !== intent.calendarHorizonDays) {
      pushFieldSourcedIssue(errors, warnings, "calendarHorizonDays", fieldSources, options, {
        code: "cycle_structure_mismatch",
        message: `计划周期为 ${draft.cycleLengthDays} 天，用户期望预览周期为 ${intent.calendarHorizonDays} 天。`,
      });
    }

    if (draft.trainingDayCount !== expectedTrainingDays) {
      pushFieldSourcedIssue(errors, warnings, "weeklyFrequency", fieldSources, options, {
        code: "weekly_frequency_mismatch",
        message: `计划包含 ${draft.trainingDayCount} 个训练日，但 ${intent.calendarHorizonDays} 天内每周 ${intent.weeklyFrequency} 练应安排 ${expectedTrainingDays} 个训练日。`,
      });
    }
  }

  if (
    draft.weeklyFrequency &&
    draft.trainingDayCount !== draft.weeklyFrequency &&
    !intent.calendarHorizonDays
  ) {
    pushFieldSourcedIssue(errors, warnings, "weeklyFrequency", fieldSources, options, {
      code: "weekly_frequency_mismatch",
      message: `计划周期包含 ${draft.trainingDayCount} 个训练日，用户期望每周 ${intent.weeklyFrequency} 次。`,
    });
  }

  for (const estimate of dayEstimates) {
    if (estimate.estimatedMinutes > intent.sessionMinutes + 15) {
      pushFieldSourcedIssue(errors, warnings, "sessionMinutes", fieldSources, options, {
        code: "session_too_long",
        dayIndex: estimate.dayIndex,
        message: `训练日「${estimate.title}」估算 ${estimate.estimatedMinutes} 分钟，明显超过用户每次 ${intent.sessionMinutes} 分钟。`,
      });
    }

    if (isSessionTooShortForTarget(estimate.estimatedMinutes, intent.sessionMinutes)) {
      pushFieldSourcedIssue(errors, warnings, "sessionMinutes", fieldSources, options, {
        code: "session_too_short",
        dayIndex: estimate.dayIndex,
        message: `训练日「${estimate.title}」估算 ${estimate.estimatedMinutes} 分钟，明显低于用户每次 ${intent.sessionMinutes} 分钟。`,
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
        warnings.push({
          code: "day_similarity_high",
          dayIndex: dayIndex + 1,
          message: `训练日「${day.title}」与第 ${previousIndex} 天动作组合高度重复。`,
        });
      }

      trainingDaySignatures.set(signature, dayIndex + 1);
    }

    const previousDay = draft.days[dayIndex - 1];
    const previousEstimate = dayEstimates[dayIndex - 1];
    const currentEstimate = dayEstimates[dayIndex];
    if (
      previousDay &&
      !previousDay.isRestDay &&
      !day.isRestDay &&
      previousEstimate?.totalSets >= 10 &&
      currentEstimate?.totalSets >= 10 &&
      hasExerciseOverlap(getWorkoutDayItems(previousDay), dayItems)
    ) {
      warnings.push({
        code: "consecutive_load_high",
        dayIndex: dayIndex + 1,
        message: `训练日「${previousDay.title}」和「${day.title}」连续安排了高度重叠且偏高的训练量。`,
      });
    }

    for (const item of dayItems) {
      const exercise = exerciseById.get(item.exerciseId);

      const sectionWarning = createSectionSemanticWarning(exercise, item.section, dayIndex + 1, item.exerciseId);
      if (sectionWarning) {
        warnings.push(sectionWarning);
      }

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

function validateMemoryConstraints(
  exerciseIds: string[],
  exerciseById: Map<string, Exercise>,
  memoryState?: ConversationMemoryState,
): WorkoutPlanValidationIssue[] {
  if (!memoryState) {
    return [];
  }

  const issues: WorkoutPlanValidationIssue[] = [];
  const currentRequestedIds = new Set(memoryState.currentMessage.requestedExerciseIds);
  const dislikedIds = new Set([
    ...memoryState.currentMessage.dislikedExerciseIds,
    ...memoryState.activeExerciseFeedback
      .filter((feedback) => feedback.kind === "dislike" && feedback.status === "active" && !feedback.requiresConfirmation)
      .map((feedback) => feedback.exerciseId),
  ]);

  for (const exerciseId of exerciseIds) {
    if (currentRequestedIds.has(exerciseId)) {
      continue;
    }

    if (dislikedIds.has(exerciseId)) {
      issues.push({
        code: "user_memory_constraint",
        exerciseId,
        message: `动作 ${exerciseById.get(exerciseId)?.nameZh ?? exerciseId} 命中用户 dislike 记忆，建议替换或解释当前消息覆盖原因。`,
      });
    }
  }

  return issues;
}

function pushAvoidanceIssues(input: {
  target: WorkoutPlanValidationIssue[];
  exerciseIds: string[];
  exerciseById: Map<string, Exercise>;
  avoidances: string[];
  sourceLabel: string;
}) {
  const normalizedAvoidances = input.avoidances
    .map((item) => normalizeConstraintText(item))
    .filter(Boolean);
  if (normalizedAvoidances.length === 0) {
    return;
  }

  for (const exerciseId of input.exerciseIds) {
    const exercise = input.exerciseById.get(exerciseId);
    if (!exercise) {
      continue;
    }

    const exerciseTokens = [
      exercise.id,
      exercise.nameZh,
      exercise.nameEn,
      exercise.categoryZh,
      exercise.category,
      ...exercise.primaryMusclesZh,
      ...exercise.primaryMuscles,
      ...exercise.riskTags,
      ...exercise.contraindications,
    ].flatMap((item) => item ? [normalizeConstraintText(item)] : []).filter(Boolean);
    const exerciseText = exerciseTokens.join(" ");
    const matchedAvoidance = normalizedAvoidances.find((avoidance) =>
      exerciseText.includes(avoidance) || exerciseTokens.some((token) => avoidance.includes(token)),
    );

    if (matchedAvoidance) {
      input.target.push({
        code: "user_memory_constraint",
        exerciseId,
        message: `${input.sourceLabel}命中动作 ${exercise.nameZh ?? exerciseId}，需要替换或重新生成。`,
      });
    }
  }
}

function normalizeConstraintText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
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
  const exerciseById = new Map(options.exercises.map((exercise) => [exercise.id, exercise]));
  const fieldSources = getValidationFieldSources(options);
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
    pushFieldSourcedIssue(errors, warnings, "sessionMinutes", fieldSources, options, {
      code: "session_too_long",
      dayIndex: 1,
      message: `单次训练编排估算 ${estimatedMinutes} 分钟，明显超过用户每次 ${intent.sessionMinutes} 分钟。`,
    });
  }

  if (isSessionTooShortForTarget(estimatedMinutes, intent.sessionMinutes)) {
    pushFieldSourcedIssue(errors, warnings, "sessionMinutes", fieldSources, options, {
      code: "session_too_short",
      dayIndex: 1,
      message: `单次训练编排估算 ${estimatedMinutes} 分钟，明显低于用户每次 ${intent.sessionMinutes} 分钟。`,
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
    const exercise = exerciseById.get(item.exerciseId);

    const sectionWarning = createSectionSemanticWarning(exercise, item.section, 1, item.exerciseId);
    if (sectionWarning) {
      warnings.push(sectionWarning);
    }

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

  pushIssues(
    warnings,
    errors,
    validateMemoryConstraints(exerciseIdValidation.exerciseIds, exerciseById, options.memoryState),
    shouldUseUserConstraintAsHardFail("avoidances", fieldSources, options),
  );
  pushAvoidanceIssues({
    target: shouldUseUserConstraintAsHardFail("avoidances", fieldSources, options) ? errors : warnings,
    exerciseIds: exerciseIdValidation.exerciseIds,
    exerciseById,
    avoidances: intent.avoidances,
    sourceLabel: "用户明确避免动作",
  });
  pushAvoidanceIssues({
    target: shouldUseUserConstraintAsHardFail("injuryLimitations", fieldSources, options) ? errors : warnings,
    exerciseIds: exerciseIdValidation.exerciseIds,
    exerciseById,
    avoidances: intent.injuryLimitations,
    sourceLabel: "用户明确训练禁忌",
  });

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

// Section 归属属于训练语义判断，服务端只记录本地元数据分歧，不阻断可执行草稿。
function createSectionSemanticWarning(
  exercise: Exercise | undefined,
  section: WorkoutRoutineSection,
  dayIndex: number,
  exerciseId: string,
): WorkoutPlanValidationIssue | null {
  if (!exercise) {
    return null;
  }

  const metadata = normalizeExerciseMetadata(exercise);
  if (metadata.allowedSections.includes(section)) {
    return null;
  }

  return {
    code: "section_exercise_mismatch",
    dayIndex,
    exerciseId,
    section,
    metadataSections: metadata.allowedSections,
    message: `动作 ${exerciseId} 的本地元数据偏向 ${metadata.allowedSections.join("、")}，AI 放入 ${section} 阶段。`,
  };
}

// 明确时长的 routine 需要接近目标可执行时长，避免只信任 LLM 声明分钟数。
function isSessionTooShortForTarget(estimatedMinutes: number, targetSessionMinutes: number) {
  return targetSessionMinutes >= minimumTargetMinutesForShortSessionCheck
    && estimatedMinutes < targetSessionMinutes - sessionDurationToleranceMinutes;
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

function hasExerciseOverlap(left: WorkoutPlanItemDraft[], right: WorkoutPlanItemDraft[]) {
  const leftIds = new Set(left.map((item) => item.exerciseId));

  return right.some((item) => leftIds.has(item.exerciseId));
}

function calculateTrainingDayCountForHorizon(horizonDays: number, weeklyFrequency: number) {
  const pattern = getWeeklyPattern(weeklyFrequency);
  let count = 0;

  for (let weekStart = 1; weekStart <= horizonDays; weekStart += 7) {
    const daysInWeek = Math.min(7, horizonDays - weekStart + 1);
    count += pattern.filter((weekday) => weekday <= daysInWeek).length;
  }

  return count;
}

function getWeeklyPattern(weeklyFrequency: number) {
  const patterns: Record<number, number[]> = {
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 3, 5, 7],
    5: [1, 2, 4, 5, 7],
    6: [1, 2, 3, 4, 5, 6],
    7: [1, 2, 3, 4, 5, 6, 7],
  };

  return patterns[weeklyFrequency] ?? patterns[3];
}
