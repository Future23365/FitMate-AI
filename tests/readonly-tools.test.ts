import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise, createWorkoutPlanDraft, createWorkoutRoutineDraft } from "./fixtures/domain";
import type { ControlledToolContext } from "@/lib/server/ai/tools";
import type { ResolvedChatIntent } from "@/lib/shared/chat/resolved-intent";

const artifactMocks = vi.hoisted(() => ({
  searchArtifactsDetailed: vi.fn(),
  getArtifactPayload: vi.fn(),
}));
const exerciseMocks = vi.hoisted(() => ({
  getExerciseById: vi.fn(),
  searchExercises: vi.fn(),
}));

vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactMocks);
vi.mock("@/lib/server/exercises/exercise-service", () => exerciseMocks);

const tools = await import("@/lib/server/ai/tools");

describe("readonly LLM tools", () => {
  beforeEach(() => {
    artifactMocks.searchArtifactsDetailed.mockReset();
    artifactMocks.getArtifactPayload.mockReset();
    exerciseMocks.getExerciseById.mockReset();
    exerciseMocks.searchExercises.mockReset();
    delete process.env.ENABLE_READONLY_LLM_TOOLS;
  });

  it("registers only the allowed readonly tools", () => {
    const names = Array.from(tools.getReadonlyToolRegistry().keys());

    expect(names.sort()).toEqual([
      "getArtifactPayload",
      "getExerciseById",
      "searchArtifacts",
      "searchExercises",
    ]);
    expect(names).not.toContain("applyWorkoutPatch");
    expect(names).not.toContain("createWorkoutPlanDraft");
    expect(names).not.toContain("saveWorkoutPlan");
    expect(names).not.toContain("recordUserFeedback");
    expect(tools.getReadonlyTool("unknown")).toBeUndefined();
  });

  it("executes a valid tool through schema, permission context and summary output", async () => {
    const exercise = createExercise({ id: "push-up", nameZh: "俯卧撑" });
    exerciseMocks.getExerciseById.mockResolvedValue(exercise);
    const trace = createTraceMock();

    const result = await tools.executeReadonlyTool({
      toolName: "getExerciseById",
      toolInput: { exerciseId: "push-up" },
      context: createToolContext({ trace }),
      reason: "用户询问动作细节",
    });

    expect(result).toMatchObject({
      toolName: "getExerciseById",
      status: "success",
      modelSummary: expect.objectContaining({
        exerciseId: "push-up",
        nameZh: "俯卧撑",
      }),
    });
    expect(exerciseMocks.getExerciseById).toHaveBeenCalledWith("push-up");
    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_call",
      input: expect.objectContaining({ toolName: "getExerciseById" }),
      output: expect.objectContaining({ exerciseId: "push-up" }),
    }));
  });

  it("rejects unknown tools, invalid schema input and out-of-bound artifact ids deterministically", async () => {
    await expect(tools.executeReadonlyTool({
      toolName: "saveWorkoutPlan",
      toolInput: {},
      context: createToolContext(),
    })).resolves.toMatchObject({
      status: "failed",
      error: { code: "unknown_tool" },
    });

    await expect(tools.executeReadonlyTool({
      toolName: "getExerciseById",
      toolInput: {},
      context: createToolContext(),
    })).resolves.toMatchObject({
      status: "failed",
      error: { code: "schema_validation_failed" },
    });

    await expect(tools.executeReadonlyTool({
      toolName: "getArtifactPayload",
      toolInput: { artifactId: "artifact-b" },
      context: createToolContext({ allowedArtifactIds: ["artifact-a"] }),
    })).resolves.toMatchObject({
      status: "failed",
      error: { code: "forbidden" },
    });
    expect(artifactMocks.getArtifactPayload).not.toHaveBeenCalled();
  });

  it("normalizes tool execution failures and not-found results", async () => {
    artifactMocks.getArtifactPayload.mockResolvedValue({
      ok: false,
      code: "not_found",
      message: "Artifact not found or not accessible.",
    });

    await expect(tools.executeReadonlyTool({
      toolName: "getArtifactPayload",
      toolInput: { artifactId: "artifact-missing" },
      context: createToolContext(),
    })).resolves.toMatchObject({
      status: "failed",
      error: { code: "not_found" },
    });

    exerciseMocks.searchExercises.mockRejectedValue(new Error("db down"));
    await expect(tools.executeReadonlyTool({
      toolName: "searchExercises",
      toolInput: { query: "胸", limit: 2 },
      context: createToolContext(),
    })).resolves.toMatchObject({
      status: "failed",
      error: { code: "execution_failed" },
    });
  });

  it("parses JSON tool decisions and rejects unsafe decision shapes", () => {
    expect(tools.parseReadonlyToolDecision({
      action: "call_tool",
      toolName: "searchExercises",
      input: { query: "胸" },
      reason: "需要真实动作库",
    })).toMatchObject({ ok: true });
    expect(tools.parseReadonlyToolDecision({
      action: "finish",
      answerReadiness: "enough_context",
      reason: "上下文足够",
    })).toMatchObject({ ok: true });
    expect(tools.parseJsonObject("```json\n{\"action\":\"finish\"}\n```")).toMatchObject({ ok: true });
    expect(tools.parseJsonObject("{broken")).toMatchObject({ ok: false, code: "invalid_json" });
    expect(tools.parseReadonlyToolDecision([
      { action: "call_tool", toolName: "searchExercises", input: {}, reason: "a" },
      { action: "call_tool", toolName: "getExerciseById", input: {}, reason: "b" },
    ])).toMatchObject({ ok: false, code: "invalid_decision" });
    expect(tools.parseReadonlyToolDecision({
      action: "write",
      toolName: "saveWorkoutPlan",
      input: {},
      reason: "no",
    })).toMatchObject({ ok: false, code: "invalid_decision" });
    expect(tools.parseReadonlyToolDecision({
      action: "call_tool",
      toolName: "searchExercises",
      input: {},
    })).toMatchObject({ ok: false, code: "invalid_decision" });
  });

  it("summarizes artifact payloads with stable schemas and without leaking full payloads", () => {
    const routine = createWorkoutRoutineDraft();
    const plan = createWorkoutPlanDraft();

    expect(tools.summarizeArtifactPayloadForModel({
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
    expect(tools.summarizeArtifactPayloadForModel({
      artifactId: "artifact-plan",
      kind: "plan",
      payload: plan,
      maxTextChars: 80,
    })).toMatchObject({
      kind: "plan",
      artifactId: "artifact-plan",
      days: expect.any(Array),
    });
    expect(tools.summarizePatchResultForModel({
      artifactId: "patch-1",
      maxTextChars: 80,
      result: {
        status: "applied",
        message: "已替换动作",
        sourceArtifactId: "artifact-routine",
        artifactId: "artifact-new",
        artifactKind: "routine",
        diff: [
          {
            operation: "replace_exercise",
            target: {
              artifactId: "artifact-routine",
              artifactKind: "routine",
              section: "training",
              exerciseId: "push-up",
            },
            originalExerciseId: "push-up",
            replacementExerciseId: "wall-push-up",
            preservedFields: [],
            changedFields: [],
            reason: "降低难度",
          },
        ],
        suggestedReplies: [],
        failureReasons: [],
      },
    })).toMatchObject({
      kind: "patch",
      sourceArtifactId: "artifact-routine",
      changedExerciseIds: ["push-up", "wall-push-up"],
    });
  });

  it("keeps the tool loop disabled by default and records the skipped reason", async () => {
    const trace = createTraceMock();
    const bundle = await tools.runReadonlyToolLoop({
      apiKey: "test-key",
      userId: "user-1",
      sessionId: "chat-1",
      messages: [{ role: "user", content: "之前那个计划为什么这样安排" }],
      conversationSummaryContext: {
        summary: "用户之前有一个训练计划。",
        latestUserMessage: "之前那个计划为什么这样安排",
      },
      resolvedIntent: createResolvedIntent(),
      referenceResolution: null,
      trace,
      eligibility: { allowed: false, reason: "feature_flag_disabled" },
    });

    expect(bundle).toMatchObject({
      enabled: false,
      available: false,
      stopReason: "feature_flag_disabled",
      decisionCallCount: 0,
      toolExecutionCount: 0,
    });
    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_decision",
      output: expect.objectContaining({
        stopReason: "feature_flag_disabled",
        decisionCallCount: 0,
      }),
    }));
  });

  it("allows only readonly explanation scenarios into the first trigger matrix", () => {
    process.env.ENABLE_READONLY_LLM_TOOLS = "true";

    expect(tools.decideReadonlyToolLoopEligibility({
      latestUserMessage: "之前那个计划为什么这样安排",
      resolvedIntent: createResolvedIntent(),
      referenceResolution: null,
      assistantActionExists: false,
    })).toEqual({ allowed: true, trigger: "plan_reason_explanation" });
    expect(tools.decideReadonlyToolLoopEligibility({
      latestUserMessage: "给我一个一周四练计划",
      resolvedIntent: createResolvedIntent({ action: { kind: "workout_plan", shouldTrigger: true, blockingMissingFields: [] } }),
      referenceResolution: null,
      assistantActionExists: true,
    })).toEqual({ allowed: false, reason: "deterministic_skip" });
  });

  it("formats prompt context so failed or unavailable reads cannot be claimed as fetched data", () => {
    expect(tools.formatReadonlyToolContextBundleForPrompt(null)).toContain("available\": false");
    expect(tools.formatReadonlyToolContextBundleForPrompt({
      enabled: true,
      available: true,
      stopReason: "model_finish",
      decisionCallCount: 1,
      toolExecutionCount: 1,
      totalDurationMs: 10,
      stepLimitReached: false,
      timeout: false,
      truncated: false,
      serializedLength: 120,
      calls: [{
        id: "call-1",
        toolName: "getExerciseById",
        input: { exerciseId: "push-up" },
        status: "success",
        durationMs: 1,
        modelSummary: { exerciseId: "push-up" },
        traceSummary: { exerciseId: "push-up" },
        priority: 2,
      }],
      modelContext: [{ id: "call-1", toolName: "getExerciseById", summary: { exerciseId: "push-up" } }],
    })).toContain("getExerciseById");
  });
});

function createToolContext(overrides: Partial<ControlledToolContext> = {}): ControlledToolContext {
  return {
    userId: "user-1",
    sessionId: "chat-1",
    budget: tools.defaultReadonlyToolBudget,
    ...overrides,
  };
}

function createResolvedIntent(overrides: Partial<ResolvedChatIntent> = {}): ResolvedChatIntent {
  return {
    type: "general_fitness_advice",
    responseMode: "answer_only",
    action: { kind: "none", shouldTrigger: false, blockingMissingFields: [] },
    missingActionFields: [],
    clarificationReplies: [],
    adjustmentReplies: [],
    fieldSources: {},
    referenceRequirement: {
      required: false,
      allowedArtifactKinds: [],
    },
    ...overrides,
  };
}

function createTraceMock() {
  return {
    id: "trace-1",
    addStep: vi.fn(),
    finish: vi.fn(),
    update: vi.fn(),
  };
}
