import { describe, expect, it } from "vitest";

import {
  buildFitnessConversationContext,
  formatFitnessConversationContextForPrompt,
  selectMessagesForAiContext,
} from "@/lib/shared/chat/fitness-conversation-context";

import { createWorkoutPlanIntent } from "./fixtures/domain";

describe("fitness conversation context", () => {
  it("keeps first message, recent window, durable facts, and trigger intent in long conversations", () => {
    const triggerIntent = createWorkoutPlanIntent({
      goal: "胸肌增肌",
      sessionMinutes: 35,
      equipment: ["自重"],
    });
    const messages = [
      { role: "user" as const, content: "我想减脂，每周 3 次，每次 30 分钟，自重训练。" },
      ...Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? ("assistant" as const) : ("user" as const),
        content: index === 3 ? "我膝盖有点痛，避免跳跃。" : `闲聊 ${index}`,
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

    const selected = selectMessagesForAiContext(messages, { maxMessages: 8, recentWindow: 4 });
    const context = buildFitnessConversationContext(messages);
    const prompt = formatFitnessConversationContextForPrompt(context);

    expect(selected[0].content).toContain("我想减脂");
    expect(selected.some((message) => message.content.includes("膝盖"))).toBe(true);
    expect(selected.at(-1)?.content).toBe("换一批动作");
    expect(context.currentIntent).toMatchObject({
      goal: "胸肌增肌",
      sessionMinutes: 35,
      weeklyFrequency: 1,
    });
    expect(context.knownFacts.injuryLimitations).toContain("我膝盖有点痛，避免跳跃。");
    expect(context.knownFacts.avoidances).toContain("我膝盖有点痛，避免跳跃。");
    expect(prompt).toContain("fitnessConversationContext:");
    expect(prompt).toContain("胸肌增肌");
  });
});
