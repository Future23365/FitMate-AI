import { describe, expect, it } from "vitest";

import { createToolFirstAgentToolRegistry, parseAgentToolDecision } from "@/lib/server/agent-orchestrator";
import {
  buildAgentArtifactStreamEvents,
  buildAgentDecisionModelInput,
  buildAgentStreamEvents,
  chatRequestSchema,
  createAgentActivityStreamEvent,
  encodeChatStreamEvent,
  parseJsonObject,
  prepareAiChatRequest,
} from "@/lib/server/chat/chat-service";
import { createChatConversation } from "./fixtures/domain";

describe("chat service Agent-only contract", () => {
  it("accepts current chat request shape and ignores removed legacy event toggles", () => {
    const parsed = chatRequestSchema.parse({
      latestUserMessage: "给我一个 30 分钟居家训练",
      conversationSummary: "",
      emitLegacyEvents: true,
    });

    expect(parsed).toEqual({
      latestUserMessage: "给我一个 30 分钟居家训练",
      conversationSummary: "",
    });
    expect("emitLegacyEvents" in parsed).toBe(false);
  });

  it("hydrates saved server messages but keeps conversationSummary outside Agent execution facts", () => {
    const savedConversation = createChatConversation({
      messages: [
        { id: "m1", role: "user", content: "我想练胸", createdAt: "2026-06-01T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已生成训练", createdAt: "2026-06-01T00:01:00.000Z" },
      ],
      conversationSummary: { summary: "用户想练胸。" },
    });
    const prepared = prepareAiChatRequest(
      {
        conversationId: savedConversation.id,
        latestUserMessage: "换成徒手",
        conversationSummary: "客户端摘要不可信。",
      },
      { savedConversation },
    );

    expect(prepared.rawMessages.map((message) => message.content)).toEqual([
      "我想练胸",
      "已生成训练",
      "换成徒手",
    ]);
    expect(prepared.conversationSummaryContext.summary).toBe("用户想练胸。");
    expect(prepared.hydration.source).toBe("server_saved");
    expect(prepared).not.toHaveProperty("resolvedIntent");
  });

  it("emits Agent stream contract events without assistant_action or intent_resolved", () => {
    const events = buildAgentStreamEvents({
      agentResult: {
        status: "answered",
        replyContext: { reply: "可以，改成徒手训练。" },
        usedToolResultIds: ["tool-result-1"],
      },
      projection: {
        status: "answered",
        reply: "可以，改成徒手训练。",
        assistantSuggestions: [],
        references: [],
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: true,
        },
      },
      replayFixture: {
        runId: "agent-run-1",
        contextSummary: {},
        toolDecisions: [],
        toolResults: [],
        dependencyGraph: { nodes: [], edges: [] },
        finalResult: {
          status: "answered",
          replyContext: { reply: "可以，改成徒手训练。" },
          usedToolResultIds: ["tool-result-1"],
        },
        repairSummary: {
          repairTurnCount: 0,
          repairFeedbackCodes: [],
          unregisteredResourceReferences: [],
          fusedFailureCount: 0,
          compressedFeedbackCount: 0,
          rawFeedbackCount: 0,
        },
        legacyPathSkip: {
          intentFirst: true,
          normalize: true,
          summaryOnlyContext: true,
          referenceResolverFirst: true,
          readonlyToolLoop: true,
          assistantActionEvent: true,
        },
      },
      activitySequence: 7,
    });

    expect(events.map((event) => event.type)).toEqual(["agent_activity", "agent_execution_result"]);
    expect(events.map((event) => event.type)).not.toContain("assistant_action");
    expect(events.map((event) => event.type)).not.toContain("intent_resolved");
    expect(events[0].metadata).toEqual({
      stage: "writing_reply",
      status: "active",
      messageKey: "writing_reply",
      sequence: 7,
    });
    expect(events[1].metadata.legacyPathSkip).toMatchObject({
      intentFirst: true,
      readonlyToolLoop: true,
      assistantActionEvent: true,
    });
  });

  it("builds user-safe activity events before user-visible content", () => {
    const activity = createAgentActivityStreamEvent({
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 1,
      toolName: "searchExercises",
      prompt: "hidden prompt",
      resourceId: "candidate-set-1",
      toolPayload: { query: "胸部" },
    } as Parameters<typeof createAgentActivityStreamEvent>[0] & Record<string, unknown>);
    const content = { type: "content", metadata: { delta: "hi" } };
    const events = [activity, content];

    expect(events.findIndex((event) => event.type === "agent_activity"))
      .toBeLessThan(events.findIndex((event) => event.type === "content"));
    expect(activity.metadata).toEqual({
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 1,
    });
    expect(activity.metadata).not.toHaveProperty("toolName");
    expect(activity.metadata).not.toHaveProperty("prompt");
    expect(activity.metadata).not.toHaveProperty("resourceId");
    expect(activity.metadata).not.toHaveProperty("toolPayload");
  });

  it("encodes ndjson stream events and parses fenced JSON", () => {
    const encoded = new TextDecoder().decode(encodeChatStreamEvent("content", "hi", { traceId: "trace-1" }));

    expect(JSON.parse(encoded)).toEqual({ type: "content", delta: "hi", traceId: "trace-1" });
    expect(parseJsonObject("```json\n{\"action\":\"final_result\"}\n```")).toEqual({
      ok: true,
      value: { action: "final_result" },
    });
    expect(parseJsonObject("{broken")).toMatchObject({ ok: false, code: "invalid_json" });
  });

  it("recovers wrapped Agent JSON while preserving parse recovery diagnostics", () => {
    const parsed = parseJsonObject("模型回复如下：\n{\"action\":\"call_tool\",\"toolName\":\"validateRoutineDraft\",\"input\":{\"draftId\":\"draft_1\"},\"reason\":\"继续校验\"}}\n请执行。");

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        action: "call_tool",
        toolName: "validateRoutineDraft",
      },
      recovery: {
        strategy: "balanced_json_object",
        strictFailure: {
          code: "invalid_json",
          message: "AI returned invalid JSON.",
        },
        discardedTrailingChars: expect.any(Number),
        recoveredTextLength: expect.any(Number),
      },
    });
  });

  it("projects referenced searchExercises results into recommendation card events", async () => {
    const events = await buildAgentArtifactStreamEvents({
      userId: "user-1",
      result: {
        status: "answered",
        replyContext: { reply: "给你 2 个弹力带臀腿动作。" },
        usedToolResultIds: ["tool-result-rec"],
      },
      projection: {
        status: "answered",
        reply: "给你 2 个弹力带臀腿动作。",
        assistantSuggestions: [],
        references: [{ kind: "tool_result", id: "tool-result-rec" }],
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
        },
      },
      context: {
        latestUserMessage: "推荐几个适合新手的臀腿动作，我只有弹力带",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      toolResults: [{
        toolResultId: "tool-result-rec",
        toolCallId: "tool-call-rec",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-rec",
        output: {
          candidateSetId: "candidate-set-rec",
          candidateUse: "recommendation",
          candidates: [
            {
              id: "Band_Good_Morning",
              imageUrls: ["/band-good-morning.png"],
            },
          ],
        },
        modelSummary: {
          candidateSetId: "candidate-set-rec",
          candidateUse: "recommendation",
          candidates: [
            {
              exerciseId: "Band_Good_Morning",
              nameZh: "弹力带早安式",
              nameEn: "Band Good Morning",
              categoryZh: "力量训练",
              levelZh: "初级",
              equipmentZh: "弹力带",
              primaryMusclesZh: ["腘绳肌"],
              secondaryMusclesZh: ["臀部"],
              goalTags: ["beginner_friendly"],
            },
          ],
        },
      }],
    });

    expect(events.map((event) => event.type)).toEqual(["artifact_validated", "artifact"]);
    expect(events[0].metadata).toMatchObject({
      artifactKind: "exercise_recommendation",
      artifactId: "recommendation_candidate-set-rec",
      payload: {
        title: "为你推荐的动作",
        summary: "已根据你的条件筛选出 1 个动作。",
        items: [
          expect.objectContaining({
            exerciseId: "Band_Good_Morning",
            nameZh: "弹力带早安式",
            imageUrl: "/band-good-morning.png",
          }),
        ],
      },
    });
  });

  it("projects recommendation cards after normalizing a final_result that omitted reason", async () => {
    const parsed = parseAgentToolDecision({
      action: "final_result",
      result: {
        status: "answered",
        replyContext: { reply: "给你几个弹力带臀腿动作。" },
        usedToolResultIds: ["tool-result-rec"],
      },
    }, createToolFirstAgentToolRegistry());

    if (!parsed.ok || parsed.decision.action !== "final_result") {
      throw new Error("Expected normalized final_result decision.");
    }

    const events = await buildAgentArtifactStreamEvents({
      userId: "user-1",
      result: parsed.decision.result,
      context: {
        latestUserMessage: "推荐几个适合新手的臀腿动作，我只有弹力带，不想做跳跃",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      toolResults: [{
        toolResultId: "tool-result-rec",
        toolCallId: "tool-call-rec",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-rec",
        modelSummary: {
          candidateSetId: "candidate-set-rec",
          candidateUse: "recommendation",
          candidates: [
            {
              exerciseId: "Squats_-_With_Bands",
              nameZh: "弹力带深蹲",
              categoryZh: "力量训练",
              levelZh: "初级",
              equipmentZh: "弹力带",
              primaryMusclesZh: ["股四头肌"],
              secondaryMusclesZh: ["臀部", "腘绳肌"],
              goalTags: ["beginner_friendly"],
            },
          ],
        },
      }],
    });

    expect(parsed.decision.reason).toContain("缺少 reason");
    expect(events.map((event) => event.type)).toEqual(["artifact_validated", "artifact"]);
    expect(events[0].metadata).toMatchObject({
      artifactKind: "exercise_recommendation",
      payload: {
        items: [
          expect.objectContaining({
            exerciseId: "Squats_-_With_Bands",
            nameZh: "弹力带深蹲",
          }),
        ],
      },
    });
  });

  it("projects recommendation card events from successful recommendation tool results when final result omits references", async () => {
    const events = await buildAgentArtifactStreamEvents({
      userId: "user-1",
      result: {
        status: "answered",
        replyContext: { reply: "给你几个胸部动作。" },
        usedToolResultIds: [],
      },
      projection: {
        status: "answered",
        reply: "给你几个胸部动作。",
        assistantSuggestions: [],
        references: [],
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
        },
      },
      context: {
        latestUserMessage: "今天我想练胸",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      toolResults: [{
        toolResultId: "tool-result-rec",
        toolCallId: "tool-call-rec",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-rec",
        modelSummary: {
          candidateSetId: "candidate-set-rec",
          candidateUse: "recommendation",
          candidates: [
            {
              exerciseId: "Push_Up",
              nameZh: "俯卧撑",
              nameEn: "Push Up",
              categoryZh: "力量训练",
              levelZh: "初级",
              equipmentZh: "自重",
              primaryMusclesZh: ["胸部"],
              secondaryMusclesZh: ["肱三头肌"],
            },
          ],
        },
      }],
    });

    expect(events.map((event) => event.type)).toEqual(["artifact_validated", "artifact"]);
    expect(events[0].metadata).toMatchObject({
      artifactKind: "exercise_recommendation",
      artifactId: "recommendation_candidate-set-rec",
    });
  });

  it("does not project routine candidate sets into exercise recommendation cards", async () => {
    const events = await buildAgentArtifactStreamEvents({
      userId: "user-1",
      result: {
        status: "answered",
        replyContext: { reply: "以下是一套30分钟上肢训练计划。" },
        usedToolResultIds: ["tool-result-routine"],
      },
      projection: {
        status: "answered",
        reply: "以下是一套30分钟上肢训练计划。",
        assistantSuggestions: [],
        references: [{ kind: "tool_result", id: "tool-result-routine" }],
        metadata: {
          promisedWrite: false,
          hasExecutedWrite: false,
          safeOperationOnly: false,
        },
      },
      toolResults: [{
        toolResultId: "tool-result-routine",
        toolCallId: "tool-call-routine",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-routine",
        modelSummary: {
          candidateSetId: "candidate-set-routine",
          candidateUse: "routine",
          candidates: [{ exerciseId: "e1", nameZh: "动作" }],
        },
      }],
    });

    expect(events).toEqual([]);
  });

  it("slims Agent decision model input and removes verbose search diagnostics", () => {
    const input = buildAgentDecisionModelInput({
      contextPackage: {
        latestUserMessage: "推荐几个动作",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      registeredTools: [{
        name: "searchExercises",
        description: "检索动作",
        accessLevel: "read",
        inputJsonSchemaHint: {
          type: "object",
          required: ["candidateUse"],
          properties: {
            candidateUse: { type: "string", enum: ["answer_only", "recommendation"] },
            allowedSections: {
              type: "array",
              maxItems: 3,
              items: { type: "string", enum: ["warmup", "training", "stretch"] },
            },
            targetMuscles: { type: "array", maxItems: 16, items: { type: "string" } },
          },
        },
        dependencies: [],
      }],
      toolResults: [{
        toolResultId: "tool-result-rec",
        toolCallId: "tool-call-rec",
        toolName: "searchExercises",
        status: "success",
        candidateSetId: "candidate-set-rec",
        modelSummary: {
          candidates: [{ exerciseId: "e1", nameZh: "动作", instructionsZh: ["很长的说明"] }],
          diagnostics: {
            query: "臀腿",
            recalledCount: 1,
            rerank: [{ exerciseId: "e1", score: { totalScore: 99 } }],
          },
        },
      }],
      dependencyGraph: {
        nodes: [{ id: "tool-call-rec", kind: "tool_call", label: "searchExercises" }],
        edges: [],
      },
      remainingSteps: 9,
    });

    const serialized = JSON.stringify(input.input);

    expect(input.budget.slimmedChars).toBeLessThan(input.budget.originalChars);
    expect(serialized).toContain("inputFields");
    expect(serialized).toContain("warmup");
    expect(serialized).toContain("training");
    expect(serialized).toContain("stretch");
    expect(serialized).not.toContain("rerank");
    expect(serialized).not.toContain("instructionsZh");
    expect(serialized).not.toContain("\"variant\"");
  });

  it("keeps evaluatePolicy union branch fields visible after model input slimming", () => {
    const input = buildAgentDecisionModelInput({
      contextPackage: {
        latestUserMessage: "给我生成一套 30 分钟上肢训练",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      registeredTools: createToolFirstAgentToolRegistry().listModelDefinitions(),
      toolResults: [],
      dependencyGraph: { nodes: [], edges: [] },
      remainingSteps: 6,
    });

    const toolSummary = input.input.registeredTools.find((tool) => tool.name === "evaluatePolicy");
    const inputFields = toolSummary?.inputFields;

    expect(Array.isArray(inputFields)).toBe(true);

    const variants = inputFields as Array<{ fields?: Array<Record<string, unknown>> }>;
    const newArtifactFields = variants
      .find((variant) => variant.fields?.some((field) => field.name === "policyTarget" && field.const === "new_artifact"))
      ?.fields;

    expect(newArtifactFields).toBeDefined();
    expect(newArtifactFields).toContainEqual(expect.objectContaining({
      name: "policyTarget",
      required: true,
      const: "new_artifact",
    }));
    expect(newArtifactFields).toContainEqual(expect.objectContaining({
      name: "artifactKind",
      required: true,
      enum: ["routine", "plan"],
    }));
    expect(newArtifactFields).toContainEqual(expect.objectContaining({
      name: "draftId",
      required: true,
    }));
  });

  it("keeps nested searchExercises schema shapes visible after model input slimming", () => {
    const input = buildAgentDecisionModelInput({
      contextPackage: {
        latestUserMessage: "今天想练上肢，30 分钟，有哑铃，帮我安排一套",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      registeredTools: createToolFirstAgentToolRegistry().listModelDefinitions(),
      toolResults: [],
      dependencyGraph: { nodes: [], edges: [] },
      remainingSteps: 6,
    });

    const searchFields = getToolInputFields(input.input.registeredTools, "searchExercises");
    const topLevelQuery = findField(searchFields, "query");
    const resultRequirements = findField(searchFields, "resultRequirements");
    const resultRequirementFields = readFieldList(resultRequirements.properties);
    const sectionCoverage = findField(resultRequirementFields, "sectionCoverage");
    const sectionCoverageValue = sectionCoverage.additionalProperties as Record<string, unknown> | undefined;
    const sectionCoverageValueFields = readFieldList(sectionCoverageValue?.properties);
    const softPreferences = findField(searchFields, "softPreferences");
    const softPreferenceFields = readFieldList(softPreferences.properties);

    expect(topLevelQuery).toMatchObject({
      name: "query",
      type: "string",
    });
    expect(sectionCoverage).toMatchObject({
      name: "sectionCoverage",
      type: "object",
      propertyNames: expect.objectContaining({
        enum: ["warmup", "training", "stretch"],
      }),
    });
    expect(sectionCoverageValue).toMatchObject({
      type: "object",
    });
    expect(sectionCoverageValueFields).toContainEqual(expect.objectContaining({
      name: "min",
      required: true,
      type: "integer",
      min: 1,
      max: 40,
    }));
    expect(softPreferenceFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "preferredEquipment" }),
      expect.objectContaining({ name: "preferredMuscles" }),
      expect.objectContaining({ name: "preferredDifficulty" }),
    ]));
    expect(softPreferenceFields.some((field) => field.name === "query")).toBe(false);
  });

  it("keeps nested generation tool schema shapes visible after model input slimming", () => {
    const input = buildAgentDecisionModelInput({
      contextPackage: {
        latestUserMessage: "生成一套长期计划",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      registeredTools: createToolFirstAgentToolRegistry().listModelDefinitions(),
      toolResults: [],
      dependencyGraph: { nodes: [], edges: [] },
      remainingSteps: 6,
    });

    const routineFields = getToolInputFields(input.input.registeredTools, "generateRoutineDraft");
    const routineIntent = findField(routineFields, "intent");
    const routineIntentFields = readFieldList(routineIntent.properties);
    const planFields = getToolInputFields(input.input.registeredTools, "generatePlanDraft");
    const planStrategy = findField(planFields, "strategy");
    const planStrategyFields = readFieldList(planStrategy.properties);
    const policyFields = input.input.registeredTools
      .find((tool) => tool.name === "evaluatePolicy")
      ?.inputFields as Array<{ fields?: Array<Record<string, unknown>> }>;
    const artifactRevisionFields = policyFields
      .find((variant) => variant.fields?.some((field) => field.name === "policyTarget" && field.const === "artifact_revision"))
      ?.fields ?? [];

    expect(routineIntentFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "intentType" }),
      expect.objectContaining({ name: "goal" }),
      expect.objectContaining({ name: "sessionMinutes" }),
      expect.objectContaining({ name: "weeklyFrequency" }),
      expect.objectContaining({ name: "equipment" }),
    ]));
    expect(planStrategyFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "goal" }),
      expect.objectContaining({ name: "horizonDays" }),
      expect.objectContaining({ name: "weeklyFrequency" }),
      expect.objectContaining({ name: "sessionMinutes" }),
      expect.objectContaining({ name: "progressionPolicy" }),
      expect.objectContaining({ name: "fieldSources" }),
    ]));
    expect(artifactRevisionFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "policyTarget", const: "artifact_revision" }),
      expect.objectContaining({ name: "sourceArtifactId" }),
      expect.objectContaining({ name: "draftId" }),
      expect.objectContaining({ name: "patchId" }),
    ]));
  });

  it("compacts duplicate non-retryable tool failures in Agent decision model input", () => {
    const input = buildAgentDecisionModelInput({
      contextPackage: {
        latestUserMessage: "这8个动作做成一套训练",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      registeredTools: createToolFirstAgentToolRegistry().listModelDefinitions(),
      toolCalls: [
        {
          id: "tool-call-1",
          toolName: "getArtifactPayload",
          input: { artifactId: "artifact-old" },
          status: "failed",
          reason: "读取推荐 artifact。",
        },
        {
          id: "tool-call-2",
          toolName: "getArtifactPayload",
          input: { artifactId: "artifact-old" },
          status: "failed",
          reason: "重复读取推荐 artifact。",
        },
      ],
      toolResults: [
        {
          toolResultId: "tool-result-1",
          toolCallId: "tool-call-1",
          toolName: "getArtifactPayload",
          status: "failed",
          error: {
            code: "not_found",
            message: "Artifact not found or not accessible.",
            retryable: false,
          },
        },
        {
          toolResultId: "tool-result-2",
          toolCallId: "tool-call-2",
          toolName: "getArtifactPayload",
          status: "failed",
          error: {
            code: "duplicate_tool_failure",
            message: "Duplicate non-retryable tool failure was suppressed by Agent runtime.",
            retryable: false,
            detail: {
              duplicateFailureKey: "getArtifactPayload:{\"artifactId\":\"artifact-old\"}",
              originalFailureCode: "not_found",
              firstToolResultId: "tool-result-1",
              latestToolResultId: "tool-result-2",
              repeatCount: 1,
            },
          },
        },
      ],
      dependencyGraph: {
        nodes: [],
        edges: [],
      },
      remainingSteps: 8,
    });

    expect(input.input.toolResults).toHaveLength(1);
    expect(input.input.toolResults[0]).toMatchObject({
      toolResultId: "tool-result-1",
      latestToolResultId: "tool-result-2",
      repeatCount: 2,
      error: {
        code: "not_found",
        repeatCount: 2,
        latestToolResultId: "tool-result-2",
      },
    });
  });

  it("exposes compressed AgentDecisionFeedback without raw rejected decisions", () => {
    const input = buildAgentDecisionModelInput({
      contextPackage: {
        latestUserMessage: "帮我生成一套训练",
        recentMessages: [],
        recentArtifacts: [],
        memorySnapshot: { snapshotId: "memory-1", facts: [], preferences: [], avoidances: [] },
        provenance: [],
        limits: {
          maxRecentMessages: 12,
          maxRecentArtifacts: 8,
          maxMessageChars: 1200,
          maxArtifactSummaryChars: 700,
        },
      },
      registeredTools: createToolFirstAgentToolRegistry().listModelDefinitions(),
      toolCalls: [{
        id: "tool-call-feedback",
        toolName: "agentDecisionFeedback",
        input: { rawDecision: { hidden: "raw payload must stay out" } },
        status: "failed",
        reason: "模型提前 final。",
      }],
      toolResults: [{
        toolResultId: "tool-result-feedback",
        toolCallId: "tool-call-feedback",
        toolName: "agentDecisionFeedback",
        status: "failed",
        modelSummary: {
          code: "premature_final_result_before_save",
          recommendedToolName: "saveConversationArtifactRevision",
        },
        error: {
          code: "premature_final_result_before_save",
          message: "必须先保存 revision。",
          retryable: true,
        },
        decisionFeedback: {
          code: "premature_final_result_before_save",
          message: "必须先保存 revision。",
          failedAction: "final_result.generated",
          retryable: true,
          hardBoundary: false,
          availableResources: {
            toolResultIds: ["tool-result-draft"],
            candidateSetIds: ["candidate-set-1"],
            artifactPayloadIds: [],
            editPlanIds: [],
            draftIds: ["draft-1"],
            patchIds: [],
            validationIds: ["validation-1"],
            policyDecisionIds: ["policy-1"],
            confirmationIds: [],
            revisionIds: [],
            operationResultIds: [],
          },
          missingResources: [{ kind: "revision", reason: "missing producer" }],
          unregisteredReferences: [],
          recommendedNextTool: "saveConversationArtifactRevision",
          recommendedInput: { draftId: "draft-1", validationId: "validation-1", policyDecisionId: "policy-1" },
          sanitizedReason: "保存前不能返回 generated。",
          budget: {
            repairTurnCount: 0,
            maxRepairTurns: 3,
            remainingRepairTurns: 3,
            sameCodeCount: 0,
            maxSameCodePerRun: 2,
            remainingSteps: 4,
          },
        },
      }],
      dependencyGraph: { nodes: [], edges: [] },
      remainingSteps: 4,
    });

    expect(input.input.toolResults[0]).toMatchObject({
      agentDecisionFeedback: {
        code: "premature_final_result_before_save",
        recommendedNextTool: "saveConversationArtifactRevision",
        missingResources: [{ kind: "revision", reason: "missing producer" }],
      },
    });
    expect(JSON.stringify(input.input)).not.toContain("raw payload must stay out");
    expect(input.budget).toMatchObject({
      rawFeedbackCount: 1,
      compressedFeedbackCount: 1,
    });
  });
});

function getToolInputFields(tools: Array<Record<string, unknown>>, toolName: string) {
  const fields = tools.find((tool) => tool.name === toolName)?.inputFields;

  if (!Array.isArray(fields)) {
    throw new Error(`Expected ${toolName} inputFields to be an array.`);
  }

  return fields as Array<Record<string, unknown>>;
}

function findField(fields: Array<Record<string, unknown>>, name: string) {
  const field = fields.find((candidate) => candidate.name === name);

  if (!field) {
    throw new Error(`Expected field ${name} to be visible.`);
  }

  return field;
}

function readFieldList(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Expected nested field list to be visible.");
  }

  return value as Array<Record<string, unknown>>;
}
