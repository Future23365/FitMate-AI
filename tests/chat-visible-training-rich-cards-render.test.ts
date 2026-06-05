import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/features/chat/types";

const chatControllerMock = vi.hoisted(() => ({
  useChatController: vi.fn(),
}));

vi.mock("@/features/chat/hooks/use-chat-controller", () => ({
  useChatController: chatControllerMock.useChatController,
}));

vi.mock("@/features/exercises/components/exercise-recommendation-card", () => ({
  ExerciseRecommendationCard: ({ assistantSuggestions, card }: { assistantSuggestions?: unknown[]; card: { summary?: string; title: string } }) =>
    createElement(
      "section",
      { "data-rich-card": "exercise" },
      `${card.title}:summary=${card.summary ?? ""}:cardSuggestions=${assistantSuggestions?.length ?? 0}`,
    ),
}));

vi.mock("@/features/workouts/components/workout-routine-draft-card", () => ({
  WorkoutRoutineDraftCard: ({ draft }: { draft: { title: string } }) =>
    createElement("section", { "data-rich-card": "routine" }, draft.title),
}));

vi.mock("@/features/workouts/components/workout-plan-draft-card", () => ({
  WorkoutPlanDraftCard: ({ draft }: { draft: { title: string } }) =>
    createElement("section", { "data-rich-card": "plan" }, draft.title),
}));

vi.mock("@/features/workouts/api/workout-data-client", () => ({
  listWorkoutSchedules: vi.fn().mockResolvedValue([]),
}));

const { ChatPage } = await import("@/features/chat/components/chat-page");

describe("ChatPage visible training proposal rich card rendering", () => {
  it("renders visibleTrainingProposal through the rich card adapter without lightweight panel fields", () => {
    chatControllerMock.useChatController.mockReturnValue(createControllerState({
      messages: [
        {
          id: "assistant-visible-card",
          role: "assistant",
          content: "按你的条件推荐这些动作。",
          suggestedQuestions: ["换一批"],
          visibleOutputs: [
            {
              outputType: "visibleTrainingProposal",
              schemaVersion: "1",
              payload: {
                kind: "exercise_selection",
                exerciseItems: [
                  { exerciseId: "push-up", section: "training", order: 1 },
                ],
              },
              content: {
                kind: "exercise_selection",
                sections: [
                  {
                    section: "training",
                    items: [
                      {
                        exerciseId: "push-up",
                        section: "training",
                        order: 1,
                        exercise: {
                          exerciseId: "push-up",
                          nameZh: "俯卧撑",
                          equipmentZh: "自重",
                          primaryMusclesZh: ["胸部"],
                          imageUrl: null,
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    }));

    const html = renderToStaticMarkup(createElement(ChatPage));

    expect(html).toContain('data-rich-card="exercise"');
    expect(html).toContain("summary=共 1 个训练动作，主要覆盖胸部，器械需求：自重。");
    expect(html).toContain("cardSuggestions=0");
    expect(html).toContain("换一批");
    expect(html).not.toContain("exercise_selection");
    expect(html).not.toContain("visibleTrainingProposal");
    expect(html).not.toContain("schemaVersion");
  });

  it("does not render old trigger blocks or legacy bubble fallback cards without visibleOutputs", () => {
    chatControllerMock.useChatController.mockReturnValue(createControllerState({
      messages: [
        {
          id: "assistant-legacy",
          role: "assistant",
          content: [
            "```json",
            JSON.stringify({ type: "workout_plan_trigger", payload: { title: "旧计划卡片" } }),
            "```",
          ].join("\n"),
        },
      ],
    }));

    const html = renderToStaticMarkup(createElement(ChatPage));

    expect(html).not.toContain("旧计划卡片");
    expect(html).not.toContain("data-rich-card");
  });
});

function createControllerState(overrides: { messages: ChatMessage[] }) {
  return {
    error: "",
    input: "",
    isLoading: false,
    messages: overrides.messages,
    sendMessage: vi.fn(),
    setInput: vi.fn(),
    setThinkingEnabled: vi.fn(),
    thinkingEnabled: false,
  };
}
