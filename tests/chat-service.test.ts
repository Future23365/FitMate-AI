import { describe, expect, it } from "vitest";

import { prepareChatRequest } from "@/lib/server/chat/chat-service";

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
});
