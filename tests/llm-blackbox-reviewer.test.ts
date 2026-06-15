import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/features/chat/types";
import {
  calculateLlmBlackboxRunStats,
  cancelPendingLlmBlackboxWork,
  completeLlmBlackboxTurn,
  createLlmBlackboxReviewRun,
  skipRemainingFlowTurnsAfterFailure,
  startLlmBlackboxTurn,
  updateLlmBlackboxTurnReview,
  type LlmBlackboxReviewRun,
} from "@/features/dev/llm-blackbox/review-state";
import {
  clearLlmBlackboxReviewRuns,
  llmBlackboxReviewRunsMaxCount,
  pruneLlmBlackboxReviewRuns,
  readLlmBlackboxReviewRuns,
  writeLlmBlackboxReviewRuns,
} from "@/features/dev/llm-blackbox/review-storage";
import { parseBasicChatFixtureFromJson } from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";

vi.mock("next/dynamic", () => ({
  default: () => function DynamicMarkdownContent(props: { content: string }) {
    return createElement("div", { "data-markdown-content": "" }, props.content);
  },
}));

vi.mock("@/features/exercises/components/exercise-recommendation-card", () => ({
  ExerciseRecommendationCard: ({ card }: { card: { title: string } }) =>
    createElement("section", { "data-rich-card": "exercise" }, card.title),
}));

const { ChatTranscript } = await import("@/features/chat/components/chat-transcript");

vi.mock("@/features/workouts/components/workout-routine-draft-card", () => ({
  WorkoutRoutineDraftCard: ({ draft }: { draft: { title: string } }) =>
    createElement("section", { "data-rich-card": "routine" }, draft.title),
}));

vi.mock("@/features/workouts/components/workout-plan-draft-card", () => ({
  WorkoutPlanDraftCard: ({ draft }: { draft: { title: string } }) =>
    createElement("section", { "data-rich-card": "plan" }, draft.title),
}));

describe("dev LLM blackbox runner state", () => {
  it("tracks single-flow turn completion and manual review independently", () => {
    const fixture = createFixture();
    let run = createLlmBlackboxReviewRun({
      fixture,
      flows: [fixture.flows[0]],
      mode: "single",
      now: new Date("2026-06-15T10:00:00.000Z"),
      createId: () => "run-single",
    });

    run = startLlmBlackboxTurn(run, {
      flowId: "F01",
      turnIndex: 1,
      conversationId: "conversation-1",
      responseMessageId: "assistant-1",
      startedAt: new Date("2026-06-15T10:00:01.000Z"),
    });
    run = completeLlmBlackboxTurn(run, "F01", 1, {
      status: "passed",
      assistantMessage: createAssistantMessage("assistant-1", "可以，先做俯卧撑。"),
      eventTypes: ["content", "done"],
      endedAt: new Date("2026-06-15T10:00:03.000Z"),
      durationMs: 2000,
      resultReason: "收到用户可见回答：assistant_text",
      tokenDiagnostics: {
        source: "dev_trace_store",
        status: "missing",
        reason: "trace token usage not found",
      },
    });
    run = updateLlmBlackboxTurnReview(run, "F01", 1, "accepted");

    const stats = calculateLlmBlackboxRunStats(run);

    expect(run.flows[0].turns[0]).toMatchObject({
      status: "passed",
      reviewStatus: "accepted",
      assistantText: "可以，先做俯卧撑。",
      conversationId: "conversation-1",
      responseMessageId: "assistant-1",
    });
    expect(stats).toMatchObject({
      flowTotal: 1,
      turnTotal: 2,
      passedTurnCount: 1,
      acceptedCount: 1,
      tokenMissingCount: 1,
    });
  });

  it("allows all-flow runs to continue after one flow fails and skips only that flow remainder", () => {
    const fixture = createFixture();
    let run = createLlmBlackboxReviewRun({
      fixture,
      flows: fixture.flows,
      mode: "all",
      now: new Date("2026-06-15T10:00:00.000Z"),
      createId: () => "run-all",
    });

    run = startLlmBlackboxTurn(run, {
      flowId: "F01",
      turnIndex: 1,
      conversationId: "conversation-f01",
      responseMessageId: "assistant-f01-1",
      startedAt: new Date("2026-06-15T10:00:01.000Z"),
    });
    run = completeLlmBlackboxTurn(run, "F01", 1, {
      status: "failed",
      assistantMessage: createAssistantMessage("assistant-f01-1", ""),
      eventTypes: ["done"],
      endedAt: new Date("2026-06-15T10:00:02.000Z"),
      durationMs: 1000,
      failureReason: "没有用户可见回答。",
    });
    run = skipRemainingFlowTurnsAfterFailure(run, "F01", 1, "前置 turn 失败。", new Date("2026-06-15T10:00:02.000Z"));
    run = startLlmBlackboxTurn(run, {
      flowId: "F02",
      turnIndex: 1,
      conversationId: "conversation-f02",
      responseMessageId: "assistant-f02-1",
      startedAt: new Date("2026-06-15T10:00:03.000Z"),
    });
    run = completeLlmBlackboxTurn(run, "F02", 1, {
      status: "passed",
      assistantMessage: createAssistantMessage("assistant-f02-1", "换成徒手版本。"),
      eventTypes: ["content", "done"],
      endedAt: new Date("2026-06-15T10:00:04.000Z"),
      durationMs: 1000,
      resultReason: "收到用户可见回答：assistant_text",
    });

    const stats = calculateLlmBlackboxRunStats(run);

    expect(run.flows.find((flow) => flow.id === "F01")?.status).toBe("failed");
    expect(run.flows.find((flow) => flow.id === "F01")?.turns[1].status).toBe("skipped");
    expect(run.flows.find((flow) => flow.id === "F02")?.turns[0].status).toBe("passed");
    expect(stats.failedTurnCount).toBe(1);
    expect(stats.skippedTurnCount).toBe(1);
    expect(stats.passedTurnCount).toBe(1);
  });

  it("cancels running and queued work when the reviewer stops a run", () => {
    const fixture = createFixture();
    let run = createLlmBlackboxReviewRun({
      fixture,
      flows: fixture.flows,
      mode: "all",
      createId: () => "run-stop",
    });

    run = startLlmBlackboxTurn(run, {
      flowId: "F01",
      turnIndex: 1,
      conversationId: "conversation-f01",
      responseMessageId: "assistant-f01",
      startedAt: new Date("2026-06-15T10:00:01.000Z"),
    });
    run = cancelPendingLlmBlackboxWork(run, "开发者停止了当前批次。", new Date("2026-06-15T10:00:02.000Z"));

    const statuses = run.flows.flatMap((flow) => flow.turns.map((turn) => turn.status));

    expect(run.status).toBe("stopped");
    expect(statuses).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(calculateLlmBlackboxRunStats(run).cancelledTurnCount).toBe(3);
  });
});

