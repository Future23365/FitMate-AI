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

  it("keeps agent_progress out of the assistant message content", () => {
    expect(
      applyAgentTextChatEventToAssistantMessage(createAssistantMessage(), {
        type: "agent_progress",
        stage: "querying_exercises",
        status: "active",
        messageKey: "querying_exercises",
        sequence: 2,
      }),
    ).toEqual(createAssistantMessage());
  });

  it("keeps agent_loop out of the assistant message content", () => {
    expect(
      applyAgentTextChatEventToAssistantMessage(createAssistantMessage(), {
        type: "agent_loop",
        loopTurn: 1,
        sequence: 2,
      }),
    ).toEqual(createAssistantMessage());
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

  it("settles fallback content, suggestions and done as a normal assistant message", () => {
    const withContent = applyAgentTextChatEventToAssistantMessage(createAssistantMessage(), {
      type: "content",
      content: "这次没有生成通过校验的可靠训练结果。",
    });
    const withSuggestions = applyAgentTextChatEventToAssistantMessage(withContent, {
      type: "assistant_suggestions",
      suggestions: ["缩小训练范围", "补充缺失条件"],
    });
    const done = applyAgentTextChatEventToAssistantMessage(withSuggestions, {
      type: "done",
    });

    expect(done).toMatchObject({
      content: "这次没有生成通过校验的可靠训练结果。",
      suggestedReplies: ["缩小训练范围", "补充缺失条件"],
      isReasoning: false,
    });
  });

  it("writes safe stream error text into the assistant bubble and clears loading markers", () => {
    expect(
      applyAgentTextChatEventToAssistantMessage(createAssistantMessage(), {
        type: "error",
        error: {
          code: "chat_ai_not_configured",
          message: "Chat AI model configuration is missing.",
        },
      }),
    ).toMatchObject({
      content: "聊天服务暂时不可用，请稍后再试。",
      isReasoning: false,
    });
  });

  it("appends visible_output events only to message.visibleOutputs", () => {
    const next = applyAgentTextChatEventToAssistantMessage(createAssistantMessage({ content: "完成。" }), {
      type: "visible_output",
      outputType: "visibleTrainingProposal",
      schemaVersion: "1",
      payload: {
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "push-up", section: "training", order: 1 },
        ],
      },
      content: {
        sections: [],
      },
    });

    expect(next).toMatchObject({
      content: "完成。",
      visibleOutputs: [
        {
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          payload: {
            kind: "exercise_selection",
          },
        },
      ],
      isReasoning: false,
    });
    expect("bubblePlans" in next).toBe(false);
    expect("bubbleRoutines" in next).toBe(false);
    expect("bubbleExerciseRecommendations" in next).toBe(false);
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
