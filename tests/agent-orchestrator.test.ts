import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createExercise, createWorkoutPlanDraft, createWorkoutPlanIntent, createWorkoutRoutineDraft } from "./fixtures/domain";
import {
  AgentToolRegistry,
  AgentToolRegistryContractError,
  agentExecutionResultSchema,
  createAgentContextBuilder,
  createReadonlyAgentToolRegistry,
  createToolFirstAgentToolRegistry,
  projectAgentExecutionResultToResponse,
  parseAgentJsonObject,
  parseAgentToolDecision,
  runAgentOrchestrator,
  saveConversationArtifactRevisionAgentToolInputSchema,
  validateAgentResponseProjection,
  type AgentWorkoutDraftOutput,
  type AgentToolCapabilityContract,
  type AgentToolDefinition,
  type AgentToolExecutionContext,
} from "@/lib/server/agent-orchestrator";
import { buildPromptFromModules } from "@/lib/server/ai/prompt-config";
import { createAgentChatTokenBudgetDecision } from "@/lib/server/ai/token-budget";

const artifactMocks = vi.hoisted(() => ({
  createConversationArtifactRevision: vi.fn(),
  createOrUpdateConversationArtifact: vi.fn(),
  getActiveArtifactPayload: vi.fn(),
  getArtifactPayload: vi.fn(),
  listRecentArtifacts: vi.fn(),
  searchArtifactsDetailed: vi.fn(),
}));
const exerciseMocks = vi.hoisted(() => ({
  exerciseBodyRegionValues: ["upper_body", "lower_body", "core", "full_body"],
  exerciseMatchesCandidateSetFilters: vi.fn(() => true),
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
          kind: "exercise_recommendation",
          title: "为你推荐的动作",
          summary: "已根据你的条件筛选出 2 个动作。",
          exerciseIds: ["Side_Standing_Long_Jump", "Lateral_Box_Jump"],
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
      kind: "exercise_recommendation",
      exerciseIds: ["Side_Standing_Long_Jump", "Lateral_Box_Jump"],
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

  it("tracks truncation, pending confirmation and ContextSnapshot provenance", () => {
    const builder = createAgentContextBuilder();
    const context = builder.build({
      latestUserMessage: "  ".concat("今天训练安排需要调整".repeat(20)),
      recentMessages: [
        { id: "m-old", role: "user", content: "旧消息不会进入上下文", createdAt: "2026-06-01T00:00:00.000Z" },
        { id: "m-new", role: "assistant", content: "上轮已经生成了一套训练".repeat(20), createdAt: "2026-06-01T00:01:00.000Z" },
      ],
      recentArtifacts: [
        {
          artifactId: "artifact-1",
          revisionId: "rev-1",
          kind: "routine",
          title: "上肢训练",
          summary: "哑铃动作较多".repeat(20),
          exerciseIds: [],
          updatedAt: "2026-06-01T00:02:00.000Z",
        },
      ],
      memorySnapshot: {
        snapshotId: "memory-1",
        facts: ["用户常在家训练"],
        preferences: ["低冲击"],
        avoidances: ["跳跃"],
        updatedAt: "2026-06-01T00:03:00.000Z",
      },
      pendingConfirmation: {
        confirmationId: "confirmation-1",
        status: "pending",
        resourceType: "ConversationArtifact",
        summary: "是否保存为新 revision",
      },
      optionalContextSnapshot: {
        snapshotId: "snapshot-1",
        summary: "长会话摘要，仅供阅读，不作为事实源。",
        sourceMessageIds: ["m-old"],
        trustLevel: "derived_summary",
        factSourceWarning: "snapshot_not_fact_source",
      },
      limits: {
        maxRecentMessages: 1,
        maxRecentArtifacts: 1,
        maxMessageChars: 80,
        maxArtifactSummaryChars: 80,
      },
    });

    expect(context.latestUserMessage.length).toBe(80);
    expect(context.recentMessages).toEqual([
      expect.objectContaining({ id: "m-new", content: expect.stringMatching(/^上轮已经/) }),
    ]);
    expect(context.recentMessages[0].content.length).toBe(80);
    expect(context.recentArtifacts[0].summary?.length).toBe(80);
    expect(context.pendingConfirmation?.confirmationId).toBe("confirmation-1");
    expect(context.optionalContextSnapshot).toMatchObject({
      snapshotId: "snapshot-1",
      factSourceWarning: "snapshot_not_fact_source",
    });
    expect(context.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKind: "latest_user_message", truncationReason: "max_chars" }),
      expect.objectContaining({ sourceKind: "recent_message", sourceId: "m-new", truncationReason: "max_chars" }),
      expect.objectContaining({ sourceKind: "recent_artifact", sourceId: "artifact-1", truncationReason: "max_chars" }),
      expect.objectContaining({ sourceKind: "pending_confirmation", sourceId: "confirmation-1" }),
      expect.objectContaining({ sourceKind: "context_snapshot", sourceId: "snapshot-1", trustLevel: "derived_summary" }),
    ]));
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

  it("normalizes registered tool names used as action into call_tool decisions", () => {
    const registry = createToolFirstAgentToolRegistry();

    expect(parseAgentToolDecision({
      action: "askClarification",
      input: {
        question: "你想重点练胸、背、肩还是手臂？",
        blockingReasons: ["target_missing"],
        assistantSuggestions: [
          { label: "练背", message: "我想重点练背" },
        ],
      },
      reason: "需要澄清目标肌群。",
    }, registry)).toMatchObject({
      ok: true,
      decision: {
        action: "call_tool",
        toolName: "askClarification",
        input: {
          question: "你想重点练胸、背、肩还是手臂？",
        },
      },
    });

    expect(parseAgentToolDecision({
      action: "notRegisteredTool",
      input: {},
      reason: "非法工具。",
    }, registry)).toMatchObject({ ok: false, code: "invalid_decision" });
  });

  it("normalizes legacy blocked final results into the AgentExecutionResult contract", () => {
    const registry = new AgentToolRegistry([createReadTool()]);
    const parsed = parseAgentToolDecision({
      action: "final_result",
      result: {
        status: "blocked",
        replyContext: { reply: "没有找到符合条件的动作候选。" },
        usedToolResultIds: ["tool-result-empty"],
      },
      reason: "候选为空，停止执行。",
    }, registry);

    expect(parsed).toMatchObject({
      ok: true,
      decision: {
        action: "final_result",
        result: {
          status: "blocked",
          blockReason: "没有找到符合条件的动作候选。",
          usedToolResultIds: ["tool-result-empty"],
        },
      },
    });

    if (!parsed.ok || parsed.decision.action !== "final_result") {
      throw new Error("Expected normalized final_result.");
    }

    expect(projectAgentExecutionResultToResponse({
      result: parsed.decision.result,
      toolResults: [{
        toolResultId: "tool-result-empty",
        toolCallId: "tool-call-empty",
        toolName: "searchExercises",
        status: "failed",
      }],
    })).toMatchObject({
      status: "blocked",
      reply: "没有找到符合条件的动作候选。",
      references: expect.arrayContaining([
        { kind: "tool_result", id: "tool-result-empty", resourceRole: "diagnostic" },
        { kind: "blocking_reason", id: "没有找到符合条件的动作候选。" },
      ]),
    });
  });

  it("normalizes legacy failed final results into the AgentExecutionResult contract", () => {
    const registry = new AgentToolRegistry([createReadTool()]);

    expect(parseAgentToolDecision({
      action: "final_result",
      result: {
        status: "failed",
        replyContext: { reply: "生成训练计划时发生错误：输入验证失败。" },
        usedToolResultIds: ["tool-result-invalid"],
      },
      reason: "工具执行失败，停止执行。",
    }, registry)).toMatchObject({
      ok: true,
      decision: {
        action: "final_result",
        result: {
          status: "failed",
          failureCode: "tool_execution_failed",
          usedToolResultIds: ["tool-result-invalid"],
        },
      },
    });
  });

  it("normalizes missing final_result reason only when the result contract is already valid", () => {
    const registry = new AgentToolRegistry([createReadTool()]);

    expect(parseAgentToolDecision({
      action: "final_result",
      result: {
        status: "answered",
        replyContext: { reply: "给你几个弹力带臀腿动作。" },
        usedToolResultIds: ["tool-result-rec"],
      },
    }, registry)).toMatchObject({
      ok: true,
      decision: {
        action: "final_result",
        reason: "模型返回了合法终止结果但缺少 reason，runtime 已补齐诊断原因。",
        result: {
          status: "answered",
          usedToolResultIds: ["tool-result-rec"],
        },
      },
    });

    expect(parseAgentToolDecision({
      action: "final_result",
      result: {
        status: "generated",
        replyContext: { reply: "已生成训练。" },
      },
    }, registry)).toMatchObject({
      ok: false,
      code: "invalid_decision",
    });
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

  it("rejects write tools with incomplete field whitelist or permission contracts", () => {
    expect(() => new AgentToolRegistry([{
      ...createWriteTool(),
      domainCapability: {
        ...createWriteTool().domainCapability!,
        fieldWhitelist: [],
      },
    }])).toThrow(AgentToolRegistryContractError);

    try {
      new AgentToolRegistry([{
        ...createWriteTool(),
        domainCapability: {
          ...createWriteTool().domainCapability!,
          permissionScope: "",
        },
      }]);
      throw new Error("expected registry contract error");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentToolRegistryContractError);
      expect((error as AgentToolRegistryContractError).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "invalid_write_contract" }),
      ]));
    }
  });

  it("parses fenced JSON model output for structured-output fallback providers", () => {
    expect(parseAgentJsonObject("```json\n{\"action\":\"final_result\"}\n```")).toEqual({
      ok: true,
      value: { action: "final_result" },
    });
    expect(parseAgentJsonObject("{broken")).toMatchObject({ ok: false, code: "invalid_json" });
  });

  it("recovers agent decision JSON with trailing object delimiters without bypassing schema", () => {
    const parsedJson = parseAgentJsonObject("{\"action\":\"call_tool\",\"toolName\":\"validateRoutineDraft\",\"input\":{\"draftId\":\"draft_1\",\"candidateSetId\":\"candidate_set_1\",\"candidateExerciseIds\":[\"Push_Up\"],\"intent\":{\"goal\":\"strength\",\"bodyRegions\":[\"upper_body\"],\"durationMinutes\":30,\"equipment\":[\"哑铃\"],\"experience\":\"beginner\",\"sessionType\":\"single\"}},\"reason\":\"生成 draft 成功，需要校验。\"}}");

    expect(parsedJson).toMatchObject({
      ok: true,
      value: {
        action: "call_tool",
        toolName: "validateRoutineDraft",
      },
      recovery: {
        strategy: "balanced_json_object",
        discardedTrailingChars: 1,
      },
    });

    if (!parsedJson.ok) {
      throw new Error("Expected recovered JSON.");
    }

    expect(parseAgentToolDecision(parsedJson.value, createToolFirstAgentToolRegistry())).toMatchObject({
      ok: true,
      decision: {
        action: "call_tool",
        toolName: "validateRoutineDraft",
      },
    });
  });

  it("does not recover ambiguous JSON objects or bypass unknown tool validation", () => {
    expect(parseAgentJsonObject("{\"action\":\"final_result\"}{\"action\":\"call_tool\"}")).toMatchObject({
      ok: false,
      code: "invalid_json",
    });

    const parsedJson = parseAgentJsonObject("{\"action\":\"call_tool\",\"toolName\":\"unknownTool\",\"input\":{},\"reason\":\"尝试调用未知工具\"}}");
    if (!parsedJson.ok) {
      throw new Error("Expected boundary recovery before schema validation.");
    }

    expect(parseAgentToolDecision(parsedJson.value, createToolFirstAgentToolRegistry())).toMatchObject({
      ok: false,
      code: "unknown_tool",
    });
  });
});

