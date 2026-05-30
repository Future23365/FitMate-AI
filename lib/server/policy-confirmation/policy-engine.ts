import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import type {
  ConfirmationRequest,
  ConfirmationTokenPayload,
  ConfirmationValidationResult,
  PolicyCheckResult,
  PolicyOperationType,
  PolicyReason,
  PolicyReasonCode,
  PolicySafeScope,
} from "@/lib/shared/policy-confirmation/schema";
import {
  confirmationRequestSchema,
  confirmationTokenPayloadSchema,
  confirmationValidationResultSchema,
  policyCheckResultSchema,
} from "@/lib/shared/policy-confirmation/schema";
import type { UserMemoryInput } from "@/lib/shared/user-feedback-memory/schema";
import type { WorkoutPatch } from "@/lib/shared/workout-patches/schema";

type ArtifactPolicyInput = {
  userId: string;
  artifact: {
    id: string;
    userId: string;
    status: "active" | "superseded" | "archived";
    revision: number;
  };
  expectedRevision?: number;
};

type RoutinePolicyInput = {
  userId: string;
  routine: {
    id: string;
    userId: string;
    status: "active" | "archived";
  };
  overwriteSavedRoutine?: boolean;
};

type SchedulePolicyInput = {
  userId: string;
  schedules: Array<{
    id: string;
    userId: string;
    status: "planned" | "completed" | "missed" | "cancelled" | "rest";
    scheduledFor: Date;
    hasResult?: boolean;
  }>;
  now?: Date;
  allowBulk?: boolean;
};

type WorkoutPatchPolicyInput = {
  userId: string;
  patch: WorkoutPatch;
  targetIds?: string[];
};

type PlanChangePolicyInput = {
  weeklyFrequencyChanged?: boolean;
  calendarReordered?: boolean;
  largeIntensityChange?: boolean;
  deletedExerciseCount?: number;
};

type ConfirmationInput = {
  userId: string;
  targetIds: string[];
  scope: PolicySafeScope;
  operationType: PolicyOperationType;
  diffSummary: string;
  policy: PolicyCheckResult;
  now?: Date;
  ttlSeconds?: number;
  secret?: string;
};

type ConfirmationValidationInput = {
  token: string;
  expected: {
    userId: string;
    targetIds: string[];
    scope: PolicySafeScope;
    operationType: PolicyOperationType;
    diffSummary: string;
  };
  now?: Date;
  secret?: string;
};

const defaultConfirmationTtlSeconds = 10 * 60;

// PolicyEngine 统一表达写操作是否允许、是否需要确认，以及可安全执行的最窄 scope。
export function evaluateArtifactPolicy(input: ArtifactPolicyInput): PolicyCheckResult {
  const blockedReasons: PolicyReason[] = [];
  const reasons: PolicyReason[] = [];

  if (input.artifact.userId !== input.userId) {
    blockedReasons.push(reason("artifact_not_owned_by_user", "目标 artifact 不属于当前用户。", "blocked"));
  }

  if (input.artifact.status !== "active") {
    blockedReasons.push(reason("artifact_not_active", "只能修改 active 状态的 artifact。", "blocked"));
  }

  if (input.expectedRevision !== undefined && input.artifact.revision !== input.expectedRevision) {
    blockedReasons.push(reason("artifact_revision_conflict", "目标 artifact revision 已变化，需要重新读取后再修改。", "blocked"));
  }

  if (blockedReasons.length === 0) {
    reasons.push(reason("artifact_allowed_for_revision", "当前聊天 artifact 可通过新 revision 修改。"));
  }

  return normalizePolicyResult({
    allowed: blockedReasons.length === 0,
    requiresConfirmation: false,
    safeScope: "new_revision",
    reasons,
    blockedReasons,
  });
}

// Routine Policy 保护已保存训练编排，默认倾向创建新 revision 而不是静默覆盖。
export function evaluateRoutinePolicy(input: RoutinePolicyInput): PolicyCheckResult {
  const blockedReasons: PolicyReason[] = [];
  const reasons: PolicyReason[] = [];

  if (input.routine.userId !== input.userId) {
    blockedReasons.push(reason("artifact_not_owned_by_user", "目标 routine 不属于当前用户。", "blocked"));
  }

  if (input.routine.status !== "active") {
    blockedReasons.push(reason("artifact_not_active", "只能修改 active 状态的 routine。", "blocked"));
  }

  if (input.overwriteSavedRoutine) {
    reasons.push(reason("saved_routine_requires_confirmation", "覆盖已保存 routine 需要用户确认。", "confirmation"));
  }

  return normalizePolicyResult({
    allowed: blockedReasons.length === 0 && !input.overwriteSavedRoutine,
    requiresConfirmation: blockedReasons.length === 0 && Boolean(input.overwriteSavedRoutine),
    safeScope: input.overwriteSavedRoutine ? "new_revision" : "saved_routine",
    reasons,
    blockedReasons,
  });
}

