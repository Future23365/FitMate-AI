import { describe, expect, it } from "vitest";

import { applyAgentTextChatEventToAssistantMessage } from "@/features/chat/hooks/use-chat-controller";
import type { ChatMessage } from "@/features/chat/types";

function createAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "",
    isReasoning: true,
    ...overrides,
  };
}

describe("chat controller Agent text event projection", () => {
  it("appends content chunks to the current assistant message", () => {
    const first = applyAgentTextChatEventToAssistantMessage(createAssistantMessage(), {
      type: "content",
      content: "你好，",
    });
    const second = applyAgentTextChatEventToAssistantMessage(first, {
      type: "content",
      content: "可以开始。",
    });

    expect(second).toMatchObject({
      content: "你好，可以开始。",
      isReasoning: false,
    });
  });

  it("stores assistant_suggestions as user-clickable suggested replies", () => {
    expect(
      applyAgentTextChatEventToAssistantMessage(createAssistantMessage({ content: "你想练多久？" }), {
        type: "assistant_suggestions",
        suggestions: ["20 分钟", "40 分钟"],
      }),
    ).toMatchObject({
      content: "你想练多久？",
      suggestedReplies: ["20 分钟", "40 分钟"],
      isReasoning: false,
    });
  });

  it("writes stream errors into the assistant bubble and clears loading markers", () => {
    expect(
      applyAgentTextChatEventToAssistantMessage(createAssistantMessage(), {
        type: "error",
        error: {
          code: "chat_ai_not_configured",
          message: "Chat AI model configuration is missing.",
        },
      }),
    ).toMatchObject({
      content: "Chat AI model configuration is missing.",
      isReasoning: false,
    });
  });

  it("clears reasoning state on done without inventing business card results", () => {
    expect(
      applyAgentTextChatEventToAssistantMessage(createAssistantMessage({ content: "完成。" }), {
        type: "done",
      }),
    ).toEqual({
      id: "assistant-1",
      role: "assistant",
      content: "完成。",
      isReasoning: false,
    });
  });
});
