import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise, createWorkoutRoutineDraft } from "./fixtures/domain";

const artifactMocks = vi.hoisted(() => ({
  getArtifactPayload: vi.fn(),
}));
const exerciseMocks = vi.hoisted(() => ({
  exerciseBodyRegionValues: ["upper_body", "lower_body", "core", "full_body"],
  listAllExercises: vi.fn(),
  searchExercisesInMemory: vi.fn(),
}));
const patchEngineMocks = vi.hoisted(() => ({
  applyWorkoutPatch: vi.fn(),
}));

vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactMocks);
vi.mock("@/lib/server/exercises/exercise-service", () => exerciseMocks);
vi.mock("@/lib/server/workout-patches/workout-patch-engine", () => patchEngineMocks);

const patchChatService = await import("@/lib/server/workout-patches/workout-patch-chat-service");

describe("workout patch chat service", () => {
  beforeEach(() => {
    artifactMocks.getArtifactPayload.mockReset();
    exerciseMocks.listAllExercises.mockReset();
    exerciseMocks.searchExercisesInMemory.mockReset();
    exerciseMocks.searchExercisesInMemory.mockReturnValue({
      diagnostics: { rerank: [] },
    });
    patchEngineMocks.applyWorkoutPatch.mockReset();
  });

  it("builds a controlled patch from a resolved artifact reference", async () => {
    const draft = createWorkoutRoutineDraft();
    artifactMocks.getArtifactPayload.mockResolvedValue({
      ok: true,
      artifactId: "artifact-routine",
      kind: "routine",
      payload: draft,
    });
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({ id: "push-up", nameZh: "俯卧撑" }),
      createExercise({ id: "wall-push-up", nameZh: "墙壁俯卧撑" }),
    ]);
    patchEngineMocks.applyWorkoutPatch.mockResolvedValue({
      status: "applied",
      message: "已把俯卧撑替换为墙壁俯卧撑，组数、目标次数/时长和休息保持不变。",
      sourceArtifactId: "artifact-routine",
      artifactId: "artifact-new",
      artifactKind: "routine",
      payload: draft,
      diff: [],
      suggestedReplies: [],
      failureReasons: [],
    });

    const result = await patchChatService.buildAndApplyWorkoutPatchFromChat({
      userId: "user-1",
      latestUserMessage: "把这套里的俯卧撑换成墙壁俯卧撑",
      actionKind: "exercise_replacement",
      responseMessageId: "assistant-1",
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-routine",
        artifactKind: "routine",
        confidence: "high",
        reason: "近指引用命中。",
        candidates: [],
      },
    });

    expect(result).toMatchObject({ handled: true, result: { status: "applied" } });
    expect(patchEngineMocks.applyWorkoutPatch).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      responseMessageId: "assistant-1",
      rawPatch: expect.objectContaining({
        scope: "artifact_only",
        target: { artifactId: "artifact-routine", artifactKind: "routine" },
        operations: [
          expect.objectContaining({
            operation: "replace_exercise",
            replacementExerciseId: "wall-push-up",
            target: expect.objectContaining({
              section: "training",
              exerciseId: "push-up",
            }),
          }),
        ],
      }),
    }));
  });

  it("returns assistantSuggestions and pending selection when replacement is not specified", async () => {
    const draft = createWorkoutRoutineDraft();
    artifactMocks.getArtifactPayload.mockResolvedValue({
      ok: true,
      artifactId: "artifact-routine",
      kind: "routine",
      payload: draft,
    });
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({ id: "push-up", nameZh: "俯卧撑", level: "intermediate", difficulty: "intermediate" }),
      createExercise({ id: "wall-push-up", nameZh: "墙壁俯卧撑", level: "beginner", difficulty: "beginner" }),
    ]);

    const result = await patchChatService.buildAndApplyWorkoutPatchFromChat({
      userId: "user-1",
      latestUserMessage: "把这套里的俯卧撑换成别的吧",
      actionKind: "exercise_replacement",
      responseMessageId: "assistant-1",
      now: new Date("2026-06-01T00:00:00.000Z"),
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-routine",
        artifactKind: "routine",
        confidence: "high",
        reason: "近指引用命中。",
        candidates: [],
      },
    });

    expect(result).toMatchObject({
      handled: true,
      result: {
        status: "ambiguous",
        failureReasons: ["replacement_selection_required"],
        pendingReplacementSelection: {
          artifactId: "artifact-routine",
          artifactKind: "routine",
          sourceExerciseId: "push-up",
          candidateExerciseIds: ["wall-push-up"],
        },
        assistantSuggestions: [
          expect.objectContaining({
            label: "墙壁俯卧撑",
            message: "把俯卧撑换成墙壁俯卧撑",
            source: "workout_patch",
          }),
        ],
      },
    });
    if (result.handled) {
      expect(patchChatService.formatWorkoutPatchReply(result.result)).toBe(
        "我已定位到 俯卧撑。请选择一个替代动作，我会只替换这个动作并保留组数、目标和休息。",
      );
      expect(patchChatService.formatWorkoutPatchReply(result.result)).not.toContain("已经生成了新的训练卡片");
    }
    expect(patchEngineMocks.applyWorkoutPatch).not.toHaveBeenCalled();
  });

  it("consumes pending replacement selection when the user only names a candidate", async () => {
    const draft = createWorkoutRoutineDraft();
    artifactMocks.getArtifactPayload.mockResolvedValue({
      ok: true,
      artifactId: "artifact-routine",
      kind: "routine",
      payload: draft,
    });
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({ id: "push-up", nameZh: "俯卧撑", level: "intermediate", difficulty: "intermediate" }),
      createExercise({ id: "wall-push-up", nameZh: "墙壁俯卧撑", level: "beginner", difficulty: "beginner" }),
    ]);
    patchEngineMocks.applyWorkoutPatch.mockResolvedValue({
      status: "applied",
      message: "已把俯卧撑替换为墙壁俯卧撑，组数、目标次数/时长和休息保持不变。",
      sourceArtifactId: "artifact-routine",
      artifactId: "artifact-new",
      artifactKind: "routine",
      payload: draft,
      diff: [],
      suggestedReplies: [],
      failureReasons: [],
    });

    const result = await patchChatService.buildAndApplyWorkoutPatchFromChat({
      userId: "user-1",
      latestUserMessage: "墙壁俯卧撑",
      actionKind: "exercise_replacement",
      responseMessageId: "assistant-2",
      now: new Date("2026-06-01T00:01:00.000Z"),
      pendingReplacementSelection: {
        artifactId: "artifact-routine",
        artifactKind: "routine",
        sourceExerciseId: "push-up",
        sourceExerciseName: "俯卧撑",
        candidateExerciseIds: ["wall-push-up"],
        candidateExerciseNames: ["墙壁俯卧撑"],
        createdAt: "2026-06-01T00:00:00.000Z",
        expiresAt: "2026-06-01T00:10:00.000Z",
      },
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-routine",
        artifactKind: "routine",
        confidence: "high",
        reason: "pending selection 命中。",
        candidates: [],
      },
    });

    expect(result).toMatchObject({ handled: true, result: { status: "applied" } });
    expect(patchEngineMocks.applyWorkoutPatch).toHaveBeenCalledWith(expect.objectContaining({
      rawPatch: expect.objectContaining({
        operations: [
          expect.objectContaining({
            operation: "replace_exercise",
            replacementExerciseId: "wall-push-up",
            target: expect.objectContaining({
              exerciseId: "push-up",
            }),
          }),
        ],
      }),
    }));
  });

  it("returns a guidance result when the patch target cannot be located", async () => {
    artifactMocks.getArtifactPayload.mockResolvedValue({
      ok: true,
      artifactId: "artifact-routine",
      kind: "routine",
      payload: createWorkoutRoutineDraft(),
    });
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({ id: "push-up", nameZh: "俯卧撑" }),
    ]);

    const result = await patchChatService.buildAndApplyWorkoutPatchFromChat({
      userId: "user-1",
      latestUserMessage: "把深蹲换掉",
      actionKind: "exercise_replacement",
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-routine",
        artifactKind: "routine",
        confidence: "high",
        reason: "近指引用命中。",
        candidates: [],
      },
    });

    expect(result).toMatchObject({
      handled: true,
      result: {
        status: "ambiguous",
        failureReasons: ["patch_target_not_found"],
      },
    });
    expect(patchEngineMocks.applyWorkoutPatch).not.toHaveBeenCalled();
  });
});
