import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createExercise } from "./fixtures/domain";
import {
  AgentToolRegistry,
  AgentToolRegistryContractError,
  agentExecutionResultSchema,
  createAgentContextBuilder,
  createLegacyChatEventAdapter,
  createReadonlyAgentToolRegistry,
  parseAgentJsonObject,
  parseAgentToolDecision,
  type AgentToolDefinition,
  type AgentToolExecutionContext,
} from "@/lib/server/agent-orchestrator";

const artifactMocks = vi.hoisted(() => ({
  getArtifactPayload: vi.fn(),
  listRecentArtifacts: vi.fn(),
  searchArtifactsDetailed: vi.fn(),
}));
const exerciseMocks = vi.hoisted(() => ({
  getExerciseById: vi.fn(),
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
    artifactMocks.listRecentArtifacts.mockReset();
    artifactMocks.searchArtifactsDetailed.mockReset();
    exerciseMocks.getExerciseById.mockReset();
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

function createToolExecutionContext(overrides: Partial<AgentToolExecutionContext> = {}): AgentToolExecutionContext {
  return {
    runId: "run-1",
    userId: "user-1",
    sessionId: "chat-1",
    traceId: "trace-1",
    ...overrides,
  };
}
