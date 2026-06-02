import { describe, expect, it } from "vitest";

import { readAssistantSuggestionsFromStreamEvent } from "@/features/chat/lib/assistant-suggestions";
import { buildClientFitnessConversationContext } from "@/features/chat/lib/lightweight-conversation-context";
import { readWorkoutPlanIntentLightweight } from "@/features/chat/lib/lightweight-workout-intent";

describe("chat lightweight client guards", () => {
  it("keeps valid recommendation intent without loading the full plan schema", () => {
    expect(
      readWorkoutPlanIntentLightweight({
        intentType: "routine",
        goal: "减脂",
        experience: "beginner",
        sessionMinutes: 30,
        weeklyFrequency: 3,
        equipment: ["哑铃"],
        injuryLimitations: [],
        preferences: ["居家"],
        avoidances: ["跳跃"],
      }),
    ).toMatchObject({
      intentType: "routine",
      goal: "减脂",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      equipment: ["哑铃"],
    });
  });

  it("rejects invalid recommendation intent at the UI history boundary", () => {
    expect(readWorkoutPlanIntentLightweight({ goal: "", sessionMinutes: 3 })).toBeNull();
    expect(readWorkoutPlanIntentLightweight(null)).toBeNull();
  });

  it("builds client conversation context from recent user messages", () => {
    expect(
      buildClientFitnessConversationContext([
        { role: "user", content: "我想减脂，每周 4 练，每次 45 分钟，家里只有哑铃，不想跳跃" },
        { role: "assistant", content: "可以。" },
      ]),
    ).toMatchObject({
      knownFacts: expect.objectContaining({
        goal: "减脂",
        sessionMinutes: 45,
        weeklyFrequency: 4,
        equipment: ["哑铃"],
        preferences: ["家里"],
        avoidances: ["跳跃"],
      }),
    });
  });

  it("accepts valid assistant suggestions and drops malformed entries", () => {
    expect(
      readAssistantSuggestionsFromStreamEvent({
        type: "assistant_suggestions",
        assistantSuggestions: [
          {
            label: "继续生成",
            message: "继续生成",
            kind: "next_action",
            blocking: false,
            source: "workout_generation",
          },
          { label: "", message: "bad", kind: "retry", blocking: false, source: "legacy" },
        ],
      }),
    ).toEqual([
      {
        label: "继续生成",
        message: "继续生成",
        kind: "next_action",
        blocking: false,
        source: "workout_generation",
      },
    ]);
  });
});
