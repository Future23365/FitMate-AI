import { describe, expect, it } from "vitest";

import {
  buildConversationSummaryContext,
  buildFitnessConversationContext,
  formatConversationSummaryContextForPrompt,
  formatFitnessConversationContextForPrompt,
  initializeConversationSummary,
  selectMessagesForLegacyContextMigration,
} from "@/lib/shared/chat/fitness-conversation-context";

import { createWorkoutPlanIntent } from "./fixtures/domain";

describe("fitness conversation context", () => {
  it("keeps first message, recent window, and durable facts without using legacy trigger intent", () => {
    const triggerIntent = createWorkoutPlanIntent({
      goal: "胸肌增肌",
      sessionMinutes: 35,
      equipment: ["自重"],
    });
    const messages = [
      { role: "user" as const, content: "我想减脂，每周 3 次，每次 30 分钟，自重训练。" },
      ...Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? ("assistant" as const) : ("user" as const),
        content: index === 3 ? "我不想做跳跃动作。" : `闲聊 ${index}`,
      })),
      {
        role: "assistant" as const,
        content: `已整理。\n\`\`\`json\n${JSON.stringify({
          type: "workout_routine_trigger",
          intent: triggerIntent,
        })}\n\`\`\``,
      },
      { role: "user" as const, content: "换一批动作" },
    ];

    const selected = selectMessagesForLegacyContextMigration(messages, { maxMessages: 8, recentWindow: 4 });
    const context = buildFitnessConversationContext(messages);
    const prompt = formatFitnessConversationContextForPrompt(context);
    const summaryContext = buildConversationSummaryContext({
      summary: context.summary,
      latestUserMessage: "换一批动作",
    });
    const summaryPrompt = formatConversationSummaryContextForPrompt(summaryContext);

    expect(selected[0].content).toContain("我想减脂");
    expect(selected.some((message) => message.content.includes("跳跃"))).toBe(true);
    expect(selected.at(-1)?.content).toBe("换一批动作");
    expect(context.currentIntent).toBeUndefined();
    expect(context.knownFacts.injuryLimitations).toEqual([]);
    expect(context.knownFacts.avoidances).toContain("我不想做跳跃动作。");
    expect(prompt).toContain("conversationSummary:");
    expect(prompt).not.toContain("knownFacts");
    expect(summaryPrompt).toContain("conversationSummary:");
    expect(prompt).not.toContain("胸肌增肌");
  });

  it("initializes natural language summary from legacy conversation context", () => {
    const summary = initializeConversationSummary(
      [{ role: "user", content: "今天在家练胸 30 分钟" }],
      { summary: "用户想在家练胸肌。" },
    );

    expect(summary).toMatchObject({
      summary: "用户想在家练胸肌。",
      latestUserMessage: "今天在家练胸 30 分钟",
    });
  });

  it("does not extract operational requests or short replies into knownFacts.goal", () => {
    for (const content of ["保存刚才生成的训练", "查看刚才生成的训练", "好的", "没有", "取消吧"]) {
      const context = buildFitnessConversationContext([{ role: "user", content }]);

      expect(context.knownFacts.goal).toBeUndefined();
      expect(context.knownFacts.latestUserMessage).toBe(content);
    }
  });

  it("keeps low-ambiguity facts without inferring a high-level goal", () => {
    const context = buildFitnessConversationContext([
      { role: "user", content: "我有哑铃，每周 3 次，每次 30 分钟。" },
    ]);

    expect(context.knownFacts.goal).toBeUndefined();
    expect(context.knownFacts.sessionMinutes).toBe(30);
    expect(context.knownFacts.weeklyFrequency).toBe(3);
    expect(context.knownFacts.equipment).toEqual(["哑铃"]);
  });
});
