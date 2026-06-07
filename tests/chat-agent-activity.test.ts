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
import {
  agentActivitySummarySafetyEnabled,
  sanitizeAgentActivitySummary,
} from "@/lib/shared/agent-activity-summary";
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
    lastActivitySequence: 4,
    lastLoopSequence: 3,
    ...overrides,
  };
}

describe("Agent progress activity UI state", () => {
  it("keeps activitySummary safety filtering disabled for debug visibility", () => {
    expect(agentActivitySummarySafetyEnabled).toBe(false);
    expect(sanitizeAgentActivitySummary("toolName=searchExerciseResources 内部调试")).toEqual({
      ok: true,
      summary: "toolName=searchExerciseResources 内部调试",
    });
  });

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

    expect(knownFailed.label).toBe("正在思考...");
    expect(knownFailed.toneClass).toBe("text-primary");
    expect(unknownFailed.label).toBe(fallbackAgentActivityLabel);
    expect(unknownFailed.toneClass).toBe("text-primary");
    expect(`${knownFailed.label}${unknownFailed.label}`).not.toContain("Agent 编排");
    expect(`${knownFailed.label}${unknownFailed.label}`).not.toContain("遇到问题");
  });

  it("uses analyzing_request only as an initial fallback activity", () => {
    const analyzing = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      sequence: 1,
    }, { nowMs: 0 });

    expect(analyzing?.activityStage?.stage).toBe("analyzing_request");
    expect(getAgentActivityDisplay(analyzing!).label).toBe("正在思考...");
  });

  it("keeps loopTurn independent when Activity arbitration ignores analyzing_request after an informative stage", () => {
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
    expect(afterCooldown?.activityStage?.stage).toBe("querying_exercises");
    expect(afterCooldown?.loopTurn).toBe(1);
    expect(afterCooldown?.lastActivitySequence).toBe(4);
    expect(getAgentActivityDisplay(afterCooldown!).label).toBe("正在思考...");
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
    expect(getAgentActivityDisplay(secondLoop!).label).toBe("正在思考...");
  });

  it("prioritizes safe activitySummary without using it to infer loopTurn", () => {
    const initial = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      sequence: 1,
    }, { nowMs: 0 });
    const firstLoop = reduceAgentActivity(initial, {
      type: "agent_loop",
      loopTurn: 1,
      sequence: 2,
    }, { nowMs: 100 });
    const summary = reduceAgentActivity(firstLoop, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      activitySummary: "需要查询动作库",
      sequence: 3,
    }, { nowMs: 1_100 });
    const secondLoop = reduceAgentActivity(summary, {
      type: "agent_loop",
      loopTurn: 2,
      sequence: 4,
    }, { nowMs: 1_200 });

    expect(summary?.loopTurn).toBe(1);
    expect(summary?.activityStage?.activitySummary).toBe("需要查询动作库");
    expect(getAgentActivityDisplay(summary!).label).toBe("需要查询动作库");
    expect(secondLoop?.loopTurn).toBe(2);
    expect(secondLoop?.activityStage?.activitySummary).toBe("需要查询动作库");
    expect(getAgentActivityDisplay(secondLoop!).label).toBe("需要查询动作库");
  });

  it("keeps model activitySummary visible when later progress has no summary", () => {
    const summary = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      activitySummary: "正在读取模型摘要",
      sequence: 1,
    }, { nowMs: 0 });

    const validating = reduceAgentActivity(summary, {
      type: "agent_progress",
      stage: "validating_result",
      status: "active",
      messageKey: "validating_result",
      sequence: 2,
    }, { nowMs: 2_000 });

    const writing = reduceVisibleAgentActivity(
      validating,
      createWritingReplyAgentActivity(validating),
      { nowMs: 3_000 },
    );

    expect(validating?.activityStage?.stage).toBe("analyzing_request");
    expect(validating?.activityStage?.activitySummary).toBe("正在读取模型摘要");
    expect(validating?.lastActivitySequence).toBe(2);
    expect(getAgentActivityDisplay(validating!).label).toBe("正在读取模型摘要");
    expect(writing?.activityStage?.activitySummary).toBe("正在读取模型摘要");
    expect(writing?.lastActivitySequence).toBe(3);
    expect(getAgentActivityDisplay(writing!).label).toBe("正在读取模型摘要");
  });

  it("updates model activitySummary immediately while ignoring later fallback progress", () => {
    const firstSummary = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      activitySummary: "正在理解你的目标",
      sequence: 1,
    }, { nowMs: 0 });

    const pendingSummary = reduceAgentActivity(firstSummary, {
      type: "agent_progress",
      stage: "analyzing_request",
      status: "active",
      messageKey: "analyzing_request",
      activitySummary: "正在筛选训练条件",
      sequence: 2,
    }, { nowMs: 500 });

    const fallbackProgress = reduceAgentActivity(pendingSummary, {
      type: "agent_progress",
      stage: "validating_result",
      status: "active",
      messageKey: "validating_result",
      sequence: 3,
    }, { nowMs: 600 });

    expect(pendingSummary?.activityStage?.activitySummary).toBe("正在筛选训练条件");
    expect(pendingSummary?.lastActivitySequence).toBe(2);
    expect(getAgentActivityDisplay(pendingSummary!).label).toBe("正在筛选训练条件");
    expect(fallbackProgress?.activityStage?.activitySummary).toBe("正在筛选训练条件");
    expect(fallbackProgress?.lastActivitySequence).toBe(3);
    expect(getAgentActivityDisplay(fallbackProgress!).label).toBe("正在筛选训练条件");
  });

  it("shows raw activitySummary values while debug safety is disabled", () => {
    const next = reduceAgentActivity(null, {
      type: "agent_progress",
      stage: "validating_result",
      status: "active",
      messageKey: "validating_result",
      activitySummary: "toolName=searchExerciseResources 内部调试",
      sequence: 1,
    }, { nowMs: 0 });

    expect(next?.activityStage?.activitySummary).toBe("toolName=searchExerciseResources 内部调试");
    expect(getAgentActivityDisplay(next!).label).toBe("toolName=searchExerciseResources 内部调试");
    expect(JSON.stringify(next)).toContain("searchExerciseResources");
  });

  it("updates rapid specific stage changes immediately", () => {
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
      { nowMs: 1_300 },
    );

    expect(reading?.activityStage?.stage).toBe("reading_artifacts");
    expect(withLoop?.loopTurn).toBe(5);
    expect(saving?.activityStage?.stage).toBe("saving_result");
    expect(saving?.loopTurn).toBe(5);
    expect(writing?.activityStage?.stage).toBe("writing_reply");
    expect(writing?.loopTurn).toBe(5);
    expect(writing?.activityStage?.sequence).toBe(4);
  });

  it("keeps loopTurn synced when writing reply replaces the current label", () => {
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
    }, { nowMs: 1_100 });

    const writing = reduceVisibleAgentActivity(
      saving,
      createWritingReplyAgentActivity(saving),
      { nowMs: 2_200 },
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
    expect(html).toContain("正在思考...");
    expect(html).not.toContain("fact_check");
    expect(html).toContain("items-baseline");
    expect(html).toContain("gap-[2px]");
    expect(html).toContain("max-w-[min(34rem,100%)]");
    expect(html).toContain("overflow-hidden");
    expect(html).toContain("truncate");
    expect(html).toContain("pl-0");
    expect(html).toContain("w-[1.375rem]");
    expect(html).toContain("text-left");
    expect(html).toContain("tabular-nums");
    expect(html).not.toContain("text-right");
    expect(html).not.toContain("translate-y-[1px]");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).toContain("agent-activity-indicator");
    expect(html).not.toContain("agent-activity-breathe");
    expect(html).not.toContain("validateRoutineDraft");
  });

  it("renders safe activitySummary as the visible label while keeping loop prefix accessible", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityIndicator, {
        activity: createVisibleActivityForTest({
          loopTurn: 2,
          activityStage: {
            stage: "analyzing_request",
            status: "active",
            messageKey: "analyzing_request",
            activitySummary: "需要读取已有训练内容",
            sequence: 3,
          },
        }),
      }),
    );

    expect(html).toContain("#2");
    expect(html).toContain("需要读取已有训练内容");
    expect(html).not.toContain("正在思考...");
    expect(html).not.toContain("toolName");
    expect(html).toContain("aria-live=\"polite\"");
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

  it("renders the first loop prefix before a valid backend loop event", () => {
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

    expect(html).toContain("正在思考...");
    expect(html).toContain("w-[1.375rem]");
    expect(html).toContain("#1");
    expect(html).not.toContain("#0");
  });

  it("defines rolling transition styles for activity row changes", () => {
    const componentSource = readFileSync(
      fileURLToPath(new URL("../features/chat/components/agent-activity-indicator.tsx", import.meta.url)),
      "utf8",
    );
    const globalCss = readFileSync(
      fileURLToPath(new URL("../app/globals.css", import.meta.url)),
      "utf8",
    );

    expect(componentSource).toContain("agent-activity-roll-current");
    expect(componentSource).toContain("agent-activity-roll-previous");
    expect(componentSource).toContain("motion-safe:animate-pulse");
    expect(componentSource).toContain("transition-colors duration-200 motion-safe:animate-pulse motion-reduce:animate-none");
    expect(componentSource).not.toContain("items-baseline gap-[2px] motion-safe:animate-pulse");
    expect(componentSource).not.toContain("agent-activity-breathe");
    expect(globalCss).not.toContain("@keyframes agent-activity-breathe");
    expect(globalCss).not.toContain(".agent-activity-breathe::before");
    expect(globalCss).toContain("@keyframes agent-activity-current-in");
    expect(globalCss).toContain("@keyframes agent-activity-previous-out");
    expect(globalCss).toContain("agent-activity-current-in 0.18s cubic-bezier(0.2, 0, 0, 1) both");
    expect(globalCss).toContain("agent-activity-previous-out 0.18s cubic-bezier(0.2, 0, 0, 1) both");
    expect(globalCss).toContain("@media (prefers-reduced-motion: reduce)");
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

  it("keeps long Agent activity text from stretching the answer bubble width", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../features/chat/components/chat-page.tsx", import.meta.url)),
      "utf8",
    );
    const activityIndex = source.indexOf("<AgentActivityIndicator");
    const bubbleIndex = source.indexOf("ai-chat-bubble", activityIndex);
    const messageColumnSource = source.slice(
      source.lastIndexOf("flex min-w-0 flex-1 flex-col gap-xs", activityIndex),
      bubbleIndex,
    );

    expect(messageColumnSource).toContain('isUserMessage ? "items-end" : "items-start"');
    expect(source).toContain("ai-chat-bubble max-w-full min-w-0");
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
