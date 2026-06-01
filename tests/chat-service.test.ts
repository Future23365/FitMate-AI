import { describe, expect, it } from "vitest";

import {
  buildAgentArtifactStreamEvents,
  buildAgentDecisionModelInput,
  buildAgentStreamEvents,
  chatRequestSchema,
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

  it("emits only Agent stream contract events without assistant_action or intent_resolved", () => {
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
        legacyPathSkip: {
          intentFirst: true,
          normalize: true,
          summaryOnlyContext: true,
          referenceResolverFirst: true,
          readonlyToolLoop: true,
          assistantActionEvent: true,
        },
      },
    });

    expect(events.map((event) => event.type)).toEqual(["agent_execution_result"]);
    expect(events.map((event) => event.type)).not.toContain("assistant_action");
    expect(events.map((event) => event.type)).not.toContain("intent_resolved");
    expect(events[0].metadata.legacyPathSkip).toMatchObject({
      intentFirst: true,
      readonlyToolLoop: true,
      assistantActionEvent: true,
    });
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
  });
});