describe("agent orchestrator phase 2 readonly tools", () => {
  beforeEach(() => {
    artifactMocks.getArtifactPayload.mockReset();
    artifactMocks.getActiveArtifactPayload.mockReset();
    artifactMocks.createConversationArtifactRevision.mockReset();
    artifactMocks.createOrUpdateConversationArtifact.mockReset();
    artifactMocks.listRecentArtifacts.mockReset();
    artifactMocks.searchArtifactsDetailed.mockReset();
    exerciseMocks.getExerciseById.mockReset();
    exerciseMocks.exerciseMatchesCandidateSetFilters.mockReset();
    exerciseMocks.exerciseMatchesCandidateSetFilters.mockReturnValue(true);
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
      "queryUserMemory",
      "resolveArtifactReference",
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
    expect(artifactMocks.getActiveArtifactPayload).not.toHaveBeenCalled();
  });

  it("reads artifact payload through active revision resolution and exposes revision summary", async () => {
    artifactMocks.getActiveArtifactPayload.mockResolvedValue({
      ok: true,
      artifactId: "artifact-active",
      requestedArtifactId: "artifact-old",
      revisionResolution: {
        status: "resolved_to_active",
        requestedArtifactId: "artifact-old",
        activeArtifactId: "artifact-active",
      },
      kind: "exercise_recommendation",
      payload: createRecommendationArtifactPayload(["push-up"]),
    });
    const registry = createReadonlyAgentToolRegistry();
    const payloadTool = registry.get("getArtifactPayload");

    const result = await payloadTool?.execute({ artifactId: "artifact-old" }, createToolExecutionContext());

    expect(artifactMocks.getActiveArtifactPayload).toHaveBeenCalledWith({
      userId: "user-1",
      artifactId: "artifact-old",
    });
    expect(artifactMocks.getArtifactPayload).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      output: {
        artifactId: "artifact-active",
        requestedArtifactId: "artifact-old",
        revisionResolution: {
          status: "resolved_to_active",
          activeArtifactId: "artifact-active",
        },
      },
      modelSummary: {
        requestedArtifactId: "artifact-old",
        activeArtifactId: "artifact-active",
        revisionResolution: "resolved_to_active",
      },
      traceSummary: {
        revisionResolution: {
          status: "resolved_to_active",
          requestedArtifactId: "artifact-old",
          activeArtifactId: "artifact-active",
        },
      },
    });
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

  it("exposes controlled exercise facets in the searchExercises tool definition", () => {
    const registry = createReadonlyAgentToolRegistry();
    const searchTool = registry.listModelDefinitions().find((tool) => tool.name === "searchExercises");

    expect(searchTool?.description).toContain("bodyRegions 可用 upper_body/lower_body/core/full_body");
    expect(searchTool?.description).toContain("allowedSections 可用 warmup/training/stretch");
    expect(searchTool?.description).toContain("filters.homeRequirements=[\"no_equipment\"]");
    expect(searchTool?.description).toContain("弹力带");
    expect(searchTool?.description).toContain("臀部、股四头肌、腘绳肌");
    expect(searchTool?.capabilityContract).toMatchObject({
      operationKind: "structured_search",
      supportedOperations: ["build_exercise_candidate_set"],
      inputContract: expect.objectContaining({
        requiredFields: expect.arrayContaining([
          "operation for executable candidateUse",
          "filters for executable candidateUse",
          "resultRequirements for routine/plan/patch",
        ]),
        hardConstraintFields: expect.arrayContaining(["filters.bodyRegions", "filters.equipment", "filters.allowedSections"]),
        resultRequirementFields: expect.arrayContaining(["minCandidates", "sectionCoverage", "requireProof"]),
      }),
    });
    expect(searchTool?.toolRequestContractSummary).toMatchObject({
      supportedOperations: ["build_exercise_candidate_set"],
      hardConstraints: expect.arrayContaining(["filters.bodyRegions", "filters.equipment", "filters.allowedSections"]),
      resultRequirements: expect.arrayContaining(["minCandidates", "sectionCoverage", "requireProof"]),
      projection: expect.any(Array),
    });
  });

  it("defaults executable recommendation search to no-equipment when equipment is unspecified", async () => {
    const pushUp = createExercise({ id: "push-up", nameZh: "俯卧撑" });
    exerciseMocks.searchExercises.mockResolvedValue(createMockExerciseSearchResult({
      candidates: [pushUp],
      candidateUse: "recommendation",
      appliedFilters: {
        visibility: "published",
        bodyRegions: ["upper_body"],
        homeRequirements: ["no_equipment"],
      },
    }));
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("searchExercises")?.execute(
      {
        operation: "build_exercise_candidate_set",
        candidateUse: "recommendation",
        filters: {
          bodyRegions: ["upper_body"],
          visibility: "published",
        },
        limit: 6,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        candidateUse: "recommendation",
        candidates: [expect.objectContaining({ id: "push-up" })],
        candidateSetEvidence: expect.objectContaining({
          appliedFilters: expect.objectContaining({
            homeRequirements: ["no_equipment"],
          }),
        }),
      },
    });
    expect(exerciseMocks.searchExercises).toHaveBeenCalledWith(expect.objectContaining({
      candidateUse: "recommendation",
      filters: expect.objectContaining({
        homeRequirements: ["no_equipment"],
      }),
      homeRequirements: ["no_equipment"],
    }));
  });

  it("does not overwrite explicit available equipment with the no-equipment default", async () => {
    const dumbbellRow = createExercise({
      id: "dumbbell-row",
      nameZh: "哑铃划船",
      equipment: "dumbbell",
      equipmentZh: "哑铃",
    });
    exerciseMocks.searchExercises.mockResolvedValue(createMockExerciseSearchResult({
      candidates: [dumbbellRow],
      candidateUse: "routine",
      appliedFilters: {
        visibility: "published",
        bodyRegions: ["upper_body"],
        equipmentRequired: ["dumbbell"],
      },
    }));
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("searchExercises")?.execute(
      {
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        filters: {
          bodyRegions: ["upper_body"],
          equipment: { in: ["dumbbell"] },
          visibility: "published",
        },
        resultRequirements: {
          minCandidates: 1,
          requireProof: true,
        },
        limit: 6,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({ ok: true });
    expect(exerciseMocks.searchExercises).toHaveBeenCalledWith(expect.objectContaining({
      equipmentRequired: ["dumbbell"],
      filters: expect.objectContaining({
        equipment: { in: ["dumbbell"] },
      }),
    }));
    expect(exerciseMocks.searchExercises).not.toHaveBeenCalledWith(expect.objectContaining({
      homeRequirements: ["no_equipment"],
    }));
  });

  it("lets current structured no-equipment input override confirmed equipment memory", async () => {
    const pushUp = createExercise({ id: "push-up", nameZh: "俯卧撑" });
    exerciseMocks.searchExercises.mockResolvedValue(createMockExerciseSearchResult({
      candidates: [pushUp],
      candidateUse: "routine",
      appliedFilters: {
        visibility: "published",
        bodyRegions: ["upper_body"],
        homeRequirements: ["no_equipment"],
      },
    }));
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("searchExercises")?.execute(
      {
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        filters: {
          bodyRegions: ["upper_body"],
          homeRequirements: ["no_equipment"],
          visibility: "published",
        },
        resultRequirements: {
          minCandidates: 1,
          requireProof: true,
        },
      },
      createToolExecutionContext({
        contextPackage: createTestContextPackage({
          memorySnapshot: {
            snapshotId: "memory-equipment",
            facts: [],
            preferences: [],
            avoidances: [],
            equipment: ["哑铃"],
          },
        }),
      }),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        candidateSetEvidence: expect.objectContaining({
          appliedFilters: expect.objectContaining({
            homeRequirements: ["no_equipment"],
          }),
        }),
      },
    });
    expect(exerciseMocks.searchExercises).toHaveBeenCalledWith(expect.objectContaining({
      homeRequirements: ["no_equipment"],
    }));
  });

  it("preserves confirmed available equipment context instead of applying the no-equipment default", async () => {
    const dumbbellRow = createExercise({
      id: "dumbbell-row",
      nameZh: "哑铃划船",
      equipment: "dumbbell",
      equipmentZh: "哑铃",
    });
    exerciseMocks.searchExercises.mockResolvedValue(createMockExerciseSearchResult({
      candidates: [dumbbellRow],
      candidateUse: "routine",
      appliedFilters: {
        visibility: "published",
        bodyRegions: ["upper_body"],
      },
    }));
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("searchExercises")?.execute(
      {
        operation: "build_exercise_candidate_set",
        candidateUse: "routine",
        filters: {
          bodyRegions: ["upper_body"],
          visibility: "published",
        },
        resultRequirements: {
          minCandidates: 1,
          requireProof: true,
        },
      },
      createToolExecutionContext({
        contextPackage: createTestContextPackage({
          memorySnapshot: {
            snapshotId: "memory-equipment",
            facts: [],
            preferences: [],
            avoidances: [],
            equipment: ["哑铃"],
          },
        }),
      }),
    )).resolves.toMatchObject({ ok: true });
    expect(exerciseMocks.searchExercises).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.not.objectContaining({
        homeRequirements: ["no_equipment"],
      }),
    }));
    expect(exerciseMocks.searchExercises).not.toHaveBeenCalledWith(expect.objectContaining({
      homeRequirements: ["no_equipment"],
    }));
  });

  it("recovers searchExercises once when structured facet diagnostics provide retry suggestions", async () => {
    const exercise = createExercise({
      id: "dumbbell-curl",
      nameZh: "哑铃弯举",
      equipment: "dumbbell",
      equipmentZh: "哑铃",
      primaryMusclesZh: ["肱二头肌"],
    });
    exerciseMocks.searchExercises
      .mockResolvedValueOnce({
        candidates: [],
        diagnostics: {
          query: undefined,
          filters: {
            visibility: "published",
            candidateUse: "answer_only",
            targetMuscles: ["upper body"],
            equipment: ["dumbbell"],
          },
          expandedTargetMuscles: [],
          recalledCount: 0,
          filteredCount: 1,
          rerank: [],
          finalExerciseIds: [],
          failureReasons: ["no_exercise_after_filters", "unknown_target_muscle"],
          unmatchedTargetMuscles: ["upper body"],
          unmatchedEquipment: [],
          suggestedTargetMuscles: ["肱二头肌"],
          suggestedEquipment: [],
          retryable: true,
        },
      })
      .mockResolvedValueOnce({
        candidates: [exercise],
        diagnostics: {
          query: undefined,
          filters: {
            visibility: "published",
            candidateUse: "answer_only",
            targetMuscles: ["肱二头肌"],
            equipment: ["dumbbell"],
          },
          expandedTargetMuscles: [],
          recalledCount: 1,
          filteredCount: 0,
          rerank: [],
          finalExerciseIds: ["dumbbell-curl"],
          failureReasons: [],
          unmatchedTargetMuscles: [],
          unmatchedEquipment: [],
          suggestedTargetMuscles: [],
          suggestedEquipment: [],
          retryable: false,
        },
      });
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("searchExercises")?.execute(
      {
        candidateUse: "answer_only",
        targetMuscles: ["upper body"],
        equipment: ["dumbbell"],
        visibility: "published",
        limit: 8,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        candidates: [expect.objectContaining({ id: "dumbbell-curl" })],
        diagnostics: expect.objectContaining({
          recoveredFrom: expect.objectContaining({
            unmatchedTargetMuscles: ["upper body"],
          }),
        }),
      },
    });
    expect(exerciseMocks.searchExercises).toHaveBeenCalledTimes(2);
    expect(exerciseMocks.searchExercises).toHaveBeenLastCalledWith(expect.objectContaining({
      targetMuscles: ["肱二头肌"],
      equipment: ["dumbbell"],
    }));
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
        equipment: ["自重"],
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

  it("returns structured ambiguity when resolving an artifact reference is not unique", async () => {
    artifactMocks.searchArtifactsDetailed.mockResolvedValue({
      candidates: [
        {
          artifactId: "artifact-1",
          kind: "routine",
          title: "上肢训练 A",
          exerciseIds: [],
          goals: [],
          muscles: [],
          equipment: [],
          updatedAt: "2026-06-01T01:00:00.000Z",
        },
        {
          artifactId: "artifact-2",
          kind: "routine",
          title: "上肢训练 B",
          exerciseIds: [],
          goals: [],
          muscles: [],
          equipment: [],
          updatedAt: "2026-06-01T02:00:00.000Z",
        },
      ],
      diagnostics: {
        query: undefined,
        filters: { userId: "user-1", sessionId: "chat-1", kind: "routine" },
        recalledCount: 2,
        filteredCount: 0,
        rerank: [],
        finalCandidateIds: ["artifact-1", "artifact-2"],
        failureReasons: [],
      },
    });
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("resolveArtifactReference")?.execute(
      {
        operation: "resolve_artifact_reference",
        referenceKind: "latest",
        kind: "routine",
        requireUnique: true,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "ambiguous_resource",
        detail: expect.objectContaining({
          ambiguousCandidateIds: ["artifact-1", "artifact-2"],
        }),
      },
    });
  });

  it("returns unverifiable_result when structured user memory query has no coverage", async () => {
    prismaMocks.userMemory.findMany.mockResolvedValue([]);
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("queryUserMemory")?.execute(
      {
        operation: "query_user_memory",
        filters: {
          kind: ["constraint"],
          subjectType: ["equipment"],
          confirmed: true,
        },
        limit: 5,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "unverifiable_result",
        detail: expect.objectContaining({
          coverageDiagnostics: expect.objectContaining({
            matchedCount: 0,
            unverifiable: true,
          }),
        }),
      },
    });
  });

  it("resolves unique artifact references and returns query user memory matches", async () => {
    artifactMocks.searchArtifactsDetailed.mockResolvedValue({
      candidates: [
        {
          artifactId: "artifact-1",
          kind: "routine",
          title: "上肢训练",
          exerciseIds: ["push-up"],
          goals: ["胸肌训练"],
          muscles: ["胸部"],
          equipment: ["自重"],
          updatedAt: "2026-06-01T01:00:00.000Z",
        },
      ],
      diagnostics: {
        query: undefined,
        filters: { userId: "user-1", sessionId: "chat-1", kind: "routine" },
        recalledCount: 1,
        filteredCount: 0,
        rerank: [],
        finalCandidateIds: ["artifact-1"],
        failureReasons: [],
      },
    });
    prismaMocks.userMemory.findMany.mockResolvedValue([
      {
        id: "memory-1",
        kind: "explicit_preference",
        subjectType: "equipment",
        subjectId: null,
        subjectLabel: "自重",
        value: { text: "用户偏好自重训练。" },
        source: "chat",
        status: "active",
        requiresConfirmation: false,
        updatedAt: new Date("2026-06-01T02:00:00.000Z"),
      },
    ]);
    const registry = createReadonlyAgentToolRegistry();

    await expect(registry.get("resolveArtifactReference")?.execute(
      {
        operation: "resolve_artifact_reference",
        referenceKind: "latest",
        kind: "routine",
        requireUnique: true,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        artifactReferenceId: expect.stringMatching(/^artifact_reference_/),
        artifactId: "artifact-1",
      },
    });

    await expect(registry.get("queryUserMemory")?.execute(
      {
        operation: "query_user_memory",
        filters: {
          kind: ["explicit_preference"],
          subjectType: ["equipment"],
          confirmed: true,
          source: ["chat"],
        },
        projection: { includeValue: true },
        limit: 5,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        memoryQueryId: expect.stringMatching(/^memory_query_/),
        matchedMemories: [
          expect.objectContaining({
            memoryId: "memory-1",
            subjectLabel: "自重",
            confirmed: true,
            value: { text: "用户偏好自重训练。" },
          }),
        ],
        coverageDiagnostics: {
          matchedCount: 1,
          limit: 5,
          unverifiable: false,
          snapshotFreshness: "2026-06-01T02:00:00.000Z",
        },
      },
    });
    expect(prismaMocks.userMemory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        kind: { in: ["explicit_preference"] },
        subjectType: { in: ["equipment"] },
        requiresConfirmation: false,
      }),
    }));
  });
});

