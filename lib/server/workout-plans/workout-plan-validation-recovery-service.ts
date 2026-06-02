import type {
  WorkoutPlanValidationIssue,
  WorkoutPlanValidationIssueCode,
  WorkoutPlanValidationResult,
} from "./workout-plan-validation-service";

const recoverableIssueCodes = new Set<WorkoutPlanValidationIssueCode>([
  "candidate_query_boundary_mismatch",
  "result_requirement_unmet",
  "session_too_long",
  "session_too_short",
  "weekly_frequency_mismatch",
]);

// 确定性硬边界会阻止自动展示；训练合理性 warning 不参与恢复分类。
const hardBoundaryIssueCodes = new Set<WorkoutPlanValidationIssueCode>([
  "invalid_exercise_id",
  "outside_candidate_exercise_id",
  "empty_candidate_set",
  "missing_routine_section",
  "cycle_structure_mismatch",
]);

export type WorkoutPlanValidationRecovery = {
  recoverable: boolean;
  primaryIssueCode?: WorkoutPlanValidationIssueCode;
  guidanceMessage: string;
  suggestedReplies: string[];
};

// 将服务端校验问题压缩成前端和修复 prompt 都能使用的恢复策略。
export function classifyWorkoutPlanValidationFailure(
  validation: WorkoutPlanValidationResult,
  options: { targetSessionMinutes?: number } = {},
): WorkoutPlanValidationRecovery {
  const primaryIssue = validation.errors[0];
  const hasRecoverableIssue = validation.errors.some((issue) => recoverableIssueCodes.has(issue.code));
  const hasHardBoundaryIssue = validation.errors.some((issue) => hardBoundaryIssueCodes.has(issue.code));
  const recoverable = hasRecoverableIssue && !hasHardBoundaryIssue;

  return {
    recoverable,
    primaryIssueCode: primaryIssue?.code,
    guidanceMessage: buildGuidanceMessage(validation, primaryIssue, recoverable, options.targetSessionMinutes),
    suggestedReplies: buildSuggestedReplies(primaryIssue?.code, recoverable, options.targetSessionMinutes),
  };
}

export function isRecoverableWorkoutPlanIssue(code: WorkoutPlanValidationIssueCode) {
  return recoverableIssueCodes.has(code);
}

function buildGuidanceMessage(
  validation: WorkoutPlanValidationResult,
  primaryIssue: WorkoutPlanValidationIssue | undefined,
  recoverable: boolean,
  targetSessionMinutes?: number,
) {
  if (primaryIssue?.code === "session_too_long") {
    const estimate = validation.dayEstimates.find((item) => item.dayIndex === primaryIssue.dayIndex)
      ?? validation.dayEstimates[0];

    if (estimate) {
      const target = targetSessionMinutes ?? estimate.declaredEstimatedMinutes;

      return `这版训练估算约 ${estimate.estimatedMinutes} 分钟，超过你原本的 ${target} 分钟。你想压缩到 ${target} 分钟，还是保留完整训练量？`;
    }
  }

  if (primaryIssue?.code === "session_too_short") {
    const estimate = validation.dayEstimates.find((item) => item.dayIndex === primaryIssue.dayIndex)
      ?? validation.dayEstimates[0];

    if (estimate) {
      const target = targetSessionMinutes ?? estimate.declaredEstimatedMinutes;

      return `这版训练估算约 ${estimate.estimatedMinutes} 分钟，低于你原本的 ${target} 分钟。你想补足到 ${target} 分钟，还是保留轻量版本？`;
    }
  }

  if (primaryIssue?.code === "candidate_query_boundary_mismatch") {
    return "这版训练越过了上游动作查询边界，需要用合法结构化 filters 重新检索候选后再生成。";
  }

  if (primaryIssue?.code === "result_requirement_unmet") {
    return "上游候选集合没有满足本次训练生成的结果要求，需要带上 section 覆盖和候选数量要求重新查询。";
  }

  if (recoverable) {
    return "这版训练的时长、训练量或频率还需要调整。你可以选择压缩时长、减少动作数量或降低每个动作组数。";
  }

  return "这版训练没有通过动作范围或结构校验，暂时不能展示为可保存训练卡片。请补充目标、器械或训练时长后重新生成。";
}

function buildSuggestedReplies(
  primaryIssueCode: WorkoutPlanValidationIssueCode | undefined,
  recoverable: boolean,
  targetSessionMinutes?: number,
) {
  if (!recoverable) {
    return ["重新生成一版", "补充可用器械", "调整训练目标"];
  }

  if (primaryIssueCode === "candidate_query_boundary_mismatch" || primaryIssueCode === "result_requirement_unmet") {
    return ["按原约束重查候选", "补足热身和拉伸候选", "放宽候选数量要求", "改为先澄清"];
  }

  if (primaryIssueCode === "session_too_long") {
    const target = targetSessionMinutes ?? 30;

    return [`压缩到 ${target} 分钟`, "保留完整训练量", "减少动作数量", "降低每个动作组数"];
  }

  if (primaryIssueCode === "session_too_short") {
    const target = targetSessionMinutes ?? 30;

    return [`补足到 ${target} 分钟`, "增加主训练轮数", "增加每个动作组数", "增加一个主训练动作"];
  }

  return ["减少动作数量", "降低每个动作组数", "保留完整训练量"];
}
