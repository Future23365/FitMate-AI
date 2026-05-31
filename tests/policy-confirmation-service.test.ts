import { describe, expect, it } from "vitest";

import {
  createConfirmationRequest,
  evaluateArtifactPolicy,
  evaluatePlanChangePolicy,
  evaluateRoutinePolicy,
  evaluateSchedulePolicy,
  evaluateUserMemoryPolicy,
  evaluateWorkoutPatchPolicy,
  getWorkoutPatchOperationType,
  summarizeWorkoutPatchDiffIntent,
  validateConfirmationToken,
} from "@/lib/server/policy-confirmation/policy-engine";
import type { WorkoutPatch } from "@/lib/shared/workout-patches/schema";

describe("policy confirmation service", () => {
  it("allows current user active artifact edits through a new revision", () => {
    const result = evaluateArtifactPolicy({
      userId: "user-1",
      artifact: {
        id: "artifact-1",
        userId: "user-1",
        status: "active",
        revision: 3,
      },
      expectedRevision: 3,
    });

    expect(result).toMatchObject({
      allowed: true,
      requiresConfirmation: false,
      safeScope: "new_revision",
    });
  });

  it("blocks artifact ownership and revision mismatches", () => {
    const result = evaluateArtifactPolicy({
      userId: "user-1",
      artifact: {
        id: "artifact-1",
        userId: "user-2",
        status: "active",
        revision: 4,
      },
      expectedRevision: 3,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.map((item) => item.code)).toEqual(expect.arrayContaining([
      "artifact_not_owned_by_user",
      "artifact_revision_conflict",
    ]));
  });

  it("requires confirmation before overwriting a saved routine", () => {
    const result = evaluateRoutinePolicy({
      userId: "user-1",
      routine: {
        id: "routine-1",
        userId: "user-1",
        status: "active",
      },
      overwriteSavedRoutine: true,
    });

    expect(result).toMatchObject({
      allowed: false,
      requiresConfirmation: true,
      safeScope: "new_revision",
    });
    expect(result.reasons.map((item) => item.code)).toContain("saved_routine_requires_confirmation");
  });

  it("requires confirmation for multiple future schedules and blocks completed history", () => {
    const futureResult = evaluateSchedulePolicy({
      userId: "user-1",
      now: new Date("2026-05-30T08:00:00.000Z"),
      schedules: [
        {
          id: "schedule-1",
          userId: "user-1",
          status: "planned",
          scheduledFor: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          id: "schedule-2",
          userId: "user-1",
          status: "planned",
          scheduledFor: new Date("2026-06-03T00:00:00.000Z"),
        },
      ],
    });

    expect(futureResult.requiresConfirmation).toBe(true);
    expect(futureResult.reasons.map((item) => item.code)).toContain("bulk_future_schedule_requires_confirmation");

    const completedResult = evaluateSchedulePolicy({
      userId: "user-1",
      schedules: [
        {
          id: "schedule-3",
          userId: "user-1",
          status: "completed",
          scheduledFor: new Date("2026-05-29T00:00:00.000Z"),
          hasResult: true,
        },
      ],
    });

    expect(completedResult.allowed).toBe(false);
    expect(completedResult.blockedReasons.map((item) => item.code)).toEqual(expect.arrayContaining([
      "completed_history_blocked",
      "session_result_blocked",
    ]));
  });

  it("requires confirmation for long-term memory writes but not health signals", () => {
    const result = evaluateUserMemoryPolicy([
      {
        kind: "constraint",
        subjectType: "exercise",
        subjectId: "push-up",
        value: { rawText: "以后都不要安排俯卧撑" },
        source: "chat",
        requiresConfirmation: true,
        status: "pending_confirmation",
      },
      {
        kind: "injury_or_pain_signal",
        subjectType: "health",
        subjectLabel: "肩",
        value: { rawText: "肩膀不舒服" },
        source: "chat",
      },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.reasons.map((item) => item.code)).toEqual(["long_term_memory_requires_confirmation"]);
  });

  it("does not require confirmation for health signal memory alone", () => {
    const result = evaluateUserMemoryPolicy([
      {
        kind: "injury_or_pain_signal",
        subjectType: "health",
        subjectLabel: "肩",
        value: { rawText: "肩膀不舒服" },
        source: "chat",
      },
    ]);

    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("requires confirmation for weekly frequency, calendar, intensity, and multi-delete plan changes", () => {
    const result = evaluatePlanChangePolicy({
      weeklyFrequencyChanged: true,
      calendarReordered: true,
      largeIntensityChange: true,
      deletedExerciseCount: 2,
    });

    expect(result.requiresConfirmation).toBe(true);
    expect(result.reasons.map((item) => item.code)).toEqual(expect.arrayContaining([
      "weekly_frequency_requires_confirmation",
      "calendar_reorder_requires_confirmation",
      "large_intensity_change_requires_confirmation",
      "multi_delete_requires_confirmation",
    ]));
  });

  it("binds confirmation token to user, scope, targets, operation, diff, and expiry", () => {
    const patch = createSavedRoutinePatch();
    const policy = evaluateWorkoutPatchPolicy({
      userId: "user-1",
      patch,
      targetIds: [patch.target.artifactId],
    });
    const diffSummary = summarizeWorkoutPatchDiffIntent(patch);
    const operationType = getWorkoutPatchOperationType(patch);
    const request = createConfirmationRequest({
      userId: "user-1",
      targetIds: [patch.target.artifactId],
      scope: policy.safeScope,
      operationType,
      diffSummary,
      policy,
      now: new Date("2026-05-30T10:00:00.000Z"),
      ttlSeconds: 60,
      secret: "test-secret",
    });

    expect(request).toMatchObject({
      targetIds: ["artifact-routine"],
      diffSummary,
    });

    const valid = validateConfirmationToken({
      token: request.token,
      expected: {
        userId: "user-1",
        targetIds: [patch.target.artifactId],
        scope: policy.safeScope,
        operationType,
        diffSummary,
      },
      now: new Date("2026-05-30T10:00:30.000Z"),
      secret: "test-secret",
    });
    expect(valid.ok).toBe(true);

    const mismatch = validateConfirmationToken({
      token: request.token,
      expected: {
        userId: "user-1",
        targetIds: [patch.target.artifactId],
        scope: policy.safeScope,
        operationType,
        diffSummary: `${diffSummary}; changed`,
      },
      now: new Date("2026-05-30T10:00:30.000Z"),
      secret: "test-secret",
    });
    expect(mismatch).toMatchObject({ ok: false, code: "token_diff_mismatch" });

    const expired = validateConfirmationToken({
      token: request.token,
      expected: {
        userId: "user-1",
        targetIds: [patch.target.artifactId],
        scope: policy.safeScope,
        operationType,
        diffSummary,
      },
      now: new Date("2026-05-30T10:02:00.000Z"),
      secret: "test-secret",
    });
    expect(expired).toMatchObject({ ok: false, code: "token_expired" });
  });
});

function createSavedRoutinePatch(): WorkoutPatch {
  return {
    scope: "saved_routine",
    target: {
      artifactId: "artifact-routine",
      artifactKind: "routine",
    },
    operations: [
      {
        operation: "replace_exercise",
        target: {
          artifactId: "artifact-routine",
          artifactKind: "routine",
          section: "training",
          exerciseId: "push-up",
        },
        replacementExerciseId: "wall-push-up",
        preserve: {
          section: true,
          order: true,
          sets: true,
          target: true,
          duration: true,
          rest: true,
        },
        reason: "把俯卧撑换成更容易的版本",
      },
    ],
    reason: "把俯卧撑换成更容易的版本",
  };
}
