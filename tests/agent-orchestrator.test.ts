import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createExercise, createWorkoutPlanIntent, createWorkoutRoutineDraft } from "./fixtures/domain";
import {
  AgentToolRegistry,
  AgentToolRegistryContractError,
  agentExecutionResultSchema,
  createAgentContextBuilder,
  createLegacyChatEventAdapter,
  createReadonlyAgentToolRegistry,
  createToolFirstAgentToolRegistry,
  projectAgentExecutionResultToResponse,
  parseAgentJsonObject,
  parseAgentToolDecision,
  runAgentOrchestrator,
  validateAgentResponseProjection,
  type AgentToolDefinition,
  type AgentToolExecutionContext,
} from "@/lib/server/agent-orchestrator";
import { buildPromptFromModules } from "@/lib/server/ai/prompt-config";
import { createAgentChatTokenBudgetDecision } from "@/lib/server/ai/token-budget";

const artifactMocks = vi.hoisted(() => ({
  createConversationArtifactRevision: vi.fn(),
  getArtifactPayload: vi.fn(),
  listRecentArtifacts: vi.fn(),
  searchArtifactsDetailed: vi.fn(),
}));
const exerciseMocks = vi.hoisted(() => ({
  getExerciseById: vi.fn(),
  listAllExercises: vi.fn(),
  searchExercises: vi.fn(),
}));
const prismaMocks = vi.hoisted(() => ({
  userProfile: {
    findUnique: vi.fn(),
  },
  userMemory: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactMocks);
vi.mock("@/lib/server/exercises/exercise-service", () => exerciseMocks);
vi.mock("@/lib/server/db/prisma", () => ({
  getPrismaClient: () => prismaMocks,
}));

describe("agent orchestrator phase 1 contracts", () => {
  it("builds a ContextPackage from real messages, artifacts, memory and provenance", () => {
    const builder = createAgentContextBuilder();
    const context = builder.build({
      latestUserMessage: "不用哑铃了，换一个",
      recentMessages: [
        { id: "m1", role: "user", content: "我想练上肢", createdAt: "2026-06-01T01:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已生成哑铃上肢训练", createdAt: "2026-06-01T01:01:00.000Z" },
      ],
      recentArtifacts: [
        {
          artifactId: "artifact-1",
          revisionId: "rev-1",
          kind: "routine",
          title: "30 分钟上肢训练",
          summary: "包含哑铃推举和俯身划船。",
          updatedAt: "2026-06-01T01:02:00.000Z",
        },
      ],
      memorySnapshot: {
        snapshotId: "memory-1",
        facts: ["用户常在家训练"],
        preferences: ["偏好低冲击动作"],
        avoidances: ["避免跳跃动作"],
      },
      limits: { maxRecentMessages: 2, maxMessageChars: 80 },
    });

    expect(context.latestUserMessage).toBe("不用哑铃了，换一个");
    expect(context.recentMessages).toHaveLength(2);
    expect(context.recentArtifacts[0]).toMatchObject({
      artifactId: "artifact-1",
      kind: "routine",
    });
    expect(context.provenance.map((item) => item.sourceKind)).toEqual([
      "latest_user_message",
      "recent_message",
      "recent_message",
      "recent_artifact",
      "user_memory",
    ]);
    expect(context).not.toHaveProperty("conversationSummary");
  });

  it("keeps AgentExecutionResult as the terminal schema including completed_operation", () => {
    expect(agentExecutionResultSchema.parse({
      status: "completed_operation",
      operationResultId: "operation-result-1",
      usedToolResultIds: ["tool-result-1"],
      policyDecisionId: "policy-1",
      confirmationId: "confirm-1",
      operation: {
        operationType: "updateUserProfile",
        resourceType: "UserProfile",
        title: "已更新训练偏好",
        summary: "训练偏好已保存为在家训练。",
        visibleFields: [{ key: "trainingLocation", label: "训练地点", value: "在家" }],
      },
    })).toMatchObject({
      status: "completed_operation",
      operation: { sensitiveFieldsOmitted: true },
    });

    expect(agentExecutionResultSchema.safeParse({
      status: "completed_operation",
      operationResultId: "operation-result-1",
      usedToolResultIds: [],
      operation: {
        operationType: "updateUserProfile",
        resourceType: "UserProfile",
        title: "已更新训练偏好",
        summary: "训练偏好已保存。",
      },
    }).success).toBe(false);
  });

  it("registers model-visible tools and rejects unknown tool decisions", () => {
    const registry = new AgentToolRegistry([createReadTool()]);

    expect(registry.listModelDefinitions()).toEqual([
      expect.objectContaining({
        name: "getUserMemory",
        accessLevel: "read",
        dependencies: [],
      }),
    ]);

    expect(parseAgentToolDecision({
      action: "call_tool",
      toolName: "getUserMemory",
      input: { scope: "current_user" },
      reason: "需要读取用户偏好",
    }, registry)).toMatchObject({ ok: true });

    expect(parseAgentToolDecision({
      action: "call_tool",
      toolName: "saveConversationArtifactRevision",
      input: {},
      reason: "尝试保存",
    }, registry)).toMatchObject({ ok: false, code: "unknown_tool" });

    expect(parseAgentToolDecision([
      { action: "call_tool", toolName: "getUserMemory", input: {}, reason: "a" },
      { action: "call_tool", toolName: "getUserMemory", input: {}, reason: "b" },
    ], registry)).toMatchObject({ ok: false, code: "invalid_decision" });
  });

  it("blocks write tools that lack a domain capability contract or safe projection", () => {
    expect(() => new AgentToolRegistry([{
      ...createReadTool(),
      name: "saveConversationArtifactRevision",
      accessLevel: "write",
      dependencies: [],
    }])).toThrow(AgentToolRegistryContractError);

    const registry = new AgentToolRegistry([createWriteTool()]);

    expect(registry.get("saveConversationArtifactRevision")).toMatchObject({
      accessLevel: "write",
      domainCapability: expect.objectContaining({
        openspecChange: "replace-chat-orchestrator-with-tool-first-agent",
      }),
    });
  });

  it("derives legacy chat events only from AgentExecutionResult", () => {
    const adapter = createLegacyChatEventAdapter();
    const projection = adapter.project({
      result: {
        status: "patched",
        artifact: {
          artifactId: "artifact-2",
          kind: "routine",
          title: "无哑铃上肢训练",
        },
        patchResult: {
          patchId: "patch-1",
          sourceArtifactId: "artifact-1",
          targetArtifactId: "artifact-2",
          changedExerciseIds: ["dumbbell-row", "bodyweight-row"],
          summary: "已替换哑铃动作。",
        },
        revisionId: "rev-2",
        validationId: "validation-1",
        usedToolResultIds: ["tool-result-1"],
      },
    });

    expect(projection).toMatchObject({
      derived: true,
      assistantAction: {
        action: "workout_patched",
        artifactId: "artifact-2",
        revisionId: "rev-2",
      },
      resolvedIntent: {
        source: "agent_execution_result",
        status: "patched",
        usedToolResultIds: ["tool-result-1"],
      },
    });
  });

  it("parses fenced JSON model output for structured-output fallback providers", () => {
    expect(parseAgentJsonObject("```json\n{\"action\":\"final_result\"}\n```")).toEqual({
      ok: true,
      value: { action: "final_result" },
    });
    expect(parseAgentJsonObject("{broken")).toMatchObject({ ok: false, code: "invalid_json" });
  });
});

describe("agent orchestrator phase 2 readonly tools", () => {
  beforeEach(() => {
    artifactMocks.getArtifactPayload.mockReset();
    artifactMocks.createConversationArtifactRevision.mockReset();
    artifactMocks.listRecentArtifacts.mockReset();
    artifactMocks.searchArtifactsDetailed.mockReset();
    exerciseMocks.getExerciseById.mockReset();
    exerciseMocks.listAllExercises.mockReset();
    exerciseMocks.searchExercises.mockReset();
    prismaMocks.userProfile.findUnique.mockReset();
    prismaMocks.userMemory.findMany.mockReset();
  });

  it("registers readonly Agent tools in the unified registry without writable tools", () => {
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
    expect(names).not.toContain("saveConversationArtifactRevision");
    expect(registry.listModelDefinitions()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "searchArtifacts",
        accessLevel: "read",
        dependencies: [],
      }),
      expect.objectContaining({
        name: "getUserMemory",
        accessLevel: "read",
        dependencies: [],
      }),
    ]));
  });

  it("executes artifact tools with user/session isolation and stable tool result ids", async () => {
    artifactMocks.searchArtifactsDetailed.mockResolvedValue({
      candidates: [{
        artifactId: "artifact-1",
        kind: "routine",
        title: "上肢训练",
        exerciseIds: ["push-up"],
        goals: ["增肌"],
        muscles: ["胸"],
        equipment: ["自重"],
        updatedAt: "2026-06-01T01:00:00.000Z",
      }],
      diagnostics: {
        query: "上肢",
        filters: { userId: "user-1", sessionId: "chat-1", sessionScope: "current_session", status: "active" },
        recalledCount: 1,
        filteredCount: 0,
        rerank: [],
        finalCandidateIds: ["artifact-1"],
        failureReasons: [],
      },
    });
    const registry = createReadonlyAgentToolRegistry();
    const tool = registry.get("searchArtifacts");

    const result = await tool?.execute({ query: "上肢", limit: 2 }, createToolExecutionContext());

    expect(artifactMocks.searchArtifactsDetailed).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sessionId: "chat-1",
      sessionScope: "current_session",
      query: "上肢",
      limit: 2,
    }));
    expect(result).toMatchObject({
      ok: true,
      toolResultId: expect.stringMatching(/^tool_result_/),
      output: {
        candidateSetId: expect.stringMatching(/^candidate_set_/),
        candidates: [expect.objectContaining({ artifactId: "artifact-1" })],
      },
      modelSummary: expect.objectContaining({
        candidateSetId: expect.stringMatching(/^candidate_set_/),
      }),
    });
  });

  it("lists recent artifacts and rejects payload reads outside the allowed artifact boundary", async () => {
    artifactMocks.listRecentArtifacts.mockResolvedValue([
      {
        artifactId: "artifact-1",
        kind: "routine",
        title: "最近训练",
        exerciseIds: ["push-up"],
        goals: [],
        muscles: [],
        equipment: [],
        updatedAt: "2026-06-01T01:00:00.000Z",
      },
    ]);
    const registry = createReadonlyAgentToolRegistry();
    const listTool = registry.get("listRecentArtifacts");
    const payloadTool = registry.get("getArtifactPayload");

    await expect(listTool?.execute({ limit: 1 }, createToolExecutionContext())).resolves.toMatchObject({
      ok: true,
      output: {
        candidateSetId: expect.stringMatching(/^candidate_set_/),
        artifacts: [expect.objectContaining({ artifactId: "artifact-1" })],
      },
    });
    expect(artifactMocks.listRecentArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sessionId: "chat-1",
      sessionScope: "current_session",
    }));

    await expect(payloadTool?.execute({
      artifactId: "artifact-2",
      allowedArtifactIds: ["artifact-1"],
    }, createToolExecutionContext())).resolves.toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(artifactMocks.getArtifactPayload).not.toHaveBeenCalled();
  });

  it("executes exercise tools through database-backed services and returns candidate set ids", async () => {
    const exercise = createExercise({ id: "push-up", nameZh: "俯卧撑" });
    exerciseMocks.getExerciseById.mockResolvedValue(exercise);
    exerciseMocks.searchExercises.mockResolvedValue({
      candidates: [exercise],
      diagnostics: {
        query: "胸",
        filters: { visibility: "published" },
        recalledCount: 1,
        filteredCount: 0,
        rerank: [],
        finalExerciseIds: ["push-up"],
        failureReasons: [],
      },
    });
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("getExerciseById")?.execute(
      { exerciseId: "push-up" },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: { exercise: expect.objectContaining({ id: "push-up" }) },
      modelSummary: expect.objectContaining({ exerciseId: "push-up" }),
    });
    await expect(registry.get("searchExercises")?.execute(
      { query: "胸", limit: 3 },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: { candidateSetId: expect.stringMatching(/^candidate_set_/) },
      modelSummary: expect.objectContaining({
        candidateSetId: expect.stringMatching(/^candidate_set_/),
      }),
    });
  });

  it("reads user memory through current user scope without using conversation summary", async () => {
    prismaMocks.userProfile.findUnique.mockResolvedValue({
      userId: "user-1",
      goal: "增肌",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      preferences: ["居家训练"],
      avoidances: ["跳跃动作"],
      injuryLimitations: ["膝盖不适"],
      updatedAt: new Date("2026-06-01T01:00:00.000Z"),
    });
    prismaMocks.userMemory.findMany.mockResolvedValue([
      {
        kind: "explicit_preference",
        subjectType: "equipment",
        subjectId: null,
        subjectLabel: "自重",
        requiresConfirmation: false,
        updatedAt: new Date("2026-06-01T02:00:00.000Z"),
      },
      {
        kind: "constraint",
        subjectType: "equipment",
        subjectId: null,
        subjectLabel: "哑铃",
        requiresConfirmation: false,
        updatedAt: new Date("2026-06-01T01:30:00.000Z"),
      },
    ]);
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("getUserMemory")?.execute(
      { includePending: false, limit: 12 },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        snapshotId: expect.stringMatching(/^user_memory_/),
        facts: expect.arrayContaining(["goal:增肌", "sessionMinutes:30"]),
        preferences: expect.arrayContaining(["居家训练", "explicit_preference:自重"]),
        avoidances: expect.arrayContaining(["跳跃动作", "injury:膝盖不适", "constraint:哑铃"]),
      },
      traceSummary: expect.objectContaining({
        preferences: 2,
        avoidances: 3,
      }),
    });
    expect(prismaMocks.userMemory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        status: "active",
      }),
    }));
  });
});