// Schedule Policy 防止 AI 静默改写已完成历史，并对多个未来训练日要求确认。
export function evaluateSchedulePolicy(input: SchedulePolicyInput): PolicyCheckResult {
  const now = input.now ?? new Date();
  const blockedReasons: PolicyReason[] = [];
  const reasons: PolicyReason[] = [];
  const futureSchedules = input.schedules.filter((schedule) => schedule.scheduledFor.getTime() >= startOfDay(now).getTime());

  for (const schedule of input.schedules) {
    if (schedule.userId !== input.userId) {
      blockedReasons.push(reason("artifact_not_owned_by_user", `Schedule ${schedule.id} 不属于当前用户。`, "blocked"));
    }

    if (schedule.status === "completed") {
      blockedReasons.push(reason("completed_history_blocked", `Schedule ${schedule.id} 已完成，不能静默修改历史。`, "blocked"));
    }

    if (schedule.hasResult) {
      blockedReasons.push(reason("session_result_blocked", `Schedule ${schedule.id} 已有关联训练结果，不能静默修改。`, "blocked"));
    }
  }

  if (blockedReasons.length === 0 && futureSchedules.length > 1 && !input.allowBulk) {
    reasons.push(reason("bulk_future_schedule_requires_confirmation", "批量修改多个未来训练日需要用户确认。", "confirmation"));
  } else if (blockedReasons.length === 0 && futureSchedules.length === 1) {
    reasons.push(reason("future_schedule_requires_confirmation", "修改未来训练安排需要用户确认。", "confirmation"));
  }

  return normalizePolicyResult({
    allowed: blockedReasons.length === 0 && reasons.every((item) => item.severity !== "confirmation"),
    requiresConfirmation: blockedReasons.length === 0 && reasons.some((item) => item.severity === "confirmation"),
    safeScope: input.schedules.some((schedule) => schedule.status === "completed" || schedule.hasResult)
      ? "completed_history"
      : "future_schedule",
    reasons,
    blockedReasons,
  });
}

// 用户记忆策略把长期限制和健康/不适信号放入确认流，避免模型直接沉淀敏感偏好。
export function evaluateUserMemoryPolicy(memories: UserMemoryInput[]): PolicyCheckResult {
  const reasons: PolicyReason[] = [];

  for (const memory of memories) {
    if (memory.kind === "injury_or_pain_signal") {
      reasons.push(reason("health_signal_requires_confirmation", "健康或不适信号写入长期记忆前需要确认。", "confirmation"));
    } else if (memory.requiresConfirmation || memory.status === "pending_confirmation") {
      reasons.push(reason("long_term_memory_requires_confirmation", "长期偏好或限制写入前需要确认。", "confirmation"));
    }
  }

  return normalizePolicyResult({
    allowed: reasons.length === 0,
    requiresConfirmation: reasons.length > 0,
    safeScope: "user_memory",
    reasons: uniqueReasons(reasons),
    blockedReasons: [],
  });
}