describe("agent orchestrator phase 3 workout tools", () => {
  beforeEach(() => {
    artifactMocks.createConversationArtifactRevision.mockReset();
    artifactMocks.createOrUpdateConversationArtifact.mockReset();
    artifactMocks.getArtifactPayload.mockReset();
    artifactMocks.getActiveArtifactPayload.mockReset();
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
      error: { code: "missing_required_parameter" },
    });
    expect(exerciseMocks.searchExercises).not.toHaveBeenCalled();
  });

  it("creates edit plans and clarification outputs as standalone tool results", async () => {
    const registry = createToolFirstAgentToolRegistry();
    const editPlanInput = {
      targetArtifactId: "artifact-1",
      sourceArtifactPayloadId: "payload-1",
      allowedArtifactPayloadIds: ["payload-1"],
      requestedChangeSummary: "不用哑铃了，替换为自重动作。",
      preserve: [{ kind: "duration", summary: "保留 30 分钟训练时长。" }],
      changes: [{ kind: "equipment", summary: "排除哑铃，改为自重动作。" }],
      scope: "whole_routine",
      strategy: "patch",
      requiredCandidateSetIds: ["candidate-set-patch"],
      confirmationLevel: "none",
    } as const;

    await expect(registry.get("proposeWorkoutEditPlan")?.execute(
      editPlanInput,
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        editPlanId: expect.stringMatching(/^edit_plan_/),
        targetArtifactId: "artifact-1",
        sourceArtifactPayloadId: "payload-1",
        changes: [expect.objectContaining({ kind: "equipment" })],
      },
      modelSummary: expect.objectContaining({
        editPlanId: expect.stringMatching(/^edit_plan_/),
      }),
    });

    await expect(registry.get("proposeWorkoutEditPlan")?.execute(
      {
        ...editPlanInput,
        sourceArtifactPayloadId: "payload-outside",
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_dependency",
        detail: { sourceArtifactPayloadId: "payload-outside" },
      },
    });

    await expect(registry.get("askClarification")?.execute(
      {
        question: "这次训练想重点练哪个部位？",
        blockingReasons: ["缺少目标部位，无法生成可靠训练。"],
        assistantSuggestions: [
          { label: "练胸", message: "今天练胸，20分钟。" },
          { label: "练腿", message: "今天练腿，20分钟。" },
        ],
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        question: "这次训练想重点练哪个部位？",
        blockingReasons: ["缺少目标部位，无法生成可靠训练。"],
        assistantSuggestions: [
          { label: "练胸", message: "今天练胸，20分钟。" },
          { label: "练腿", message: "今天练腿，20分钟。" },
        ],
      },
      toolResultId: expect.stringMatching(/^tool_result_/),
    });
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
    }, createCandidateSetContext("candidate-set-1", ["warmup", "push-up", "stretch"]));

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

    if (!result?.ok) {
      throw new Error("expected generateRoutineDraft to succeed");
    }

    const draftOutput = result.output as Extract<AgentWorkoutDraftOutput, { draftKind: "routine" }>;
    expect(draftOutput.draft.summary).toBe("围绕胸肌训练安排了热身、主训练和拉伸，器械按自重处理，适合约 12 分钟完成。");
    expect(draftOutput.draft.summary).not.toMatch(/受控候选|Validator|Policy|展示或保存前/);
  });

  it("defaults unspecified routine intent equipment to no-equipment when candidates prove that boundary", async () => {
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
      intent: createWorkoutPlanIntent({ intentType: "routine", sessionMinutes: 30, equipment: [] }),
      candidateSetId: "candidate-set-no-equipment-routine",
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
    }, createCandidateSetContext(
      "candidate-set-no-equipment-routine",
      ["warmup", "push-up", "stretch"],
      {},
      "routine",
    ));

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        validation: { valid: true },
        draft: {
          summary: expect.stringContaining("器械按自重处理"),
        },
      },
    });
  });

  it("rejects partial candidate sets before routine draft generation", async () => {
    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({ intentType: "routine", sessionMinutes: 30 }),
      candidateSetId: "candidate-set-partial",
      candidateExerciseIds: ["dumbbell-row"],
    }, createToolExecutionContext({
      toolResults: [createPartialCandidateSetToolResult("candidate-set-partial", ["dumbbell-row"])],
    }));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_dependency",
        detail: expect.objectContaining({
          candidateSetId: "candidate-set-partial",
          resourceRole: "partial",
          satisfied: false,
        }),
      },
    });
  });

  it("uses controlled supplemental section evidence when building routine drafts", async () => {
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "Dumbbell_Row",
        nameZh: "哑铃划船",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        allowedSections: ["training"],
      }),
      createExercise({
        id: "Dynamic_Back_Stretch",
        nameZh: "动态背部拉伸",
        categoryZh: "拉伸",
        equipment: "bodyweight",
        equipmentZh: "自重",
        allowedSections: ["warmup", "stretch"],
        intensityRole: "recovery",
      }),
      createExercise({
        id: "Dynamic_Chest_Stretch",
        nameZh: "动态胸部拉伸",
        categoryZh: "拉伸",
        equipment: "bodyweight",
        equipmentZh: "自重",
        allowedSections: ["warmup", "stretch"],
        intensityRole: "recovery",
      }),
      createExercise({
        id: "Triceps_Stretch",
        nameZh: "三头肌拉伸",
        categoryZh: "拉伸",
        equipment: "bodyweight",
        equipmentZh: "自重",
        allowedSections: ["stretch"],
        intensityRole: "recovery",
      }),
    ]);
    const candidateExerciseIds = [
      "Dumbbell_Row",
      "Dynamic_Back_Stretch",
      "Dynamic_Chest_Stretch",
      "Triceps_Stretch",
    ];
    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "上肢训练",
        equipment: ["dumbbell"],
        sessionMinutes: 30,
      }),
      candidateSetId: "candidate-set-upper-dumbbell",
      candidateExerciseIds,
      title: "上肢哑铃训练",
    }, createToolExecutionContext({
      toolResults: [
        createCandidateSetToolResult(
          "candidate-set-upper-dumbbell",
          candidateExerciseIds,
          "routine",
          {
            controlledSupplementalCandidates: [
              {
                exerciseId: "Dynamic_Back_Stretch",
                section: "warmup",
                appliedFilters: { allowedSections: ["warmup"], equipmentAvoided: ["dumbbell"] },
                reason: "section_coverage_supplement",
              },
              {
                exerciseId: "Dynamic_Chest_Stretch",
                section: "warmup",
                appliedFilters: { allowedSections: ["warmup"], equipmentAvoided: ["dumbbell"] },
                reason: "section_coverage_supplement",
              },
              {
                exerciseId: "Triceps_Stretch",
                section: "stretch",
                appliedFilters: { allowedSections: ["stretch"], equipmentAvoided: ["dumbbell"] },
                reason: "section_coverage_supplement",
              },
            ],
          },
        ),
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        validation: { valid: true },
      },
    });

    if (!result?.ok) {
      throw new Error("expected generateRoutineDraft to succeed");
    }

    const draftOutput = result.output as Extract<AgentWorkoutDraftOutput, { draftKind: "routine" }>;
    expect(draftOutput.draft.sections.find((section) => section.section === "warmup")?.items.map((item) => item.exerciseId)).toEqual([
      "Dynamic_Back_Stretch",
      "Dynamic_Chest_Stretch",
    ]);
    expect(draftOutput.draft.sections.find((section) => section.section === "training")?.items.map((item) => item.exerciseId)).toEqual([
      "Dumbbell_Row",
    ]);
    expect(draftOutput.draft.sections.find((section) => section.section === "stretch")?.items.map((item) => item.exerciseId)).toEqual([
      "Triceps_Stretch",
    ]);
  });

  it("prefers no-equipment warmup and stretch supplements over routine intent equipment", async () => {
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "Dumbbell_Row",
        nameZh: "哑铃划船",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        allowedSections: ["training"],
      }),
      createExercise({
        id: "Dumbbell_Warmup",
        nameZh: "哑铃热身绕环",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        allowedSections: ["warmup"],
        intensityRole: "activation",
      }),
      createExercise({
        id: "Bodyweight_Warmup",
        nameZh: "肩部环绕",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        allowedSections: ["warmup"],
        intensityRole: "activation",
      }),
      createExercise({
        id: "Dumbbell_Stretch",
        nameZh: "哑铃辅助胸部拉伸",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        allowedSections: ["stretch"],
        intensityRole: "recovery",
      }),
      createExercise({
        id: "Bodyweight_Stretch",
        nameZh: "胸大肌拉伸",
        equipment: "bodyweight",
        equipmentZh: "自重",
        homeRequirement: "no_equipment",
        homeRequirementZh: "无器械",
        allowedSections: ["stretch"],
        intensityRole: "recovery",
      }),
    ]);
    const registry = createToolFirstAgentToolRegistry();
    const candidateSetExerciseIds = [
      "Dumbbell_Row",
      "Dumbbell_Warmup",
      "Bodyweight_Warmup",
      "Dumbbell_Stretch",
      "Bodyweight_Stretch",
    ];
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "上肢训练",
        equipment: ["dumbbell"],
        sessionMinutes: 30,
      }),
      candidateSetId: "candidate-set-section-equipment",
      candidateExerciseIds: ["Dumbbell_Row"],
      title: "上肢哑铃训练",
    }, createCandidateSetContext("candidate-set-section-equipment", candidateSetExerciseIds));

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        validation: { valid: true },
      },
    });

    if (!result?.ok) {
      throw new Error("expected generateRoutineDraft to succeed");
    }

    const draftOutput = result.output as Extract<AgentWorkoutDraftOutput, { draftKind: "routine" }>;
    expect(draftOutput.draft.sections.find((section) => section.section === "warmup")?.items.map((item) => item.exerciseId)).toEqual([
      "Bodyweight_Warmup",
    ]);
    expect(draftOutput.draft.sections.find((section) => section.section === "stretch")?.items.map((item) => item.exerciseId)).toEqual([
      "Bodyweight_Stretch",
    ]);
  });

  it("keeps every specified routine candidate and supplements missing routine sections", async () => {
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "Band_Warmup",
        nameZh: "弹力带动态热身",
        equipment: "bands",
        equipmentZh: "弹力带",
        allowedSections: ["warmup"],
        intensityRole: "activation",
      }),
      createExercise({ id: "Hip_Lift_with_Band", nameZh: "弹力带髋部抬起", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({ id: "Hip_Flexion_with_Band", nameZh: "弹力带髋屈曲", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({ id: "Squats_-_With_Bands", nameZh: "弹力带深蹲", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({ id: "Calf_Raises_-_With_Bands", nameZh: "弹力带提踵", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({ id: "Band_Good_Morning", nameZh: "弹力带早安式", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({ id: "Band_Good_Morning_Pull_Through", nameZh: "弹力带早安式（拉穿）", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({ id: "Hip_Extension_with_Bands", nameZh: "弹力带髋伸展", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({
        id: "Hamstring_Stretch",
        nameZh: "腘绳肌拉伸",
        equipment: "bands",
        equipmentZh: "弹力带",
        allowedSections: ["stretch"],
        intensityRole: "recovery",
      }),
    ]);

    const specifiedIds = [
      "Hip_Lift_with_Band",
      "Hip_Flexion_with_Band",
      "Squats_-_With_Bands",
      "Calf_Raises_-_With_Bands",
      "Band_Good_Morning",
      "Band_Good_Morning_Pull_Through",
      "Hip_Extension_with_Bands",
      "Hamstring_Stretch",
    ];
    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        equipment: ["弹力带"],
        sessionMinutes: 30,
      }),
      candidateSetId: "candidate-set-1",
      candidateExerciseIds: specifiedIds,
      title: "弹力带臀腿训练",
    }, createCandidateSetContext("candidate-set-1", ["Band_Warmup", ...specifiedIds]));

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        validation: { valid: true },
        candidateExerciseIds: expect.arrayContaining(["Band_Warmup", ...specifiedIds]),
      },
    });

    if (!result?.ok) {
      throw new Error("expected generateRoutineDraft to succeed");
    }

    const draftOutput = result.output as Extract<AgentWorkoutDraftOutput, { draftKind: "routine" }>;
    const trainingExerciseIds = draftOutput.draft.sections
      .find((section) => section.section === "training")
      ?.items.map((item) => item.exerciseId);
    const warmupExerciseIds = draftOutput.draft.sections
      .find((section) => section.section === "warmup")
      ?.items.map((item) => item.exerciseId);
    const stretchExerciseIds = draftOutput.draft.sections
      .find((section) => section.section === "stretch")
      ?.items.map((item) => item.exerciseId);

    expect(trainingExerciseIds).toEqual(expect.arrayContaining(specifiedIds.slice(0, 7)));
    expect(warmupExerciseIds).toEqual(["Band_Warmup"]);
    expect(stretchExerciseIds).toEqual(["Hamstring_Stretch"]);
  });

  it("keeps every required exercise from a source recommendation artifact", async () => {
    const requiredIds = [
      "Side_Standing_Long_Jump",
      "Lateral_Box_Jump",
      "Lateral_Bound",
      "Side_Hop-Sprint",
      "Lateral_Cone_Hops",
      "Vertical_Swing",
      "Sledgehammer_Swings",
      "Thigh_Adductor",
    ];
    artifactMocks.getActiveArtifactPayload.mockResolvedValue({
      ok: true,
      artifactId: "artifact-rec-active",
      requestedArtifactId: "artifact-rec-1",
      revisionResolution: {
        status: "resolved_to_active",
        requestedArtifactId: "artifact-rec-1",
        activeArtifactId: "artifact-rec-active",
      },
      kind: "exercise_recommendation",
      payload: createRecommendationArtifactPayload(requiredIds),
    });
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "Warmup_March",
        nameZh: "动态原地踏步",
        allowedSections: ["warmup"],
        intensityRole: "activation",
      }),
      ...requiredIds.map((id) => createExercise({
        id,
        nameZh: id,
        allowedSections: ["training"],
        primaryMusclesZh: ["臀部"],
      })),
      createExercise({
        id: "Cooldown_Stretch",
        nameZh: "下肢拉伸",
        allowedSections: ["stretch"],
        intensityRole: "recovery",
      }),
    ]);

    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "臀腿训练",
        sessionMinutes: 30,
      }),
      candidateSetId: "candidate-set-artifact-1",
      candidateExerciseIds: requiredIds,
      sourceArtifactId: "artifact-rec-1",
      requiredExerciseIds: requiredIds,
      title: "臀腿训练 30分钟",
    }, createCandidateSetContext("candidate-set-artifact-1", ["Warmup_March", ...requiredIds, "Cooldown_Stretch"]));

    expect(artifactMocks.getActiveArtifactPayload).toHaveBeenCalledWith({
      userId: "user-1",
      artifactId: "artifact-rec-1",
    });
    expect(artifactMocks.getArtifactPayload).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        sourceArtifactId: "artifact-rec-1",
        activeSourceArtifactId: "artifact-rec-active",
        sourceArtifactRevisionResolution: {
          status: "resolved_to_active",
          requestedArtifactId: "artifact-rec-1",
          activeArtifactId: "artifact-rec-active",
        },
        requiredExerciseIds: requiredIds,
        candidateExerciseIds: expect.arrayContaining(["Warmup_March", ...requiredIds, "Cooldown_Stretch"]),
        validation: { valid: true },
      },
    });

    if (!result?.ok) {
      throw new Error("expected artifact-bound generateRoutineDraft to succeed");
    }

    const draftOutput = result.output as Extract<AgentWorkoutDraftOutput, { draftKind: "routine" }>;
    const allDraftExerciseIds = draftOutput.draft.sections.flatMap((section) => section.items.map((item) => item.exerciseId));

    expect(allDraftExerciseIds).toEqual(expect.arrayContaining(requiredIds));
  });

  it("rejects artifact-bound routine required exercises outside the source artifact", async () => {
    artifactMocks.getActiveArtifactPayload.mockResolvedValue({
      ok: true,
      artifactId: "artifact-rec-1",
      requestedArtifactId: "artifact-rec-1",
      revisionResolution: {
        status: "direct",
        requestedArtifactId: "artifact-rec-1",
        activeArtifactId: "artifact-rec-1",
      },
      kind: "exercise_recommendation",
      payload: createRecommendationArtifactPayload(["Side_Standing_Long_Jump"]),
    });

    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "臀腿训练",
        sessionMinutes: 30,
      }),
      candidateSetId: "candidate-set-artifact-1",
      candidateExerciseIds: ["Side_Standing_Long_Jump"],
      sourceArtifactId: "artifact-rec-1",
      requiredExerciseIds: ["Side_Standing_Long_Jump", "Otis-Up"],
      title: "臀腿训练 30分钟",
    }, createCandidateSetContext("candidate-set-artifact-1", ["Side_Standing_Long_Jump", "Otis-Up"]));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_dependency",
        detail: expect.objectContaining({
          sourceArtifactId: "artifact-rec-1",
          outsideArtifactIds: ["Otis-Up"],
        }),
      },
    });
    expect(exerciseMocks.listAllExercises).not.toHaveBeenCalled();
  });

  it("fails when a routine candidate set cannot cover required warmup and stretch sections", async () => {
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "Band_Warmup",
        nameZh: "弹力带动态热身",
        equipment: "bands",
        equipmentZh: "弹力带",
        allowedSections: ["warmup"],
        intensityRole: "activation",
      }),
      createExercise({ id: "Squats_-_With_Bands", nameZh: "弹力带深蹲", equipment: "bands", equipmentZh: "弹力带", allowedSections: ["training"] }),
      createExercise({
        id: "Band_Stretch",
        nameZh: "弹力带臀腿拉伸",
        equipment: "bands",
        equipmentZh: "弹力带",
        allowedSections: ["stretch"],
        intensityRole: "recovery",
      }),
    ]);

    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        equipment: ["弹力带"],
        sessionMinutes: 15,
      }),
      candidateSetId: "candidate-set-1",
      candidateExerciseIds: ["Squats_-_With_Bands"],
    }, createCandidateSetContext("candidate-set-1", ["Squats_-_With_Bands"]));

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "result_requirement_unmet",
      },
    });
  });

  it("ignores partial model draft payloads when validating generated routine resources", async () => {
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
    const intent = createWorkoutPlanIntent({ intentType: "routine", sessionMinutes: 12 });
    const generation = await registry.get("generateRoutineDraft")?.execute({
      intent,
      candidateSetId: "candidate-set-1",
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      title: "上肢哑铃训练",
    }, createCandidateSetContext("candidate-set-1", ["warmup", "push-up", "stretch"]));

    expect(generation).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        validation: { valid: true },
      },
    });

    if (!generation?.ok) {
      throw new Error("expected generateRoutineDraft to succeed");
    }

    const draftOutput = generation.output as Extract<AgentWorkoutDraftOutput, { draftKind: "routine" }>;
    const validation = await registry.get("validateRoutineDraft")?.execute({
      draftId: draftOutput.draftId,
      candidateSetId: draftOutput.candidateSetId,
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      intent,
      draft: {
        title: "上肢哑铃训练",
        sections: [
          { sectionType: "warmup" },
          {
            sectionType: "training",
            exercises: [
              {
                exerciseId: "push-up",
                sets: 3,
                reps: 12,
                restSeconds: 60,
              },
            ],
          },
          { sectionType: "stretch" },
        ],
      },
    }, createToolExecutionContext({
      toolResults: [
        createCandidateSetToolResult(draftOutput.candidateSetId, ["warmup", "push-up", "stretch"]),
        {
          toolResultId: generation.toolResultId,
          toolCallId: "tool-call-generate-routine",
          toolName: "generateRoutineDraft",
          status: "success",
          draftId: draftOutput.draftId,
          candidateSetId: draftOutput.candidateSetId,
          output: draftOutput,
        },
      ],
    }));

    expect(validation).toMatchObject({
      ok: true,
      output: {
        valid: true,
        draftId: draftOutput.draftId,
        candidateSetId: draftOutput.candidateSetId,
      },
    });
  });

  it("defaults routine-only intent contract fields before generating routine drafts", async () => {
    exerciseMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "warmup",
        nameZh: "肩部绕环",
        categoryZh: "热身",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        allowedSections: ["warmup"],
      }),
      createExercise({
        id: "dumbbell-row",
        nameZh: "哑铃划船",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        allowedSections: ["training"],
      }),
      createExercise({
        id: "stretch",
        nameZh: "胸肩拉伸",
        categoryZh: "拉伸",
        equipment: "dumbbell",
        equipmentZh: "哑铃",
        allowedSections: ["stretch"],
      }),
    ]);
    const registry = createToolFirstAgentToolRegistry();
    const result = await registry.get("generateRoutineDraft")?.execute({
      intent: {
        goal: "strength",
        bodyRegions: ["upper_body"],
        sessionMinutes: 30,
        equipment: ["dumbbell"],
        sections: ["warmup", "training", "stretch"],
      },
      candidateSetId: "candidate-set-upper-body",
      candidateExerciseIds: ["warmup", "dumbbell-row", "stretch"],
      title: "上肢训练 30 分钟 - 哑铃",
    }, createCandidateSetContext("candidate-set-upper-body", ["warmup", "dumbbell-row", "stretch"]));

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "routine",
        validation: { valid: true },
        draft: {
          title: "上肢训练 30 分钟 - 哑铃",
          estimatedSessionMinutes: 30,
          trainingLoopRounds: 2,
        },
      },
    });
  });

  it("generates plan drafts from current candidate ids without a source artifact", async () => {
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
    const intent = createWorkoutPlanIntent({
      intentType: "plan",
      goal: "胸肌训练",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      calendarHorizonDays: 6,
    });
    const result = await registry.get("generatePlanDraft")?.execute({
      intent,
      candidateSetId: "candidate-set-plan",
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      strategy: {
        goal: "胸肌训练",
        horizonDays: 6,
        weeklyFrequency: 3,
        sessionMinutes: 30,
        strategy: "custom",
        progressionPolicy: "none",
        intensityBias: "normal",
        constraints: [],
        fieldSources: {
          goal: "current_user_message",
          calendarHorizonDays: "current_user_message",
          weeklyFrequency: "current_user_message",
          sessionMinutes: "current_user_message",
        },
        defaultAssumptions: [],
      },
    }, createCandidateSetContext("candidate-set-plan", ["warmup", "push-up", "stretch"], {}, "plan"));

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "plan",
        draftId: expect.stringMatching(/^draft_/),
        validation: { valid: true },
        draft: {
          kind: "plan",
          cycleLengthDays: 6,
          weeklyFrequency: 3,
          days: expect.any(Array),
        },
      },
    });
  });

  it("defaults unspecified plan equipment to no-equipment instead of requiring an equipment clarification", async () => {
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
    const intent = createWorkoutPlanIntent({
      intentType: "plan",
      goal: "胸肌训练",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      calendarHorizonDays: 6,
      equipment: [],
    });
    const result = await registry.get("generatePlanDraft")?.execute({
      intent,
      candidateSetId: "candidate-set-no-equipment-plan",
      candidateExerciseIds: ["warmup", "push-up", "stretch"],
      strategy: {
        goal: "胸肌训练",
        horizonDays: 6,
        weeklyFrequency: 3,
        sessionMinutes: 30,
        strategy: "custom",
        progressionPolicy: "none",
        intensityBias: "normal",
        constraints: [],
        fieldSources: {
          goal: "current_user_message",
          calendarHorizonDays: "current_user_message",
          weeklyFrequency: "current_user_message",
          sessionMinutes: "current_user_message",
        },
        defaultAssumptions: [],
      },
    }, createCandidateSetContext(
      "candidate-set-no-equipment-plan",
      ["warmup", "push-up", "stretch"],
      {},
      "plan",
    ));

    expect(result).toMatchObject({
      ok: true,
      output: {
        draftKind: "plan",
        validation: { valid: true },
        draft: {
          planStrategy: expect.objectContaining({
            constraints: expect.arrayContaining(["器械：无器械 / 自重"]),
            fieldSources: expect.objectContaining({ equipment: "default" }),
            defaultAssumptions: expect.arrayContaining(["未指定可用器械，按无器械 / 自重训练生成。"]),
          }),
        },
      },
    });
  });

  it("validates plan drafts from registered plan draft resources", async () => {
    const exerciseIds = ["warmup", "push-up", "stretch"];
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
    const intent = createWorkoutPlanIntent({
      intentType: "plan",
      goal: "胸肌训练",
      sessionMinutes: 30,
      weeklyFrequency: 1,
    });
    const draftResult = createPlanDraftToolResult({
      candidateSetId: "candidate-set-plan",
      candidateExerciseIds: exerciseIds,
      intent,
    });

    await expect(registry.get("validatePlanDraft")?.execute(
      {
        draftId: "draft-plan-1",
        candidateSetId: "candidate-set-plan",
        candidateExerciseIds: exerciseIds,
        intent,
      },
      createCandidateSetContext("candidate-set-plan", exerciseIds, {
        toolResults: [draftResult],
      }, "plan"),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        validationId: expect.stringMatching(/^validation_/),
        draftId: "draft-plan-1",
        candidateSetId: "candidate-set-plan",
        valid: true,
      },
      modelSummary: expect.objectContaining({
        validationId: expect.stringMatching(/^validation_/),
        valid: true,
      }),
    });
  });

  it("proposes and validates workout patches from current candidate resources", async () => {
    const registry = createToolFirstAgentToolRegistry();
    const candidateSetId = "candidate-set-patch";
    const candidateExerciseIds = ["bodyweight-row"];
    const patch = createWorkoutPatchFixture({ replacementExerciseId: "bodyweight-row" });
    const editPlan = {
      editPlanId: "edit-plan-1",
      targetArtifactId: "artifact-1",
      sourceArtifactPayloadId: "payload-1",
      requestedChangeSummary: "不用哑铃，替换主训练动作。",
      preserve: [{ kind: "duration", summary: "保留原训练容量。" }],
      changes: [{ kind: "exercise", targetId: "push-up", summary: "替换为自重划船。" }],
      scope: "single_item",
      strategy: "patch",
      requiredCandidateSetIds: [candidateSetId],
      confirmationLevel: "none",
    } as const;
    const context = createCandidateSetContext(candidateSetId, candidateExerciseIds, {}, "patch");
    const proposal = await registry.get("proposeWorkoutPatch")?.execute({
      editPlan,
      candidateSetId,
      candidateExerciseIds,
      patch,
    }, context);

    expect(proposal).toMatchObject({
      ok: true,
      output: {
        patchId: expect.stringMatching(/^patch_/),
        editPlanId: "edit-plan-1",
        candidateSetId,
        patch,
      },
      modelSummary: expect.objectContaining({
        patchId: expect.stringMatching(/^patch_/),
        candidateSetId,
      }),
    });

    if (!proposal?.ok) {
      throw new Error("expected proposeWorkoutPatch to succeed");
    }

    const proposedPatch = proposal.output as { patchId: string };

    await expect(registry.get("validateWorkoutPatch")?.execute(
      {
        patchId: proposedPatch.patchId,
        candidateSetId,
        candidateExerciseIds,
        patch,
      },
      context,
    )).resolves.toMatchObject({
      ok: true,
      output: {
        validationId: expect.stringMatching(/^validation_/),
        valid: true,
        errors: [],
        candidateSetId,
        patchId: proposedPatch.patchId,
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
    }, createCandidateSetContext("candidate-set-1", ["bodyweight-row"], {}, "patch"));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "candidate_set_mismatch" },
    });
  });

  it("evaluates policy decisions for new artifacts and workout patches", async () => {
    const registry = createToolFirstAgentToolRegistry();
    const patch = createWorkoutPatchFixture({ replacementExerciseId: "bodyweight-row" });

    await expect(registry.get("evaluatePolicy")?.execute(
      {
        policyTarget: "new_artifact",
        artifactKind: "routine",
        draftId: "draft-routine-1",
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        policyDecisionId: expect.stringMatching(/^policy_decision_/),
        artifactKind: "routine",
        draftId: "draft-routine-1",
        policy: {
          allowed: true,
          requiresConfirmation: false,
          safeScope: "new_revision",
        },
      },
      modelSummary: {
        policyDecisionId: expect.stringMatching(/^policy_decision_/),
        allowed: true,
        requiresConfirmation: false,
        safeScope: "new_revision",
        blockedReasons: [],
      },
    });

    await expect(registry.get("evaluatePolicy")?.execute(
      {
        policyTarget: "workout_patch",
        patchId: "patch-1",
        patch,
      },
      createToolExecutionContext(),
    )).resolves.toMatchObject({
      ok: true,
      output: {
        policyDecisionId: expect.stringMatching(/^policy_decision_/),
        patchId: "patch-1",
        policy: {
          allowed: true,
          requiresConfirmation: false,
          safeScope: "artifact_only",
        },
      },
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
      draftId: "draft-1",
      candidateSetId: "candidate-set-1",
      validationId: "validation-1",
      policyDecisionId: "policy-1",
      validationPassed: true,
      policyAllowed: true,
    }, createToolExecutionContext({
      toolResults: [
        {
          toolResultId: "tool-result-draft",
          toolCallId: "tool-call-draft",
          toolName: "generateRoutineDraft",
          status: "success",
          draftId: "draft-1",
          candidateSetId: "candidate-set-1",
          output: {
            draftKind: "routine",
            draftId: "draft-1",
            candidateSetId: "candidate-set-1",
            candidateExerciseIds: ["push-up"],
            draft,
            validation: { valid: true, errors: [], warnings: [], exerciseIds: ["push-up"] },
            recovery: { recoverable: false, guidanceMessage: "校验通过", suggestedReplies: [] },
          },
        },
        {
          toolResultId: "tool-result-validation",
          toolCallId: "tool-call-validation",
          toolName: "validateRoutineDraft",
          status: "success",
          validationId: "validation-1",
          draftId: "draft-1",
          candidateSetId: "candidate-set-1",
          output: {
            validationId: "validation-1",
            draftId: "draft-1",
            candidateSetId: "candidate-set-1",
            valid: true,
            errors: [],
            warnings: [],
            exerciseIds: ["push-up"],
          },
        },
        {
          toolResultId: "tool-result-policy",
          toolCallId: "tool-call-policy",
          toolName: "evaluatePolicy",
          status: "success",
          policyDecisionId: "policy-1",
          draftId: "draft-1",
          output: {
            policyDecisionId: "policy-1",
            sourceArtifactId: "artifact-1",
            draftId: "draft-1",
            policy: {
              allowed: true,
              requiresConfirmation: false,
              safeScope: "new_revision",
              reasons: [],
              blockedReasons: [],
            },
          },
        },
      ],
    }));

    expect(artifactMocks.createConversationArtifactRevision).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sourceArtifactId: "artifact-1",
      payload: draft,
    }));
    expect(result).toMatchObject({
      ok: true,
      output: {
        revisionId: "artifact-2",
        artifactKind: "routine",
        candidateSetId: "candidate-set-1",
        validationId: "validation-1",
        policyDecisionId: "policy-1",
      },
    });
  });

  it("creates new conversation artifacts when no source artifact exists", async () => {
    artifactMocks.createOrUpdateConversationArtifact.mockResolvedValue({
      id: "artifact-new",
      revision: 1,
    });
    const registry = createToolFirstAgentToolRegistry();
    const draft = createWorkoutRoutineDraft();
    const result = await registry.get("saveConversationArtifactRevision")?.execute({
      sourceArtifactId: null,
      artifactKind: "routine",
      payload: null,
      confirmationId: null,
      draftId: "draft-1",
      patchId: null,
      candidateSetId: "candidate-set-1",
      validationId: "validation-1",
      policyDecisionId: "policy-1",
      validationPassed: true,
      policyAllowed: true,
      responseMessageId: "assistant-from-model",
    } as never, createToolExecutionContext({
      responseMessageId: "assistant-from-context",
      toolResults: [
        {
          toolResultId: "tool-result-draft",
          toolCallId: "tool-call-draft",
          toolName: "generateRoutineDraft",
          status: "success",
          draftId: "draft-1",
          candidateSetId: "candidate-set-1",
          output: {
            draftKind: "routine",
            draftId: "draft-1",
            candidateSetId: "candidate-set-1",
            candidateExerciseIds: ["push-up"],
            draft,
            validation: { valid: true, errors: [], warnings: [], exerciseIds: ["push-up"] },
            recovery: { recoverable: false, guidanceMessage: "校验通过", suggestedReplies: [] },
          },
        },
        {
          toolResultId: "tool-result-validation",
          toolCallId: "tool-call-validation",
          toolName: "validateRoutineDraft",
          status: "success",
          validationId: "validation-1",
          draftId: "draft-1",
          candidateSetId: "candidate-set-1",
          output: {
            validationId: "validation-1",
            draftId: "draft-1",
            candidateSetId: "candidate-set-1",
            valid: true,
            errors: [],
            warnings: [],
            exerciseIds: ["push-up"],
          },
        },
        {
          toolResultId: "tool-result-policy",
          toolCallId: "tool-call-policy",
          toolName: "evaluatePolicy",
          status: "success",
          policyDecisionId: "policy-1",
          draftId: "draft-1",
          output: {
            policyDecisionId: "policy-1",
            artifactKind: "routine",
            draftId: "draft-1",
            policy: {
              allowed: true,
              requiresConfirmation: false,
              safeScope: "new_revision",
              reasons: [],
              blockedReasons: [],
            },
          },
        },
      ],
    }));

    expect(artifactMocks.createOrUpdateConversationArtifact).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "assistant-from-context",
      kind: "routine",
      payload: draft,
    }));
    expect(result).toMatchObject({
      ok: true,
      traceSummary: {
        responseMessageBinding: {
          responseMessageId: "assistant-from-context",
          source: "server_context",
          modelProvidedResponseMessageId: "assistant-from-model",
        },
      },
      output: {
        revisionId: "artifact-new",
        artifactId: "artifact-new",
        artifactKind: "routine",
        candidateSetId: "candidate-set-1",
      },
    });
  });

  it("still rejects save requests without draft or payload after null absence normalization", () => {
    const result = saveConversationArtifactRevisionAgentToolInputSchema.safeParse({
      sourceArtifactId: null,
      artifactKind: "routine",
      payload: null,
      candidateSetId: "candidate-set-1",
      validationId: "validation-1",
      policyDecisionId: "policy-1",
      validationPassed: true,
      policyAllowed: true,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected saveConversationArtifactRevision schema to reject missing draft and payload.");
    }
    expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "保存 revision 必须引用 draftId 或 patchId。",
      "Patch revision 保存必须提交 payload。",
    ]));
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
      readonlyToolLoop: true,
      assistantActionEvent: true,
    });
  });

  it("does not call generation, policy or save tools when the model ends with answered or clarification", async () => {
    const answeredWriteTool = createWriteTool();
    const answeredExecute = vi.spyOn(answeredWriteTool, "execute");
    const answeredRun = await runAgentOrchestrator({
      runId: "agent-run-short-answered",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([answeredWriteTool]),
      decideNext: vi.fn().mockResolvedValueOnce({
        action: "final_result",
        result: {
          status: "answered",
          replyContext: { reply: "好的，这次先不调整训练。" },
          usedToolResultIds: [],
        },
        reason: "模型将短回复处理为普通回答。",
      }),
    });

    const clarificationWriteTool = createWriteTool();
    const clarificationExecute = vi.spyOn(clarificationWriteTool, "execute");
    const clarificationRun = await runAgentOrchestrator({
      runId: "agent-run-short-clarification",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([clarificationWriteTool]),
      decideNext: vi.fn().mockResolvedValueOnce({
        action: "final_result",
        result: {
          status: "needs_clarification",
          question: "你想查看刚才的训练，还是继续调整它？",
          assistantSuggestions: [
            { label: "查看训练", message: "查看刚才生成的训练", targetOperation: "view_artifact" },
          ],
          blockingReasons: ["目标不明确"],
          usedToolResultIds: [],
        },
        reason: "模型选择澄清而不是执行写链。",
      }),
    });

    expect(answeredRun.result).toMatchObject({ status: "answered" });
    expect(answeredRun.state.toolCalls).toEqual([]);
    expect(answeredExecute).not.toHaveBeenCalled();
    expect(clarificationRun.result).toMatchObject({ status: "needs_clarification" });
    expect(clarificationRun.state.toolCalls).toEqual([]);
    expect(clarificationExecute).not.toHaveBeenCalled();
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
      failureCode: "repair_budget_exhausted",
    });
    expect(output.replayFixture.finalResult).toMatchObject({
      status: "failed",
      failureCode: "repair_budget_exhausted",
    });
    expect(output.state.repairSummary).toMatchObject({
      repairFeedbackCodes: expect.arrayContaining(["invalid_json"]),
      repairBudgetExhaustedReason: expect.stringContaining("repair_budget_exhausted"),
    });
  });

  it("rejects tool calls whose required dependencies were not registered in the current run", async () => {
    const output = await runAgentOrchestrator({
      runId: "agent-run-invalid-dependency",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([createWriteTool()]),
      limits: { maxSteps: 1 },
      decideNext: () => ({
        action: "call_tool",
        toolName: "saveConversationArtifactRevision",
        input: { validationId: "validation-from-another-run" },
        reason: "尝试引用伪造 validation 保存。",
      }),
    });

    expect(output.state.toolResults[0]).toMatchObject({
      status: "failed",
      error: {
        code: "invalid_dependency",
      },
    });
    expect(output.result).toMatchObject({
      status: "failed",
      failureCode: "step_limit_exceeded",
    });
  });

  it("allows partial diagnostic tool results for clarification but rejects generated consumption", async () => {
    const partialSearchTool = createPartialSearchTool();
    const partialRun = await runAgentOrchestrator({
      runId: "agent-run-partial-clarification",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([partialSearchTool]),
      limits: { maxSteps: 2 },
      decideNext: vi.fn()
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "searchExercises",
          input: { candidateUse: "routine" },
          reason: "先查 routine 候选。",
        })
        .mockResolvedValueOnce({
          action: "final_result",
          result: {
            status: "needs_clarification",
            question: "缺少拉伸候选，是否允许用无器械拉伸补齐？",
            assistantSuggestions: [{ label: "允许补齐", message: "可以用无器械拉伸补齐" }],
            blockingReasons: ["result_requirement_unmet:sectionCoverage.stretch"],
            usedToolResultIds: ["tool-result-partial"],
          },
          reason: "partial candidate 只能作为澄清证据。",
        }),
    });

    expect(partialRun.result).toMatchObject({
      status: "needs_clarification",
      usedToolResultIds: ["tool-result-partial"],
    });
    expect(partialRun.state.toolResults[0]).toMatchObject({
      toolResultId: "tool-result-partial",
      status: "success",
      resourceRole: "partial",
      fulfillment: expect.objectContaining({ satisfied: false }),
    });
    expect(partialRun.state.candidateSets).toEqual({});

    const generatedRun = await runAgentOrchestrator({
      runId: "agent-run-partial-generated",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([partialSearchTool]),
      limits: { maxSteps: 2 },
      decideNext: vi.fn()
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "searchExercises",
          input: { candidateUse: "routine" },
          reason: "先查 routine 候选。",
        })
        .mockResolvedValueOnce({
          action: "final_result",
          result: {
            status: "generated",
            artifact: { artifactId: "artifact-1", revisionId: "revision-1", kind: "routine", title: "上肢训练" },
            revisionId: "revision-1",
            validationId: "validation-1",
            usedToolResultIds: ["tool-result-partial"],
          },
          reason: "错误地把 partial 当成功依赖。",
        }),
    });

    expect(generatedRun.result).toMatchObject({
      status: "failed",
      failureCode: "model_output_invalid",
    });
  });

  it("projects successful askClarification tool output into needs_clarification", async () => {
    const output = await runAgentOrchestrator({
      runId: "agent-run-ask-clarification",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([createAskClarificationToolForTest()]),
      limits: { maxSteps: 3 },
      decideNext: vi.fn().mockResolvedValueOnce({
        action: "call_tool",
        toolName: "askClarification",
        input: {
          question: "是否允许用无器械热身和拉伸补齐？",
          blockingReasons: ["result_requirement_unmet:sectionCoverage.warmup"],
          assistantSuggestions: [{ label: "允许", message: "允许用无器械补齐" }],
        },
        reason: "需要用户确认补齐边界。",
      }),
    });

    expect(output.result).toMatchObject({
      status: "needs_clarification",
      question: "是否允许用无器械热身和拉伸补齐？",
      blockingReasons: ["result_requirement_unmet:sectionCoverage.warmup"],
      assistantSuggestions: [{ label: "允许", message: "允许用无器械补齐" }],
      usedToolResultIds: ["tool-result-clarification"],
    });
    expect(output.state.toolResults[0]).toMatchObject({
      toolName: "askClarification",
      resourceRole: "diagnostic",
    });
  });

  it("suppresses repeated non-retryable tool failures with the same normalized input", async () => {
    const trace = { id: "trace-duplicate", addStep: vi.fn() };
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "not_found",
        message: "Artifact not found or not accessible.",
        retryable: false,
      },
      traceSummary: { artifactId: "artifact-old" },
    });
    const registry = new AgentToolRegistry([{
      name: "getArtifactPayload",
      description: "读取 artifact payload。",
      accessLevel: "read",
      inputSchema: z.object({ artifactId: z.string().min(1) }),
      dependencies: [],
      capabilityContract: createTestCapabilityContract({
        operationKind: "exact_read",
        supportedOperations: ["get_artifact_payload"],
        inputContract: { requiredFields: ["artifactId"] },
        produces: ["artifact_payload"],
        evidence: ["artifactId"],
        failureCodes: ["not_found", "tool_execution_failed"],
      }),
      getIdempotencyKey(input, context) {
        return `${context.runId}:${input.artifactId}`;
      },
      summarizeOutput(output) {
        return output;
      },
      summarizeTrace(result) {
        return result.ok ? result.traceSummary : result.error;
      },
      execute,
    } satisfies AgentToolDefinition<{ artifactId: string }, { artifactId: string }>]);

    const output = await runAgentOrchestrator({
      runId: "agent-run-duplicate-failure",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      limits: { maxSteps: 2 },
      trace: trace as never,
      decideNext: vi.fn()
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "getArtifactPayload",
          input: { artifactId: "artifact-old" },
          reason: "首次读取 artifact。",
        })
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "getArtifactPayload",
          input: { artifactId: "artifact-old" },
          reason: "重复读取 artifact。",
        }),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(output.state.toolResults).toHaveLength(2);
    expect(output.state.toolResults[0]).toMatchObject({
      status: "failed",
      error: { code: "not_found" },
    });
    expect(output.state.toolResults[1]).toMatchObject({
      status: "failed",
      error: {
        code: "duplicate_tool_failure",
        detail: {
          originalFailureCode: "not_found",
          firstToolResultId: output.state.toolResults[0].toolResultId,
          repeatCount: 1,
        },
      },
      traceSummary: {
        code: "duplicate_tool_failure",
        firstToolResultId: output.state.toolResults[0].toolResultId,
        repeatCount: 1,
      },
    });
    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "agent_tool_result",
      metadata: expect.objectContaining({
        duplicateToolFailure: expect.objectContaining({
          originalFailureCode: "not_found",
          firstToolResultId: output.state.toolResults[0].toolResultId,
          repeatCount: 1,
        }),
      }),
    }));
  });

  it("does not suppress non-retryable failures when the normalized input changes", async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "not_found",
        message: "Artifact not found or not accessible.",
        retryable: false,
      },
      traceSummary: { reason: "not_found" },
    });
    const registry = new AgentToolRegistry([{
      name: "getArtifactPayload",
      description: "读取 artifact payload。",
      accessLevel: "read",
      inputSchema: z.object({ artifactId: z.string().min(1) }),
      dependencies: [],
      capabilityContract: createTestCapabilityContract({
        operationKind: "exact_read",
        supportedOperations: ["get_artifact_payload"],
        inputContract: { requiredFields: ["artifactId"] },
        produces: ["artifact_payload"],
        evidence: ["artifactId"],
        failureCodes: ["not_found", "tool_execution_failed"],
      }),
      getIdempotencyKey(input, context) {
        return `${context.runId}:${input.artifactId}`;
      },
      summarizeOutput(output) {
        return output;
      },
      summarizeTrace(result) {
        return result.ok ? result.traceSummary : result.error;
      },
      execute,
    } satisfies AgentToolDefinition<{ artifactId: string }, { artifactId: string }>]);

    await runAgentOrchestrator({
      runId: "agent-run-different-failure-input",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      limits: { maxSteps: 2 },
      decideNext: vi.fn()
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "getArtifactPayload",
          input: { artifactId: "artifact-old-1" },
          reason: "读取第一个 artifact。",
        })
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "getArtifactPayload",
          input: { artifactId: "artifact-old-2" },
          reason: "读取第二个 artifact。",
        }),
    });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("records artifact revision resolution in tool result trace metadata", async () => {
    const trace = { id: "trace-revision", addStep: vi.fn() };
    const registry = new AgentToolRegistry([{
      name: "getArtifactPayload",
      description: "读取 artifact payload。",
      accessLevel: "read",
      inputSchema: z.object({ artifactId: z.string().min(1) }),
      dependencies: [],
      capabilityContract: createTestCapabilityContract({
        operationKind: "exact_read",
        supportedOperations: ["get_artifact_payload"],
        inputContract: { requiredFields: ["artifactId"] },
        produces: ["artifact_payload"],
        evidence: ["artifactPayloadId", "revisionResolution"],
        failureCodes: ["not_found", "tool_execution_failed"],
      }),
      getIdempotencyKey(input, context) {
        return `${context.runId}:${input.artifactId}`;
      },
      summarizeOutput(output) {
        return output;
      },
      summarizeTrace(result) {
        return result.ok ? result.traceSummary : result.error;
      },
      async execute() {
        return {
          ok: true,
          output: {
            artifactPayloadId: "artifact-payload-1",
            artifactId: "artifact-active",
            requestedArtifactId: "artifact-old",
            revisionResolution: {
              status: "resolved_to_active",
              requestedArtifactId: "artifact-old",
              activeArtifactId: "artifact-active",
            },
          },
          toolResultId: "tool-result-revision",
          modelSummary: {
            artifactPayloadId: "artifact-payload-1",
            requestedArtifactId: "artifact-old",
            activeArtifactId: "artifact-active",
          },
          traceSummary: {
            revisionResolution: {
              status: "resolved_to_active",
              requestedArtifactId: "artifact-old",
              activeArtifactId: "artifact-active",
            },
          },
        };
      },
    } satisfies AgentToolDefinition<{ artifactId: string }, {
      artifactPayloadId: string;
      artifactId: string;
      requestedArtifactId: string;
      revisionResolution: { status: "resolved_to_active"; requestedArtifactId: string; activeArtifactId: string };
    }>]);

    await runAgentOrchestrator({
      runId: "agent-run-revision-trace",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      limits: { maxSteps: 1 },
      trace: trace as never,
      decideNext: () => ({
        action: "call_tool",
        toolName: "getArtifactPayload",
        input: { artifactId: "artifact-old" },
        reason: "读取旧 revision。",
      }),
    });

    expect(trace.addStep).toHaveBeenCalledWith(expect.objectContaining({
      name: "agent_tool_result",
      metadata: expect.objectContaining({
        artifactRevisionResolution: {
          status: "resolved_to_active",
          requestedArtifactId: "artifact-old",
          activeArtifactId: "artifact-active",
        },
      }),
    }));
  });

  it("rejects final results that cite missing tool results", async () => {
    const output = await runAgentOrchestrator({
      runId: "agent-run-missing-result",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry: new AgentToolRegistry([createReadTool()]),
      decideNext: () => ({
        action: "final_result",
        result: {
          status: "answered",
          replyContext: { reply: "这条回复引用了不存在的工具结果。" },
          usedToolResultIds: ["missing-tool-result"],
        },
        reason: "模型错误引用了不存在的 tool result。",
      }),
    });

    expect(output.result).toMatchObject({
      status: "failed",
      failureCode: "model_output_invalid",
    });
  });

  it("runs a routine generation chain through candidate, draft, validation, policy and revision dependencies", async () => {
    const warmup = createExercise({
      id: "warmup",
      nameZh: "肩部绕环",
      categoryZh: "热身",
      allowedSections: ["warmup"],
    });
    const pushUp = createExercise({
      id: "push-up",
      nameZh: "俯卧撑",
      allowedSections: ["training"],
    });
    const stretch = createExercise({
      id: "stretch",
      nameZh: "胸肩拉伸",
      categoryZh: "拉伸",
      allowedSections: ["stretch"],
    });
    exerciseMocks.searchExercises.mockResolvedValue({
      candidates: [warmup, pushUp, stretch],
      diagnostics: {
        query: "上肢",
        filters: { visibility: "published" },
        recalledCount: 3,
        filteredCount: 0,
        rerank: [],
        finalExerciseIds: ["warmup", "push-up", "stretch"],
        failureReasons: [],
      },
    });
    exerciseMocks.listAllExercises.mockResolvedValue([warmup, pushUp, stretch]);
    artifactMocks.createConversationArtifactRevision.mockResolvedValue({
      ok: true,
      artifact: { id: "artifact-new", revision: 2 },
      payload: createWorkoutRoutineDraft(),
    });
    const registry = createToolFirstAgentToolRegistry();
    const intent = createWorkoutPlanIntent({ intentType: "routine", goal: "上肢力量", sessionMinutes: 12 });

    const output = await runAgentOrchestrator({
      runId: "agent-run-routine-chain",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      limits: { maxSteps: 8 },
      decideNext: ({ state }) => {
        if (state.toolResults.length === 0) {
          return {
            action: "call_tool",
            toolName: "searchExercises",
            input: {
              operation: "build_exercise_candidate_set",
              query: "上肢",
              candidateUse: "routine",
              filters: {
                equipment: { notIn: ["哑铃"] },
                visibility: "published",
              },
              resultRequirements: {
                minCandidates: 3,
                sectionCoverage: {
                  warmup: { min: 1 },
                  training: { min: 1 },
                  stretch: { min: 1 },
                },
                requireProof: true,
              },
              goal: "上肢力量",
              equipmentAvoided: ["哑铃"],
              limit: 6,
            },
            reason: "先查询无哑铃候选动作。",
          };
        }

        const candidateSetId = state.toolResults[0].candidateSetId!;
        if (state.toolResults.length === 1) {
          return {
            action: "call_tool",
            toolName: "generateRoutineDraft",
            input: {
              intent,
              candidateSetId,
              candidateExerciseIds: ["warmup", "push-up", "stretch"],
              title: "无哑铃上肢训练",
            },
            reason: "使用候选集合生成 routine 草稿。",
          };
        }

        const generatedDraft = state.toolResults[1].modelSummary as { draftId: string };
        if (state.toolResults.length === 2) {
          return {
            action: "call_tool",
            toolName: "validateRoutineDraft",
            input: {
              draftId: generatedDraft.draftId,
              candidateSetId,
              candidateExerciseIds: ["warmup", "push-up", "stretch"],
              intent,
            },
            reason: "保存前校验 routine 草稿。",
          };
        }

        const validationId = state.toolResults[2].validationId!;
        if (state.toolResults.length === 3) {
          return {
            action: "call_tool",
            toolName: "evaluatePolicy",
            input: {
              policyTarget: "artifact_revision",
              sourceArtifactId: "artifact-1",
              draftId: generatedDraft.draftId,
            },
            reason: "保存 artifact revision 前执行策略校验。",
          };
        }

        const policyDecisionId = state.toolResults[3].policyDecisionId!;
        if (state.toolResults.length === 4) {
          return {
            action: "call_tool",
            toolName: "saveConversationArtifactRevision",
            input: {
              sourceArtifactId: "artifact-1",
              draftId: generatedDraft.draftId,
              candidateSetId,
              validationId,
              policyDecisionId,
              validationPassed: true,
              policyAllowed: true,
            },
            reason: "所有前置结果齐备后保存 revision。",
          };
        }

        const saved = state.toolResults[4];
        return {
          action: "final_result",
          result: {
            status: "generated",
            artifact: {
              artifactId: "artifact-new",
              kind: "routine",
              title: "无哑铃上肢训练",
            },
            revisionId: saved.revisionId!,
            validationId,
            policyDecisionId,
            usedToolResultIds: [saved.toolResultId],
          },
          reason: "revision 已保存，返回生成结果。",
        };
      },
    });

    expect(output.result).toMatchObject({
      status: "generated",
      revisionId: "artifact-new",
    });
    expect(output.state.toolResults.map((result) => result.toolName)).toEqual([
      "searchExercises",
      "generateRoutineDraft",
      "validateRoutineDraft",
      "evaluatePolicy",
      "saveConversationArtifactRevision",
    ]);
    expect(output.state.dependencyGraph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "candidate_set" }),
      expect.objectContaining({ kind: "draft" }),
      expect.objectContaining({ kind: "validation" }),
      expect.objectContaining({ kind: "policy_decision" }),
    ]));
  });

  it("recovers when the model returns generated before saving the artifact revision", async () => {
    const warmup = createExercise({
      id: "warmup",
      nameZh: "肩部绕环",
      categoryZh: "热身",
      allowedSections: ["warmup"],
    });
    const pushUp = createExercise({
      id: "push-up",
      nameZh: "俯卧撑",
      allowedSections: ["training"],
    });
    const stretch = createExercise({
      id: "stretch",
      nameZh: "胸肩拉伸",
      categoryZh: "拉伸",
      allowedSections: ["stretch"],
    });
    exerciseMocks.searchExercises.mockResolvedValue({
      candidates: [warmup, pushUp, stretch],
      diagnostics: {
        query: "上肢",
        filters: { visibility: "published" },
        recalledCount: 3,
        filteredCount: 0,
        rerank: [],
        finalExerciseIds: ["warmup", "push-up", "stretch"],
        failureReasons: [],
      },
    });
    exerciseMocks.listAllExercises.mockResolvedValue([warmup, pushUp, stretch]);
    artifactMocks.createOrUpdateConversationArtifact.mockResolvedValue({
      id: "artifact-new",
      revision: 1,
    });
    const registry = createToolFirstAgentToolRegistry();
    const intent = createWorkoutPlanIntent({ intentType: "routine", goal: "上肢力量", sessionMinutes: 12 });

    const output = await runAgentOrchestrator({
      runId: "agent-run-premature-generated",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      limits: { maxSteps: 8 },
      decideNext: ({ state }) => {
        if (state.toolResults.length === 0) {
          return {
            action: "call_tool",
            toolName: "searchExercises",
            input: {
              operation: "build_exercise_candidate_set",
              query: "上肢",
              candidateUse: "routine",
              filters: {
                visibility: "published",
              },
              resultRequirements: {
                minCandidates: 3,
                sectionCoverage: {
                  warmup: { min: 1 },
                  training: { min: 1 },
                  stretch: { min: 1 },
                },
                requireProof: true,
              },
              goal: "上肢力量",
              limit: 6,
            },
            reason: "先查询上肢候选动作。",
          };
        }

        const candidateSetId = state.toolResults[0].candidateSetId!;
        if (state.toolResults.length === 1) {
          return {
            action: "call_tool",
            toolName: "generateRoutineDraft",
            input: {
              intent,
              candidateSetId,
              candidateExerciseIds: ["warmup", "push-up", "stretch"],
              title: "上肢训练",
            },
            reason: "使用候选集合生成 routine 草稿。",
          };
        }

        const generatedDraft = state.toolResults[1].modelSummary as { draftId: string };
        if (state.toolResults.length === 2) {
          return {
            action: "call_tool",
            toolName: "validateRoutineDraft",
            input: {
              draftId: generatedDraft.draftId,
              candidateSetId,
              candidateExerciseIds: ["warmup", "push-up", "stretch"],
              intent,
            },
            reason: "保存前校验 routine 草稿。",
          };
        }

        const validationId = state.toolResults[2].validationId!;
        if (state.toolResults.length === 3) {
          return {
            action: "call_tool",
            toolName: "evaluatePolicy",
            input: {
              policyTarget: "new_artifact",
              artifactKind: "routine",
              draftId: generatedDraft.draftId,
            },
            reason: "保存新 artifact 前执行策略校验。",
          };
        }

        const policyDecisionId = state.toolResults[3].policyDecisionId!;
        if (state.toolResults.length === 4) {
          return {
            action: "final_result",
            result: {
              status: "generated",
              usedToolResultIds: state.toolResults.map((result) => result.toolResultId),
              replyContext: { reply: "草稿已生成并通过校验，确认后保存。" },
            },
            reason: "错误地提前返回 generated，但还没有保存 revision。",
          };
        }

        if (state.toolResults.length === 5) {
          const feedback = state.toolResults[4].modelSummary as {
            recommendedInput: Record<string, unknown>;
          };

          return {
            action: "call_tool",
            toolName: "saveConversationArtifactRevision",
            input: feedback.recommendedInput,
            reason: "根据 runtime 反馈继续保存 artifact。",
          };
        }

        const saved = state.toolResults[5];
        return {
          action: "final_result",
          result: {
            status: "generated",
            artifact: {
              artifactId: "artifact-new",
              kind: "routine",
              title: "上肢训练",
            },
            revisionId: saved.revisionId!,
            validationId,
            policyDecisionId,
            usedToolResultIds: [saved.toolResultId],
          },
          reason: "revision 已保存，返回生成结果。",
        };
      },
    });

    expect(output.state.toolResults.map((result) => result.toolName)).toEqual([
      "searchExercises",
      "generateRoutineDraft",
      "validateRoutineDraft",
      "evaluatePolicy",
      "agentDecisionFeedback",
      "saveConversationArtifactRevision",
    ]);
    expect(output.state.toolResults[4]).toMatchObject({
      status: "failed",
      error: {
        code: "premature_final_result_before_save",
        retryable: true,
      },
      decisionFeedback: {
        code: "premature_final_result_before_save",
        missingResources: expect.arrayContaining([
          expect.objectContaining({ kind: "revision" }),
        ]),
      },
      modelSummary: {
        recommendedToolName: "saveConversationArtifactRevision",
      },
    });
    expect(output.result).toMatchObject({
      status: "generated",
      revisionId: "artifact-new",
      validationId: expect.any(String),
      policyDecisionId: expect.any(String),
    });
  });

  it("completes generated final result resources from the saved artifact revision", async () => {
    const warmup = createExercise({
      id: "warmup",
      nameZh: "肩部绕环",
      categoryZh: "热身",
      allowedSections: ["warmup"],
    });
    const pushUp = createExercise({
      id: "push-up",
      nameZh: "俯卧撑",
      allowedSections: ["training"],
    });
    const stretch = createExercise({
      id: "stretch",
      nameZh: "胸肩拉伸",
      categoryZh: "拉伸",
      allowedSections: ["stretch"],
    });
    exerciseMocks.searchExercises.mockResolvedValue({
      candidates: [warmup, pushUp, stretch],
      diagnostics: {
        query: "上肢",
        filters: { visibility: "published" },
        recalledCount: 3,
        filteredCount: 0,
        rerank: [],
        finalExerciseIds: ["warmup", "push-up", "stretch"],
        failureReasons: [],
      },
    });
    exerciseMocks.listAllExercises.mockResolvedValue([warmup, pushUp, stretch]);
    artifactMocks.createOrUpdateConversationArtifact.mockResolvedValue({
      id: "artifact-new",
      revision: 1,
    });
    const registry = createToolFirstAgentToolRegistry();
    const intent = createWorkoutPlanIntent({ intentType: "routine", goal: "上肢力量", sessionMinutes: 12 });

    const output = await runAgentOrchestrator({
      runId: "agent-run-generated-final-contract",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      limits: { maxSteps: 7 },
      decideNext: ({ state }) => {
        if (state.toolResults.length === 0) {
          return {
            action: "call_tool",
            toolName: "searchExercises",
            input: {
              operation: "build_exercise_candidate_set",
              query: "上肢",
              candidateUse: "routine",
              filters: {
                visibility: "published",
              },
              resultRequirements: {
                minCandidates: 3,
                sectionCoverage: {
                  warmup: { min: 1 },
                  training: { min: 1 },
                  stretch: { min: 1 },
                },
                requireProof: true,
              },
              goal: "上肢力量",
              limit: 6,
            },
            reason: "先查询上肢候选动作。",
          };
        }

        const candidateSetId = state.toolResults[0].candidateSetId!;
        if (state.toolResults.length === 1) {
          return {
            action: "call_tool",
            toolName: "generateRoutineDraft",
            input: {
              intent,
              candidateSetId,
              candidateExerciseIds: ["warmup", "push-up", "stretch"],
              title: "上肢训练",
            },
            reason: "使用候选集合生成 routine 草稿。",
          };
        }

        const generatedDraft = state.toolResults[1].modelSummary as { draftId: string };
        if (state.toolResults.length === 2) {
          return {
            action: "call_tool",
            toolName: "validateRoutineDraft",
            input: {
              draftId: generatedDraft.draftId,
              candidateSetId,
              candidateExerciseIds: ["warmup", "push-up", "stretch"],
              intent,
            },
            reason: "保存前校验 routine 草稿。",
          };
        }

        const validationId = state.toolResults[2].validationId!;
        if (state.toolResults.length === 3) {
          return {
            action: "call_tool",
            toolName: "evaluatePolicy",
            input: {
              policyTarget: "new_artifact",
              artifactKind: "routine",
              draftId: generatedDraft.draftId,
            },
            reason: "保存新 artifact 前执行策略校验。",
          };
        }

        const policyDecisionId = state.toolResults[3].policyDecisionId!;
        if (state.toolResults.length === 4) {
          return {
            action: "call_tool",
            toolName: "saveConversationArtifactRevision",
            input: {
              artifactKind: "routine",
              draftId: generatedDraft.draftId,
              candidateSetId,
              validationId,
              policyDecisionId,
              validationPassed: true,
              policyAllowed: true,
            },
            reason: "所有前置结果齐备后保存 artifact。",
          };
        }

        return {
          action: "final_result",
          result: {
            status: "generated",
            replyContext: { reply: "已生成并保存上肢训练。" },
            usedToolResultIds: state.toolResults.map((result) => result.toolResultId),
          },
          reason: "保存已完成，但模型遗漏了 generated 必需资源字段。",
        };
      },
    });

    const saved = output.state.toolResults.at(-1)!;

    expect(output.state.toolResults.map((result) => result.toolName)).toEqual([
      "searchExercises",
      "generateRoutineDraft",
      "validateRoutineDraft",
      "evaluatePolicy",
      "saveConversationArtifactRevision",
    ]);
    expect(output.result).toMatchObject({
      status: "generated",
      artifact: {
        artifactId: "artifact-new",
        revisionId: "artifact-new",
        kind: "routine",
        title: "上肢训练",
      },
      revisionId: "artifact-new",
      validationId: expect.any(String),
      policyDecisionId: expect.any(String),
      usedToolResultIds: expect.arrayContaining([saved.toolResultId]),
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
        { kind: "tool_result", id: "tool-result-1", resourceRole: "consumable" },
        { kind: "operation_result", id: "operation-result-1" },
      ]),
    });
    const generatedProjection = projectAgentExecutionResultToResponse({
      result: {
        status: "generated",
        artifact: { artifactId: "artifact-1", kind: "routine", title: "居家训练" },
        revisionId: "revision-1",
        validationId: "validation-1",
        usedToolResultIds: ["tool-result-generated"],
      },
      toolResults: [{
        toolResultId: "tool-result-generated",
        toolCallId: "tool-call-generated",
        toolName: "saveConversationArtifactRevision",
        status: "success",
      }],
    });
    expect(generatedProjection.reply).toBe("已为你生成「居家训练」，可以在下方卡片查看训练内容。");
    expect(generatedProjection.reply).not.toMatch(/结构校验|Validator|Policy/);
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

  it("normalizes Agent suggestions into the front-end assistantSuggestions contract", () => {
    const clarification = projectAgentExecutionResultToResponse({
      result: {
        status: "needs_clarification",
        question: "你想练上背还是下背？",
        assistantSuggestions: [
          { label: "练上背", message: "我想练上背" },
        ],
        blockingReasons: ["target_missing"],
        usedToolResultIds: [],
      },
      toolResults: [],
    });
    const recommendation = projectAgentExecutionResultToResponse({
      result: {
        status: "answered",
        replyContext: {
          reply: "给你几个动作。",
          assistantSuggestions: [
            { label: "生成训练", message: "按这些动作生成 30 分钟训练" },
          ],
        },
        usedToolResultIds: ["tool-result-rec"],
      },
      toolResults: [{
        toolResultId: "tool-result-rec",
        toolCallId: "tool-call-rec",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-rec",
        modelSummary: {
          candidateUse: "recommendation",
        },
      }],
    });

    expect(clarification.assistantSuggestions).toEqual([
      {
        label: "练上背",
        message: "我想练上背",
        kind: "clarification",
        blocking: true,
        source: "intent",
      },
    ]);
    expect(recommendation.assistantSuggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "生成训练",
        message: "按这些动作生成 30 分钟训练",
        kind: "next_action",
        blocking: false,
        source: "exercise_recommendation",
      }),
    ]));
    expect(projectAgentExecutionResultToResponse({
      result: {
        status: "answered",
        replyContext: { reply: "给你几个动作。" },
        usedToolResultIds: ["tool-result-rec"],
      },
      toolResults: [{
        toolResultId: "tool-result-rec",
        toolCallId: "tool-call-rec",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-rec",
        modelSummary: {
          candidateUse: "recommendation",
        },
      }],
    }).assistantSuggestions).toEqual([]);

    expect(projectAgentExecutionResultToResponse({
      result: {
        status: "answered",
        replyContext: { reply: "以下是一套30分钟上肢训练计划。" },
        usedToolResultIds: ["tool-result-routine"],
      },
      toolResults: [{
        toolResultId: "tool-result-routine",
        toolCallId: "tool-call-routine",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-routine",
        modelSummary: {
          candidateUse: "routine",
        },
      }],
    }).assistantSuggestions).toEqual([]);
  });

  it("tells the Agent to use routine generation tools for single-session composition", () => {
    const prompt = buildPromptFromModules(["agent_tool_decision"]);

    expect(prompt).toContain("candidateUse=\"routine\"");
    expect(prompt).toContain("generateRoutineDraft");
    expect(prompt).toContain("禁止只用 answered 输出自由文本 routine");
    expect(prompt).toContain("operation=\"build_exercise_candidate_set\"");
    expect(prompt).toContain("filters");
    expect(prompt).toContain("homeRequirements=[\"no_equipment\"]");
    expect(prompt).toContain("resultRequirements");
    expect(prompt).toContain("query 只能作为召回或排序提示，不是 hard constraint");
    expect(prompt).toContain("experience=\"beginner\"");
    expect(prompt).toContain("weeklyFrequency 可使用 1");
    expect(prompt).toContain("resourceRole");
    expect(prompt).toContain("candidateSetStatus=\"partial\"");
    expect(prompt).toContain("默认把器械作为 training 主训练候选边界");
    expect(prompt).toContain("缺少器械或场地本身不能阻断生成");
  });

  it("runs controlled operation fixtures through completed_operation, confirmation and policy blocked results", async () => {
    const registry = new AgentToolRegistry([createUserProfilePolicyTool(), createUserProfileWriteTool()]);
    const success = await runAgentOrchestrator({
      runId: "agent-run-operation-success",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      decideNext: vi.fn()
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "evaluateUserProfilePolicy",
          input: { location: "在家" },
          reason: "先评估用户资料写入策略。",
        })
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "updateUserProfile",
          input: { location: "在家", mode: "success", policyDecisionId: "policy-user-profile-success" },
          reason: "保存训练地点偏好。",
        })
        .mockResolvedValueOnce({
          action: "final_result",
          result: {
            status: "completed_operation",
            operationResultId: "operation-result-success",
            usedToolResultIds: ["operation-tool-success"],
            policyDecisionId: "policy-user-profile-success",
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
      { location: "健身房", mode: "confirmation_required", policyDecisionId: "policy-user-profile-success" },
      createToolExecutionContext(),
    );
    const blocked = await registry.get("updateUserProfile")?.execute(
      { location: "危险高强度", mode: "policy_blocked", policyDecisionId: "policy-user-profile-success" },
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

  it("rejects completed_operation when the operation result producer is not consumed", async () => {
    const registry = new AgentToolRegistry([createUserProfilePolicyTool(), createUserProfileWriteTool()]);
    const output = await runAgentOrchestrator({
      runId: "agent-run-operation-missing-producer",
      userId: "user-1",
      sessionId: "chat-1",
      context: createTestContextPackage(),
      registry,
      decideNext: vi.fn()
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "evaluateUserProfilePolicy",
          input: { location: "在家" },
          reason: "先评估用户资料写入策略。",
        })
        .mockResolvedValueOnce({
          action: "call_tool",
          toolName: "updateUserProfile",
          input: { location: "在家", mode: "success", policyDecisionId: "policy-user-profile-success" },
          reason: "保存训练地点偏好。",
        })
        .mockResolvedValueOnce({
          action: "final_result",
          result: {
            status: "completed_operation",
            operationResultId: "operation-result-success",
            usedToolResultIds: ["policy-tool-user-profile"],
            policyDecisionId: "policy-user-profile-success",
            operation: {
              operationType: "updateUserProfile",
              resourceType: "UserProfile",
              title: "已更新训练偏好",
              summary: "训练地点已保存为在家。",
              visibleFields: [{ key: "location", label: "训练地点", value: "在家" }],
            },
          },
          reason: "错误地没有引用写工具结果。",
        }),
    });

    expect(output.result).toMatchObject({
      status: "failed",
      failureCode: "model_output_invalid",
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
    expect(buildPromptFromModules(["agent_final_result"]))
      .toContain("blocked 必须返回");
    expect(buildPromptFromModules(["agent_final_result"]))
      .toContain("failed 必须返回");
    expect(buildPromptFromModules(["agent_final_result"]))
      .toContain("没有成功的 saveConversationArtifactRevision tool result 和 revisionId 时，禁止返回 generated 或 patched");
    expect(buildPromptFromModules(["agent_final_result"]))
      .toContain("generated 必须返回");
    expect(buildPromptFromModules(["agent_tool_decision"]))
      .toContain("AgentDecisionFeedback");
    expect(buildPromptFromModules(["agent_tool_execution"]))
      .toContain("retryable: true 不是继续重试的充分条件");
    expect(buildPromptFromModules(["agent_final_result"]))
      .toContain("多个可能匹配的 draft、patch、save 或 operation 写结果");
    expect(buildPromptFromModules(["agent_tool_decision", "agent_tool_execution", "agent_final_result"]))
      .not.toContain("关键词分流");
    expect(buildPromptFromModules(["agent_tool_decision", "agent_tool_execution", "agent_final_result"]))
      .not.toContain("同义词匹配");
  });
});

function createReadTool(): AgentToolDefinition<{ scope: "current_user" }, { facts: string[] }> {
  return {
    name: "getUserMemory",
    description: "读取当前用户记忆摘要。",
    accessLevel: "read",
    inputSchema: z.object({ scope: z.literal("current_user") }),
    dependencies: [],
    capabilityContract: createTestCapabilityContract({
      operationKind: "memory_snapshot",
      supportedOperations: ["read_memory_snapshot"],
      produces: ["memory_snapshot"],
      evidence: ["facts"],
    }),
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

function createPartialSearchTool(): AgentToolDefinition<{ candidateUse: "routine" }, unknown> {
  const candidateSetId = "candidate-set-partial";

  return {
    name: "searchExercises",
    description: "返回 partial routine candidate set。",
    accessLevel: "read",
    inputSchema: z.object({ candidateUse: z.literal("routine") }),
    dependencies: [],
    capabilityContract: createTestCapabilityContract({
      operationKind: "structured_search",
      supportedOperations: ["build_exercise_candidate_set"],
      produces: ["candidate_set"],
      evidence: ["partial candidate set"],
      failureCodes: ["result_requirement_unmet"],
    }),
    getIdempotencyKey(input, context) {
      return `${context.runId}:${input.candidateUse}`;
    },
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute() {
      const output = {
        candidateSetId,
        candidateUse: "routine",
        candidateSetStatus: "partial",
        satisfied: false,
        candidates: [createExercise({ id: "dumbbell-row", nameZh: "哑铃划船" })],
        diagnostics: {
          queryMode: "none",
          failureReasons: ["result_requirement_unmet:sectionCoverage.stretch"],
          unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
          finalExerciseIds: ["dumbbell-row"],
        },
        resultRequirementProof: {
          sectionCoverage: {
            training: { required: 1, actual: 1, satisfied: true },
            stretch: { required: 1, actual: 0, satisfied: false },
          },
        },
        recoveryOptions: [{ label: "允许补齐", message: "可以用无器械拉伸补齐" }],
      };

      return {
        ok: true,
        output,
        toolResultId: "tool-result-partial",
        modelSummary: output,
        traceSummary: output,
        fulfillment: {
          operationKind: "structured_search",
          operation: "build_exercise_candidate_set",
          satisfied: false,
          producedResources: [],
          appliedHardConstraints: {},
          unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
          evidence: output,
          diagnostics: output.diagnostics,
        },
      };
    },
  };
}

function createAskClarificationToolForTest(): AgentToolDefinition<{
  question: string;
  blockingReasons: string[];
  assistantSuggestions: Array<{ label: string; message: string }>;
}, unknown> {
  const schema = z.object({
    question: z.string().min(1),
    blockingReasons: z.array(z.string()).default([]),
    assistantSuggestions: z.array(z.object({ label: z.string(), message: z.string() })).default([]),
  });

  return {
    name: "askClarification",
    description: "返回澄清问题。",
    accessLevel: "clarify",
    inputSchema: schema,
    dependencies: [],
    capabilityContract: createTestCapabilityContract({
      operationKind: "clarification",
      supportedOperations: ["ask_clarification"],
      produces: ["clarification"],
      evidence: ["question"],
    }),
    getIdempotencyKey(input, context) {
      return `${context.runId}:${input.question}`;
    },
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input) {
      const output = schema.parse(input);

      return {
        ok: true,
        output,
        toolResultId: "tool-result-clarification",
        modelSummary: output,
        traceSummary: output,
        fulfillment: {
          operationKind: "clarification",
          operation: "ask_clarification",
          satisfied: true,
          producedResources: [],
          appliedHardConstraints: {},
          unmetResultRequirements: [],
          evidence: output,
          diagnostics: {},
        },
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
    capabilityContract: createTestCapabilityContract({
      operationKind: "persistence",
      supportedOperations: ["save_revision"],
      inputContract: {
        resourceRefs: ["validationId", "policyDecisionId"],
      },
      executionContract: {
        writes: ["ConversationArtifact"],
        strictness: "validated_compile",
      },
      produces: ["revision"],
      evidence: ["revisionId"],
      failureCodes: ["invalid_dependency", "persistence_failed"],
    }),
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

function createUserProfilePolicyTool(): AgentToolDefinition<
  { location: string },
  { policyDecisionId: string }
> {
  return {
    name: "evaluateUserProfilePolicy",
    description: "评估当前用户资料写入策略。",
    accessLevel: "validate",
    inputSchema: z.object({
      location: z.string().min(1),
    }),
    dependencies: [],
    capabilityContract: createTestCapabilityContract({
      operationKind: "policy",
      supportedOperations: ["evaluate_user_profile_policy"],
      produces: ["policy_decision"],
      evidence: ["policyDecisionId"],
      failureCodes: ["policy_blocked", "tool_execution_failed"],
    }),
    getIdempotencyKey(input, context) {
      return `${context.runId}:policy:${input.location}`;
    },
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute() {
      return {
        ok: true,
        output: { policyDecisionId: "policy-user-profile-success" },
        toolResultId: "policy-tool-user-profile",
        modelSummary: { policyDecisionId: "policy-user-profile-success" },
        traceSummary: { policyDecisionId: "policy-user-profile-success" },
      };
    },
  };
}

function createUserProfileWriteTool(): AgentToolDefinition<
  { location: string; mode: "success" | "confirmation_required" | "policy_blocked"; policyDecisionId: string },
  { operationResultId: string; policyDecisionId?: string; confirmationId?: string }
> {
  return {
    name: "updateUserProfile",
    description: "更新当前用户训练偏好。",
    accessLevel: "write",
    inputSchema: z.object({
      location: z.string().min(1),
      mode: z.enum(["success", "confirmation_required", "policy_blocked"]),
      policyDecisionId: z.string().min(1),
    }),
    dependencies: [
      { kind: "policy_decision", required: true, description: "必须经过用户资料写入策略评估。" },
    ],
    capabilityContract: createTestCapabilityContract({
      operationKind: "persistence",
      supportedOperations: ["update_user_profile"],
      inputContract: {
        requiredFields: ["location", "mode", "policyDecisionId"],
        resourceRefs: ["policyDecisionId"],
      },
      executionContract: {
        writes: ["UserProfile"],
        strictness: "validated_compile",
      },
      produces: ["operation_result", "confirmation"],
      evidence: ["operationResultId", "policyDecisionId", "confirmationId"],
      failureCodes: ["confirmation_required", "policy_blocked", "tool_execution_failed"],
    }),
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
        output: { operationResultId: "operation-result-success", policyDecisionId: input.policyDecisionId },
        toolResultId: "operation-tool-success",
        modelSummary: { title: "已更新训练偏好", location: input.location },
        traceSummary: { operationResultId: "operation-result-success", policyDecisionId: input.policyDecisionId, location: input.location },
      };
    },
  };
}

type TestCapabilityContractOverrides = Omit<
  Partial<AgentToolCapabilityContract>,
  "inputContract" | "executionContract"
> & {
  inputContract?: Partial<AgentToolCapabilityContract["inputContract"]>;
  executionContract?: Partial<AgentToolCapabilityContract["executionContract"]>;
};

function createTestCapabilityContract(
  overrides: TestCapabilityContractOverrides = {},
): AgentToolCapabilityContract {
  const base: AgentToolCapabilityContract = {
    operationKind: "exact_read",
    supportedOperations: ["test_operation"],
    inputContract: {
      requiredFields: [],
      optionalFields: [],
      acceptedFilters: [],
      acceptedEnums: {},
      resourceRefs: [],
      hardConstraintFields: [],
      softPreferenceFields: [],
      resultRequirementFields: [],
      projectionFields: [],
    },
    executionContract: {
      reads: ["test_resource"],
      writes: [],
      mustNotRead: [],
      strictness: "exact",
    },
    refusesWhen: ["test contract cannot be satisfied"],
    produces: ["tool_result"],
    evidence: ["test output"],
    failureCodes: ["tool_execution_failed"],
    unsupportedOperations: [],
  };

  return {
    ...base,
    ...overrides,
    inputContract: {
      ...base.inputContract,
      ...overrides.inputContract,
    },
    executionContract: {
      ...base.executionContract,
      ...overrides.executionContract,
    },
  };
}

function createCandidateSetToolResult(
  candidateSetId: string,
  exerciseIds: string[],
  candidateUse: "routine" | "plan" | "patch" | "recommendation" | "answer_only" = "routine",
  candidateSetEvidenceOverrides: Record<string, unknown> = {},
): NonNullable<AgentToolExecutionContext["toolResults"]>[number] {
  const candidates = exerciseIds.map((exerciseId) => createExercise({ id: exerciseId, nameZh: exerciseId }));
  const candidateSetEvidence = {
    normalizedQueryInput: {
      candidateUse,
      filters: {},
      resultRequirements: {},
      softPreferences: {},
      projection: {},
    },
    appliedFilters: {},
    invalidFilters: [],
    constraintProof: exerciseIds.map((exerciseId) => ({ exerciseId, matchedFilters: [] })),
    resultRequirementProof: {},
    diagnostics: {
      queryMode: "none" as const,
      failureReasons: [],
      unmetResultRequirements: [],
      finalExerciseIds: exerciseIds,
    },
    satisfied: true,
    exerciseIds,
    ...candidateSetEvidenceOverrides,
  };

  return {
    toolResultId: `tool-result-${candidateSetId}`,
    toolCallId: `tool-call-${candidateSetId}`,
    toolName: "searchExercises",
    status: "success",
    candidateSetId,
    output: {
      candidateSetId,
      candidateUse,
      candidates,
      diagnostics: {
        queryMode: "none",
        failureReasons: [],
        unmetResultRequirements: [],
        finalExerciseIds: exerciseIds,
      },
      satisfied: true,
      candidateSetEvidence,
    },
    modelSummary: {
      candidateSetId,
      candidateUse,
      candidateIds: exerciseIds,
    },
    traceSummary: {
      candidateSetId,
      candidateUse,
      finalExerciseIds: exerciseIds,
    },
    fulfillment: {
      operationKind: "structured_search",
      operation: "build_exercise_candidate_set",
      satisfied: true,
      producedResources: [{ type: "candidate_set", id: candidateSetId }],
      appliedHardConstraints: {},
      unmetResultRequirements: [],
      evidence: candidateSetEvidence,
      diagnostics: {
        finalExerciseIds: exerciseIds,
      },
    },
  };
}

function createPartialCandidateSetToolResult(
  candidateSetId: string,
  exerciseIds: string[],
): NonNullable<AgentToolExecutionContext["toolResults"]>[number] {
  const base = createCandidateSetToolResult(candidateSetId, exerciseIds, "routine");

  return {
    ...base,
    resourceRole: "partial",
    resourceSummary: {
      role: "partial",
      consumable: false,
      diagnostic: true,
      partial: true,
      feedback: false,
      producedResources: [],
      unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
      allowedFinalResultStatuses: ["answered", "blocked", "failed", "needs_clarification"],
    },
    output: {
      ...(base.output as Record<string, unknown>),
      satisfied: false,
      candidateSetStatus: "partial",
      unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
    },
    fulfillment: {
      ...base.fulfillment!,
      satisfied: false,
      producedResources: [],
      unmetResultRequirements: ["result_requirement_unmet:sectionCoverage.stretch"],
    },
  };
}

function createPlanDraftToolResult(input: {
  candidateSetId: string;
  candidateExerciseIds: string[];
  intent?: ReturnType<typeof createWorkoutPlanIntent>;
  draftId?: string;
}): NonNullable<AgentToolExecutionContext["toolResults"]>[number] {
  const draftId = input.draftId ?? "draft-plan-1";
  const draft = createWorkoutPlanDraft({
    weeklyFrequency: input.intent?.weeklyFrequency,
    estimatedSessionMinutes: input.intent?.sessionMinutes,
    calendarHorizonDays: input.intent?.calendarHorizonDays,
  });
  const output: Extract<AgentWorkoutDraftOutput, { draftKind: "plan" }> = {
    draftKind: "plan",
    draftId,
    candidateSetId: input.candidateSetId,
    candidateExerciseIds: input.candidateExerciseIds,
    draft,
    validation: {
      valid: true,
      errors: [],
      warnings: [],
      exerciseIds: input.candidateExerciseIds,
      invalidExerciseIds: [],
      outsideCandidateExerciseIds: [],
      dayEstimates: [
        {
          dayIndex: 1,
          title: "Day 1 胸肌激活",
          estimatedMinutes: input.intent?.sessionMinutes ?? 30,
          declaredEstimatedMinutes: input.intent?.sessionMinutes ?? 30,
          totalSets: 4,
          exerciseCount: input.candidateExerciseIds.length,
        },
      ],
      maxEstimatedMinutes: input.intent?.sessionMinutes ?? 30,
      totalWeeklySets: 4,
    },
    recovery: {
      recoverable: false,
      guidanceMessage: "校验通过",
      suggestedReplies: [],
    },
  };

  return {
    toolResultId: `tool-result-${draftId}`,
    toolCallId: `tool-call-${draftId}`,
    toolName: "generatePlanDraft",
    status: "success",
    draftId,
    candidateSetId: input.candidateSetId,
    output,
    modelSummary: {
      draftId,
      candidateSetId: input.candidateSetId,
    },
    traceSummary: {
      draftId,
      candidateSetId: input.candidateSetId,
    },
  };
}

function createMockExerciseSearchResult(input: {
  candidates: ReturnType<typeof createExercise>[];
  candidateUse: "routine" | "plan" | "patch" | "recommendation" | "answer_only";
  appliedFilters: Record<string, unknown>;
}) {
  const exerciseIds = input.candidates.map((exercise) => exercise.id);

  return {
    candidates: input.candidates,
    diagnostics: {
      filters: {
        candidateUse: input.candidateUse,
        ...input.appliedFilters,
      },
      normalizedQueryInput: {
        operation: "build_exercise_candidate_set",
        candidateUse: input.candidateUse,
        filters: input.appliedFilters,
        resultRequirements: {},
        softPreferences: {},
        projection: {},
      },
      appliedFilters: input.appliedFilters,
      invalidFilters: [],
      constraintProof: exerciseIds.map((exerciseId) => ({
        exerciseId,
        matchedFilters: Object.keys(input.appliedFilters),
      })),
      resultRequirementProof: {},
      satisfied: true,
      queryMode: "none",
      unmetResultRequirements: [],
      expandedTargetMuscles: [],
      recalledCount: input.candidates.length,
      filteredCount: 0,
      rerank: [],
      finalExerciseIds: exerciseIds,
      failureReasons: [],
      unmatchedTargetMuscles: [],
      unmatchedEquipment: [],
      suggestedTargetMuscles: [],
      suggestedEquipment: [],
      retryable: false,
    },
  };
}

function createCandidateSetContext(
  candidateSetId: string,
  exerciseIds: string[],
  overrides: Partial<AgentToolExecutionContext> = {},
  candidateUse: "routine" | "plan" | "patch" | "recommendation" | "answer_only" = "routine",
): AgentToolExecutionContext {
  return createToolExecutionContext({
    ...overrides,
    toolResults: [
      createCandidateSetToolResult(candidateSetId, exerciseIds, candidateUse),
      ...(overrides.toolResults ?? []),
    ],
  });
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

function createWorkoutPatchFixture(input: {
  replacementExerciseId: string;
  sourceExerciseId?: string;
  artifactId?: string;
  artifactKind?: "routine" | "plan";
}) {
  const artifactId = input.artifactId ?? "artifact-1";
  const artifactKind = input.artifactKind ?? "routine";
  const sourceExerciseId = input.sourceExerciseId ?? "push-up";

  return {
    scope: "artifact_only" as const,
    target: { artifactId, artifactKind },
    operations: [
      {
        operation: "replace_exercise" as const,
        target: {
          artifactId,
          artifactKind,
          section: "training" as const,
          exerciseId: sourceExerciseId,
          occurrenceIndex: 1,
        },
        replacementExerciseId: input.replacementExerciseId,
        preserve: {
          section: true,
          order: true,
          sets: true,
          target: true,
          duration: true,
          rest: true,
        },
        reason: "替换为候选集合中的动作。",
      },
    ],
    reason: "用户要求替换主训练动作。",
  };
}

function createTestContextPackage(
  overrides: Partial<Parameters<ReturnType<typeof createAgentContextBuilder>["build"]>[0]> = {},
) {
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
        exerciseIds: [],
        updatedAt: "2026-06-01T01:01:00.000Z",
      },
    ],
    memorySnapshot: {
      snapshotId: "memory-1",
      facts: ["用户在家训练"],
      preferences: ["低冲击"],
      avoidances: ["跳跃"],
      equipment: [],
    },
    ...overrides,
  });
}

function createRecommendationArtifactPayload(exerciseIds: string[]) {
  return {
    title: "为你推荐的动作",
    goal: "臀腿训练",
    summary: `已根据你的条件筛选出 ${exerciseIds.length} 个动作。`,
    items: exerciseIds.map((exerciseId) => ({
      exerciseId,
      nameZh: exerciseId,
      nameEn: exerciseId,
      categoryZh: "力量训练",
      levelZh: "初级",
      equipmentZh: "自重",
      primaryMusclesZh: ["臀部"],
      secondaryMusclesZh: [],
      reasons: ["来自推荐卡片"],
    })),
    safetyNotes: [],
  };
}