describe("agent orchestrator phase 3 workout tools", () => {
  beforeEach(() => {
    artifactMocks.createConversationArtifactRevision.mockReset();
    artifactMocks.getArtifactPayload.mockReset();
    artifactMocks.listRecentArtifacts.mockReset();
    artifactMocks.searchArtifactsDetailed.mockReset();
    exerciseMocks.getExerciseById.mockReset();
    exerciseMocks.listAllExercises.mockReset();
    exerciseMocks.searchExercises.mockReset();
    prismaMocks.userProfile.findUnique.mockReset();
    prismaMocks.userMemory.findMany.mockReset();
  });

  it("registers workout generation, validation, policy and revision tools with write contracts", () => {
    const registry = createToolFirstAgentToolRegistry();
    const names = registry.list().map((tool) => tool.name).sort();

    expect(names).toEqual(expect.arrayContaining([
      "askClarification",
      "evaluatePolicy",
      "generatePlanDraft",
      "generateRoutineDraft",
      "proposeWorkoutEditPlan",
      "proposeWorkoutPatch",
      "saveConversationArtifactRevision",
      "validatePlanDraft",
      "validateRoutineDraft",
      "validateWorkoutPatch",
    ]));
    expect(registry.get("saveConversationArtifactRevision")).toMatchObject({
      accessLevel: "write",
      domainCapability: expect.objectContaining({
        openspecChange: "replace-chat-orchestrator-with-tool-first-agent",
        writableResources: ["ConversationArtifact"],
      }),
    });
  });

  it("requires structured exercise filters for executable candidate sets", async () => {
    const registry = createToolFirstAgentToolRegistry();

    await expect(registry.get("searchExercises")?.execute(
      { query: "不用哑铃，换一个", candidateUse: "patch" },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: false,
      error: { code: "schema_validation_failed" },
    });
    expect(exerciseMocks.searchExercises).not.toHaveBeenCalled();
  });

  it("generates and validates routine drafts from current candidate ids", async () => {
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "warmup",
        nameZh: "肩部绕环",
        categoryZh: "热身",
        allowedSections: ["warmup"],
      }),
      createExercise({
        id: "push-up",
        nameZh: "俯卧撑",
        allowedSections: ["training"],
      }),
      createExercise({
        id: "stretch",
        nameZh: "胸肩拉伸",
        categoryZh: "拉伸",
        allowedSections: ["stretch"],
      }),
    ]);
    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({ intentType: "routine", sessionMinutes: 12 }),
      candidateSetId: "candidate-set-1",
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
    }, createToolExecutionContext());

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        draftId: expect.stringMatching(/^draft_/),
        validation: { valid: true },
        draft: {
          sections: [
            expect.objectContaining({ section: "warmup" }),
            expect.objectContaining({ section: "training" }),
            expect.objectContaining({ section: "stretch" }),
          ],
        },
      },
    });
  });

  it("rejects patch replacement ids outside the current candidate set", async () => {
    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("proposeWorkoutPatch")?.execute({
      editPlan: {
        editPlanId: "edit-plan-1",
        targetArtifactId: "artifact-1",
        sourceArtifactPayloadId: "payload-1",
        requestedChangeSummary: "替换主训练动作",
        preserve: [],
        changes: [{ kind: "exercise", targetId: "push-up", summary: "换成更轻松动作" }],
        scope: "single_item",
        strategy: "patch",
        requiredCandidateSetIds: ["candidate-set-1"],
        confirmationLevel: "none",
      },
      candidateSetId: "candidate-set-1",
      candidateExerciseIds: ["bodyweight-row"],
      patch: {
        scope: "artifact_only",
        target: { artifactId: "artifact-1", artifactKind: "routine" },
        operations: [{
          operation: "replace_exercise",
          target: {
            artifactId: "artifact-1",
            artifactKind: "routine",
            section: "training",
            exerciseId: "push-up",
          },
          replacementExerciseId: "dumbbell-row",
          reason: "不用哑铃",
        }],
        reason: "不用哑铃，换一个",
      },
    }, createToolExecutionContext());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "candidate_set_mismatch" },
    });
  });

  it("saves artifact revisions only after explicit validation and policy references", async () => {
    artifactMocks.createConversationArtifactRevision.mockResolvedValue({
      ok: true,
      artifact: { id: "artifact-2", revision: 2 },
      payload: createWorkoutRoutineDraft(),
    });
    const registry = createToolFirstAgentToolRegistry();
    const draft = createWorkoutRoutineDraft();
    const result = await registry.get("saveConversationArtifactRevision")?.execute({
      sourceArtifactId: "artifact-1",
      payload: draft,
      draftId: "draft-1",
      candidateSetId: "candidate-set-1",
      validationId: "validation-1",
      policyDecisionId: "policy-1",
      validationPassed: true,
      policyAllowed: true,
    }, createToolExecutionContext());

    expect(artifactMocks.createConversationArtifactRevision).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sourceArtifactId: "artifact-1",
      payload: draft,
    }));
    expect(result).toMatchObject({
      ok: true,
      output: {
        revisionId: "artifact-2",
        candidateSetId: "candidate-set-1",
        validationId: "validation-1",
        policyDecisionId: "policy-1",
      },
    });
  });
});

