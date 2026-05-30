import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyWorkoutPatch } from "@/lib/server/workout-patches/workout-patch-engine";
import type { WorkoutPatch, WorkoutPatchOperation } from "@/lib/shared/workout-patches/schema";

import { createExercise, createWorkoutRoutineDraft } from "./fixtures/domain";

const prismaMock = vi.hoisted(() => ({
  artifactIndex: {
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  conversationArtifact: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const exercises = [
  createExercise({ id: "push-up", nameZh: "俯卧撑", level: "beginner", equipmentZh: "自重" }),
  createExercise({ id: "wall-push-up", nameZh: "墙壁俯卧撑", level: "beginner", equipmentZh: "自重" }),
  createExercise({ id: "plank", nameZh: "平板支撑", level: "intermediate", equipmentZh: "自重" }),
  createExercise({ id: "warmup", nameZh: "肩部动态热身", categoryZh: "热身", goalTags: ["warmup"] }),
  createExercise({ id: "stretch", nameZh: "胸肩拉伸", categoryZh: "拉伸", goalTags: ["stretch"] }),
  createExercise({ id: "barbell-bench", nameZh: "杠铃卧推", level: "intermediate", equipmentZh: "杠铃" }),
];

describe("workout patch engine", () => {
  beforeEach(() => {
    for (const model of Object.values(prismaMock)) {
      if (typeof model === "function") {
        model.mockReset();
        continue;
      }

      for (const method of Object.values(model)) {
        method.mockReset();
      }
    }

    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.conversationArtifact.create.mockResolvedValue({
      id: "artifact-new",
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "assistant-1",
      kind: "routine",
      revision: 2,
    });
  });

  it("replaces a single exercise and preserves unnamed draft fields", async () => {
    const draft = createWorkoutRoutineDraft();
    mockReadableSourceArtifact(draft);
    const patch = createReplacePatch();

    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: patch,
      responseMessageId: "assistant-1",
      client: prismaMock as never,
      exercises,
    });

    expect(result.status).toBe("applied");
    expect(result.payload).toMatchObject({
      kind: "routine",
      trainingLoopRounds: draft.trainingLoopRounds,
      trainingLoopRestSeconds: draft.trainingLoopRestSeconds,
      sections: [
        expect.objectContaining({
          section: "warmup",
          items: [expect.objectContaining({ exerciseId: "warmup" })],
        }),
        expect.objectContaining({
          section: "training",
          items: [
            expect.objectContaining({
              exerciseId: "wall-push-up",
              sets: 3,
              target: 12,
              setRestSeconds: 45,
              transitionRestSeconds: 30,
            }),
          ],
        }),
        expect.objectContaining({
          section: "stretch",
          items: [expect.objectContaining({ exerciseId: "stretch" })],
        }),
      ],
    });
    expect(result.diff[0]).toMatchObject({
      operation: "replace_exercise",
      originalExerciseId: "push-up",
      replacementExerciseId: "wall-push-up",
      preservedFields: ["section", "order", "sets", "target", "duration", "rest"],
    });
    expect(prismaMock.conversationArtifact.update).toHaveBeenCalledWith({
      where: { id: "artifact-routine" },
      data: { status: "superseded" },
    });
    expect(prismaMock.conversationArtifact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        messageId: "assistant-1",
        revision: 2,
        revisionOfArtifactId: "artifact-routine",
      }),
    }));
  });

  it("returns ambiguous when the same exercise appears multiple times without occurrenceIndex", async () => {
    const draft = createWorkoutRoutineDraft({
      sections: [
        createWorkoutRoutineDraft().sections[0],
        {
          section: "training",
          title: "主训练",
          items: [
            createWorkoutRoutineDraft().sections[1].items[0],
            createWorkoutRoutineDraft().sections[1].items[0],
          ],
        },
        createWorkoutRoutineDraft().sections[2],
      ],
    });
    mockReadableSourceArtifact(draft);

    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: createReplacePatch(),
      client: prismaMock as never,
      exercises,
    });

    expect(result.status).toBe("ambiguous");
    expect(result.failureReasons).toContain("target_occurrence_ambiguous");
    expect(prismaMock.conversationArtifact.create).not.toHaveBeenCalled();
  });

  it("rejects replacementExerciseId outside the server candidate set", async () => {
    mockReadableSourceArtifact(createWorkoutRoutineDraft());

    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: createReplacePatch({ replacementExerciseId: "barbell-bench" }),
      client: prismaMock as never,
      exercises,
    });

    expect(result.status).toBe("validation_failed");
    expect(result.failureReasons).toEqual(expect.arrayContaining([
      "replacement_outside_candidate_set",
      "replacement_equipment_mismatch",
      "replacement_difficulty_too_high",
    ]));
    expect(prismaMock.conversationArtifact.create).not.toHaveBeenCalled();
  });

  it("blocks non artifact-only scopes before touching history", async () => {
    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: {
        ...createReplacePatch(),
        scope: "completed_history",
      },
      client: prismaMock as never,
      exercises,
    });

    expect(result.status).toBe("blocked");
    expect(result.failureReasons).toContain("non_artifact_scope_requires_confirmation");
    expect(prismaMock.conversationArtifact.findFirst).not.toHaveBeenCalled();
  });

  it("adjusts load only inside the located target", async () => {
    const draft = createWorkoutRoutineDraft();
    mockReadableSourceArtifact(draft);
    const patch: WorkoutPatch = {
      scope: "artifact_only",
      target: { artifactId: "artifact-routine", artifactKind: "routine" },
      reason: "俯卧撑太难，降低一点",
      operations: [
        {
          operation: "adjust_load",
          target: {
            artifactId: "artifact-routine",
            artifactKind: "routine",
            section: "training",
            exerciseId: "push-up",
          },
          direction: "easier",
          preserve: {
            section: true,
            order: true,
            rest: true,
          },
          reason: "俯卧撑太难，降低一点",
        },
      ],
    };

    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: patch,
      responseMessageId: "assistant-1",
      client: prismaMock as never,
      exercises,
    });

    expect(result.status).toBe("applied");
    expect(result.payload).toMatchObject({
      sections: [
        expect.anything(),
        expect.objectContaining({
          items: [
            expect.objectContaining({
              exerciseId: "push-up",
              sets: 2,
              target: 9,
            }),
          ],
        }),
        expect.anything(),
      ],
    });
    expect(result.diff[0]).toMatchObject({
      operation: "adjust_load",
      changedFields: ["target", "sets"],
    });
  });
});

function mockReadableSourceArtifact(payload: ReturnType<typeof createWorkoutRoutineDraft>) {
  prismaMock.conversationArtifact.findFirst
    .mockResolvedValueOnce({
      id: "artifact-routine",
      kind: "routine",
      payloadSchemaVersion: 1,
      payload,
    })
    .mockResolvedValueOnce({
      id: "artifact-routine",
      userId: "user-1",
      sessionId: "chat-1",
      kind: "routine",
      scope: "chat",
      revision: 1,
      payloadSchemaVersion: 1,
      payload,
    });
}

function createReplacePatch(
  overrides: Partial<Extract<WorkoutPatchOperation, { operation: "replace_exercise" }>> = {},
): WorkoutPatch {
  return {
    scope: "artifact_only",
    target: {
      artifactId: "artifact-routine",
      artifactKind: "routine",
    },
    reason: "把俯卧撑换掉",
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
        reason: "把俯卧撑换掉",
        ...overrides,
      },
    ],
  };
}
