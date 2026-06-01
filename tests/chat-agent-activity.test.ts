import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentActivityIndicator } from "@/features/chat/components/agent-activity-indicator";
import {
  fallbackAgentActivityLabel,
  getAgentActivityDisplay,
  reduceAgentActivity,
  shouldClearAgentActivityForStreamEvent,
} from "@/features/chat/lib/agent-activity";
import { createChatConversationSavePayload } from "@/features/chat/lib/chat-history";
import type { ChatMessage, ChatStreamEvent } from "@/features/chat/types";

describe("Agent activity UI state", () => {
  it("updates activity by sequence and falls back for unknown stages", () => {
    const current = reduceAgentActivity(null, {
      type: "agent_activity",
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 2,
      toolName: "searchExercises",
    } as ChatStreamEvent & Record<string, unknown>);
    const stale = reduceAgentActivity(current, {
      type: "agent_activity",
      stage: "reading_artifacts",
      status: "active",
      messageKey: "reading_artifacts",
      sequence: 1,
    });
    const fallback = getAgentActivityDisplay({
      stage: "internal_tool_stage",
      status: "active",
    });

    expect(current).toMatchObject({
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 2,
    });
    expect(current).not.toHaveProperty("toolName");
    expect(stale).toBe(current);
    expect(fallback.label).toBe(fallbackAgentActivityLabel);
    expect(fallback.label).not.toContain("internal_tool_stage");
  });

  it("marks done and error stream events as lifecycle cleanup boundaries", () => {
    expect(shouldClearAgentActivityForStreamEvent({ type: "done" })).toBe(true);
    expect(shouldClearAgentActivityForStreamEvent({ type: "error", delta: "failed" })).toBe(true);
    expect(shouldClearAgentActivityForStreamEvent({ type: "content", delta: "hi" })).toBe(false);
  });
});

describe("AgentActivityIndicator", () => {
  it("renders known stages with Chinese copy, motion classes, and aria-live", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityIndicator, {
        activity: {
          stage: "validating_result",
          status: "active",
          messageKey: "validating_result",
          sequence: 4,
        },
      }),
    );

    expect(html).toContain("aria-live=\"polite\"");
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("正在校验训练内容...");
    expect(html).toContain("fact_check");
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain("validateRoutineDraft");
  });

  it("renders unknown stages with a safe fallback label", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityIndicator, {
        activity: {
          stage: "raw_internal_tool_name",
          status: "active",
          sequence: 1,
        },
      }),
    );

    expect(html).toContain(fallbackAgentActivityLabel);
    expect(html).not.toContain("raw_internal_tool_name");
  });
});

describe("chat history activity persistence boundary", () => {
  it("does not write ephemeral agent activity fields into saved conversation payload", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        content: "今天练胸",
        createdAt: "2026-06-01T00:00:00.000Z",
        agentActivity: { stage: "querying_exercises" },
      },
      {
        id: "a1",
        role: "assistant",
        content: "可以。",
        createdAt: "2026-06-01T00:00:01.000Z",
        isReasoning: true,
        reasoningContent: "hidden reasoning",
        suggestedQuestions: ["继续"],
        agentActivity: { stage: "writing_reply" },
      },
    ] as Array<ChatMessage & { agentActivity: unknown }>;

    const payload = createChatConversationSavePayload("conversation-1", messages, {});

    expect(payload).not.toBeNull();
    expect(JSON.stringify(payload)).not.toContain("agentActivity");
    expect(JSON.stringify(payload)).not.toContain("hidden reasoning");
    expect(payload?.messages[1]).toMatchObject({
      id: "a1",
      role: "assistant",
      content: "可以。",
      suggestedReplies: ["继续"],
    });
  });
});
