import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise, createWorkoutRoutineDraft } from "./fixtures/domain";

const artifactMocks = vi.hoisted(() => ({
  getArtifactPayload: vi.fn(),
}));
const exerciseMocks = vi.hoisted(() => ({
  listAllExercises: vi.fn(),
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
      latestUserMessage: "把这套里的俯卧撑换掉",
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
            target: expect.objectContaining({
              section: "training",
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
