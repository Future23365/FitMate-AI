import { describe, expect, it } from "vitest";

import {
  getMessageAssistantSuggestions,
  readAssistantSuggestionsFromStreamEvent,
} from "@/features/chat/lib/assistant-suggestions";
import { projectAgentExecutionResultToResponse } from "@/lib/server/agent-orchestrator";

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

  it("filters suggestions whose structured target operation is an unopened write capability", () => {
    const projection = projectAgentExecutionResultToResponse({
      result: {
        status: "answered",
        replyContext: {
          reply: "训练已经生成。",
          assistantSuggestions: [
            {
              label: "继续下一步",
              message: "继续下一步",
              targetOperation: "validate_and_save",
            },
          ],
        },
        usedToolResultIds: [],
      },
      toolResults: [],
    });

    expect(projection.assistantSuggestions).toEqual([]);
    expect(projection.metadata.filteredSuggestions).toEqual([
      expect.objectContaining({
        label: "继续下一步",
        targetOperation: "validate_and_save",
        reason: "unsupported_write_operation",
      }),
    ]);
  });

  it("does not filter by label or message keywords when target operation is safe", () => {
    const projection = projectAgentExecutionResultToResponse({
      result: {
        status: "answered",
        replyContext: {
          reply: "可以查看刚才的训练。",
          assistantSuggestions: [
            {
              label: "保存查看结果",
              message: "保存一下视图，我要看刚才的训练",
              targetOperation: "view_artifact",
            },
          ],
        },
        usedToolResultIds: [],
      },
      toolResults: [],
    });

    expect(projection.assistantSuggestions).toEqual([
      expect.objectContaining({
        label: "保存查看结果",
        message: "保存一下视图，我要看刚才的训练",
        targetOperation: "view_artifact",
      }),
    ]);
    expect(projection.metadata.filteredSuggestions).toEqual([]);
  });

  it("filters unsafe structured writes even when the visible text looks harmless", () => {
    const projection = projectAgentExecutionResultToResponse({
      result: {
        status: "needs_clarification",
        question: "你想怎么处理这套训练？",
        assistantSuggestions: [
          {
            label: "下一步",
            message: "继续",
            targetOperation: "save_artifact",
          },
        ],
        blockingReasons: ["缺少可执行保存入口"],
        usedToolResultIds: [],
      },
      toolResults: [],
    });

    expect(projection.assistantSuggestions).toEqual([]);
    expect(projection.metadata.filteredSuggestions).toEqual([
      expect.objectContaining({
        label: "下一步",
        targetOperation: "save_artifact",
        reason: "unsupported_write_operation",
      }),
    ]);
  });
});