// WorkoutPatch Policy 是 PatchEngine 的入口级门禁，只允许草稿 revision 直接写入，高影响 scope 先确认。
export function evaluateWorkoutPatchPolicy(input: WorkoutPatchPolicyInput): PolicyCheckResult {
  const reasons: PolicyReason[] = [];
  const blockedReasons: PolicyReason[] = [];
  const operationTypes = input.patch.operations.map((operation) => operation.operation);

  if (input.patch.scope === "completed_history") {
    blockedReasons.push(reason("completed_history_blocked", "已完成训练历史不会被 AI 或 Patch 静默修改。", "blocked"));
  }

  if (input.patch.scope === "saved_routine") {
    reasons.push(reason("saved_routine_requires_confirmation", "覆盖已保存 routine 需要用户确认。", "confirmation"));
  }

  if (input.patch.scope === "future_schedule") {
    const targetCount = input.targetIds?.length ?? 1;
    reasons.push(
      targetCount > 1
        ? reason("bulk_future_schedule_requires_confirmation", "批量修改多个未来训练日需要用户确认。", "confirmation")
        : reason("future_schedule_requires_confirmation", "修改未来训练安排需要用户确认。", "confirmation"),
    );
  }

  if (operationTypes.filter((operation) => operation === "remove_exercise").length > 1) {
    reasons.push(reason("multi_delete_requires_confirmation", "一次删除多个动作需要用户确认。", "confirmation"));
  }

  if (input.patch.scope === "artifact_only" && reasons.length === 0 && blockedReasons.length === 0) {
    reasons.push(reason("scope_narrowed_to_artifact", "未明确要求持久化覆盖时，只修改当前聊天 artifact revision。"));
  }

  return normalizePolicyResult({
    allowed: blockedReasons.length === 0 && reasons.every((item) => item.severity !== "confirmation"),
    requiresConfirmation: blockedReasons.length === 0 && reasons.some((item) => item.severity === "confirmation"),
    safeScope: getPatchSafeScope(input.patch.scope),
    reasons,
    blockedReasons,
  });
}

// PlanChange Policy 覆盖长期计划结构性变更，避免频率、日历和强度被一次性静默重排。
export function evaluatePlanChangePolicy(input: PlanChangePolicyInput): PolicyCheckResult {
  const reasons: PolicyReason[] = [];

  if (input.weeklyFrequencyChanged) {
    reasons.push(reason("weekly_frequency_requires_confirmation", "改变周训练频率需要用户确认。", "confirmation"));
  }

  if (input.calendarReordered) {
    reasons.push(reason("calendar_reorder_requires_confirmation", "重排训练日历需要用户确认。", "confirmation"));
  }

  if (input.largeIntensityChange) {
    reasons.push(reason("large_intensity_change_requires_confirmation", "大幅调整训练强度需要用户确认。", "confirmation"));
  }

  if ((input.deletedExerciseCount ?? 0) > 1) {
    reasons.push(reason("multi_delete_requires_confirmation", "一次删除多个动作需要用户确认。", "confirmation"));
  }

  return normalizePolicyResult({
    allowed: reasons.length === 0,
    requiresConfirmation: reasons.length > 0,
    safeScope: "future_schedule",
    reasons,
    blockedReasons: [],
  });
}

// ConfirmationGate 生成短期签名 token，确保用户确认的是同一个目标、scope 和 diff。
export function createConfirmationRequest(input: ConfirmationInput): ConfirmationRequest {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlSeconds ?? defaultConfirmationTtlSeconds) * 1000);
  const payload = confirmationTokenPayloadSchema.parse({
    version: 1,
    userId: input.userId,
    targetIds: normalizeTargetIds(input.targetIds),
    scope: input.scope,
    operationType: input.operationType,
    diffSummary: input.diffSummary,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce: randomBytes(18).toString("base64url"),
  });
  const request = {
    token: signConfirmationPayload(payload, input.secret),
    question: buildConfirmationQuestion(input.operationType, input.scope),
    targetIds: payload.targetIds,
    impactSummary: buildImpactSummary(payload.targetIds.length, input.scope),
    diffSummary: input.diffSummary,
    expiresAt: payload.expiresAt,
    reasons: input.policy.reasons.filter((item) => item.severity === "confirmation"),
  };

  return confirmationRequestSchema.parse(request);
}

export function validateConfirmationToken(input: ConfirmationValidationInput): ConfirmationValidationResult {
  const parsed = parseSignedConfirmationToken(input.token, input.secret);

  if (!parsed.ok) {
    return confirmationValidationResultSchema.parse(parsed);
  }

  const now = input.now ?? new Date();
  const payload = parsed.payload;

  if (new Date(payload.expiresAt).getTime() <= now.getTime()) {
    return invalid("token_expired", "确认已过期，需要重新确认。");
  }

  if (payload.userId !== input.expected.userId) {
    return invalid("token_user_mismatch", "确认 token 与当前用户不匹配。");
  }

  if (payload.scope !== input.expected.scope) {
    return invalid("token_scope_mismatch", "确认 token 的 scope 与本次操作不匹配。");
  }

  if (payload.operationType !== input.expected.operationType) {
    return invalid("token_operation_mismatch", "确认 token 的操作类型与本次操作不匹配。");
  }

  if (!sameStringSet(payload.targetIds, input.expected.targetIds)) {
    return invalid("token_target_mismatch", "确认 token 的目标对象与本次操作不匹配。");
  }

  if (payload.diffSummary !== input.expected.diffSummary) {
    return invalid("token_diff_mismatch", "确认 token 的 diff 摘要与本次操作不匹配。");
  }

  return confirmationValidationResultSchema.parse({ ok: true, payload });
}

