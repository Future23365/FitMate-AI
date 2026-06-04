import { describe, expect, it } from "vitest";

import {
  getMessageAssistantSuggestions,
  normalizeAssistantSuggestions,
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

  it("keeps legacy suggested replies from saved messages without stream events", () => {
    expect(
      getMessageAssistantSuggestions({
        id: "m1",
        role: "assistant",
        content: "需要补充条件。",
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

  it("validates unified suggestion objects without depending on Agent projection", () => {
    expect(
      normalizeAssistantSuggestions([
        {
          label: "查看动作",
          message: "查看第一个动作",
          kind: "next_action",
          blocking: false,
          source: "exercise_recommendation",
          targetOperation: "view_artifact",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        label: "查看动作",
        message: "查看第一个动作",
        targetOperation: "view_artifact",
      }),
    ]);
  });
});