describe("agent orchestrator phase 4 runtime, response writer and prompt budget", () => {
  it("runs tool decisions, records dependency graph, checkpoints and final result", async () => {
    const registry = new AgentToolRegistry([createReadTool()]);
    const context = createTestContextPackage();
    const decisions = [
      {
        action: "call_tool",
        toolName: "getUserMemory",
        input: { scope: "current_user" },
        reason: "需要读取用户偏好。",
      },
      {
        action: "final_result",
        result: {
          status: "answered",
          replyContext: { reply: "用户偏好在家训练。" },
          usedToolResultIds: ["tool-result-1"],
        },
        reason: "已经取得用户记忆，可以回答。",
      },
    ];

    const output = await runAgentOrchestrator({
      runId: "agent-run-1",
      userId: "user-1",
      sessionId: "chat-1",
      context,
      registry,
      limits: { maxSteps: 4, checkpointEverySteps: 1 },
      decideNext: vi.fn()
        .mockResolvedValueOnce(decisions[0])
        .mockResolvedValueOnce(decisions[1]),
    });

    expect(output.result).toMatchObject({
      status: "answered",
      usedToolResultIds: ["tool-result-1"],
    });
    expect(output.state.toolCalls).toEqual([
      expect.objectContaining({ toolName: "getUserMemory", status: "success" }),
    ]);
    expect(output.state.toolResults).toEqual([
      expect.objectContaining({
        toolResultId: "tool-result-1",
        toolName: "getUserMemory",
        status: "success",
      }),
    ]);
    expect(output.state.dependencyGraph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: expect.stringMatching(/^tool_call_/), to: "tool-result-1", relation: "produces" }),
      expect.objectContaining({ from: "tool-result-1", relation: "projects" }),
    ]));
    expect(output.state.checkpoints.length).toBeGreaterThanOrEqual(1);
    expect(output.replayFixture.legacyPathSkip).toEqual({
      intentFirst: true,
      normalize: true,
      summaryOnlyContext: true,
      referenceResolverFirst: true,
    });
  });

  it("turns invalid model decisions into a diagnosable failed final result", async () => {
    const output = await runAgentOrchestrator({
      runId: "agent-run-parse-failed",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([createReadTool()]),
      decideNext: () => "{broken",
    });

    expect(output.result).toMatchObject({
      status: "failed",
      failureCode: "model_output_invalid",
    });
    expect(output.replayFixture.finalResult).toMatchObject({
      status: "failed",
      failureCode: "model_output_invalid",
    });
  });

  it("projects Response Writer replies only from AgentExecutionResult and validates tool references", () => {
    const projection = projectAgentExecutionResultToResponse({
      result: {
        status: "completed_operation",
        operationResultId: "operation-result-1",
        usedToolResultIds: ["tool-result-1"],
        policyDecisionId: "policy-1",
        operation: {
          operationType: "updateUserProfile",
          resourceType: "UserProfile",
          title: "已更新训练偏好",
          summary: "训练偏好已保存。",
          visibleFields: [{ key: "location", label: "训练地点", value: "在家" }],
          sensitiveFieldsOmitted: true,
        },
      },
      toolResults: [{
        toolResultId: "tool-result-1",
        toolCallId: "tool-call-1",
        toolName: "updateUserProfile",
        status: "success",
      }],
    });

    expect(projection).toMatchObject({
      reply: "已更新训练偏好：训练偏好已保存。（训练地点：在家）",
      metadata: {
        promisedWrite: true,
        hasExecutedWrite: true,
        safeOperationOnly: true,
      },
      references: expect.arrayContaining([
        { kind: "tool_result", id: "tool-result-1" },
        { kind: "operation_result", id: "operation-result-1" },
      ]),
    });
    expect(validateAgentResponseProjection({
      result: {
        status: "generated",
        artifact: { artifactId: "artifact-1", kind: "routine", title: "居家训练" },
        revisionId: "revision-1",
        validationId: "validation-1",
        usedToolResultIds: ["missing-tool-result"],
      },
      toolResults: [],
    })).toEqual({
      ok: false,
      missingToolResultIds: ["missing-tool-result"],
    });
  });

  it("runs controlled operation fixtures through completed_operation, confirmation and policy blocked results", async () => {
    const registry = new AgentToolRegistry([createUserProfileWriteTool()]);
    const success = await runAgentOrchestrator({
      runId: "agent-run-operation-success",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      decideNext: vi.fn()
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "updateUserProfile",
          input: { location: "在家", mode: "success" },
          reason: "保存训练地点偏好。",
        })
        .mockResolvedValueOnce({
          action: "final_result",
          result: {
            status: "completed_operation",
            operationResultId: "operation-result-success",
            usedToolResultIds: ["operation-tool-success"],
            operation: {
              operationType: "updateUserProfile",
              resourceType: "UserProfile",
              title: "已更新训练偏好",
              summary: "训练地点已保存为在家。",
              visibleFields: [{ key: "location", label: "训练地点", value: "在家" }],
            },
          },
          reason: "写工具已完成。",
        }),
    });
    const confirmationRequired = await registry.get("updateUserProfile")?.execute(
      { location: "健身房", mode: "confirmation_required" },
      createToolExecutionContext(),
    );
    const blocked = await registry.get("updateUserProfile")?.execute(
      { location: "危险高强度", mode: "policy_blocked" },
      createToolExecutionContext(),
    );

    expect(success.result).toMatchObject({
      status: "completed_operation",
      operationResultId: "operation-result-success",
    });
    expect(projectAgentExecutionResultToResponse({
      result: success.result,
      toolResults: success.state.toolResults,
    })).toMatchObject({
      metadata: { promisedWrite: true, hasExecutedWrite: true, safeOperationOnly: true },
      references: expect.arrayContaining([
        { kind: "operation_result", id: "operation-result-success" },
      ]),
    });
    expect(confirmationRequired).toMatchObject({
      ok: false,
      error: { code: "confirmation_required" },
    });
    expect(blocked).toMatchObject({
      ok: false,
      error: { code: "policy_blocked" },
    });
  });

  it("exposes Agent prompt modules and token budget stages without summary-only execution context", () => {
    const context = createTestContextPackage();
    const budget = createAgentChatTokenBudgetDecision({
      context,
      toolResultCount: 2,
      summaryUpdateSkipped: true,
      summarySkipReason: "本轮不需要后台摘要更新。",
    });

    expect(budget.modelVisibleContext).toMatchObject({
      usesConversationSummary: false,
      usesContextPackage: true,
      recentMessagesCount: 1,
      recentArtifactsCount: 1,
      toolResultCount: 2,
    });
    expect(budget.stages.map((stage) => stage.stage)).toEqual([
      "agent_context_build",
      "agent_tool_decision",
      "agent_tool_execution",
      "agent_final_result",
      "agent_response_writer",
      "agent_summary_update",
    ]);
    expect(budget.stages.flatMap((stage) => stage.promptModules)).toEqual(expect.arrayContaining([
      "agent_context_build",
      "agent_tool_decision",
      "agent_tool_execution",
      "agent_final_result",
      "agent_response_writer",
    ]));
    expect(buildPromptFromModules(["agent_tool_decision", "agent_response_writer"]))
      .toContain("不得读取 conversationSummary、旧 resolved intent 或旧 assistant_action 作为执行事实");
  });
});

