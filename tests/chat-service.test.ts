import { describe, expect, it } from "vitest";

import {
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
});
