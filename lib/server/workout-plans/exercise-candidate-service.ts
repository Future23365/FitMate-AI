import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import {
  isExerciseAllowedInSection,
  normalizeExerciseMetadata,
} from "@/lib/shared/exercises/metadata";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { ConversationMemoryState } from "@/lib/shared/user-feedback-memory/schema";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  workoutRoutineDraftSchema,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
  type WorkoutRoutineDraft,
  type WorkoutRoutineSection,
} from "@/lib/shared/workout-plans/draft-schema";

export type ExerciseCandidate = {
  exercise: Exercise;
  score: number;
  reasons: string[];
  /** 候选来源：primary = 用户意图推断，supplementary = 系统补充 */
  source: "primary" | "supplementary";
};

export type ExcludedExercise = {
  exerciseId: string;
  nameZh: string;
  reasons: string[];
};

export type ExerciseCandidateShortage = {
  pool: keyof ExerciseCandidatePools;
  required: number;
  actual: number;
  reasons: string[];
};

export type ExerciseCandidatePools = {
  warmup: ExerciseCandidate[];
  training: ExerciseCandidate[];
  stretch: ExerciseCandidate[];
  regression: ExerciseCandidate[];
  progression: ExerciseCandidate[];
  substitution: ExerciseCandidate[];
};

export type ExerciseCandidateResult = {
  intent: WorkoutPlanIntent;
  /** 用户意图直接推断出的候选动作（高优先级，AI 必须优先选用） */
  primaryCandidates: ExerciseCandidate[];
  /** 系统补充的候选动作（AI 自主决定是否选用） */
  supplementaryCandidates: ExerciseCandidate[];
  /** 按训练阶段和替代用途拆分的服务端候选池，供计划生成和 Patch 校验使用 */
  candidatePools: ExerciseCandidatePools;
  excluded: ExcludedExercise[];
  shortages: ExerciseCandidateShortage[];
  warnings: string[];
  candidateStatus: "enough" | "limited_but_usable" | "insufficient";
  relevantCandidateCount: number;
  requiredRelevantCandidateCount: number;
  isEnoughCandidates: boolean;
};

export type ExerciseCandidateOptions = {
  exercises?: Exercise[];
  minCandidates?: number;
  maxCandidates?: number;
  userId?: string;
  visibility?: "all" | "published";
  section?: WorkoutRoutineSection;
  originalExerciseId?: string;
  replacementDirection?: "regression" | "progression" | "substitution";
  memoryState?: ConversationMemoryState;
};

export type WorkoutPlanExerciseIdValidationResult = {
  valid: boolean;
  exerciseIds: string[];
  invalidExerciseIds: string[];
  outsideCandidateExerciseIds: string[];
};

const defaultPlanMinCandidates = 12;
const defaultRoutineMinCandidates = 4;
const maxPrimaryCandidates = 40;
const maxSupplementaryCandidates = 40;
/** 分数 >= 此阈值的动作归为 primary，否则归为 supplementary */
const primaryScoreThreshold = 28;
const bodyweightEquipment = new Set(["自重"]);
const genericLowEquipment = new Set(["自重", "其他", "泡沫轴"]);

