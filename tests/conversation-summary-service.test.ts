import { describe, expect, it } from "vitest";

import { buildFallbackConversationSummary } from "@/lib/server/chat/conversation-summary-service";

describe("conversation summary service", () => {
  it("builds a bounded deterministic fallback summary when model summarization is unavailable", () => {
    const summary = buildFallbackConversationSummary({
      previousSummary: "用户想在家自重练胸，经验为新手。",
      latestUserMessage: "换一批，不要俯卧撑。",
      assistantReply: "我会避开俯卧撑方向重新整理。",
      internalActionSummary: JSON.stringify({
        action: "exercise_recommendation",
        intent: { goal: "胸肌训练", equipment: ["自重"] },
      }),
    });

    expect(summary).toContain("用户想在家自重练胸");
    expect(summary).toContain("换一批，不要俯卧撑");
    expect(summary).toContain("服务端内部动作");
    expect(summary.length).toBeLessThanOrEqual(2000);
  });
});