describe("dev LLM blackbox session storage", () => {
  it("saves, restores, clears and limits stored runs", () => {
    const storage = new MemoryStorage();
    const runs = Array.from({ length: llmBlackboxReviewRunsMaxCount + 2 }, (_, index) =>
      createStoredRun(`run-${index}`, new Date(2026, 5, 15, 10, index, 0).toISOString()),
    );

    const written = writeLlmBlackboxReviewRuns(runs, storage);

    expect(written).toHaveLength(llmBlackboxReviewRunsMaxCount);
    expect(readLlmBlackboxReviewRuns(storage).map((run) => run.id)).toEqual(written.map((run) => run.id));

    clearLlmBlackboxReviewRuns(storage);
    expect(readLlmBlackboxReviewRuns(storage)).toEqual([]);
  });

  it("drops oldest oversized records before writing session storage", () => {
    const largeRuns = [
      createStoredRun("large-new", "2026-06-15T10:02:00.000Z", "x".repeat(320_000)),
      createStoredRun("large-old", "2026-06-15T10:01:00.000Z", "y".repeat(320_000)),
    ];

    expect(pruneLlmBlackboxReviewRuns(largeRuns).map((run) => run.id)).toEqual(["large-new"]);
  });
});

describe("shared chat transcript rendering for blackbox reviewer", () => {
  it("renders assistant text, visible outputs, suggested questions and errors", () => {
    const messages: ChatMessage[] = [
      { id: "user-1", role: "user", content: "推荐一个胸部动作" },
      {
        id: "assistant-1",
        role: "assistant",
        content: "可以，先做这个。",
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
    ];

    const html = renderToStaticMarkup(createElement(ChatTranscript, {
      error: "安全兜底",
      messages,
    }));

    expect(html).toContain("推荐一个胸部动作");
    expect(html).toContain("可以，先做这个。");
    expect(html).toContain('data-rich-card="exercise"');
    expect(html).toContain("换一批");
    expect(html).toContain("安全兜底");
  });
});

describe("dev LLM blackbox decoupling boundary", () => {
  it("does not import the homepage ChatPage or use DOM selector automation", async () => {
    const files = [
      "features/dev/llm-blackbox/use-llm-blackbox-review-runner.ts",
      "features/dev/llm-blackbox/llm-blackbox-reviewer.tsx",
      "app/dev/llm-blackbox/page.tsx",
    ];
    const forbiddenTerms = [
      "chat-page",
      "ChatPage",
      "querySelector",
      "getElementById",
      "<iframe",
      ".contentWindow",
    ];
    const matches: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);

    const runnerContent = await readFile("features/dev/llm-blackbox/use-llm-blackbox-review-runner.ts", "utf8");
    expect(runnerContent).toContain("requestAgentTextChatResponse");
    expect(runnerContent).toContain("applyAgentTextChatEventToAssistantMessage");
  });
});

function createFixture() {
  return parseBasicChatFixtureFromJson({
    version: 1,
    flows: [
      {
        id: "F01",
        goal: "单 flow 多轮",
        turns: [
          { userInput: "推荐胸部动作", expectedOutput: "给出可见回答。" },
          { userInput: "换一批", expectedOutput: "延续上一轮上下文。" },
        ],
      },
      {
        id: "F02",
        goal: "独立 flow",
        turns: [
          { userInput: "改成徒手", expectedOutput: "独立 conversation。" },
        ],
      },
    ],
  }, "fixture.json");
}

function createAssistantMessage(id: string, content: string): ChatMessage {
  return {
    id,
    role: "assistant",
    content,
    createdAt: "2026-06-15T10:00:00.000Z",
    isReasoning: false,
  };
}

function createStoredRun(id: string, createdAt: string, assistantText = ""): LlmBlackboxReviewRun {
  return {
    id,
    mode: "single",
    status: "completed",
    sourcePath: "fixture.json",
    selectedFlowIds: ["F01"],
    createdAt,
    startedAt: createdAt,
    endedAt: createdAt,
    durationMs: 1,
    flows: [
      {
        id: "F01",
        goal: "测试",
        status: "passed",
        reviewStatus: "unreviewed",
        turns: [
          {
            id: `${id}:turn`,
            flowId: "F01",
            flowGoal: "测试",
            turnIndex: 1,
            userInput: "输入",
            expectedOutput: "期望",
            status: "passed",
            reviewStatus: "unreviewed",
            assistantText,
            visibleOutputs: [],
            visibleOutputKinds: [],
            suggestedQuestions: [],
            eventTypes: ["content", "done"],
          },
        ],
      },
    ],
  };
}

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}
