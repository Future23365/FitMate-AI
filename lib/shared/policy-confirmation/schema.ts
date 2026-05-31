import { z } from "zod";

import { utcDateTimeStringSchema } from "@/lib/shared/time/utc-date-time";

export const policySafeScopeSchema = z.enum([
  "artifact_only",
  "new_revision",
  "saved_routine",
  "future_schedule",
  "completed_history",
  "user_memory",
]);

export const policyOperationTypeSchema = z.enum([
  "patch_artifact",
  "overwrite_routine",
  "create_routine_revision",
  "bulk_update_future_schedule",
  "update_future_schedule",
  "update_completed_schedule",
  "write_user_memory",
  "change_weekly_frequency",
  "reschedule_calendar",
  "adjust_intensity",
  "delete_exercises",
]);

export const policyReasonCodeSchema = z.enum([
  "artifact_allowed_for_revision",
  "artifact_not_owned_by_user",
  "artifact_not_active",
  "artifact_revision_conflict",
  "saved_routine_requires_confirmation",
  "future_schedule_requires_confirmation",
  "bulk_future_schedule_requires_confirmation",
  "completed_history_blocked",
  "session_result_blocked",
  "long_term_memory_requires_confirmation",
  "weekly_frequency_requires_confirmation",
  "calendar_reorder_requires_confirmation",
  "large_intensity_change_requires_confirmation",
  "multi_delete_requires_confirmation",
  "scope_narrowed_to_artifact",
]);

export const policyReasonSchema = z.object({
  code: policyReasonCodeSchema,
  message: z.string().trim().min(1).max(300),
  severity: z.enum(["info", "confirmation", "blocked"]).default("info"),
});

export const policyCheckResultSchema = z.object({
  allowed: z.boolean(),
  requiresConfirmation: z.boolean().default(false),
  safeScope: policySafeScopeSchema,
  reasons: z.array(policyReasonSchema).default([]),
  blockedReasons: z.array(policyReasonSchema).default([]),
});

export const confirmationTokenPayloadSchema = z.object({
  version: z.literal(1),
  userId: z.string().trim().min(1),
  targetIds: z.array(z.string().trim().min(1)).min(1).max(80),
  scope: policySafeScopeSchema,
  operationType: policyOperationTypeSchema,
  diffSummary: z.string().trim().min(1).max(1000),
  issuedAt: utcDateTimeStringSchema,
  expiresAt: utcDateTimeStringSchema,
  nonce: z.string().trim().min(12).max(120),
});

export const confirmationRequestSchema = z.object({
  token: z.string().trim().min(1),
  question: z.string().trim().min(1).max(500),
  targetIds: z.array(z.string().trim().min(1)).min(1).max(80),
  impactSummary: z.string().trim().min(1).max(500),
  diffSummary: z.string().trim().min(1).max(1000),
  expiresAt: utcDateTimeStringSchema,
  reasons: z.array(policyReasonSchema).default([]),
});

export const confirmationValidationResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    payload: confirmationTokenPayloadSchema,
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum([
      "token_malformed",
      "token_signature_invalid",
      "token_expired",
      "token_user_mismatch",
      "token_scope_mismatch",
      "token_target_mismatch",
      "token_operation_mismatch",
      "token_diff_mismatch",
    ]),
    message: z.string().trim().min(1),
  }),
]);

export const workoutPatchConfirmationMetadataSchema = z.object({
  request: confirmationRequestSchema.optional(),
  validation: confirmationValidationResultSchema.optional(),
});

export type PolicySafeScope = z.infer<typeof policySafeScopeSchema>;
export type PolicyOperationType = z.infer<typeof policyOperationTypeSchema>;
export type PolicyReasonCode = z.infer<typeof policyReasonCodeSchema>;
export type PolicyReason = z.infer<typeof policyReasonSchema>;
export type PolicyCheckResult = z.infer<typeof policyCheckResultSchema>;
export type ConfirmationTokenPayload = z.infer<typeof confirmationTokenPayloadSchema>;
export type ConfirmationRequest = z.infer<typeof confirmationRequestSchema>;
export type ConfirmationValidationResult = z.infer<typeof confirmationValidationResultSchema>;
export type WorkoutPatchConfirmationMetadata = z.infer<typeof workoutPatchConfirmationMetadataSchema>;