function createReadTool(): AgentToolDefinition<{ scope: "current_user" }, { facts: string[] }> {
  return {
    name: "getUserMemory",
    description: "读取当前用户记忆摘要。",
    accessLevel: "read",
    inputSchema: z.object({ scope: z.literal("current_user") }),
    dependencies: [],
    getIdempotencyKey(input, context) {
      return `${context.runId}:${input.scope}`;
    },
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(_input, _context) {
      return {
        ok: true,
        output: { facts: ["用户偏好在家训练"] },
        toolResultId: "tool-result-1",
        modelSummary: { facts: ["用户偏好在家训练"] },
        traceSummary: { factCount: 1 },
      };
    },
  };
}

function createWriteTool(): AgentToolDefinition<{ validationId: string }, { revisionId: string }> {
  return {
    name: "saveConversationArtifactRevision",
    description: "保存已校验的 ConversationArtifact revision。",
    accessLevel: "write",
    inputSchema: z.object({ validationId: z.string().min(1) }),
    dependencies: [
      { kind: "validation", required: true, description: "必须引用当前 run 的 validationId。" },
      { kind: "policy_decision", required: true, description: "必须引用当前 run 的 policyDecisionId。" },
    ],
    domainCapability: {
      openspecChange: "replace-chat-orchestrator-with-tool-first-agent",
      capabilityId: "conversation-artifact-revision-write",
      writableResources: ["ConversationArtifact"],
      fieldWhitelist: ["payload", "status", "revisionOfArtifactId"],
      permissionScope: "current_user_current_session",
      confirmationPolicy: "policy_driven",
      persistenceService: "ConversationArtifactService",
      responseWriterSafeSummary: "只暴露 artifact 标题、revisionId 和安全摘要。",
    },
    getIdempotencyKey(input, context) {
      return `${context.runId}:${input.validationId}`;
    },
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    summarizeForResponseWriter(output) {
      return { revisionId: output.revisionId };
    },
    async execute(_input, _context) {
      return {
        ok: true,
        output: { revisionId: "rev-1" },
        toolResultId: "tool-result-write-1",
        modelSummary: { revisionId: "rev-1" },
        traceSummary: { revisionId: "rev-1" },
      };
    },
  };
}

