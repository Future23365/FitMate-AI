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

function createVisibleActivityForTest(
  overrides: Partial<NonNullable<Parameters<typeof AgentActivityIndicator>[0]["activity"]>> = {},
): NonNullable<Parameters<typeof AgentActivityIndicator>[0]["activity"]> {
  return {
    activityStage: {
      stage: "validating_result",
      status: "active",
      messageKey: "validating_result",
      sequence: 4,
    },
    loopTurn: 4,
    visibleSinceMs: 0,
    holdUntilMs: 0,
    lastActivitySequence: 4,
    lastLoopSequence: 3,
    ...overrides,
  };
}

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
      activityStage: {
        stage: "querying_exercises",
        status: "active",
        messageKey: "querying_exercises",
        sequence: 2,
      },
      lastActivitySequence: 2,
      lastLoopSequence: -1,
    });
    expect(current?.loopTurn).toBeUndefined();
    expect(JSON.stringify(current)).not.toContain("toolName");
    expect(stale).toBe(current);
    expect(fallback.label).toBe(fallbackAgentActivityLabel);
    expect(fallback.label).not.toContain("internal_tool_stage");
    expect(fallback.label).not.toContain("Agent 编排");
  });

  it("keeps failed progress states as neutral user-facing activity", () => {
    const knownFailed = getAgentActivityDisplay({
      stage: "validating_result",
      status: "failed",
    });
    const unknownFailed = getAgentActivityDisplay({
      stage: "raw_internal_failure",
      status: "failed",
    });

    expect(knownFailed.label).toBe("正在校验训练内容...");
    expect(knownFailed.toneClass).toBe("text-primary");
    expect(unknownFailed.label).toBe(fallbackAgentActivityLabel);
    expect(unknownFailed.toneClass).toBe("text-primary");
    expect(`${knownFailed.label}${unknownFailed.label}`).not.toContain("Agent 编排");
    expect(`${knownFailed.label}${unknownFailed.label}`).not.toContain("遇到问题");
  });

  it("keeps loopTurn independent when Activity arbitration keeps an informative stage", () => {
    const querying = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 1,
    }, { nowMs: 0 });

    const withLoop = reduceAgentActivity(querying, {
      type: "agent_loop",
      loopTurn: 1,
      sequence: 2,
    }, { nowMs: 100 });

    const genericActivity = reduceAgentActivity(withLoop, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      sequence: 3,
    }, { nowMs: 500 });

    const afterCooldown = reduceAgentActivity(genericActivity, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      sequence: 4,
    }, { nowMs: 3_000 });

    expect(querying?.activityStage?.stage).toBe("querying_exercises");
    expect(querying?.loopTurn).toBeUndefined();
    expect(withLoop?.activityStage?.stage).toBe("querying_exercises");
    expect(withLoop?.loopTurn).toBe(1);
    expect(genericActivity?.activityStage?.stage).toBe("querying_exercises");
    expect(genericActivity?.loopTurn).toBe(1);
    expect(genericActivity?.lastActivitySequence).toBe(3);
    expect(afterCooldown?.activityStage?.stage).toBe("analyzing_request");
    expect(afterCooldown?.loopTurn).toBe(1);
    expect(getAgentActivityDisplay(afterCooldown!).label).toBe("正在规划下一步...");
  });

  it("uses safe fallback copy for unknown Activity stages without exposing raw stage", () => {
    const unknownStage = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "raw_internal_tool_name",
      status: "active",
      sequence: 1,
    }, { nowMs: 0 });

    expect(unknownStage?.activityStage?.stage).toBe("raw_internal_tool_name");
    expect(getAgentActivityDisplay(unknownStage!).label).toBe(fallbackAgentActivityLabel);
    expect(getAgentActivityDisplay(unknownStage!).label).not.toContain("raw_internal_tool_name");
  });

  it("updates loopTurn for repeated Activity labels without changing the label source", () => {
    const firstQuery = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 1,
    }, { nowMs: 0 });

    const firstLoop = reduceAgentActivity(firstQuery, {
      type: "agent_loop",
      loopTurn: 1,
      sequence: 2,
    }, { nowMs: 100 });

    const repeatedQuery = reduceAgentActivity(firstLoop, {
      type: "agent_progress",
      stage: "querying_exercises",
      status: "active",
      messageKey: "querying_exercises",
      sequence: 3,
    }, { nowMs: 300 });

    const secondLoop = reduceAgentActivity(repeatedQuery, {
      type: "agent_loop",
      loopTurn: 2,
      sequence: 4,
    }, { nowMs: 400 });

    expect(firstQuery?.activityStage?.stage).toBe("querying_exercises");
    expect(firstLoop?.loopTurn).toBe(1);
    expect(repeatedQuery?.activityStage?.stage).toBe("querying_exercises");
    expect(repeatedQuery?.loopTurn).toBe(1);
    expect(secondLoop?.activityStage?.stage).toBe("querying_exercises");
    expect(secondLoop?.loopTurn).toBe(2);
    expect(getAgentActivityDisplay(secondLoop!).label).toBe("正在查询动作库...");
  });

  it("accepts specific stages in a dynamic order without changing loopTurn from content", () => {
    const reading = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "reading_artifacts",
      status: "active",
      messageKey: "reading_artifacts",
      sequence: 1,
    }, { nowMs: 0 });

    const withLoop = reduceAgentActivity(reading, {
      type: "agent_loop",
      loopTurn: 5,
      sequence: 2,
    }, { nowMs: 100 });

    const saving = reduceAgentActivity(withLoop, {
      type: "agent_progress",
      stage: "saving_result",
      status: "active",
      messageKey: "saving_result",
      sequence: 3,
    }, { nowMs: 300 });

    const writing = reduceVisibleAgentActivity(
      saving,
      createWritingReplyAgentActivity(saving),
      { nowMs: 600 },
    );

    expect(reading?.activityStage?.stage).toBe("reading_artifacts");
    expect(withLoop?.loopTurn).toBe(5);
    expect(saving?.activityStage?.stage).toBe("saving_result");
    expect(saving?.loopTurn).toBe(5);
    expect(writing?.activityStage?.stage).toBe("writing_reply");
    expect(writing?.loopTurn).toBe(5);
    expect(writing?.activityStage?.sequence).toBe(4);
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
  it("renders known stages with Chinese copy, fixed prefix width, and aria-live", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityIndicator, {
        activity: createVisibleActivityForTest(),
      }),
    );

    expect(html).toContain("aria-live=\"polite\"");
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("#4");
    expect(html).toContain("正在校验训练内容...");
    expect(html).not.toContain("fact_check");
    expect(html).toContain("items-baseline");
    expect(html).toContain("gap-[2px]");
    expect(html).toContain("pl-0");
    expect(html).toContain("w-[1.375rem]");
    expect(html).toContain("text-left");
    expect(html).toContain("tabular-nums");
    expect(html).not.toContain("text-right");
    expect(html).not.toContain("translate-y-[1px]");
    expect(html).not.toContain("motion-safe:animate-pulse");
    expect(html).not.toContain("validateRoutineDraft");
  });

  it("renders unknown stages with a safe fallback label", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityIndicator, {
        activity: createVisibleActivityForTest({
          loopTurn: 1,
          activityStage: {
            stage: "raw_internal_tool_name",
            status: "active",
            sequence: 1,
          },
        }),
      }),
    );

    expect(html).toContain(fallbackAgentActivityLabel);
    expect(html).toContain("#1");
    expect(html).not.toContain("raw_internal_tool_name");
  });

  it("does not render a local loop prefix before a valid backend loop event", () => {
    const activity = createVisibleActivityForTest({
      activityStage: {
        stage: "preparing_context",
        status: "active",
        messageKey: "preparing_context",
        sequence: 1,
      },
    });
    delete activity.loopTurn;

    const html = renderToStaticMarkup(
      createElement(AgentActivityIndicator, {
        activity,
      }),
    );

    expect(html).toContain("正在整理上下文...");
    expect(html).toContain("aria-hidden=\"true\"");
    expect(html).toContain("w-[1.375rem]");
    expect(html).not.toContain("#0");
    expect(html).not.toContain("#1");
  });
});

describe("ChatPage activity placement", () => {
  it("renders Agent activity above the active answer bubble while keeping the thinking indicator inside the bubble", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../features/chat/components/chat-page.tsx", import.meta.url)),
      "utf8",
    );
    const inputShellIndex = source.indexOf("app-shell-glass-soft border-t border-line/60");
    const activityIndex = source.lastIndexOf("<AgentActivityIndicator", inputShellIndex);
    const assistantBranchIndex = source.lastIndexOf('message.role === "assistant"', activityIndex);
    const bubbleIndex = source.indexOf("ai-chat-bubble", activityIndex);
    const thinkingIndex = source.indexOf("<ChatThinkingIndicator", bubbleIndex);
    const inputShellSource = source.slice(inputShellIndex);

    expect(activityIndex).toBeGreaterThan(assistantBranchIndex);
    expect(bubbleIndex).toBeGreaterThan(activityIndex);
    expect(thinkingIndex).toBeGreaterThan(bubbleIndex);
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
      suggestedQuestions: ["继续"],
    });
  });
});
