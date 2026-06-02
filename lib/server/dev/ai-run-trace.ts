import "server-only";

import type { AiRunFinalDecision } from "@/lib/server/dev/ai-trace-store";
import type { RecentArtifactSummary } from "@/lib/server/conversation-artifacts/artifact-service";
import type { ConfirmationRequest, ConfirmationValidationResult, PolicyCheckResult } from "@/lib/shared/policy-confirmation/schema";
import type { WorkoutPatch, WorkoutPatchResult } from "@/lib/shared/workout-patches/schema";

export const aiRunTraceModel = "deepseek-v4-flash";
export const aiRunTracePromptVersion = "2026-05-30.chat-trace-v1";
export const aiRunTraceToolVersions = {
  ReferenceResolver: "2026-05-30.reference-resolver-v1",
  searchArtifacts: "2026-05-30.artifact-search-v1",
  getArtifactPayload: "2026-05-30.artifact-payload-v1",
  getExerciseById: "2026-05-31.readonly-exercise-by-id-v1",
  searchExercises: "2026-05-31.readonly-search-exercises-v1",
  WorkoutPatchEngine: "2026-05-30.workout-patch-v1",
  PolicyEngine: "2026-05-30.policy-engine-v1",
  ConfirmationGate: "2026-05-30.confirmation-gate-v1",
  RecommendationDedup: "2026-05-30.recommendation-dedup-v1",
  ValidationService: "2026-05-30.workout-validation-v1",
  ResponseWriter: "2026-05-30.response-writer-v1",
};

// Trace 摘要只保留可定位链路的 id、状态和短文本，避免把完整训练 payload 推进调试存储。
export function summarizeRecentArtifactsForTrace(summaries: RecentArtifactSummary[]) {
  return summaries.map((summary) => ({
    artifactId: summary.artifactId,
    kind: summary.kind,
    title: summary.title,
    summary: summary.summary,
    exerciseIds: summary.exerciseIds.slice(0, 12),
    goals: summary.goals.slice(0, 6),
    muscles: summary.muscles.slice(0, 8),
    equipment: summary.equipment.slice(0, 8),
    sessionMinutes: summary.sessionMinutes,
    weeklyFrequency: summary.weeklyFrequency,
    trainingDayCount: summary.trainingDayCount,
    updatedAt: summary.updatedAt,
  }));
}

// Patch trace 只暴露 scope、operation、目标和 diff 摘要，完整 payload 交给 Raw JSON 的截断层处理。
export function summarizeWorkoutPatchForTrace(patch: WorkoutPatch) {
  return {
    scope: patch.scope,
    target: patch.target,
    operations: patch.operations.map((operation) => ({
      operation: operation.operation,
      target: operation.target,
      reason: operation.reason,
      replacementExerciseId:
        "replacementExerciseId" in operation ? operation.replacementExerciseId : undefined,
      direction: "direction" in operation ? operation.direction : undefined,
    })),
    reason: patch.reason,
  };
}

export function summarizeWorkoutPatchResultForTrace(result: WorkoutPatchResult) {
  return {
    status: result.status,
    message: result.message,
    sourceArtifactId: result.sourceArtifactId,
    artifactId: result.artifactId,
    artifactKind: result.artifactKind,
    diff: result.diff,
    confirmation: result.confirmation
      ? summarizeConfirmationRequestForTrace(result.confirmation)
      : undefined,
    failureReasons: result.failureReasons,
    suggestedReplies: result.suggestedReplies,
    hasPayload: Boolean(result.payload),
  };
}

export function summarizePolicyCheckForTrace(result: PolicyCheckResult) {
  return {
    allowed: result.allowed,
    requiresConfirmation: result.requiresConfirmation,
    safeScope: result.safeScope,
    reasons: result.reasons.map((item) => ({
      code: item.code,
      severity: item.severity,
      message: item.message,
    })),
    blockedReasons: result.blockedReasons.map((item) => ({
      code: item.code,
      severity: item.severity,
      message: item.message,
    })),
  };
}

export function summarizeConfirmationRequestForTrace(request: ConfirmationRequest) {
  return {
    targetIds: request.targetIds,
    impactSummary: request.impactSummary,
    diffSummary: request.diffSummary,
    expiresAt: request.expiresAt,
    reasons: request.reasons.map((item) => ({ code: item.code, severity: item.severity })),
    hasToken: Boolean(request.token),
  };
}

export function summarizeConfirmationValidationForTrace(result: ConfirmationValidationResult) {
  if (result.ok) {
    return {
      ok: true,
      targetIds: result.payload.targetIds,
      scope: result.payload.scope,
      operationType: result.payload.operationType,
      expiresAt: result.payload.expiresAt,
    };
  }

  return {
    ok: false,
    code: result.code,
    message: result.message,
  };
}

export function createFinalDecision(input: AiRunFinalDecision): AiRunFinalDecision {
  return input;
}