export function selectExerciseCandidates(
  rawIntent: WorkoutPlanIntent,
  exercises: Exercise[],
  options: Omit<ExerciseCandidateOptions, "exercises"> = {},
): ExerciseCandidateResult {
  const intent = workoutPlanIntentSchema.parse(rawIntent);
  const requestedEquipment = resolveRequestedEquipment(intent.equipment);
  const goalTags = resolveGoalTags(intent);
  const targetMuscles = resolveTargetMuscles(intent);
  const candidateRequirement = resolveCandidateRequirement(intent, targetMuscles, options);
  const excluded: ExcludedExercise[] = [];
  const warnings = new Set<string>();

  // 第一步：排除不合格动作并评分
  const allScored = exercises
    .flatMap((exercise) => {
      const exclusionReasons = getExerciseExclusionReasons(exercise, intent, {
        requestedEquipment,
        visibility: options.visibility ?? "all",
        section: options.section,
        memoryState: options.memoryState,
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
            targetMuscles,
            memoryState: options.memoryState,
          }),
        },
      ];
    })
    .sort(compareCandidates);

  // 第二步：基于分数阈值分层
  const primaryCandidates: ExerciseCandidate[] = allScored
    .filter((c) => c.score >= primaryScoreThreshold)
    .slice(0, maxPrimaryCandidates)
    .map((c) => ({ ...c, source: "primary" as const }));

  const supplementaryCandidates: ExerciseCandidate[] = allScored
    .filter((c) => c.score < primaryScoreThreshold)
    .slice(0, maxSupplementaryCandidates)
    .map((c) => ({ ...c, source: "supplementary" as const }));
  const structuredSupplementaryCandidates = ["plan", "routine"].includes(intent.intentType)
    ? mergeStructuredSectionCandidates(supplementaryCandidates, allScored, primaryCandidates)
    : supplementaryCandidates;
  const allCandidates = [
    ...primaryCandidates,
    ...structuredSupplementaryCandidates,
  ];
  const candidatePools = buildExerciseCandidatePools({
    candidates: allCandidates,
    originalExerciseId: options.originalExerciseId,
    replacementDirection: options.replacementDirection ?? inferReplacementDirectionFromMemory(
      options.originalExerciseId,
      options.memoryState,
    ),
  });

  const totalCandidates = primaryCandidates.length + structuredSupplementaryCandidates.length;
  const relevantCandidateCount =
    targetMuscles.size > 0
      ? primaryCandidates.filter((candidate) => matchesTargetMuscles(candidate.exercise, targetMuscles))
          .length
      : primaryCandidates.length;
  const candidateStatus = resolveCandidateStatus({
    relevantCandidateCount,
    requiredRelevantCandidateCount: candidateRequirement.requiredRelevantCandidateCount,
    totalCandidates,
    requiredTotalCandidateCount: candidateRequirement.requiredTotalCandidateCount,
  });

  if (requestedEquipment.size > 0 && candidateStatus === "insufficient") {
    warnings.add("按当前器械限制筛选后没有足够相关动作，可能需要放宽器械条件。");
  }

  for (const warning of buildMemoryWarnings(options.memoryState)) {
    warnings.add(warning);
  }

  if (candidateStatus === "limited_but_usable") {
    warnings.add("相关候选动作数量有限但可用，可通过动作变式、组数、次数和休息时间完成编排。");
  }

  if (candidateStatus === "insufficient") {
    warnings.add("相关候选动作不足，无法生成可靠的训练计划草稿。");
  }

  const shortages = resolveCandidateShortages(candidatePools, intent);
  for (const shortage of shortages) {
    warnings.add(`${shortage.pool} 候选不足：需要 ${shortage.required} 个，当前 ${shortage.actual} 个。`);
  }

  return {
    intent,
    primaryCandidates,
    supplementaryCandidates: structuredSupplementaryCandidates,
    candidatePools,
    excluded,
    shortages,
    warnings: [...warnings],
    candidateStatus,
    relevantCandidateCount,
    requiredRelevantCandidateCount: candidateRequirement.requiredRelevantCandidateCount,
    isEnoughCandidates: candidateStatus !== "insufficient",
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
    ...new Set(
      draft.days.flatMap((day) =>
        day.sections.flatMap((section) => section.items.map((item) => item.exerciseId)),
      ),
    ),
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

export function validateWorkoutRoutineDraftExerciseIds(
  rawDraft: WorkoutRoutineDraft,
  candidateExerciseIds: Iterable<string>,
  exercises: Exercise[],
): WorkoutPlanExerciseIdValidationResult {
  const draft = workoutRoutineDraftSchema.parse(rawDraft);
  const allExerciseIds = new Set(exercises.map((exercise) => exercise.id));
  const candidateIds = new Set(candidateExerciseIds);
  const exerciseIds = [
    ...new Set(draft.sections.flatMap((section) => section.items.map((item) => item.exerciseId))),
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

/** 返回 primary + supplementary 的全部候选动作 ID 合集 */
export function getCandidateExerciseIds(result: ExerciseCandidateResult) {
  return [
    ...new Set([
      ...result.primaryCandidates.map((c) => c.exercise.id),
      ...result.supplementaryCandidates.map((c) => c.exercise.id),
      ...Object.values(result.candidatePools).flatMap((pool) => pool.map((c) => c.exercise.id)),
    ]),
  ];
}

function getExerciseExclusionReasons(
  exercise: Exercise,
  intent: WorkoutPlanIntent,
  context: {
    requestedEquipment: Set<string>;
    visibility: "all" | "published";
    section?: WorkoutRoutineSection;
    memoryState?: ConversationMemoryState;
  },
) {
  const reasons: string[] = [];
  const metadata = normalizeExerciseMetadata(exercise);

  if (context.visibility === "published" && !exercise.isPublished) {
    reasons.push("动作未发布");
  }

  if (intent.experience === "beginner" && metadata.difficulty === "advanced") {
    reasons.push("新手用户排除 expert 动作");
  }

  if (context.section && !metadata.allowedSections.includes(context.section)) {
    reasons.push(`不允许进入 ${context.section} 阶段`);
  }

  if (!matchesRequestedEquipment(exercise, context.requestedEquipment)) {
    reasons.push("不符合用户可用器械");
  }

  if (matchesRiskLimit(exercise, intent.injuryLimitations)) {
    reasons.push("命中用户伤病或疼痛限制");
  }

  if (matchesAvoidance(exercise, intent.avoidances)) {
    reasons.push("命中用户避开项");
  }

  reasons.push(...getMemoryExclusionReasons(exercise, context.memoryState));

  return reasons;
}

function scoreExercise(
  exercise: Exercise,
  intent: WorkoutPlanIntent,
  context: {
    requestedEquipment: Set<string>;
    goalTags: Set<string>;
    targetMuscles: Set<string>;
    memoryState?: ConversationMemoryState;
  },
) {
  let score = 0;
  const reasons: string[] = [];

  const primaryMuscleMatches = exercise.primaryMusclesZh.filter((muscle) =>
    context.targetMuscles.has(muscle),
  );
  const secondaryMuscleMatches = exercise.secondaryMusclesZh.filter((muscle) =>
    context.targetMuscles.has(muscle),
  );

  if (primaryMuscleMatches.length > 0) {
    score += 50;
    reasons.push(`主肌群匹配 ${primaryMuscleMatches.join("、")}`);
  } else if (secondaryMuscleMatches.length > 0) {
    score += 24;
    reasons.push(`辅助肌群匹配 ${secondaryMuscleMatches.join("、")}`);
  }

  if (exercise.level === "beginner") {
    score += intent.experience === "beginner" ? 30 : 10;
    reasons.push("难度适合新手");
  }

  const metadata = normalizeExerciseMetadata(exercise);
  if (metadata.intensityRole === "activation" || metadata.intensityRole === "recovery") {
    score += 4;
    reasons.push(`动作角色 ${metadata.intensityRole}`);
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

  const memoryAdjustment = scoreExerciseMemory(exercise, context.memoryState);
  score += memoryAdjustment.score;
  reasons.push(...memoryAdjustment.reasons);

  return {
    score,
    reasons,
  };
}

function getMemoryExclusionReasons(
  exercise: Exercise,
  memoryState?: ConversationMemoryState,
) {
  if (!memoryState) {
    return [];
  }

  const requestedExerciseIds = new Set(memoryState.currentMessage.requestedExerciseIds);
  if (requestedExerciseIds.has(exercise.id)) {
    return [];
  }

  const reasons: string[] = [];
  const activeFeedback = memoryState.activeExerciseFeedback.filter(
    (feedback) => feedback.exerciseId === exercise.id && feedback.status === "active" && !feedback.requiresConfirmation,
  );

  if (activeFeedback.some((feedback) => feedback.kind === "dislike")) {
    reasons.push("命中用户长期动作 dislike");
  }

  if (memoryState.currentMessage.dislikedExerciseIds.includes(exercise.id)) {
    reasons.push("命中本轮动作 dislike");
  }

  const avoidanceLabels = [
    ...memoryState.currentMessage.temporaryAvoidanceLabels,
    ...memoryState.currentMessage.healthSignalLabels,
    ...memoryState.activeMemories
      .filter((memory) =>
        memory.status === "active" &&
        !memory.requiresConfirmation &&
        ["constraint", "temporary_context", "injury_or_pain_signal"].includes(memory.kind),
      )
      .map((memory) => memory.subjectLabel)
      .filter(Boolean),
  ];

  for (const label of avoidanceLabels) {
    if (label && matchesExerciseLabel(exercise, label)) {
      reasons.push(`命中用户记忆约束：${label}`);
    }
  }

  return [...new Set(reasons)];
}

function scoreExerciseMemory(exercise: Exercise, memoryState?: ConversationMemoryState) {
  if (!memoryState) {
    return { score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];
  const activeFeedback = memoryState.activeExerciseFeedback.filter(
    (feedback) => feedback.exerciseId === exercise.id && feedback.status === "active" && !feedback.requiresConfirmation,
  );

  if (
    activeFeedback.some((feedback) => feedback.kind === "too_hard") ||
    memoryState.currentMessage.tooHardExerciseIds.includes(exercise.id)
  ) {
    score -= 35;
    reasons.push("用户反馈该动作太难，降低排序");
  }

  if (activeFeedback.some((feedback) => feedback.kind === "too_easy")) {
    score -= 8;
    reasons.push("用户反馈该动作偏轻松，降低常规排序");
  }

  return { score, reasons };
}

function inferReplacementDirectionFromMemory(
  originalExerciseId: string | undefined,
  memoryState?: ConversationMemoryState,
): "regression" | undefined {
  if (!originalExerciseId || !memoryState) {
    return undefined;
  }

  const isTooHard =
    memoryState.currentMessage.tooHardExerciseIds.includes(originalExerciseId) ||
    memoryState.activeExerciseFeedback.some(
      (feedback) =>
        feedback.exerciseId === originalExerciseId &&
        feedback.kind === "too_hard" &&
        feedback.status === "active" &&
        !feedback.requiresConfirmation,
    );

  return isTooHard ? "regression" : undefined;
}

function buildMemoryWarnings(memoryState?: ConversationMemoryState) {
  if (!memoryState) {
    return [];
  }

  const warnings: string[] = [];
  if (memoryState.currentMessage.temporaryAvoidanceLabels.length > 0) {
    warnings.push(`已应用本轮临时约束：${memoryState.currentMessage.temporaryAvoidanceLabels.join("、")}。`);
  }

  if (memoryState.currentMessage.healthSignalLabels.length > 0) {
    warnings.push(`已按本轮不适信号保守筛选：${memoryState.currentMessage.healthSignalLabels.join("、")}。`);
  }

  return warnings;
}

function matchesExerciseLabel(exercise: Exercise, label: string) {
  const normalizedLabel = label.trim();
  const text = [
    exercise.nameZh,
    exercise.nameEn,
    exercise.categoryZh,
    exercise.levelZh,
    ...exercise.primaryMusclesZh,
    ...exercise.secondaryMusclesZh,
    ...exercise.riskTags,
    ...exercise.contraindications,
  ]
    .filter(Boolean)
    .join(" ");

  if (text.includes(normalizedLabel)) {
    return true;
  }

  const aliases: Record<string, RegExp> = {
    腿: /腿|股四头|腘绳|小腿|臀/,
    胸: /胸/,
    背: /背|背阔|斜方/,
    肩: /肩|三角肌/,
    核心: /核心|腹|腰/,
    手臂: /手臂|肱二头|肱三头|前臂/,
    臀: /臀/,
    膝: /膝|腿|股四头|弓步|深蹲/,
    腰: /腰|下背|核心/,
    手腕: /手腕|俯卧撑|支撑/,
    脚踝: /脚踝|跳|跑|弓步|深蹲/,
  };

  return aliases[normalizedLabel]?.test(text) ?? false;
}

function resolveCandidateRequirement(
  intent: WorkoutPlanIntent,
  targetMuscles: Set<string>,
  options: Omit<ExerciseCandidateOptions, "exercises">,
) {
  const requiredTotalCandidateCount =
    options.minCandidates ??
    (intent.intentType === "routine"
      ? defaultRoutineMinCandidates
      : Math.min(defaultPlanMinCandidates, Math.max(6, intent.weeklyFrequency * 3)));
  const requiredRelevantCandidateCount =
    targetMuscles.size === 0
      ? requiredTotalCandidateCount
      : intent.intentType === "routine"
        ? 3
        : Math.min(10, Math.max(4, intent.weeklyFrequency * 2));

  return {
    requiredTotalCandidateCount,
    requiredRelevantCandidateCount,
  };
}

function resolveCandidateStatus(context: {
  relevantCandidateCount: number;
  requiredRelevantCandidateCount: number;
  totalCandidates: number;
  requiredTotalCandidateCount: number;
}): ExerciseCandidateResult["candidateStatus"] {
  if (context.relevantCandidateCount === 0) {
    return "insufficient";
  }

  const minimumUsableRelevantCount = Math.min(3, context.requiredRelevantCandidateCount);

  if (context.relevantCandidateCount < minimumUsableRelevantCount) {
    return "insufficient";
  }

  if (
    context.relevantCandidateCount < context.requiredRelevantCandidateCount ||
    context.totalCandidates < context.requiredTotalCandidateCount
  ) {
    return "limited_but_usable";
  }

  return "enough";
}

function compareCandidates(
  left: { score: number; exercise: Exercise },
  right: { score: number; exercise: Exercise },
) {
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

function mergeStructuredSectionCandidates(
  supplementaryCandidates: ExerciseCandidate[],
  allScored: Array<{ exercise: Exercise; score: number; reasons: string[] }>,
  primaryCandidates: ExerciseCandidate[],
) {
  const selectedIds = new Set([
    ...primaryCandidates.map((candidate) => candidate.exercise.id),
    ...supplementaryCandidates.map((candidate) => candidate.exercise.id),
  ]);
  const structuredCandidates = [...supplementaryCandidates];

  for (const candidate of allScored) {
    if (selectedIds.has(candidate.exercise.id) || !isSectionStructureCandidate(candidate.exercise)) {
      continue;
    }

    if (structuredCandidates.length >= maxSupplementaryCandidates) {
      structuredCandidates.pop();
    }

    selectedIds.add(candidate.exercise.id);
    structuredCandidates.push({
      ...candidate,
      reasons: [...candidate.reasons, "补充热身、拉伸或恢复阶段"],
      source: "supplementary",
    });

  }

  return structuredCandidates;
}

function isSectionStructureCandidate(exercise: Exercise) {
  const metadata = normalizeExerciseMetadata(exercise);

  if (metadata.allowedSections.some((section) => section === "warmup" || section === "stretch")) {
    return true;
  }

  const text = `${exercise.categoryZh ?? ""} ${exercise.nameZh} ${exercise.goalTags.join(" ")}`;

  return /(热身|激活|动态|拉伸|伸展|放松|恢复|mobility|stretch|warmup|recovery)/i.test(text);
}

// ExerciseCandidatePools 是计划生成和 Patch 的统一候选事实源，避免调用方自行猜测阶段用途。
function buildExerciseCandidatePools(input: {
  candidates: ExerciseCandidate[];
  originalExerciseId?: string;
  replacementDirection?: "regression" | "progression" | "substitution";
}): ExerciseCandidatePools {
  const warmup = input.candidates.filter((candidate) =>
    isExerciseAllowedInSection(candidate.exercise, "warmup"),
  );
  const training = input.candidates.filter((candidate) =>
    isExerciseAllowedInSection(candidate.exercise, "training"),
  );
  const stretch = input.candidates.filter((candidate) =>
    isExerciseAllowedInSection(candidate.exercise, "stretch"),
  );
  const originalExercise = input.originalExerciseId
    ? input.candidates.find((candidate) => candidate.exercise.id === input.originalExerciseId)?.exercise
    : undefined;
  const substitution = sortReplacementCandidates(input.candidates, {
    originalExercise,
    direction: input.replacementDirection ?? "substitution",
  });

  return {
    warmup,
    training,
    stretch,
    regression: sortReplacementCandidates(input.candidates, {
      originalExercise,
      direction: "regression",
    }),
    progression: sortReplacementCandidates(input.candidates, {
      originalExercise,
      direction: "progression",
    }),
    substitution,
  };
}

export function sortReplacementCandidates(
  candidates: ExerciseCandidate[],
  context: {
    originalExercise?: Exercise;
    direction?: "regression" | "progression" | "substitution";
  } = {},
) {
  if (!context.originalExercise) {
    return [...candidates].sort(compareCandidates);
  }

  const originalExercise = context.originalExercise;
  return [...candidates]
    .filter((candidate) => candidate.exercise.id !== originalExercise.id)
    .sort((left, right) =>
      scoreReplacementCandidate(right.exercise, { ...context, originalExercise }) -
        scoreReplacementCandidate(left.exercise, { ...context, originalExercise }) ||
      compareCandidates(left, right),
    );
}

function scoreReplacementCandidate(
  exercise: Exercise,
  context: {
    originalExercise: Exercise;
    direction?: "regression" | "progression" | "substitution";
  },
) {
  const original = normalizeExerciseMetadata(context.originalExercise);
  const replacement = normalizeExerciseMetadata(exercise);
  let score = 0;

  if (
    context.originalExercise.substitutionGroupId &&
    exercise.substitutionGroupId === context.originalExercise.substitutionGroupId
  ) {
    score += 100;
  }

  if (context.direction === "regression" && context.originalExercise.regressionExerciseIds.includes(exercise.id)) {
    score += 120;
  }

  if (context.direction === "progression" && context.originalExercise.progressionExerciseIds.includes(exercise.id)) {
    score += 120;
  }

  if (original.movementPattern && replacement.movementPattern === original.movementPattern) {
    score += 50;
  }

  if (sharesPrimaryMuscle(exercise, context.originalExercise)) {
    score += 30;
  }

  if (matchesOriginalEquipment(context.originalExercise, exercise)) {
    score += 20;
  }

  if (hasOverlappingSections(context.originalExercise, exercise)) {
    score += 20;
  }

  const difficultyDelta = difficultyRank(replacement.difficulty) - difficultyRank(original.difficulty);
  if (context.direction === "regression") {
    score += difficultyDelta < 0 ? 35 : -20;
  } else if (context.direction === "progression") {
    score += difficultyDelta > 0 ? 35 : -20;
  } else {
    score += difficultyDelta <= 0 ? 12 : -12;
  }

  return score;
}

function resolveCandidateShortages(
  pools: ExerciseCandidatePools,
  intent: WorkoutPlanIntent,
): ExerciseCandidateShortage[] {
  const requiredByPool: Partial<Record<keyof ExerciseCandidatePools, number>> = intent.intentType === "routine"
    ? { warmup: 1, training: 1, stretch: 1 }
    : { warmup: 1, training: Math.min(3, Math.max(1, intent.weeklyFrequency)), stretch: 1 };

  return Object.entries(requiredByPool).flatMap(([pool, required]) => {
    const key = pool as keyof ExerciseCandidatePools;
    const actual = pools[key].length;

    if (actual >= (required ?? 0)) {
      return [];
    }

    return [{
      pool: key,
      required: required ?? 0,
      actual,
      reasons: ["candidate_pool_below_required_minimum"],
    }];
  });
}

function resolveRequestedEquipment(equipment: string[]) {
  const requested = new Set<string>();
  const normalizedText = normalizeText(equipment.join(" "));

  if (!normalizedText) {
    return requested;
  }

  if (
    /(无器械|无器材|徒手|自重|居家|家里|家中|none|noequipment|bodyweight|withoutequipment)/.test(
      normalizedText,
    )
  ) {
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

function resolveTargetMuscles(intent: WorkoutPlanIntent) {
  const muscles = new Set<string>();
  const text = normalizeText([intent.goal, ...intent.preferences].join(" "));

  if (/(胸|胸肌|胸部|上胸|下胸|pector|chest)/.test(text)) {
    muscles.add("胸部");
  }

  if (/(背|背部|背阔|中背|lat|back)/.test(text)) {
    muscles.add("背阔肌");
    muscles.add("中背部");
    muscles.add("下背部");
  }

  if (/(肩|肩部|三角肌|shoulder|deltoid)/.test(text)) {
    muscles.add("肩部");
  }

  if (/(腿|下肢|大腿|股四头|腘绳|臀|quad|hamstring|glute|leg)/.test(text)) {
    muscles.add("股四头肌");
    muscles.add("腘绳肌");
    muscles.add("臀部");
  }

  if (/(核心|腹|腹肌|core|abs)/.test(text)) {
    muscles.add("腹肌");
  }

  if (/(手臂|肱二头|二头|肱三头|三头|臂|biceps|triceps|arm)/.test(text)) {
    muscles.add("肱二头肌");
    muscles.add("肱三头肌");
  }

  return muscles;
}

function matchesRequestedEquipment(exercise: Exercise, requestedEquipment: Set<string>) {
  if (requestedEquipment.size === 0) {
    return true;
  }

  if (!exercise.equipmentZh) {
    return requestedEquipment.has("自重") && isBodyweightLikeExercise(exercise);
  }

  if (requestedEquipment.has(exercise.equipmentZh)) {
    return true;
  }

  if (requestedEquipment.has("自重") && genericLowEquipment.has(exercise.equipmentZh)) {
    return true;
  }

  return false;
}

function matchesTargetMuscles(exercise: Exercise, targetMuscles: Set<string>) {
  if (targetMuscles.size === 0) {
    return true;
  }

  return [...exercise.primaryMusclesZh, ...exercise.secondaryMusclesZh].some((muscle) =>
    targetMuscles.has(muscle),
  );
}

function isBodyweightLikeExercise(exercise: Exercise) {
  const text = normalizeText(
    [
      exercise.id,
      exercise.nameEn,
      exercise.nameZh,
      exercise.equipment,
      exercise.equipmentZh,
      ...exercise.goalTags,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return (
    exercise.goalTags.includes("home_friendly") ||
    /(bodyweight|pushup|push-up|pullup|pull-up|chinup|chin-up|dip|plank|crunch|situp|sit-up|俯卧撑|引体向上|臂屈伸|平板支撑|卷腹|仰卧起坐)/.test(
      text,
    )
  );
}

function matchesPreference(exercise: Exercise, preferences: string[]) {
  return preferences.some((preference) => matchesFreeText(exercise, preference));
}

function matchesAvoidance(exercise: Exercise, avoidances: string[]) {
  return avoidances.some((avoidance) => matchesFreeText(exercise, avoidance));
}

function matchesRiskLimit(exercise: Exercise, injuryLimitations: string[]) {
  if (injuryLimitations.length === 0) {
    return false;
  }

  const metadata = normalizeExerciseMetadata(exercise);
  const riskText = normalizeText([
    ...metadata.riskTags,
    ...metadata.contraindications,
  ].join(" "));

  return injuryLimitations.some((limitation) => {
    const normalized = normalizeText(limitation);

    return (
      riskText.includes(normalized) ||
      (/膝|knee/.test(normalized) && riskText.includes("kneepain")) ||
      (/肩|shoulder/.test(normalized) && riskText.includes("shoulderpain")) ||
      (/腰|下背|back/.test(normalized) && riskText.includes("lowbackpain"))
    );
  });
}

function matchesOriginalEquipment(original: Exercise, replacement: Exercise) {
  const originalEquipment = original.equipmentZh ?? original.equipment;
  const replacementEquipment = replacement.equipmentZh ?? replacement.equipment;

  if (!originalEquipment || originalEquipment === "其他") {
    return true;
  }

  return originalEquipment === replacementEquipment;
}

function sharesPrimaryMuscle(left: Exercise, right: Exercise) {
  const rightMuscles = new Set([...right.primaryMuscles, ...right.primaryMusclesZh]);

  return [...left.primaryMuscles, ...left.primaryMusclesZh].some((muscle) => rightMuscles.has(muscle));
}

function hasOverlappingSections(left: Exercise, right: Exercise) {
  const rightSections = new Set(normalizeExerciseMetadata(right).allowedSections);

  return normalizeExerciseMetadata(left).allowedSections.some((section) => rightSections.has(section));
}

function difficultyRank(difficulty?: string | null) {
  const rank: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 3,
  };

  return rank[difficulty ?? ""] ?? 2;
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
