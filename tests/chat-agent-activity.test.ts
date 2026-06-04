import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentActivityIndicator } from "@/features/chat/components/agent-activity-indicator";
import {
  createWritingReplyAgentActivity,
  fallbackAgentActivityLabel,
  getAgentActivityDisplay,
  reduceAgentActivity,
  reduceVisibleAgentActivity,
  shouldClearAgentActivityForStreamEvent,
} from "@/features/chat/lib/agent-activity";
import { createChatConversationSavePayload } from "@/features/chat/lib/chat-history";
import type { AgentTextChatEvent } from "@/features/chat/api/chat-client";
import type { ChatMessage } from "@/features/chat/types";

describe("Agent progress activity UI state", () => {
  it("updates activity by sequence and falls back for unknown stages", () => {
    const current = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 2,
      toolName: "searchExerciseResources",
    } as AgentTextChatEvent & Record<string, unknown>);
    const stale = reduceAgentActivity(current, {
      type: "agent_progress",
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

  it("keeps informative tool stages when dynamic loop emits generic analyzing events", () => {
    const querying = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 1,
    }, { nowMs: 0 });

    const genericLoopTurn = reduceAgentActivity(querying, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      sequence: 2,
    }, { nowMs: 500 });

    const unknownStage = reduceAgentActivity(genericLoopTurn, {
      type: "agent_progress",
      stage: "raw_internal_tool_name",
      status: "active",
      sequence: 3,
    }, { nowMs: 700 });

    const afterCooldown = reduceAgentActivity(unknownStage, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      sequence: 4,
    }, { nowMs: 3_000 });

    expect(querying?.stage).toBe("querying_exercises");
    expect(genericLoopTurn?.stage).toBe("querying_exercises");
    expect(genericLoopTurn?.lastSequence).toBe(2);
    expect(unknownStage?.stage).toBe("querying_exercises");
    expect(unknownStage?.lastSequence).toBe(3);
    expect(afterCooldown?.stage).toBe("analyzing_request");
    expect(getAgentActivityDisplay(afterCooldown!).label).toBe("正在规划下一步...");
  });

  it("accepts specific stages in a dynamic order without requiring a fixed workflow", () => {
    const reading = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "reading_artifacts",
      status: "active",
      messageKey: "reading_artifacts",
      sequence: 1,
    }, { nowMs: 0 });

    const saving = reduceAgentActivity(reading, {
      type: "agent_progress",
      stage: "saving_result",
      status: "active",
      messageKey: "saving_result",
      sequence: 2,
    }, { nowMs: 300 });

    const writing = reduceVisibleAgentActivity(
      saving,
      createWritingReplyAgentActivity(saving),
      { nowMs: 600 },
    );

    expect(reading?.stage).toBe("reading_artifacts");
    expect(saving?.stage).toBe("saving_result");
    expect(writing?.stage).toBe("writing_reply");
    expect(writing?.sequence).toBe(3);
  });

  it("marks done and error stream events as lifecycle cleanup boundaries", () => {
    expect(shouldClearAgentActivityForStreamEvent({ type: "done" })).toBe(true);
    expect(shouldClearAgentActivityForStreamEvent({
      type: "error",
      error: { message: "failed" },
    })).toBe(true);
    expect(shouldClearAgentActivityForStreamEvent({
      type: "content",
      content: "hi",
    })).toBe(false);
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

describe("ChatPage activity placement", () => {
  it("renders Agent activity at the top of the active answer bubble while keeping the thinking indicator", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../features/chat/components/chat-page.tsx", import.meta.url)),
      "utf8",
    );
    const inputShellIndex = source.indexOf("app-shell-glass-soft border-t border-line/60");
    const activityIndex = source.lastIndexOf("<AgentActivityIndicator", inputShellIndex);
    const assistantBranchIndex = source.lastIndexOf('message.role === "assistant"', activityIndex);
    const thinkingIndex = source.indexOf("<ChatThinkingIndicator", activityIndex);
    const inputShellSource = source.slice(inputShellIndex);

    expect(activityIndex).toBeGreaterThan(assistantBranchIndex);
    expect(thinkingIndex).toBeGreaterThan(activityIndex);
    expect(inputShellSource).not.toContain("<AgentActivityIndicator");
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

    const payload = createChatConversationSavePayload("conversation-1", messages, { summary: "" });

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