function createUserProfileWriteTool(): AgentToolDefinition<
  { location: string; mode: "success" | "confirmation_required" | "policy_blocked" },
  { operationResultId: string; policyDecisionId?: string; confirmationId?: string }
> {
  return {
    name: "updateUserProfile",
    description: "更新当前用户训练偏好。",
    accessLevel: "write",
    inputSchema: z.object({
      location: z.string().min(1),
      mode: z.enum(["success", "confirmation_required", "policy_blocked"]),
    }),
    dependencies: [
      { kind: "policy_decision", required: true, description: "必须经过用户资料写入策略评估。" },
    ],
    domainCapability: {
      openspecChange: "replace-chat-orchestrator-with-tool-first-agent",
      capabilityId: "user-profile-write",
      writableResources: ["UserProfile"],
      fieldWhitelist: ["location"],
      permissionScope: "current_user",
      confirmationPolicy: "policy_driven",
      persistenceService: "UserProfileService",
      responseWriterSafeSummary: "只暴露用户可见偏好字段。",
    },
    getIdempotencyKey(input, context) {
      return `${context.runId}:${input.location}:${input.mode}`;
    },
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    summarizeForResponseWriter(output) {
      return output;
    },
    async execute(input) {
      if (input.mode === "confirmation_required") {
        return {
          ok: false,
          error: {
            code: "confirmation_required",
            message: "该资料写入需要用户确认。",
            retryable: true,
          },
          traceSummary: { field: "location" },
        };
      }

      if (input.mode === "policy_blocked") {
        return {
          ok: false,
          error: {
            code: "policy_blocked",
            message: "策略拒绝该用户资料写入。",
            retryable: false,
          },
          traceSummary: { field: "location" },
        };
      }

      return {
        ok: true,
        output: { operationResultId: "operation-result-success", policyDecisionId: "policy-success" },
        toolResultId: "operation-tool-success",
        modelSummary: { title: "已更新训练偏好", location: input.location },
        traceSummary: { operationResultId: "operation-result-success", location: input.location },
      };
    },
  };
}

function createToolExecutionContext(overrides: Partial<AgentToolExecutionContext> = {}): AgentToolExecutionContext {
  return {
    runId: "run-1",
    userId: "user-1",
    sessionId: "chat-1",
    traceId: "trace-1",
    ...overrides,
  };
}

function createTestContextPackage() {
  const builder = createAgentContextBuilder();

  return builder.build({
    latestUserMessage: "不用哑铃了，换一个",
    recentMessages: [
      { id: "m1", role: "user", content: "我想在家练上肢", createdAt: "2026-06-01T01:00:00.000Z" },
    ],
    recentArtifacts: [
      {
        artifactId: "artifact-1",
        revisionId: "revision-1",
        kind: "routine",
        title: "30 分钟哑铃上肢训练",
        summary: "包含哑铃动作。",
        updatedAt: "2026-06-01T01:01:00.000Z",
      },
    ],
    memorySnapshot: {
      snapshotId: "memory-1",
      facts: ["用户在家训练"],
      preferences: ["低冲击"],
      avoidances: ["跳跃"],
    },
  });
}
