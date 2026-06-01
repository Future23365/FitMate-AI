import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise, createWorkoutRoutineDraft } from "./fixtures/domain";
import {
  createReadonlyAgentToolRegistry,
  createToolFirstAgentToolRegistry,
} from "@/lib/server/agent-orchestrator";
import {
  summarizeArtifactPayloadForModel,
  summarizeExerciseForModel,
} from "@/lib/server/ai/tools";

const artifactMocks = vi.hoisted(() => ({
  listRecentArtifacts: vi.fn(),
  searchArtifactsDetailed: vi.fn(),
  getArtifactPayload: vi.fn(),
}));
const exerciseMocks = vi.hoisted(() => ({
  exerciseBodyRegionValues: ["upper_body", "lower_body", "core", "full_body"],
  getExerciseById: vi.fn(),
  searchExercises: vi.fn(),
}));
const prismaMocks = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn() },
  userMemory: { findMany: vi.fn() },
}));

vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactMocks);
vi.mock("@/lib/server/exercises/exercise-service", () => exerciseMocks);
vi.mock("@/lib/server/db/prisma", () => ({ getPrismaClient: () => prismaMocks }));

describe("Agent registry readonly tools", () => {
  beforeEach(() => {
    artifactMocks.listRecentArtifacts.mockReset();
    artifactMocks.searchArtifactsDetailed.mockReset();
    artifactMocks.getArtifactPayload.mockReset();
    exerciseMocks.getExerciseById.mockReset();
    exerciseMocks.searchExercises.mockReset();
    prismaMocks.userProfile.findUnique.mockReset();
    prismaMocks.userMemory.findMany.mockReset();
  });

  it("registers read tools inside the Agent registry instead of an independent readonly loop", () => {
    const registry = createReadonlyAgentToolRegistry();
    const names = registry.list().map((tool) => tool.name).sort();

    expect(names).toEqual([
      "getArtifactPayload",
      "getExerciseById",
      "getUserMemory",
      "listRecentArtifacts",
      "searchArtifacts",
      "searchExercises",
    ]);
    expect(names).not.toContain("runReadonlyToolLoop");
    expect(names).not.toContain("legacyIntentNormalize");
  });

  it("executes readonly Agent tools with schema, user scope and trace summaries", async () => {
    const exercise = createExercise({ id: "push-up", nameZh: "俯卧撑" });
    exerciseMocks.getExerciseById.mockResolvedValue(exercise);
    const registry = createReadonlyAgentToolRegistry();
    const tool = registry.get("getExerciseById");

    expect(tool).toBeDefined();
    const result = await tool!.execute(
      { exerciseId: "push-up" },
      {
        runId: "agent-run-1",
        userId: "user-1",
        sessionId: "chat-1",
        deadlineAt: Date.now() + 1000,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        exercise: expect.objectContaining({ id: "push-up", nameZh: "俯卧撑" }),
      },
    });
    expect(exerciseMocks.getExerciseById).toHaveBeenCalledWith("push-up");
  });

  it("keeps write-capable workout tools in the same Tool-first registry with domain contracts", () => {
    const registry = createToolFirstAgentToolRegistry();
    const tools = registry.list();

    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "searchExercises",
      "generateRoutineDraft",
      "validateRoutineDraft",
      "evaluatePolicy",
      "saveConversationArtifactRevision",
    ]));
    expect(tools.find((tool) => tool.name === "saveConversationArtifactRevision")?.accessLevel).toBe("write");
  });

  it("summarizes tool results without exposing full payloads as prompt text", () => {
    const routine = createWorkoutRoutineDraft();
    const exercise = createExercise({ id: "push-up", nameZh: "俯卧撑" });

    expect(summarizeArtifactPayloadForModel({
      artifactId: "artifact-routine",
      kind: "routine",
      payload: routine,
      maxTextChars: 80,
    })).toMatchObject({
      kind: "routine",
      artifactId: "artifact-routine",
      sections: expect.arrayContaining([
        expect.objectContaining({ exerciseIds: expect.any(Array), setsReps: expect.any(Array) }),
      ]),
    });
    expect(summarizeExerciseForModel(exercise, 80)).toMatchObject({
      exerciseId: "push-up",
      nameZh: "俯卧撑",
    });
  });
});