export function getWorkoutPatchOperationType(patch: WorkoutPatch): PolicyOperationType {
  if (patch.scope === "future_schedule") {
    return "bulk_update_future_schedule";
  }

  if (patch.scope === "saved_routine") {
    return "create_routine_revision";
  }

  if (patch.scope === "completed_history") {
    return "update_completed_schedule";
  }

  return "patch_artifact";
}

export function summarizeWorkoutPatchDiffIntent(patch: WorkoutPatch) {
  return [
    `scope=${patch.scope}`,
    `target=${patch.target.artifactKind}:${patch.target.artifactId}`,
    `operations=${patch.operations.map((operation) => operation.operation).join(",")}`,
    `reason=${patch.reason}`,
  ].join("; ");
}

function signConfirmationPayload(payload: ConfirmationTokenPayload, secret?: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getConfirmationSecret(secret)).update(encodedPayload).digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function parseSignedConfirmationToken(token: string, secret?: string): ConfirmationValidationResult {
  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra !== undefined) {
    return invalid("token_malformed", "确认 token 格式不正确。");
  }

  const expectedSignature = createHmac("sha256", getConfirmationSecret(secret)).update(encodedPayload).digest("base64url");
  if (!safeEquals(signature, expectedSignature)) {
    return invalid("token_signature_invalid", "确认 token 签名无效。");
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const parsedPayload = confirmationTokenPayloadSchema.parse(payload);

    return confirmationValidationResultSchema.parse({ ok: true, payload: parsedPayload });
  } catch {
    return invalid("token_malformed", "确认 token payload 无法解析。");
  }
}

function getConfirmationSecret(secret?: string) {
  return secret ?? process.env.CONFIRMATION_TOKEN_SECRET ?? "development-confirmation-secret";
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizePolicyResult(result: PolicyCheckResult) {
  return policyCheckResultSchema.parse({
    ...result,
    reasons: uniqueReasons(result.reasons),
    blockedReasons: uniqueReasons(result.blockedReasons),
  });
}

function uniqueReasons(reasons: PolicyReason[]) {
  const seen = new Set<PolicyReasonCode>();

  return reasons.filter((item) => {
    if (seen.has(item.code)) {
      return false;
    }

    seen.add(item.code);
    return true;
  });
}

function reason(code: PolicyReasonCode, message: string, severity: PolicyReason["severity"] = "info"): PolicyReason {
  return { code, message, severity };
}

function invalid(code: Exclude<ConfirmationValidationResult, { ok: true }>["code"], message: string): ConfirmationValidationResult {
  return confirmationValidationResultSchema.parse({ ok: false, code, message });
}

function normalizeTargetIds(targetIds: string[]) {
  return Array.from(new Set(targetIds.map((id) => id.trim()).filter(Boolean))).sort();
}

function sameStringSet(left: string[], right: string[]) {
  const normalizedLeft = normalizeTargetIds(left);
  const normalizedRight = normalizeTargetIds(right);

  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);

  return next;
}

function buildConfirmationQuestion(operationType: PolicyOperationType, scope: PolicySafeScope) {
  if (operationType === "write_user_memory") {
    return "要把这条长期偏好或健康限制保存到你的记忆里吗？";
  }

  if (scope === "future_schedule") {
    return "要把这些修改应用到未来训练安排吗？";
  }

  if (operationType === "create_routine_revision") {
    return "要基于已保存训练创建一个新的修改版本吗？";
  }

  if (scope === "saved_routine" || operationType === "overwrite_routine") {
    return "要覆盖已保存的训练编排吗？";
  }

  return "要确认执行这次高影响修改吗？";
}

function buildImpactSummary(targetCount: number, scope: PolicySafeScope) {
  if (scope === "future_schedule") {
    return `将影响 ${targetCount} 个未来训练安排。`;
  }

  if (scope === "saved_routine") {
    return `将影响 ${targetCount} 个已保存训练编排。`;
  }

  return `将影响 ${targetCount} 个目标对象。`;
}

function getPatchSafeScope(scope: WorkoutPatch["scope"]): PolicySafeScope {
  if (scope === "saved_routine") {
    return "new_revision";
  }

  return scope;
}
