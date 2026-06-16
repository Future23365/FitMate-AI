import { describe, expect, it } from "vitest";

import { prepareChatRequest } from "@/lib/server/chat/chat-service";
import { createLangChainAgentTextChatMessages } from "@/lib/server/chat/langchain-agent-text-chat-service";
import { aiContextMessageContentMaxLength } from "@/lib/shared/chat/conversation-context-limits";

import { createChatConversation, createConversationContext } from "./fixtures/domain";

describe("chat service request preparation", () => {
  it("keeps current run facts ahead of saved conversation context during hydration", () => {
    const latestUserMessage = "就按刚才的训练编排，安排未来 7 天，每周 4 练。";
    const savedConversation = createChatConversation({
      messages: [
        { id: "message-1", role: "user", content: "我有哑铃，每周 2 次，每次 30 分钟。" },
        { id: "message-2", role: "assistant", content: "已经给你整理了一套单次训练。" },
      ],
      conversationContext: createConversationContext({
        summary: "最近用户输入：我有哑铃，每周 2 次，每次 30 分钟。",
        knownFacts: {
          goal: "胸肌训练",
          experience: "beginner",
          sessionMinutes: 30,
          weeklyFrequency: 2,
          equipment: ["哑铃"],
          injuryLimitations: [],
          preferences: ["健身房训练"],
          avoidances: [],
          latestUserMessage: "我有哑铃，每周 2 次，每次 30 分钟。",
        },
      }),
    });

    const prepared = prepareChatRequest(
      {
        latestUserMessage,
        conversationSummary: "",
      },
      { savedConversation },
    );

    expect(prepared.hydration.source).toBe("server_saved");
    expect(prepared.rawMessages.at(-1)).toMatchObject({
      role: "user",
      content: latestUserMessage,
    });
    expect(prepared.internalConversationContext.knownFacts.latestUserMessage).toBe(latestUserMessage);
    expect(prepared.internalConversationContext.knownFacts.weeklyFrequency).toBe(4);
    expect(prepared.internalConversationContext.knownFacts.calendarHorizonDays).toBe(7);
    expect(prepared.internalConversationContext.knownFacts.sessionMinutes).toBe(30);
    expect(prepared.internalConversationContext.knownFacts.equipment).toEqual(["哑铃"]);
    expect(prepared.internalConversationContext.summary).toContain(`最近用户输入：${latestUserMessage}`);
    expect(prepared.internalConversationContext.summary).not.toContain("最近用户输入：我有哑铃，每周 2 次");
  });

  it("keeps server summaries and hydration metadata out of model-visible chat messages", () => {
    const latestUserMessage = "今天只想练胸，30 分钟。";
    const savedConversation = createChatConversation({
      id: "conversation-context-only",
      messages: [
        { id: "message-1", role: "user", content: "我之前每周 2 练。" },
        { id: "message-2", role: "assistant", content: "我记下了你的训练频率。" },
      ],
      conversationContext: createConversationContext({
        summary: "最近用户输入：我之前每周 2 练。",
      }),
    });
    const prepared = prepareChatRequest(
      {
        latestUserMessage,
        conversationSummary: "客户端传来的摘要不应直接进入模型消息。",
        conversationId: "conversation-context-only",
        responseMessageId: "assistant-context-only",
        thinkingEnabled: false,
      },
      { savedConversation },
    );

    const messages = createLangChainAgentTextChatMessages(prepared);
    const serializedMessages = JSON.stringify(messages);

    expect(prepared.hydration.source).toBe("server_saved");
    expect(prepared.conversationSummaryContext.summary.length).toBeGreaterThan(0);
    expect(prepared.internalConversationContext.summary.length).toBeGreaterThan(0);
    expect(messages).toEqual(prepared.rawMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })));
    expect(messages.at(-1)).toEqual({ role: "user", content: latestUserMessage });
    expect(serializedMessages).not.toContain("conversationSummary");
    expect(serializedMessages).not.toContain("fitnessContext");
    expect(serializedMessages).not.toContain("hydration");
    expect(serializedMessages).not.toContain("conversationId");
    expect(serializedMessages).not.toContain("responseMessageId");
    expect(serializedMessages).not.toContain("thinkingEnabled");
    expect(serializedMessages).not.toContain("客户端传来的摘要不应直接进入模型消息");
  });

  it("keeps long latest user messages within the expanded model input budget", () => {
    const latestUserMessage = `我需要完整说明训练限制：${"胸背腿肩核心都要覆盖。".repeat(500)}`;

    expect(latestUserMessage.length).toBeLessThan(aiContextMessageContentMaxLength);

    const prepared = prepareChatRequest({ latestUserMessage, conversationSummary: "" });
    const messages = createLangChainAgentTextChatMessages(prepared);

    expect(messages).toEqual([{ role: "user", content: latestUserMessage }]);
  });
});
