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
  getActiveArtifactPayload: vi.fn(),
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
    artifactMocks.getActiveArtifactPayload.mockReset();
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
      "queryUserMemory",
      "resolveArtifactReference",
      "searchArtifacts",
      "searchExercises",
    ]);
    expect(registry.list().every((tool) => tool.capabilityContract)).toBe(true);
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

  it("returns partial candidate diagnostics instead of failed output when result requirements are unmet", async () => {
    const exercise = createExercise({ id: "dumbbell-row", nameZh: "哑铃划船" });
    exerciseMocks.searchExercises.mockResolvedValue({
      candidates: [exercise],
      diagnostics: {
        normalizedQueryInput: {
          candidateUse: "routine",
          filters: {},
          resultRequirements: {},
          softPreferences: {},
          projection: {},
        },
        appliedFilters: {},
        invalidFilters: [],
        constraintProof: [{ exerciseId: "dumbbell-row", matchedFilters: [] }],
        resultRequirementProof: {
          sectionCoverage: {
            training: { required: 1, actual: 1, satisfied: true },
            stretch: { required: 1, actual: 0, satisfied: false },
          },
        },
        satisfied: false,
        queryMode: "none",
        failureReasons: ["result_requirement_unmet:sectionCoverage.stretch"],
        unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
        finalExerciseIds: ["dumbbell-row"],
        controlledSupplementalCandidates: [],
      },
    });
    const registry = createReadonlyAgentToolRegistry();
    const tool = registry.get("searchExercises");

    const result = await tool!.execute(
      {
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        filters: { bodyRegions: ["upper_body"], visibility: "published" },
        resultRequirements: {
          sectionCoverage: {
            training: { min: 1 },
            stretch: { min: 1 },
          },
        },
      },
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
        candidateSetStatus: "partial",
        satisfied: false,
        unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
        recoveryOptions: expect.arrayContaining([
          expect.objectContaining({ label: "允许无器械补齐" }),
        ]),
      },
      fulfillment: {
        satisfied: false,
        producedResources: [],
        unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
      },
    });
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
