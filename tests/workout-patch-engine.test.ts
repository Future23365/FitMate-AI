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
  createExercise({
    id: "push-up",
    nameZh: "俯卧撑",
    level: "intermediate",
    difficulty: "intermediate",
    equipmentZh: "自重",
    substitutionGroupId: "push:chest",
    regressionExerciseIds: ["wall-push-up"],
  }),
  createExercise({
    id: "wall-push-up",
    nameZh: "墙壁俯卧撑",
    level: "beginner",
    difficulty: "beginner",
    equipmentZh: "自重",
    substitutionGroupId: "push:chest",
  }),
  createExercise({
    id: "plank",
    nameZh: "平板支撑",
    level: "intermediate",
    difficulty: "intermediate",
    equipmentZh: "自重",
    movementPattern: "core",
    substitutionGroupId: "core:abs",
  }),
  createExercise({
    id: "warmup",
    nameZh: "肩部动态热身",
    categoryZh: "热身",
    allowedSections: ["warmup"],
    intensityRole: "activation",
    movementPattern: "mobility",
    goalTags: ["warmup"],
  }),
  createExercise({
    id: "stretch",
    nameZh: "胸肩拉伸",
    categoryZh: "拉伸",
    allowedSections: ["stretch"],
    intensityRole: "recovery",
    movementPattern: "stretch",
    goalTags: ["stretch"],
  }),
  createExercise({
    id: "barbell-bench",
    nameZh: "杠铃卧推",
    level: "expert",
    difficulty: "advanced",
    equipmentZh: "杠铃",
    substitutionGroupId: "push:chest",
  }),
  createExercise({
    id: "Rope_Jumping",
    nameZh: "跳绳",
    categoryZh: "力量",
    level: "intermediate",
    difficulty: "intermediate",
    equipmentZh: "自重",
    substitutionGroupId: "push:chest",
    regressionExerciseIds: ["wall-push-up"],
    primaryMusclesZh: ["胸部"],
    goalTags: ["strength"],
  }),
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
    const trace = createTraceMock();
    mockReadableSourceArtifact(draft);
    const patch = createReplacePatch();

    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: patch,
      responseMessageId: "assistant-1",
      client: prismaMock as never,
      exercises,
      trace,
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
    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "validation",
      name: "Patch 输入结构校验通过",
    }));
    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_call",
      input: expect.objectContaining({ toolName: "getArtifactPayload" }),
    }));
    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "persistence",
      name: "Patch revision 持久化成功",
      output: expect.objectContaining({ artifactId: "artifact-new" }),
    }));
  });

  it("only replaces Rope_Jumping and keeps the rest of the routine structure unchanged", async () => {
    const draft = createWorkoutRoutineDraft({
      sections: [
        createWorkoutRoutineDraft().sections[0],
        {
          section: "training",
          title: "主训练",
          items: [
            {
              section: "training",
              exerciseId: "Rope_Jumping",
              mode: "duration",
              sets: 3,
              target: 60,
              setRestSeconds: 30,
              transitionRestSeconds: 20,
            },
            {
              section: "training",
              exerciseId: "plank",
              mode: "duration",
              sets: 2,
              target: 45,
              setRestSeconds: 30,
              transitionRestSeconds: 20,
            },
          ],
        },
        createWorkoutRoutineDraft().sections[2],
      ],
    });
    mockReadableSourceArtifact(draft);

    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: createReplacePatch({
        target: {
          artifactId: "artifact-routine",
          artifactKind: "routine",
          section: "training",
          exerciseId: "Rope_Jumping",
        },
        replacementExerciseId: "wall-push-up",
      }),
      responseMessageId: "assistant-1",
      client: prismaMock as never,
      exercises,
    });

    expect(result.status).toBe("applied");
    expect(result.payload).toMatchObject({
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
              target: 60,
              setRestSeconds: 30,
              transitionRestSeconds: 20,
            }),
            expect.objectContaining({
              exerciseId: "plank",
              sets: 2,
              target: 45,
              setRestSeconds: 30,
              transitionRestSeconds: 20,
            }),
          ],
        }),
        expect.objectContaining({
          section: "stretch",
          items: [expect.objectContaining({ exerciseId: "stretch" })],
        }),
      ],
    });
    expect(result.diff).toEqual([
      expect.objectContaining({
        operation: "replace_exercise",
        originalExerciseId: "Rope_Jumping",
        replacementExerciseId: "wall-push-up",
      }),
    ]);
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
    const trace = createTraceMock();
    mockReadableSourceArtifact(createWorkoutRoutineDraft());

    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: createReplacePatch({ replacementExerciseId: "barbell-bench" }),
      client: prismaMock as never,
      exercises,
      trace,
    });

    expect(result.status).toBe("validation_failed");
    expect(result.failureReasons).toEqual(expect.arrayContaining([
      "replacement_outside_candidate_set",
      "replacement_equipment_mismatch",
      "replacement_difficulty_too_high",
    ]));
    expect(prismaMock.conversationArtifact.create).not.toHaveBeenCalled();
    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "validation",
      status: "failed",
      metadata: expect.objectContaining({ code: "replacement_outside_candidate_set" }),
    }));
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

  it("returns confirmation request before touching saved routine scope", async () => {
    const result = await applyWorkoutPatch({
      userId: "user-1",
      rawPatch: {
        ...createReplacePatch(),
        scope: "saved_routine",
      },
      client: prismaMock as never,
      exercises,
      confirmationSecret: "test-secret",
      now: new Date("2026-05-30T10:00:00.000Z"),
    });

    expect(result.status).toBe("confirmation_required");
    expect(result.confirmation).toMatchObject({
      targetIds: ["artifact-routine"],
      impactSummary: "将影响 1 个目标对象。",
    });
    expect(result.failureReasons).toContain("confirmation_required");
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

function createTraceMock() {
  return {
    id: "trace-1",
    addStep: vi.fn(),
    finish: vi.fn(),
    update: vi.fn(),
  };
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
