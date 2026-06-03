import "server-only";

import type { ConfirmationRequest, ConfirmationValidationResult, PolicyCheckResult } from "@/lib/shared/policy-confirmation/schema";
import type { WorkoutPatch, WorkoutPatchResult } from "@/lib/shared/workout-patches/schema";

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
