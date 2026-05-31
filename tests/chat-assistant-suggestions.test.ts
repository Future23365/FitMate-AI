import { describe, expect, it } from "vitest";

import {
  getMessageAssistantSuggestions,
  readAssistantSuggestionsFromStreamEvent,
} from "@/features/chat/lib/assistant-suggestions";

describe("chat assistant suggestions frontend adapter", () => {
  it("prefers unified assistantSuggestions and keeps message as click payload", () => {
    const suggestions = getMessageAssistantSuggestions({
      id: "m1",
      role: "assistant",
      content: "可以继续安排。",
      suggestedReplies: ["旧按钮"],
      assistantSuggestions: [
        {
          label: "生成训练",
          message: "按这些动作生成 30 分钟训练",
          kind: "next_action",
          blocking: false,
          source: "exercise_recommendation",
        },
      ],
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        label: "生成训练",
        message: "按这些动作生成 30 分钟训练",
      }),
    ]);
  });

  it("keeps legacy suggested_replies compatible without duplicating unified events", () => {
    expect(
      readAssistantSuggestionsFromStreamEvent({
        type: "suggested_replies",
        suggestedReplies: ["我在家自重练 30 分钟"],
      }),
    ).toEqual([
      {
        label: "我在家自重练 30 分钟",
        message: "我在家自重练 30 分钟",
        kind: "clarification",
        blocking: true,
        source: "legacy",
      },
    ]);
  });
});
