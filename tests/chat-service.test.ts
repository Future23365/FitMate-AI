import { describe, expect, it } from "vitest";

import {
  chatRequestSchema,
  createChatUnavailableResponse,
  prepareChatRequest,
} from "@/lib/server/chat/chat-service";
import { createChatConversation } from "./fixtures/domain";

describe("chat service disabled runtime boundary", () => {
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

  it("hydrates saved server messages without constructing Agent execution facts", () => {
    const savedConversation = createChatConversation({
      messages: [
        { id: "m1", role: "user", content: "我想练胸", createdAt: "2026-06-01T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已生成训练", createdAt: "2026-06-01T00:01:00.000Z" },
      ],
      conversationSummary: { summary: "用户想练胸。" },
    });
    const prepared = prepareChatRequest(
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
    expect(prepared).not.toHaveProperty("contextPackage");
    expect(prepared).not.toHaveProperty("agentExecutionResult");
  });

  it("returns a plain unavailable response instead of model, tool, trace, or Agent stream events", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "今天练胸",
      conversationSummary: "",
    });
    const response = createChatUnavailableResponse({
      request: prepared,
      currentUser: { id: "user-1" },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "chat_ai_disabled",
      userId: "user-1",
      hydration: expect.objectContaining({
        source: "latest_message",
      }),
    });
  });
});
